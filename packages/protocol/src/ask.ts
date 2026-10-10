// The `ask` tool's model-facing shape (a questions array, like Claude's
// AskUserQuestion), its compiler to a FormSpec, and the answer shaper.
// Pure functions: the server, fake-ask, the gallery and the tests share them.

import * as z from 'zod/v4'
import type { ChoiceOptionSchema, FormSpec, JsonSchema, OtherOptionSchema, Widget } from './form.ts'

export const DEFAULT_TIMEOUT_SECONDS = 1800
export const QUESTION_TYPES = ['choice', 'text', 'number', 'boolean', 'path'] as const satisfies readonly Widget[]

// Not `.describe()`d field by field: the tool description carries the shape
// and an example, and per-field descriptions bloat every tools/list.
const option = z.object({
  label: z.string().min(1).max(60, 'option labels are 60 characters or fewer; put detail in `description`'),
  description: z.string().max(300).optional(),
  preview: z.string().optional(),
})

const question = z.object({
  id: z.string()
    .regex(/^[a-z][a-z0-9_]*$/, 'id must be snake_case: lowercase letters, digits and underscores, starting with a letter')
    .optional(),
  header: z.string().min(1).max(12, 'header is a short chip of 12 characters or fewer, like "Auth method"; the full question goes in `question`'),
  question: z.string().min(1),
  type: z.enum(QUESTION_TYPES).default('choice'),
  required: z.boolean().optional(),
  // choice
  options: z.array(option)
    .min(2, 'a choice question needs at least 2 options')
    .max(6, 'a choice question takes at most 6 options; the user can still type their own answer')
    .optional(),
  multiSelect: z.boolean().optional(),
  allowOther: z.boolean().optional(),
  // text
  multiline: z.boolean().optional(),
  placeholder: z.string().optional(),
  // number
  min: z.number().optional(),
  max: z.number().optional(),
  integer: z.boolean().optional(),
  // path
  pathKind: z.enum(['file', 'directory']).optional(),
  multiple: z.boolean().optional(),
  extensions: z.array(z.string()).optional(),
})

export const askInputSchema = z.object({
  title: z.string().optional(),
  questions: z.array(question)
    .min(1, 'ask at least 1 question')
    .max(4, 'ask at most 4 questions per call; ask the rest in a follow-up call once you have these answers'),
  timeoutSeconds: z.number().int().min(10).max(3600).optional(),
}).superRefine((input, ctx) => {
  const seen = new Map<string, number>()
  input.questions.forEach((q, i) => {
    const n = i + 1
    const at = (...path: (string | number)[]) => ['questions', i, ...path]

    if (q.id) {
      const first = seen.get(q.id)
      if (first) ctx.addIssue({ code: 'custom', path: at('id'), message: `questions ${first} and ${n} both have id '${q.id}'; ids must be unique` })
      else seen.set(q.id, n)
    }

    if (q.type === 'choice') {
      if (!q.options) {
        ctx.addIssue({ code: 'custom', path: at('options'), message: `question ${n} has type 'choice' but no options; add 2–6 options, or use type 'text' for a free-form answer` })
        return
      }
      const labels = new Set<string>()
      q.options.forEach((o, j) => {
        if (labels.has(o.label)) {
          ctx.addIssue({ code: 'custom', path: at('options', j, 'label'), message: `question ${n} has two options labelled '${o.label}'; labels are the answer values, so they must be unique` })
        }
        labels.add(o.label)
        if (q.allowOther !== false && /^other\b/i.test(o.label.trim())) {
          ctx.addIssue({ code: 'custom', path: at('options', j, 'label'), message: `question ${n} has an option labelled '${o.label}'; leave it out, because choice questions already let the user type their own answer` })
        }
      })
    } else if (q.options) {
      ctx.addIssue({ code: 'custom', path: at('options'), message: `question ${n} has type '${q.type}' but also has options; options only apply to type 'choice', so drop them or set type to 'choice'` })
    }

    if (q.type === 'number' && q.min !== undefined && q.max !== undefined && q.min > q.max) {
      ctx.addIssue({ code: 'custom', path: at('min'), message: `question ${n} has min ${q.min} above max ${q.max}` })
    }
  })
})

export type AskInput = z.input<typeof askInputSchema>
export type Question = AskInput['questions'][number]

// The tool's structuredContent. `message` repeats the text content: Claude
// Code shows the model only structuredContent when a tool declares an
// outputSchema, so guidance like "don't ask again" has to live here too.
const answerValue = z.union([z.string(), z.array(z.string()), z.number(), z.boolean(), z.null()])

export const askResultSchema = z.object({
  status: z.enum(['answered', 'dismissed', 'timed_out', 'cancelled']),
  message: z.string(),
  answers: z.record(z.string(), z.object({
    header: z.string(),
    value: answerValue,        // null: an optional question left blank
    custom: z.string().optional(),   // the user's own text, when it isn't one of the options
  })).optional(),
  note: z.string().optional(),       // free text the user added for the agent, with an answer or a skip
})

export type AskResult = z.infer<typeof askResultSchema>
export type Answer = NonNullable<AskResult['answers']>[string]
export type AnswerValue = Answer['value']

export type AskOutcome =
  | { status: 'answered'; data: unknown; note?: string }
  | { status: 'dismissed'; note?: string }
  | { status: 'cancelled' }   // the MCP client cancelled the call
  | { status: 'timed_out' }

// Answer keys, in question order. An explicit id wins; otherwise a slug of the
// header, with `_2`, `_3`… on collisions (explicit ids are reserved first).
export function questionIds(questions: readonly Pick<Question, 'id' | 'header'>[]): string[] {
  const taken = new Set(questions.flatMap((q) => (q.id ? [q.id] : [])))
  return questions.map((q, i) => {
    if (q.id) return q.id
    const base = slug(q.header) || `question_${i + 1}`
    let id = base
    for (let n = 2; taken.has(id); n++) id = `${base}_${n}`
    taken.add(id)
    return id
  })
}

function slug(text: string): string {
  const s = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!s) return ''
  return /^[a-z]/.test(s) ? s : `q_${s}`
}

const OTHER: OtherOptionSchema = { type: 'string', minLength: 1, title: 'Other' }

export function compileQuestions(input: AskInput): FormSpec {
  const ids = questionIds(input.questions)
  const properties: Record<string, JsonSchema> = {}
  const required: string[] = []
  input.questions.forEach((q, i) => {
    properties[ids[i]!] = compileQuestion(q)
    if (q.required !== false) required.push(ids[i]!)
  })
  return {
    ...(input.title && { title: input.title }),
    schema: { type: 'object', properties, required },
  }
}

function compileQuestion(q: Question): JsonSchema {
  const required = q.required !== false
  const base = { title: q.header, description: q.question }

  switch (q.type ?? 'choice') {
    case 'choice': {
      const options = (q.options ?? []).map((o): ChoiceOptionSchema => ({
        const: o.label,
        title: o.label,
        ...(o.description && { description: o.description }),
        ...(o.preview && { 'x-preview': o.preview }),
      }))
      const choices = q.allowOther === false ? { oneOf: options } : { anyOf: [...options, OTHER] }
      if (q.multiSelect) {
        return {
          'x-widget': 'choice', ...base,
          type: 'array', uniqueItems: true, items: { type: 'string', ...choices },
          ...(required && { minItems: 1 }),
        }
      }
      return { 'x-widget': 'choice', ...base, type: 'string', ...choices }
    }
    case 'text':
      return {
        'x-widget': 'text', ...base,
        type: 'string',
        ...(required && { minLength: 1 }),
        ...(q.multiline && { 'x-multiline': true }),
        ...(q.placeholder && { 'x-placeholder': q.placeholder }),
      }
    case 'number':
      return {
        'x-widget': 'number', ...base,
        type: q.integer ? 'integer' : 'number',
        ...(q.min !== undefined && { minimum: q.min }),
        ...(q.max !== undefined && { maximum: q.max }),
      }
    case 'boolean':
      return { 'x-widget': 'boolean', ...base, type: 'boolean' }
    case 'path': {
      const path = { type: 'string', minLength: 1 }
      const extensions = q.extensions?.map((e) => e.replace(/^\./, '')).filter(Boolean)
      return {
        'x-widget': 'path', ...base,
        ...(q.multiple
          ? { type: 'array', items: path, uniqueItems: true, ...(required && { minItems: 1 }) }
          : path),
        'x-path-kind': q.pathKind ?? 'file',
        ...(extensions?.length && { 'x-extensions': extensions }),
      }
    }
  }
}

export function shapeAnswer(input: AskInput, outcome: AskOutcome): { structured: AskResult; text: string } {
  const note = 'note' in outcome ? outcome.note?.trim() || undefined : undefined
  const text = (status: AskResult['status'], message: string, answers?: AskResult['answers']) => ({
    structured: { status, message, ...(answers && { answers }), ...(note && { note }) },
    text: message,
  })
  switch (outcome.status) {
    case 'dismissed':
      return text('dismissed', note
        ? `The user skipped this without answering, and left a note:\n${quote(note)}\n\n`
          + "Don't ask it again unless the note says to. Continue with your best judgment and say what you assumed."
        : "The user skipped this without answering. Don't ask it again. Continue with your best judgment and say what you assumed.")
    case 'timed_out':
      return text('timed_out', `No answer after ${duration(input.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS)}, so the question was withdrawn. `
        + 'Continue with your best judgment and say what you assumed, or ask in chat.')
    case 'cancelled':
      return text('cancelled', 'The question was cancelled before the user answered.')
    case 'answered':
      break
  }

  const data = isRecord(outcome.data) ? outcome.data : {}
  const ids = questionIds(input.questions)
  const answers: Record<string, Answer> = {}
  const lines = ['The user answered:']
  input.questions.forEach((q, i) => {
    const id = ids[i]!
    const answer = readAnswer(q, data[id])
    answers[id] = answer
    lines.push(describe(answer, new Set(q.options?.map((o) => o.label))))
  })
  if (note) lines.push('', 'They also left a note:', quote(note))
  return text('answered', lines.join('\n'), answers)
}

function quote(text: string): string {
  return text.replace(/^/gm, '> ')
}

function readAnswer(q: Question, raw: unknown): Answer {
  const header = q.header
  const blank: Answer = { header, value: null }
  switch (q.type ?? 'choice') {
    case 'choice': {
      const labels = new Set(q.options?.map((o) => o.label))
      const values = (Array.isArray(raw) ? raw : [raw]).filter(isFilled)
      if (!values.length) return blank
      const custom = values.filter((v) => !labels.has(v))
      return {
        header,
        value: q.multiSelect ? values : values[0]!,
        ...(custom.length && { custom: custom.join(', ') }),
      }
    }
    case 'text':
      return isFilled(raw) ? { header, value: raw } : blank
    case 'number':
      return typeof raw === 'number' && Number.isFinite(raw) ? { header, value: raw } : blank
    case 'boolean':
      return typeof raw === 'boolean' ? { header, value: raw } : blank
    case 'path': {
      const values = (Array.isArray(raw) ? raw : [raw]).filter(isFilled)
      if (!values.length) return blank
      return { header, value: q.multiple ? values : values[0]! }
    }
  }
}

const OWN_ANSWER = '(their own answer, not one of the options)'

// `labels` tells a choice's own-text values apart from its options.
function describe({ header, value, custom }: Answer, labels: Set<string>): string {
  if (value === null) return `- ${header}: (left blank)`
  if (typeof value === 'boolean') return `- ${header}: ${value ? 'Yes' : 'No'}`
  if (typeof value === 'number') return `- ${header}: ${value}`
  if (Array.isArray(value)) {
    const own = (v: string) => custom !== undefined && !labels.has(v)
    return `- ${header}: ${value.map((v) => (own(v) ? `"${v}" ${OWN_ANSWER}` : v)).join(', ')}`
  }
  if (custom !== undefined) return `- ${header}: "${value}" ${OWN_ANSWER}`
  if (value.includes('\n')) return `- ${header}:\n${value.replace(/^/gm, '  ')}`
  return `- ${header}: ${value}`
}

function duration(seconds: number): string {
  if (seconds < 120) return `${seconds} seconds`
  const minutes = Math.round(seconds / 60)
  return `${minutes} minutes`
}

function isFilled(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
