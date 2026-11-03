// The server vets project files. The window receives references; only the
// inline card receives capped data URLs, in result metadata.
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { open, readdir } from 'node:fs/promises'
import {
  INLINE_MEDIA_ASK_MAX_BYTES, INLINE_MEDIA_FILE_MAX_BYTES, isMediaGlob,
  MEDIA_ASK_MAX_FILES, MEDIA_FILE_MAX_BYTES, MEDIA_VARIANTS_MAX, parseCompare,
  type Media, type MediaEntry, type MediaFile, type ShowFiles,
} from '@parley/protocol'
import { askCompareFences, askMediaRefs, type AskInput } from '@parley/protocol/ask'
import { locate, projectRoot, ShowFileError, type Project } from './show-files.ts'

export async function readShowMedia(input: AskInput, files: ShowFiles, projectDir = process.cwd()): Promise<Media> {
  const compares = askCompareFences(input, files)
  for (const fence of compares) {
    if (!parseCompare(fence)) throw badCompare()
  }
  const refs = askMediaRefs(input, files)
  if (!refs.length) return {}
  if (refs.length > MEDIA_ASK_MAX_FILES) throw tooMany()
  const project = await projectRoot(projectDir)
  const media: Media = Object.create(null)
  let count = 0
  for (const src of refs) {
    if (/[*?]/.test(src.slice(0, src.lastIndexOf('/') + 1))) {
      throw new ShowFileError(`\`${src}\`: a glob works in the file name only, not in directory names; name the directory`)
    }
    const glob = isMediaGlob(src)
    const read: { file: MediaFile; kind: MediaEntry['kind'] }[] = []
    for (const path of glob ? await expand(src, project) : [src]) read.push(await readOne(path, project))
    if (glob && read.some((r) => r.kind === 'image')) {
      throw new ShowFileError(`\`${src}\` matches images: one image per \`![]()\`, so name each picture; globs are for sound variants`)
    }
    // Brief 22's per-ask cap counts every variant a glob expands to.
    count += read.length
    if (count > MEDIA_ASK_MAX_FILES) throw tooMany()
    media[src] = { kind: read[0]!.kind, files: read.map((r) => r.file) }
  }
  for (const fence of compares) {
    if (!parseCompare(fence, media)) throw badCompare()
  }
  return media
}

function badCompare(): ShowFileError {
  return new ShowFileError('A ```compare fence takes two image paths (PNG, JPEG, GIF or WebP), one per line with an optional label after the path')
}

function tooMany(): ShowFileError {
  return new ShowFileError(`This ask names more than ${MEDIA_ASK_MAX_FILES} media files, counting each variant of a glob; split them across asks`)
}

// A glob's matches, in its directory only (readShowMedia refuses globs in
// directory names): no `**`, and dotfiles only when the pattern starts with a
// dot, as in a shell. Sorted by name with numbers in order, so `take_10`
// follows `take_9`. Each match is still located and read like a named file.
async function expand(src: string, project: Project): Promise<string[]> {
  const slash = src.lastIndexOf('/')
  const dir = src.slice(0, slash + 1)
  const pattern = src.slice(slash + 1)
  if (pattern.includes('**')) throw new ShowFileError(`\`${src}\`: \`**\` isn't supported; use \`*\` in one directory`)
  const { real } = await locate(dir || '.', project)
  let names: string[]
  try {
    names = await readdir(real)
  } catch {
    throw new ShowFileError(`Couldn't list \`${dir || '.'}\` for \`${src}\`; check that it's a readable directory inside the project`)
  }
  const body = pattern.replace(/[.+^$(){}|[\]\\]/g, '\\$&').replaceAll('*', '.*').replaceAll('?', '.')
  const re = new RegExp('^' + body + '$', 's')
  const matches = names
    .filter((name) => re.test(name) && (!name.startsWith('.') || pattern.startsWith('.')))
    .sort(byName.compare)
  if (!matches.length) throw new ShowFileError(`\`${src}\` matches no files in \`${dir || '.'}\`; check the pattern`)
  if (matches.length > MEDIA_VARIANTS_MAX) {
    throw new ShowFileError(`\`${src}\` matches ${matches.length} files; a sound takes at most ${MEDIA_VARIANTS_MAX} variants, so narrow the pattern or split it`)
  }
  return matches.map((name) => dir + name)
}

const byName = new Intl.Collator('en', { numeric: true })

async function readOne(src: string, project: Project): Promise<{ file: MediaFile; kind: MediaEntry['kind'] }> {
  const { real, given } = await locate(src, project)
  let handle
  try {
    handle = await open(real, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW)
    const info = await handle.stat()
    if (!info.isFile()) throw new ShowFileError(`\`${src}\` isn't a regular file; give an image or sound file inside the project`)
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
    const image = imageMime(data)
    const mime = image ?? audioMime(data)
    if (!mime) {
      const svg = /\.svg$/i.test(src) || /^(?:\uFEFF)?\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(data.subarray(0, 8192).toString())
      throw new ShowFileError(svg
        ? `\`${src}\` is SVG: use a \`show\` with \`path\` to draw it with the theme`
        : `\`${src}\` isn't an image (PNG, JPEG, GIF or WebP) or a sound (WAV, AIFF, MP3, M4A/AAC, FLAC or Ogg); give a file in one of those formats, or convert it first (\`ffmpeg -i in out.wav\`)`)
    }
    return { kind: image ? 'image' : 'audio', file: { path: given, abs: real, sha256: hash(data), bytes: length, mime } }
  } catch (error) {
    if (error instanceof ShowFileError) throw error
    throw new ShowFileError(`Couldn't read \`${src}\`; check that it exists and is readable inside the project`)
  } finally {
    await handle?.close()
  }
}

function tooBig(src: string): ShowFileError {
  return new ShowFileError(`\`${src}\` is over Parley's 25 MB limit for a media file; use a smaller one`)
}

function hash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function imageMime(bytes: Buffer): string | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif'
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp'
  return undefined
}

// Sniffed from the first bytes, never the extension: what WebKit's <audio>
// plays. Ogg only with a Vorbis or Opus first packet (brief 22's spike played
// Vorbis), and MP4 only with an audio or general-purpose brand, not HEIF.
const MP4_BRANDS = new Set(['M4A ', 'M4B ', 'M4P ', 'mp41', 'mp42', 'isom', 'iso2', 'iso5', 'iso6', 'dash'])

export function audioMime(bytes: Buffer): string | undefined {
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WAVE') return 'audio/wav'
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'FORM' && ['AIFF', 'AIFC'].includes(ascii(bytes, 8, 12))) return 'audio/aiff'
  if (ascii(bytes, 0, 4) === 'fLaC') return 'audio/flac'
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp' && MP4_BRANDS.has(ascii(bytes, 8, 12))) return 'audio/mp4'
  if (ascii(bytes, 0, 4) === 'OggS' && bytes.length >= 27) {
    // The first page's packet starts after its segment table.
    const start = 27 + bytes[26]!
    if (ascii(bytes, start, start + 7) === '\x01vorbis' || ascii(bytes, start, start + 8) === 'OpusHead') return 'audio/ogg'
    return undefined
  }
  if (ascii(bytes, 0, 3) === 'ID3') return 'audio/mpeg'
  // An MPEG frame sync: 11 set bits, then a version that isn't reserved. Layer
  // bits 00 is ADTS AAC; anything else is MPEG audio (MP3).
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0 && (bytes[1]! & 0x18) !== 0x08) {
    return (bytes[1]! & 0x06) === 0 ? 'audio/aac' : 'audio/mpeg'
  }
  return undefined
}

function ascii(bytes: Buffer, start: number, end: number): string {
  return bytes.subarray(start, end).toString('latin1')
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
