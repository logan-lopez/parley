import { describe, expect, it } from 'vitest'
import { createAjv } from '@jsonforms/core'
import { askInputSchema, compileQuestions } from '@parley/protocol/ask'

// Every fixture's compiled schema, under the AJV settings JSON Forms uses and
// under strict mode with the `x-*` keywords declared. Strict mode is where
// AJV warns about tuples without `minItems` and `additionalItems`.
const modules = import.meta.glob<{ default: unknown }>('../../../../packages/protocol/fixtures/*.json', { eager: true })
const schemas = Object.fromEntries(
  Object.entries(modules).map(([path, mod]) => [
    path.split('/').pop()!.replace(/\.json$/, ''),
    compileQuestions(askInputSchema.parse(mod.default)).schema,
  ]),
)

function xKeywords(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => xKeywords(v, found))
  else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      if (key.startsWith('x-')) found.add(key)
      xKeywords(v, found)
    }
  }
  return found
}

function compile(schema: object, strict: boolean) {
  const warnings: unknown[] = []
  const logger = { log: () => {}, warn: (...args: unknown[]) => warnings.push(args), error: (...args: unknown[]) => warnings.push(args) }
  const ajv = createAjv(strict ? { strict: true, logger } : { logger })
  if (strict) ajv.addVocabulary([...xKeywords(schema)])
  return { validate: ajv.compile(schema), warnings }
}

describe('compiled schemas under AJV', () => {
  it.each(Object.keys(schemas))('%s compiles without warnings', (name) => {
    expect(compile(schemas[name]!, false).warnings).toEqual([])
    expect(compile(schemas[name]!, true).warnings).toEqual([])
  })

  it('requires every decision under defaultDecision none', () => {
    const { validate } = compile(schemas['review-diff']!, false)
    const decided = Array.from({ length: 4 }, () => ({ decision: 'approve' }))
    expect(validate({ changes: decided })).toBe(true)
    expect(validate({ changes: [{ decision: 'reject', comment: 'no' }, {}, {}, decided[0]] })).toBe(false)
    expect(validate.errors!.filter((e) => e.keyword === 'required').map((e) => e.instancePath))
      .toEqual(['/changes/1', '/changes/2'])
    expect(validate({ changes: decided.slice(1) })).toBe(false)
    expect(validate({ changes: [...decided, { decision: 'approve' }] })).toBe(false)
  })

  it('takes text, screenshots or both in a required capture, and nothing empty', () => {
    const { validate } = compile(schemas.capture!, false)
    const shot = '/tmp/parley-capture-1.png'
    expect(validate({ console: { text: '[818, 57]' } })).toBe(true)
    expect(validate({ console: { images: [shot] } })).toBe(true)
    expect(validate({ console: { text: 'x', images: [shot] } })).toBe(true)
    expect(validate({})).toBe(false)
    expect(validate({ console: {} })).toBe(false)
    expect(validate({ console: { text: '', images: [] } })).toBe(false)
    expect(validate({ console: { images: Array(6).fill(shot) } })).toBe(false)
    expect(validate({ console: { text: 'x', html: '<b>' } })).toBe(false)
  })

  it('takes only text in a text capture, and lets an optional one be blank', () => {
    const { validate } = compile(schemas['capture-text']!, false)
    expect(validate({ version: { text: 'v2.1.296' } })).toBe(true)
    expect(validate({ version: { text: 'v2' }, trace: {} })).toBe(true)
    expect(validate({ version: { text: '' } })).toBe(false)
    expect(validate({ version: { text: 'v2', images: ['/tmp/a.png'] } })).toBe(false)
  })

  it('lets a review with a default leave decisions out', () => {
    const { validate } = compile(schemas.review!, false)
    expect(validate({ cleanup: Array.from({ length: 12 }, () => ({})) })).toBe(true)
  })
})
