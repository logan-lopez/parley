import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { INLINE_MEDIA_FILE_MAX_BYTES, MEDIA_FILE_MAX_BYTES, type Media } from '@parley/protocol'
import { askInputSchema } from '@parley/protocol/ask'
import { ShowFileError } from './show-files.ts'
import { audioMime, inlineMediaUrls, readShowMedia } from './show-media.ts'

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])
const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt ')])
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
  mkdirSync(join(project, 'takes'))
  for (const name of ['1_10.wav', '1_2.wav', '1_1.wav', '2_a.wav', '.1_hidden.wav']) writeFileSync(join(project, 'takes', name), wav)
  mkdirSync(join(project, 'many'))
  for (let i = 1; i <= 13; i++) writeFileSync(join(project, 'many', `t${i}.wav`), wav)
  mkdirSync(join(project, 'mixed'))
  writeFileSync(join(project, 'mixed/a.wav'), wav)
  writeFileSync(join(project, 'mixed/b.wav'), 'not a sound')
  mkdirSync(join(project, 'secret'))
  writeFileSync(join(project, 'secret/a.wav'), wav)
  writeFileSync(join(project, 'secret/a.wav.pem'), wav)
  mkdirSync(join(project, 'pics'))
  writeFileSync(join(project, 'pics/a.png'), png)
  writeFileSync(join(project, 'pics/b.png'), png)
  mkdirSync(join(project, 'twelve'))
  for (let i = 1; i <= 12; i++) writeFileSync(join(project, 'twelve', `v${String(i).padStart(2, '0')}.wav`), wav)
  mkdirSync(join(project, 'set1'))
  writeFileSync(join(project, 'set1/a.wav'), wav)
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
    ['not-image.png', /isn't an image \(PNG, JPEG, GIF or WebP\) or a sound/], ['a.svg', /SVG: use a `show` with `path`/],
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
  it('resolves both images in a compare fence and refuses non-images or wrong line counts', async () => {
    const media = await readShowMedia(input('```compare\n.dot/a.png Now\n<a b.png> Bigger\n```'), {}, project)
    expect(Object.keys(media)).toEqual(['.dot/a.png', 'a b.png'])
    expect(media['.dot/a.png']!.kind).toBe('image')
    expect(media['a b.png']!.files[0]!.path).toBe('a b.png')
    for (const bad of [
      '```compare\n.dot/a.png\n```',
      '```compare\n.dot/a.png\na b.png\npics/a.png\n```',
      '```compare\n.dot/a.png\ntakes/1_1.wav\n```',
    ]) {
      await expect(readShowMedia(input(bad), {}, project)).rejects.toThrow(/```compare fence takes two image paths/)
    }
    writeFileSync(join(project, 'sound.bin'), wav)
    await expect(readShowMedia(input('```compare\n.dot/a.png\nsound.bin\n```'), {}, project))
      .rejects.toThrow(/```compare fence takes two image paths/)
  })
})

describe('sounds', () => {
  const sound = (src: string) => readShowMedia(input(`![Take](${src})`), {}, project)
  it('resolves a single sound as audio', async () => {
    expect((await sound('takes/1_1.wav'))['takes/1_1.wav']).toEqual({ kind: 'audio', files: [expect.objectContaining({ path: 'takes/1_1.wav', mime: 'audio/wav', bytes: wav.length })] })
  })
  it('expands a glob in its directory, sorted by name with numbers in order, skipping dotfiles', async () => {
    const entry = (await sound('takes/1_*.wav'))['takes/1_*.wav']!
    expect(entry.kind).toBe('audio')
    expect(entry.files.map((f) => f.path)).toEqual(['takes/1_1.wav', 'takes/1_2.wav', 'takes/1_10.wav'])
    expect((await sound('takes/?_a.wav'))['takes/?_a.wav']!.files.map((f) => f.path)).toEqual(['takes/2_a.wav'])
    expect((await sound('takes/.1_*.wav'))['takes/.1_*.wav']!.files.map((f) => f.path)).toEqual(['takes/.1_hidden.wav'])
  })
  it('takes a glob in the project root', async () => {
    writeFileSync(join(project, 'root-take.wav'), wav)
    expect((await sound('root-*.wav'))['root-*.wav']!.files.map((f) => f.path)).toEqual(['root-take.wav'])
  })
  it.each([
    ['many/t*.wav', /matches 13 files; a sound takes at most 12 variants/],
    ['takes/9_*.wav', /matches no files in `takes\/`/],
    ['mixed/*.wav', /`mixed\/b.wav` isn't an image .* or a sound/],
    ['secret/a.wav*', /doesn't show `secret\/a.wav.pem`: it looks like it holds secrets/],
    ['.git/*.wav', /secrets/],
    ['set*/a.wav', /a glob works in the file name only, not in directory names/],
    ['takes/**.wav', /`\*\*` isn't supported/],
    ['pics/*.png', /matches images: one image per/],
    ['../*.wav', /outside the project/],
  ])('refuses %s', async (src, message) => {
    await expect(sound(src)).rejects.toBeInstanceOf(ShowFileError)
    await expect(sound(src)).rejects.toThrow(message)
  })
  it('counts every variant against the 200-file cap', async () => {
    // Distinct patterns that each match all twelve files in `twelve/`.
    const patterns = ['*.wav', 'v*.wav', 'v*wav', 'v*av', 'v*v', '*v', 'v*', '*', '*.w*', 'v*.*', '*.*', '*a*', '*w*', '*av', 'v*a*', '?*', '*?', 'v??.wav']
    const ask = (n: number) => readShowMedia(input(patterns.slice(0, n).map((p) => `![x](twelve/${p})`).join(' ')), {}, project)
    expect(Object.values(await ask(16)).flatMap((e) => e.files)).toHaveLength(192)
    await expect(ask(17)).rejects.toThrow(/more than 200 media files, counting each variant/)
  })
  it.each([
    ['WAV', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]), 'audio/wav'],
    ['AIFF', Buffer.concat([Buffer.from('FORM'), Buffer.alloc(4), Buffer.from('AIFF')]), 'audio/aiff'],
    ['AIFC', Buffer.concat([Buffer.from('FORM'), Buffer.alloc(4), Buffer.from('AIFC')]), 'audio/aiff'],
    ['ID3', Buffer.from('ID3\x04\x00'), 'audio/mpeg'],
    ['MP3 frame', Buffer.from([0xff, 0xfb, 0x90, 0x00]), 'audio/mpeg'],
    ['ADTS', Buffer.from([0xff, 0xf1, 0x50, 0x80]), 'audio/aac'],
    ['M4A', Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A ')]), 'audio/mp4'],
    ['FLAC', Buffer.from('fLaC\x00'), 'audio/flac'],
    ['Vorbis', ogg('\x01vorbis'), 'audio/ogg'],
    ['Opus', ogg('OpusHead'), 'audio/ogg'],
  ])('sniffs %s regardless of extension', async (name, bytes, mime) => {
    expect(audioMime(bytes)).toBe(mime)
    const src = `sniff-${name.replace(' ', '-')}.bin`
    writeFileSync(join(project, src), bytes)
    expect((await sound(src))[src]).toEqual({ kind: 'audio', files: [expect.objectContaining({ mime })] })
  })
  it.each([
    ['Ogg Theora', ogg('\x80theora')], ['HEIF', Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic')])],
    ['reserved MPEG version', Buffer.from([0xff, 0xeb, 0x90, 0x00])], ['text', Buffer.from('RIFF but not')],
  ])('refuses %s', (_name, bytes) => {
    expect(audioMime(bytes)).toBeUndefined()
  })
  it('never inlines sounds', async () => {
    expect(await inlineMediaUrls(await sound('takes/1_1.wav'))).toEqual({})
  })
})

// An Ogg page header with one segment, then the first packet.
function ogg(packet: string): Buffer {
  const header = Buffer.alloc(28)
  header.write('OggS', 0, 'latin1')
  header[26] = 1
  header[27] = packet.length
  return Buffer.concat([header, Buffer.from(packet, 'latin1')])
}

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
