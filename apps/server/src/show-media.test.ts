import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { INLINE_MEDIA_FILE_MAX_BYTES, MEDIA_FILE_MAX_BYTES, type Media } from '@parley/protocol'
import { askInputSchema } from '@parley/protocol/ask'
import { ShowFileError } from './show-files.ts'
import { inlineMediaUrls, readShowMedia } from './show-media.ts'

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])
let root: string
let project: string
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'parley-media-'))
  project = join(root, 'project')
  mkdirSync(project)
  mkdirSync(join(project, '.dot'))
  mkdirSync(join(project, '.git'))
  writeFileSync(join(project, '.dot/a.png'), png)
  writeFileSync(join(project, 'a b.png'), png)
  writeFileSync(join(project, 'not-image.png'), 'plain text')
  writeFileSync(join(project, 'a.svg'), '<svg/>')
  writeFileSync(join(project, '.env.local'), png)
  writeFileSync(join(project, '.git/a.png'), png)
  writeFileSync(join(project, 'big.png'), png)
  truncateSync(join(project, 'big.png'), MEDIA_FILE_MAX_BYTES + 1)
  writeFileSync(join(root, 'out.png'), png)
  symlinkSync(join(root, 'out.png'), join(project, 'link.png'))
  symlinkSync(join(project, '.env.local'), join(project, 'secret.png'))
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

const input = (text: string) => askInputSchema.parse({ questions: [{ header: 'Image', question: text, type: 'boolean' }] })
const read = (src: string) => readShowMedia(input(`![Caption](<${src}>)`), {}, project)

describe('readShowMedia', () => {
  it('keeps references and sniffed MIME, including dot directories and spaces', async () => {
    expect((await read('.dot/a.png'))['.dot/a.png']).toEqual({ kind: 'image', files: [{
      path: '.dot/a.png', abs: expect.stringContaining('/project/.dot/a.png'), bytes: png.length,
      sha256: createHash('sha256').update(png).digest('hex'), mime: 'image/png',
    }] })
    expect((await read(join(project, 'a b.png')))[join(project, 'a b.png')]!.files[0]!.path).toBe('a b.png')
  })
  it.each([
    ['../out.png', /outside the project/], ['link.png', /outside the project/],
    ['.env.local', /secrets/], ['secret.png', /secrets/], ['.git/a.png', /secrets/],
    ['not-image.png', /isn't an image \(PNG, JPEG, GIF or WebP\)/], ['a.svg', /SVG: use a `show` with `path`/],
    ['big.png', /25 MB/], ['.dot', /regular file/], ['missing.png', /doesn't exist/],
  ])('refuses %s', async (src, message) => {
    await expect(read(src)).rejects.toBeInstanceOf(ShowFileError)
    await expect(read(src)).rejects.toThrow(message)
  })
  it.each([homedir(), '/'])('refuses a client with no project (%s)', async (cwd) => {
    await expect(readShowMedia(input('![x](a.png)'), {}, cwd)).rejects.toThrow(/didn't start Parley in a project/)
  })
  it('deduplicates refs and refuses more than 200', async () => {
    expect(Object.keys(await readShowMedia(input('![a](.dot/a.png) ![b](.dot/a.png)'), {}, project))).toHaveLength(1)
    await expect(readShowMedia(input(Array.from({ length: 201 }, (_, i) => `![x](${i}.png)`).join(' ')), {}, project))
      .rejects.toThrow(/200 media files/)
  })
  it.each([
    ['JPEG', Buffer.from([255, 216, 255, 0]), 'image/jpeg'],
    ['GIF87a', Buffer.from('GIF87a'), 'image/gif'], ['GIF89a', Buffer.from('GIF89a'), 'image/gif'],
    ['WebP', Buffer.from('RIFF0000WEBP'), 'image/webp'],
  ])('sniffs %s regardless of extension', async (name, bytes, mime) => {
    const src = `${name}.bin`
    writeFileSync(join(project, src), bytes)
    expect((await read(src))[src]!.files[0]!.mime).toBe(mime)
  })
  it('does nothing for remote URLs or code, even outside a project', async () => {
    expect(await readShowMedia(input('![x](https://example.com/a.png) `![x](a.png)`'), {}, '/')).toEqual({})
  })
})

describe('inlineMediaUrls', () => {
  it('returns data only in its separate metadata payload, skipping changed and missing files', async () => {
    const media = await read('.dot/a.png')
    expect(await inlineMediaUrls(media)).toEqual({ '.dot/a.png': `data:image/png;base64,${png.toString('base64')}` })
    expect(JSON.stringify(media)).not.toContain('base64')
    const file = media['.dot/a.png']!.files[0]!
    expect(await inlineMediaUrls({ changed: { kind: 'image', files: [{ ...file, sha256: 'different' }] } })).toEqual({})
    expect(await inlineMediaUrls({ missing: { kind: 'image', files: [{ ...file, abs: join(project, 'gone.png') }] } })).toEqual({})
  })
  it('caps each image and the ask, and leaves window references intact', async () => {
    const bytes = Buffer.alloc(INLINE_MEDIA_FILE_MAX_BYTES)
    const abs = join(project, 'inline.png')
    writeFileSync(abs, bytes)
    const file = { path: 'inline.png', abs, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, mime: 'image/png' }
    const media: Media = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [String(i), { kind: 'image', files: [file] }]))
    expect(Object.keys(await inlineMediaUrls(media))).toEqual(['0', '1', '2', '3'])
    expect(await inlineMediaUrls({ large: { kind: 'image', files: [{ ...file, bytes: bytes.length + 1 }] } })).toEqual({})
    expect(Object.keys(media)).toHaveLength(5)
  })
})
