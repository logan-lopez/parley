import { describe, expect, it } from 'vitest'
import { stampState, type JsonSchema } from './form.ts'
import { askInputSchema, shapeAnswer } from './ask.ts'

const choice = { 'x-widget': 'choice', title: 'Commit', type: 'string', oneOf: [
  { const: 'yes', title: 'Yes (Recommended)' }, { const: 'no', title: 'No' },
] }
function schema(properties: Record<string, JsonSchema>, required: string[] = []) {
  return { type: 'object', properties, required }
}
const base = schema({ commit: choice })

describe('stampState', () => {
  it('fills a single recommendation without mutating input, and accepts agreement', () => {
    const input = {}
    expect(stampState(base, input)).toEqual({ kind: 'ready', data: { commit: 'yes' } })
    expect(input).toEqual({})
    expect(stampState(base, { commit: 'yes' }).kind).toBe('ready')
    expect(stampState(base, { commit: 'no' })).toEqual({ kind: 'blocked', reasons: ['You chose differently on: Commit'] })
  })
  it('ignores missing and ambiguous single recommendations, case insensitive suffix only', () => {
    for (const labels of [['yes', 'no'], ['Yes (Recommended)', 'No (recommended)'], ['(Recommended) Yes', 'no']]) {
      expect(stampState(schema({ q: { ...choice, oneOf: labels.map((title) => ({ title, const: title })) } }), {}).kind).toBe('none')
    }
    expect(stampState(schema({ q: { ...choice, oneOf: [{ title: 'Yes (rEcOmMeNdEd)', const: 'yes' }] } }), {}).kind).toBe('ready')
  })
  it('fills and compares multi recommendations as a set, including Other branches', () => {
    const multi = schema({ q: { 'x-widget': 'choice', type: 'array', items: { anyOf: [
      { title: 'A (Recommended)', const: 'a' }, { title: 'B (Recommended)', const: 'b' }, { type: 'string' },
    ] } } })
    expect(stampState(multi, {})).toEqual({ kind: 'ready', data: { q: ['a', 'b'] } })
    expect(stampState(multi, { q: ['b', 'a'] }).kind).toBe('ready')
    for (const q of [['a'], ['a', 'a'], ['a', 'b', 'c']]) expect(stampState(multi, { q }).kind).toBe('blocked')
  })
  it('blocks cleared or changed drafts, with the answer shaper normalisation', () => {
    const draft = schema({ q: { 'x-widget': 'text', 'x-draft': 'hello\r\nworld' } })
    for (const q of [undefined, '', 'changed']) expect(stampState(draft, { q }).kind).toBe('blocked')
    expect(stampState(draft, { q: ' hello\nworld\n' }).kind).toBe('ready')
  })
  it('fills preset reviews, preserving comments and rejecting a different decision', () => {
    const review = schema({ q: { 'x-widget': 'review', 'x-default-decision': 'reject', items: [{}, {}] } })
    expect(stampState(review, { q: [{ comment: 'because' }] })).toEqual({ kind: 'ready', data: { q: [{ decision: 'reject', comment: 'because' }, { decision: 'reject' }] } })
    expect(stampState(review, { q: [{ decision: 'approve' }] }).kind).toBe('blocked')
  })
  it.each(['boolean', 'number', 'path', 'capture', 'text', 'review'])('keeps %s answers without recommendations, blocks required blanks', (widget) => {
    const form = schema({ commit: choice, q: { title: 'Port', 'x-widget': widget, 'x-default-decision': 'none' } }, ['q'])
    expect(stampState(form, {})).toEqual({ kind: 'blocked', reasons: ['Still needs an answer: Port'] })
    if (widget === 'review') expect(stampState(form, { q: [{}, {}] })).toEqual({ kind: 'blocked', reasons: ['Still needs an answer: Port'] })
    const values: Record<string, unknown> = { boolean: false, number: 0, path: '/tmp/file', capture: { text: 'output' }, text: 'answer', review: [{ decision: 'reject' }] }
    const q = values[widget]
    expect(stampState(form, { q })).toEqual({ kind: 'ready', data: { q, commit: 'yes' } })
    expect(stampState({ ...form, required: [] }, {}).kind).toBe('ready')
  })
  it('ignores plain shows and blocks edited shows', () => {
    const form = schema({ commit: choice, view: { 'x-widget': 'show' }, file: { title: 'File', 'x-widget': 'show', 'x-editable': true, 'x-original': 'abc' } })
    expect(stampState(form, { file: { text: 'abc', base: 'hash' } }).kind).toBe('ready')
    expect(stampState(form, { file: { text: 'changed' } })).toEqual({ kind: 'blocked', reasons: ['You chose differently on: File'] })
  })
})

const input = askInputSchema.parse({ questions: [{ header: 'Go', question: 'Go ahead?', type: 'boolean' }] })
it('pins stamped and ordinary answer summaries and stamped metadata', () => {
  const ordinary = shapeAnswer(input, { status: 'answered', data: { go: true } })
  expect(ordinary.text.split('\n')[0]).toBe('The user answered:')
  expect(ordinary.structured).not.toHaveProperty('stamped')
  const stamped = shapeAnswer(input, { status: 'answered', data: { go: true }, stamped: true, note: 'ok', remember: ['go'] })
  expect(stamped.text.split('\n')[0]).toBe('The user read this and approved every recommendation:')
  expect(stamped.structured).toMatchObject({ status: 'answered', stamped: true, note: 'ok', remember: [{ id: 'go' }] })
})
it('pins skip and timeout permission wording, including notes and both durations', () => {
  const tail = "Continue with your best judgment and say what you assumed, but if you were asking for permission to go ahead, don't: say in chat that you're waiting."
  expect(shapeAnswer(input, { status: 'dismissed' }).text).toBe("The user skipped this without answering. That isn't approval. Don't ask it again. " + tail)
  const noted = shapeAnswer(input, { status: 'dismissed', note: 'later' }).text
  expect(noted).toBe("The user skipped this without answering, and left a note:\n> later\n\nThat isn't approval. Don't ask it again unless the note says to. " + tail)
  for (const [timeoutSeconds, duration] of [[60, '60 seconds'], [180, '3 minutes']] as const) {
    expect(shapeAnswer({ ...input, timeoutSeconds }, { status: 'timed_out' }).text).toBe(`No answer after ${duration}, so the question was withdrawn. That isn't approval. Continue with your best judgment and say what you assumed, or ask in chat, but if you were asking for permission to go ahead, don't: say in chat that you're waiting.`)
  }
})
