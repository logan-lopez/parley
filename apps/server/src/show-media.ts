// The server vets project files. The window receives references; only the
// inline card receives capped data URLs, in result metadata.
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import {
  INLINE_MEDIA_ASK_MAX_BYTES, INLINE_MEDIA_FILE_MAX_BYTES,
  MEDIA_ASK_MAX_FILES, MEDIA_FILE_MAX_BYTES, type Media, type ShowFiles,
} from '@parley/protocol'
import { askMediaRefs, type AskInput } from '@parley/protocol/ask'
import { locate, projectRoot, ShowFileError } from './show-files.ts'

export async function readShowMedia(input: AskInput, files: ShowFiles, projectDir = process.cwd()): Promise<Media> {
  const refs = askMediaRefs(input, files)
  if (!refs.length) return {}
  if (refs.length > MEDIA_ASK_MAX_FILES) {
    throw new ShowFileError(`This ask names more than ${MEDIA_ASK_MAX_FILES} media files; split the pictures across asks`)
  }
  const project = await projectRoot(projectDir)
  const media: Media = Object.create(null)
  for (const src of refs) {
    const { real, given } = await locate(src, project)
    let handle
    try {
      handle = await open(real, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW)
      const info = await handle.stat()
      if (!info.isFile()) throw new ShowFileError(`\`${src}\` isn't a regular file; give an image file inside the project`)
      if (info.size > MEDIA_FILE_MAX_BYTES) throw tooBig(src)
      // Bounded even if the file grows after stat. A regular file read can be
      // short, so keep reading until EOF or the extra byte that detects the cap.
      const bytes = Buffer.alloc(Math.min(info.size + 1, MEDIA_FILE_MAX_BYTES + 1))
      let length = 0
      while (length < bytes.length) {
        const read = await handle.read(bytes, length, bytes.length - length, null)
        if (!read.bytesRead) break
        length += read.bytesRead
      }
      if (length > MEDIA_FILE_MAX_BYTES) throw tooBig(src)
      if (length > info.size) throw new ShowFileError(`\`${src}\` changed while Parley read it; retry the ask`)
      const data = bytes.subarray(0, length)
      const mime = imageMime(data)
      if (!mime) {
        const svg = /\.svg$/i.test(src) || /^(?:\uFEFF)?\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(data.subarray(0, 8192).toString())
        throw new ShowFileError(svg
          ? `\`${src}\` is SVG: use a \`show\` with \`path\` to draw it with the theme`
          : `\`${src}\` isn't an image (PNG, JPEG, GIF or WebP); give a picture in one of those formats`)
      }
      media[src] = { kind: 'image', files: [{ path: given, abs: real, sha256: hash(data), bytes: length, mime }] }
    } catch (error) {
      if (error instanceof ShowFileError) throw error
      throw new ShowFileError(`Couldn't read \`${src}\` as an image; check that it exists and is readable inside the project`)
    } finally {
      await handle?.close()
    }
  }
  return media
}

function tooBig(src: string): ShowFileError {
  return new ShowFileError(`\`${src}\` is over Parley's 25 MB image limit; use a smaller image`)
}

function hash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function imageMime(bytes: Buffer): string | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif'
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp'
  return undefined
}

export async function inlineMediaUrls(media: Media): Promise<Record<string, string>> {
  const urls: Record<string, string> = Object.create(null)
  let total = 0
  for (const [src, entry] of Object.entries(media)) {
    const file = entry.files[0]
    if (entry.kind !== 'image' || !file || file.bytes > INLINE_MEDIA_FILE_MAX_BYTES || total + file.bytes > INLINE_MEDIA_ASK_MAX_BYTES) continue
    // Read at most the vetted size plus one; a changed file isn't sent inline.
    const handle = await open(file.abs, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW).catch(() => undefined)
    if (!handle) continue
    try {
      if (!(await handle.stat()).isFile()) continue
      const data = Buffer.alloc(file.bytes + 1)
      let length = 0
      while (length < data.length) {
        const read = await handle.read(data, length, data.length - length, null)
        if (!read.bytesRead) break
        length += read.bytesRead
      }
      if (length !== file.bytes || hash(data.subarray(0, length)) !== file.sha256) continue
      urls[src] = `data:${file.mime};base64,${data.subarray(0, length).toString('base64')}`
      total += length
    } finally {
      await handle.close()
    }
  }
  return urls
}
