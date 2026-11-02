import { describe, expect, it } from 'vitest'
import { mediaRefs, type Media } from './media.ts'
import { askInputSchema, askMediaRefs, compileQuestions } from './ask.ts'

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
  it('handles reference images and ignores unclaimed compare fences', () => {
    expect(mediaRefs('![x][shot]\n\n[shot]: a.png\n\n```compare\n![x](later.png)\n```')).toEqual(['a.png'])
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
