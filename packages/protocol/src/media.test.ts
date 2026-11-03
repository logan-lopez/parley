import { describe, expect, it } from 'vitest'
import { compareFences, isMediaGlob, looksLikeSound, mediaRefs, parseCompare, type Media } from './media.ts'
import { askCompareFences, askInputSchema, askMediaRefs, compileQuestions } from './ask.ts'

describe('mediaRefs', () => {
  it('uses markdown destinations, preserving spaces, Unicode and percent signs', () => {
    expect(mediaRefs('![One](shots/a.png) ![Two](<shots/a b.png>) ![Three](é%20.png) ![Paren](a(b).png) ![Again](shots/a.png)'))
      .toEqual(['shots/a.png', 'shots/a b.png', 'é%20.png', 'a(b).png'])
  })
  it('skips code spans, fenced and indented code, escaped images and schemes', () => {
    expect(mediaRefs('`![x](code.png)`\n\n```md\n![x](fence.png)\n```\n\n    ![x](indent.png)\n\n'
      + '\\![x](escaped.png) ![x](https://example.com/a.png) ![x](data:image/png;base64,AA) ![x](file:///a.png) ![x](//example.com/a.png)'))
      .toEqual([])
  })
  it('keeps glob characters in sound refs, and tells globs and sounds apart', () => {
    expect(mediaRefs('![Take 1](audition/jump/1_*.wav) ![Take 2](a/take_?.ogg)')).toEqual(['audition/jump/1_*.wav', 'a/take_?.ogg'])
    expect(isMediaGlob('a/1_*.wav')).toBe(true)
    expect(isMediaGlob('a*/1.wav')).toBe(false)
    expect(['a.WAV', 'b.mp3', 'c.m4a', 'd.flac', 'e.ogg', 'f.aif', 'g/*'].every(looksLikeSound)).toBe(true)
    expect(looksLikeSound('shot.png')).toBe(false)
  })
  it('handles reference images and reads two-image compare fences', () => {
    expect(mediaRefs('![x][shot]\n\n[shot]: a.png\n\n```compare\nshots/before.png Now\n<shots/after b.png> Bigger\n```'))
      .toEqual(['a.png', 'shots/before.png', 'shots/after b.png'])
    expect(mediaRefs('![x][shot]\n\n[shot]: a.png\n\n```compare\n![x](later.png)\n```')).toEqual(['a.png'])
  })
})

describe('parseCompare', () => {
  it('parses two paths with labels, defaults to A and B, and takes paths with spaces in <...>', () => {
    expect(parseCompare('\n  shots/menu-now.png Now  \n  shots/menu-big.png Bigger buttons \n')).toEqual([
      { src: 'shots/menu-now.png', label: 'Now' },
      { src: 'shots/menu-big.png', label: 'Bigger buttons' },
    ])
    expect(parseCompare('shots/a.png\n<shots/after b.png>')).toEqual([
      { src: 'shots/a.png', label: 'A' },
      { src: 'shots/after b.png', label: 'B' },
    ])
    expect(parseCompare('<shots/first one.png> Before\n<shots/second one.png> After')).toEqual([
      { src: 'shots/first one.png', label: 'Before' },
      { src: 'shots/second one.png', label: 'After' },
    ])
  })
  it.each([
    ['one line', 'shots/a.png Now'],
    ['three lines', 'shots/a.png\nshots/b.png\nshots/c.png'],
    ['sound extension', 'shots/a.png\ntakes/1_1.wav'],
    ['glob', 'shots/a.png\nshots/*.png'],
    ['svg', 'shots/a.png\nshots/b.svg'],
    ['remote url', 'shots/a.png\nhttps://example.com/b.png'],
    ['markdown image syntax', '![a](shots/a.png)\n![b](shots/b.png)'],
    ['unclosed angle bracket', '<shots/a b.png\nshots/b.png'],
  ])('refuses %s', (_case, source) => {
    expect(parseCompare(source)).toBeUndefined()
  })
  it('refuses an entry resolved as audio', () => {
    const media: Media = {
      'a.png': { kind: 'image', files: [{ path: 'a.png', abs: '/p/a.png', sha256: 'h', bytes: 1, mime: 'image/png' }] },
      'b.bin': { kind: 'audio', files: [{ path: 'b.bin', abs: '/p/b.bin', sha256: 'h', bytes: 1, mime: 'audio/wav' }] },
    }
    expect(parseCompare('a.png\nb.bin', media)).toBeUndefined()
    expect(compareFences('```compare\na.png\nb.bin\n```')).toEqual(['a.png\nb.bin\n'])
    const ask = askInputSchema.parse({ questions: [{ header: 'Look', question: '```compare\na.png\nb.bin\n```', type: 'boolean' }] })
    expect(askCompareFences(ask)).toEqual(['a.png\nb.bin\n'])
  })
})

describe('media in the form', () => {
  const input = askInputSchema.parse({ questions: [
    { header: 'Choice', question: '![q](q.png)', options: [
      { label: 'One', description: '![d](d.png)', preview: '![p](p.png)' }, { label: 'Two' },
    ] },
    { header: 'Review', question: 'Look', type: 'review', items: [{ label: 'A', detail: '![d](detail.png)', preview: '![p](item.png)' }] },
    { header: 'Show', question: 'Look', type: 'show', content: '![c](content.png)' },
    { header: 'File', question: 'Look', type: 'show', path: 'docs/a.md' },
  ] })
  it('finds every rendered markdown field and shown markdown files', () => {
    expect(askMediaRefs(input, { file: { path: 'docs/a.md', text: '![f](file.png)', totalLines: 1, sha256: 'hash' } }))
      .toEqual(['q.png', 'd.png', 'p.png', 'detail.png', 'item.png', 'content.png', 'file.png'])
    expect(askMediaRefs(input, { file: { path: 'a.ts', text: '![f](code.png)', totalLines: 1, sha256: 'hash' } }))
      .not.toContain('code.png')
  })
  it('writes x-media only when resolved, without changing the input schema', () => {
    const media: Media = { 'q.png': { kind: 'image', files: [{ path: 'q.png', abs: '/project/q.png', sha256: 'hash', bytes: 42, mime: 'image/png' }] } }
    expect(compileQuestions(input, undefined, media).schema['x-media']).toEqual(media)
    expect(compileQuestions(input).schema).not.toHaveProperty('x-media')
    expect(compileQuestions(input, {}, {}).schema).not.toHaveProperty('x-media')
  })
})
