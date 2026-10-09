import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { askInputSchema, compileQuestions, questionIds, shapeAnswer, type AskInput } from './ask.ts'

const fixturesDir = join(import.meta.dirname, '../fixtures')
const fixtures = Object.fromEntries(
  readdirSync(fixturesDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(fixturesDir, f), 'utf8')) as unknown]),
)

const parse = (input: unknown) => askInputSchema.parse(input)
const fixture = (name: string) => parse(fixtures[name])
const props = (input: AskInput) => compileQuestions(input).schema.properties as Record<string, Record<string, unknown>>
const issues = (input: unknown) => askInputSchema.safeParse(input).error?.issues.map((i) => i.message) ?? []

describe('fixtures', () => {
  it.each(Object.keys(fixtures))('%s validates and compiles', (name) => {
    const input = fixture(name)
    const { schema } = compileQuestions(input)
    expect(Object.keys(schema.properties as object)).toEqual(questionIds(input.questions))
  })

  it('covers every question type, the maximum and previews', () => {
    const all = Object.values(fixtures).map(parse)
    const types = new Set(all.flatMap((f) => f.questions.map((q) => q.type)))
    expect([...types].sort()).toEqual(['boolean', 'choice', 'number', 'path', 'text'])
    expect(all.some((f) => f.questions.length === 4)).toBe(true)
    expect(all.some((f) => f.questions.some((q) => q.options?.every((o) => o.preview)))).toBe(true)
  })
})

describe('input validation', () => {
  const q = { header: 'Pick', question: 'Which?' }
  const options = [{ label: 'A' }, { label: 'B' }]

  it('defaults type to choice', () => {
    expect(parse({ questions: [{ ...q, options }] }).questions[0]!.type).toBe('choice')
  })

  it('explains a choice without options', () => {
    expect(issues({ questions: [{ ...q, type: 'text' }, q] }))
      .toEqual([expect.stringContaining("question 2 has type 'choice' but no options")])
  })

  it('rejects options on other types', () => {
    expect(issues({ questions: [{ ...q, type: 'text', options }] }))
      .toEqual([expect.stringContaining("question 1 has type 'text' but also has options")])
  })

  it('rejects an explicit Other option unless allowOther is false', () => {
    const withOther = [...options, { label: 'Other (specify)' }]
    expect(issues({ questions: [{ ...q, options: withOther }] }))
      .toEqual([expect.stringContaining("labelled 'Other (specify)'")])
    expect(issues({ questions: [{ ...q, options: withOther, allowOther: false }] })).toEqual([])
  })

  it('rejects duplicate labels, duplicate ids, min above max', () => {
    expect(issues({ questions: [{ ...q, options: [{ label: 'A' }, { label: 'A' }] }] }))
      .toEqual([expect.stringContaining("two options labelled 'A'")])
    expect(issues({ questions: [{ ...q, id: 'x', options }, { ...q, id: 'x', options }] }))
      .toEqual([expect.stringContaining("questions 1 and 2 both have id 'x'")])
    expect(issues({ questions: [{ ...q, type: 'number', min: 5, max: 1 }] }))
      .toEqual([expect.stringContaining('min 5 above max 1')])
  })

  it('limits header length, option count and question count', () => {
    expect(issues({ questions: [{ ...q, header: 'Authentication method', options }] }))
      .toEqual([expect.stringContaining('12 characters or fewer')])
    expect(issues({ questions: [{ ...q, options: [{ label: 'A' }] }] }))
      .toEqual([expect.stringContaining('at least 2 options')])
    expect(issues({ questions: Array(5).fill({ ...q, options }) }))
      .toEqual([expect.stringContaining('at most 4 questions')])
  })
})

describe('questionIds', () => {
  it('slugs headers', () => {
    expect(questionIds([{ header: 'Auth method' }, { header: 'Café / Bar!' }, { header: '2FA' }, { header: '???' }]))
      .toEqual(['auth_method', 'cafe_bar', 'q_2fa', 'question_4'])
  })

  it('deduplicates with a numeric suffix and reserves explicit ids', () => {
    expect(questionIds([{ header: 'Name' }, { header: 'name' }, { header: 'Other', id: 'name_2' }, { header: 'NAME' }]))
      .toEqual(['name', 'name_3', 'name_2', 'name_4'])
  })
})

describe('compileQuestions', () => {
  it('builds an object schema in question order with a required list', () => {
    const spec = compileQuestions(fixture('four-questions'))
    expect(spec.title).toBe('Before I refactor the auth module')
    expect(spec.schema).toMatchObject({
      type: 'object',
      required: ['scope', 'providers', 'keep_api'],
    })
    expect(Object.keys(spec.schema.properties as object)).toEqual(['scope', 'providers', 'keep_api', 'branch'])
  })

  it('compiles single choice with Other as anyOf and without as oneOf', () => {
    const p = props(fixture('choice'))
    expect(p.layout).toEqual({
      'x-widget': 'choice',
      title: 'Layout',
      description: 'How should I lay out the new packages?',
      type: 'string',
      anyOf: [
        expect.objectContaining({ const: 'Workspace (Recommended)', title: 'Workspace (Recommended)', description: expect.any(String) }),
        expect.objectContaining({ const: 'Single package' }),
        expect.objectContaining({ const: 'Separate repos' }),
        { type: 'string', minLength: 1, title: 'Other' },
      ],
    })
    expect(p.node_version).toEqual({
      'x-widget': 'choice',
      title: 'Node',
      description: 'Which Node version should CI pin?',
      type: 'string',
      oneOf: [{ const: '24 LTS (Recommended)', title: '24 LTS (Recommended)' }, { const: '26 current', title: '26 current' }],
    })
  })

  it('compiles multi choice as a unique array, minItems only when required', () => {
    const p = props(fixture('multi-select'))
    expect(p.checks).toMatchObject({ type: 'array', uniqueItems: true, minItems: 1, items: { type: 'string', anyOf: expect.any(Array) } })
    const optional = props(parse({ questions: [{ header: 'X', question: '?', multiSelect: true, required: false, options: [{ label: 'a' }, { label: 'b' }] }] }))
    expect(optional.x).not.toHaveProperty('minItems')
  })

  it('carries previews as x-preview', () => {
    const p = props(fixture('previews'))
    const anyOf = p.errors!.anyOf as Record<string, unknown>[]
    expect(anyOf[0]!['x-preview']).toContain('type Result<T>')
  })

  it('compiles text', () => {
    const p = props(fixture('text'))
    expect(p.name).toEqual({ 'x-widget': 'text', title: 'Name', description: expect.any(String), type: 'string', minLength: 1, 'x-placeholder': 'e.g. @parley/forms' })
    expect(p.notes).toEqual({ 'x-widget': 'text', title: 'Notes', description: expect.any(String), type: 'string', 'x-multiline': true })
  })

  it('compiles number and integer', () => {
    const p = props(fixture('number'))
    expect(p.retries).toMatchObject({ 'x-widget': 'number', type: 'integer', minimum: 0, maximum: 10 })
    expect(p.budget).toMatchObject({ 'x-widget': 'number', type: 'number', minimum: 0 })
    expect(p.budget).not.toHaveProperty('maximum')
  })

  it('compiles boolean without a default', () => {
    const p = props(fixture('boolean'))
    expect(p.migrate).toEqual({ 'x-widget': 'boolean', title: 'Migrate', description: expect.any(String), type: 'boolean' })
  })

  it('compiles path, single and multiple, normalising extensions', () => {
    const p = props(fixture('path'))
    expect(p.fixtures).toMatchObject({
      'x-widget': 'path', type: 'array', uniqueItems: true, minItems: 1,
      items: { type: 'string', minLength: 1 }, 'x-path-kind': 'file', 'x-extensions': ['json', 'jsonc'],
    })
    expect(p.output).toMatchObject({ 'x-widget': 'path', type: 'string', 'x-path-kind': 'directory' })
  })
})

describe('shapeAnswer', () => {
  it('shapes every type, Other in single and multi select, and a skipped optional', () => {
    const input = parse({
      questions: [
        { header: 'Approach', question: '?', options: [{ label: 'Workspace' }, { label: 'Single' }] },
        { header: 'Name', question: '?', options: [{ label: 'parley' }, { label: 'ask' }] },
        { header: 'Checks', question: '?', multiSelect: true, options: [{ label: 'Lint' }, { label: 'Test' }] },
        { header: 'Port', question: '?', type: 'number' },
      ],
    })
    const { structured, text } = shapeAnswer(input, {
      status: 'answered',
      data: { approach: 'Workspace', name: 'parley-ui', checks: ['Lint', 'Fuzzing'], port: 8080 },
    })
    expect(structured).toEqual({
      status: 'answered',
      message: text,
      answers: {
        approach: { header: 'Approach', value: 'Workspace' },
        name: { header: 'Name', value: 'parley-ui', custom: 'parley-ui' },
        checks: { header: 'Checks', value: ['Lint', 'Fuzzing'], custom: 'Fuzzing' },
        port: { header: 'Port', value: 8080 },
      },
    })
    expect(text).toBe([
      'The user answered:',
      '- Approach: Workspace',
      '- Name: "parley-ui" (their own answer, not one of the options)',
      '- Checks: Lint, "Fuzzing" (their own answer, not one of the options)',
      '- Port: 8080',
    ].join('\n'))
  })

  it('shapes text, boolean, path and blanks', () => {
    const { structured, text } = shapeAnswer(fixture('four-questions'), {
      status: 'answered',
      data: { scope: 'Everything', providers: ['GitHub', 'Okta'], keep_api: false },
    })
    expect(structured.answers).toEqual({
      scope: { header: 'Scope', value: 'Everything' },
      providers: { header: 'Providers', value: ['GitHub', 'Okta'] },
      keep_api: { header: 'Keep API', value: false },
      branch: { header: 'Branch', value: null },
    })
    expect(text).toBe([
      'The user answered:',
      '- Scope: Everything',
      '- Providers: GitHub, Okta',
      '- Keep API: No',
      '- Branch: (left blank)',
    ].join('\n'))

    const paths = shapeAnswer(fixture('path'), {
      status: 'answered',
      data: { fixtures: ['/Users/logan/a.json', '/Users/logan/b.json'], output: '' },
    })
    expect(paths.structured.answers).toEqual({
      fixtures: { header: 'Fixtures', value: ['/Users/logan/a.json', '/Users/logan/b.json'] },
      output: { header: 'Output', value: null },
    })
    expect(paths.text).toContain('- Fixtures: /Users/logan/a.json, /Users/logan/b.json')

    const notes = shapeAnswer(fixture('text'), { status: 'answered', data: { name: 'forms', notes: 'one\ntwo' } })
    expect(notes.text).toBe('The user answered:\n- Name: forms\n- Notes:\n  one\n  two')
    expect(shapeAnswer(fixture('boolean'), { status: 'answered', data: { migrate: true } }).text)
      .toBe('The user answered:\n- Migrate: Yes\n- Notify: (left blank)')
  })

  it('shapes every non-answer status', () => {
    const input = fixture('choice')
    const dismissed = "The user skipped this without answering. Don't ask it again. Continue with your best judgment and say what you assumed."
    expect(shapeAnswer(input, { status: 'dismissed' })).toEqual({
      structured: { status: 'dismissed', message: dismissed },
      text: dismissed,
    })
    const timedOut = 'No answer after 10 minutes, so the question was withdrawn. Continue with your best judgment and say what you assumed, or ask in chat.'
    expect(shapeAnswer(input, { status: 'timed_out' })).toEqual({
      structured: { status: 'timed_out', message: timedOut },
      text: timedOut,
    })
    expect(shapeAnswer({ ...input, timeoutSeconds: 45 }, { status: 'timed_out' }).text).toContain('after 45 seconds')
    expect(shapeAnswer(input, { status: 'cancelled' }).structured).toEqual({
      status: 'cancelled',
      message: 'The question was cancelled before the user answered.',
    })
  })

  it('treats junk data as blanks', () => {
    const { structured } = shapeAnswer(fixture('number'), { status: 'answered', data: { retries: '3', budget: Number.NaN } })
    expect(structured.answers).toEqual({
      retries: { header: 'Retries', value: null },
      budget: { header: 'Budget', value: null },
    })
  })
})
