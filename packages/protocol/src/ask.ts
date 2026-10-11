// The `ask` tool's model-facing shape (a questions array, like Claude's
// AskUserQuestion), its compiler to a FormSpec, and the answer shaper.
// Pure functions: the server, fake-ask, the gallery and the tests share them.

import * as z from 'zod/v4'
import {
  CAPTURE_MAX_IMAGES,
  REVIEW_DECISIONS,
  type ChoiceOptionSchema,
  type DefaultDecision,
  type FormSpec,
  type JsonSchema,
  type OtherOptionSchema,
  type ReviewDecision,
  type ReviewItemSchema,
  type CaptureAccept,
  type Widget,
} from './form.ts'

export const DEFAULT_TIMEOUT_SECONDS = 1800
export const QUESTION_TYPES = ['choice', 'text', 'number', 'boolean', 'path', 'review', 'capture'] as const satisfies readonly Widget[]

// Not `.describe()`d field by field: the tool description carries the shape
// and an example, and per-field descriptions bloat every tools/list.
const option = z.object({
  label: z.string().min(1).max(60, 'option labels are 60 characters or fewer; put detail in `description`'),
  description: z.string().max(300).optional(),
  preview: z.string().optional(),
})

const reviewItem = z.object({
  label: z.string().min(1).max(120, 'item labels are 120 characters or fewer; put detail in `detail`'),
  detail: z.string().max(300).optional(),
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
  // text (and capture, for placeholder)
  multiline: z.boolean().optional(),
  placeholder: z.string().optional(),
  draft: z.string().min(1).max(4000, 'a draft is 4,000 characters or fewer').optional(),
  // number
  min: z.number().optional(),
  max: z.number().optional(),
  integer: z.boolean().optional(),
  // path
  pathKind: z.enum(['file', 'directory']).optional(),
  multiple: z.boolean().optional(),
  extensions: z.array(z.string()).optional(),
  // review
  items: z.array(reviewItem)
    .min(1, 'a review question needs at least 1 item')
    .max(30, 'a review question takes at most 30 items; ask about the rest in a follow-up call')
    .optional(),
  decisions: z.array(z.string().min(1).max(12, "decision labels are 12 characters or fewer, like 'Port' or 'Skip'"))
    .min(2, 'a review takes 2–4 decisions; leave `decisions` out for approve and reject')
    .max(4, 'a review takes at most 4 decisions')
    .optional(),
  defaultDecision: z.string().optional(),
  // capture
  accept: z.enum(['text', 'image', 'any']).optional(),
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
      if (!q.options && q.items) {
        ctx.addIssue({ code: 'custom', path: at('items'), message: `question ${n} has items but type 'choice'; set type to 'review' to have the user approve or reject each item, or give a choice question 2–6 options instead` })
        return
      }
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
    } else if (q.type === 'review') {
      if (!q.items) {
        ctx.addIssue(q.options
          ? { code: 'custom', path: at('options'), message: `question ${n} has type 'review' but lists its items in \`options\`; put them in \`items\` instead, each { label, detail?, preview? }` }
          : { code: 'custom', path: at('items'), message: `question ${n} has type 'review' but no items; list 1–30 items to approve or reject` })
        return
      }
      if (q.options) {
        ctx.addIssue({ code: 'custom', path: at('options'), message: `question ${n} has type 'review' but also has options; a review lists what to approve in \`items\`, and \`options\` only apply to type 'choice', so drop them` })
      }
      const labels = new Set<string>()
      q.items.forEach((item, j) => {
        if (labels.has(item.label)) {
          ctx.addIssue({ code: 'custom', path: at('items', j, 'label'), message: `question ${n} has two items labelled '${item.label}'; labels identify items in the answer, so they must be unique` })
        }
        labels.add(item.label)
      })
      const decisions = new Set<string>()
      q.decisions?.forEach((d, j) => {
        if (decisions.has(d)) {
          ctx.addIssue({ code: 'custom', path: at('decisions', j), message: `question ${n} has the decision '${d}' twice; decisions must be unique` })
        } else if (d === 'none') {
          ctx.addIssue({ code: 'custom', path: at('decisions', j), message: `question ${n} has a decision labelled 'none', which is reserved for defaultDecision; pick another label` })
        }
        decisions.add(d)
      })
      const allowed = [...(q.decisions ?? REVIEW_DECISIONS), 'none']
      if (q.defaultDecision !== undefined && !allowed.includes(q.defaultDecision)) {
        const list = allowed.map((d) => `'${d}'`)
        ctx.addIssue({ code: 'custom', path: at('defaultDecision'), message: q.decisions
          ? `question ${n}'s defaultDecision '${q.defaultDecision}' isn't one of its decisions; use one of ${list.slice(0, -1).join(', ')}, or 'none'`
          : `question ${n}'s defaultDecision '${q.defaultDecision}' isn't 'approve', 'reject' or 'none'; to use your own labels, list them in \`decisions\`` })
      }
    } else if (q.options) {
      ctx.addIssue({ code: 'custom', path: at('options'), message: `question ${n} has type '${q.type}' but also has options; options only apply to type 'choice', so drop them or set type to 'choice'` })
    }

    if (q.type !== 'review' && q.type !== 'choice' && q.items) {
      ctx.addIssue({ code: 'custom', path: at('items'), message: `question ${n} has type '${q.type}' but also has items; items only apply to type 'review', so drop them or set type to 'review'` })
    }
    if (q.type === 'choice' && q.options && q.items) {
      ctx.addIssue({ code: 'custom', path: at('items'), message: `question ${n} has type 'choice' but also has items; items only apply to type 'review', and a choice question takes \`options\`` })
    }

    if (q.decisions && q.type !== 'review') {
      ctx.addIssue({ code: 'custom', path: at('decisions'), message: `question ${n} has decisions but type '${q.type}'; decisions only apply to type 'review'` })
    }

    if (q.draft !== undefined && q.type !== 'text') {
      ctx.addIssue({ code: 'custom', path: at('draft'), message: `question ${n} has a draft but type '${q.type}'; drafts only apply to type 'text', so set type to 'text' or drop it` })
    }

    if (q.accept !== undefined && q.type !== 'capture') {
      ctx.addIssue({ code: 'custom', path: at('accept'), message: `question ${n} has accept but type '${q.type}'; accept only applies to type 'capture', so set type to 'capture' or drop it` })
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

const reviewOutcome = z.object({
  label: z.string(),
  decision: z.string(),   // 'approve' or 'reject', or one of the question's own decisions
  comment: z.string().optional(),
})

export const askResultSchema = z.object({
  status: z.enum(['answered', 'dismissed', 'timed_out', 'cancelled']),
  message: z.string(),
  answers: z.record(z.string(), z.object({
    header: z.string(),
    value: answerValue,        // null: an optional question left blank
    custom: z.string().optional(),   // the user's own text, when it isn't one of the options
    review: z.array(reviewOutcome).optional(),   // a review's every item, in order; `value` is the labels given the first decision
    edited: z.boolean().optional(),  // a text question with a draft: whether the final text differs from it
    images: z.array(z.string()).optional(),  // a capture's pasted screenshots: absolute paths of PNG files
  })).optional(),
  note: z.string().optional(),       // free text the user added for the agent, with an answer or a skip
})

export type AskResult = z.infer<typeof askResultSchema>
export type Answer = NonNullable<AskResult['answers']>[string]
export type AnswerValue = Answer['value']
export type ReviewOutcome = z.infer<typeof reviewOutcome>

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
        // A draft with a line break needs a textarea, whatever `multiline` says.
        ...((q.multiline || q.draft?.includes('\n')) && { 'x-multiline': true }),
        ...(q.placeholder && { 'x-placeholder': q.placeholder }),
        ...(q.draft && { 'x-draft': q.draft }),
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
    case 'review': {
      const items = q.items ?? []
      const decisions = reviewDecisions(q)
      const fallback = q.defaultDecision ?? decisions[0]!
      return {
        'x-widget': 'review', ...base,
        type: 'array',
        items: items.map((item): ReviewItemSchema => ({
          type: 'object',
          title: item.label,
          ...(item.detail && { description: item.detail }),
          ...(item.preview && { 'x-preview': item.preview }),
          properties: {
            decision: { type: 'string', enum: decisions },
            comment: { type: 'string' },
          },
          ...(fallback === 'none' && { required: ['decision'] as ['decision'] }),
        })),
        minItems: items.length,
        maxItems: items.length,
        additionalItems: false,
        'x-default-decision': fallback satisfies DefaultDecision,
      }
    }
    case 'capture': {
      const accept = q.accept ?? 'any'
      const text = accept !== 'image'
      const images = accept !== 'text'
      // When required, at least one of them filled: an anyOf when both are
      // accepted, a plain `required` when only one is. The branches repeat
      // `type` so strict AJV knows what minLength and minItems apply to.
      const filled = !required ? {}
        : text && images ? { anyOf: [
          { required: ['text'], properties: { text: { type: 'string', minLength: 1 } } },
          { required: ['images'], properties: { images: { type: 'array', minItems: 1 } } },
        ] }
        : { required: [text ? 'text' : 'images'] }
      return {
        'x-widget': 'capture', ...base,
        type: 'object',
        properties: {
          ...(text && { text: { type: 'string', ...(required && !images && { minLength: 1 }) } }),
          ...(images && { images: {
            type: 'array', items: { type: 'string' }, maxItems: CAPTURE_MAX_IMAGES,
            ...(required && !text && { minItems: 1 }),
          } }),
        },
        additionalProperties: false,
        'x-accept': accept satisfies CaptureAccept,
        ...(q.placeholder && { 'x-placeholder': q.placeholder }),
        ...filled,
      }
    }
  }
}

// A review's decisions, the positive one first: its own, or approve and reject.
function reviewDecisions(q: Question): string[] {
  return [...(q.decisions ?? REVIEW_DECISIONS)]
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
    lines.push(answer.review
      ? (q.decisions ? describeDecisions(answer.header, answer.review, q.decisions) : describeReview(answer.header, answer.review))
      : q.type === 'capture' ? describeCapture(answer)
      : describe(answer, new Set(q.options?.map((o) => o.label))))
  })
  if (note) lines.push('', 'They also left a note:', quote(note))
  return text('answered', lines.join('\n'), answers)
}

function quote(text: string): string {
  return text.replace(/^/gm, '> ')
}

function indent(text: string): string {
  return text.replace(/^/gm, '  ')
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
    case 'text': {
      const answer = isFilled(raw) ? { header, value: raw } : blank
      if (q.draft === undefined) return answer
      // Trimmed, with line endings normalised: re-wrapping the end of a draft isn't an edit.
      const edited = !isFilled(raw) || plain(raw) !== plain(q.draft)
      return { ...answer, edited }
    }
    case 'number':
      return typeof raw === 'number' && Number.isFinite(raw) ? { header, value: raw } : blank
    case 'boolean':
      return typeof raw === 'boolean' ? { header, value: raw } : blank
    case 'path': {
      const values = (Array.isArray(raw) ? raw : [raw]).filter(isFilled)
      if (!values.length) return blank
      return { header, value: q.multiple ? values : values[0]! }
    }
    case 'review': {
      // The app always sends a complete array (the renderer writes the
      // defaults, or the form requires every decision), so only an optional
      // review can be blank. Missing entries, from fake-hub or partial data,
      // fall back to the default; under 'none' that's the last decision, the
      // most cautious one (reject, without decisions of its own), so nothing
      // gets the first decision that the user didn't give it.
      if (!Array.isArray(raw) && q.required === false) return blank
      const entries = Array.isArray(raw) ? raw : []
      const decisions = reviewDecisions(q)
      const preset = q.defaultDecision ?? decisions[0]!
      const fallback: ReviewDecision = preset === 'none' ? decisions[decisions.length - 1]! : preset
      const review = (q.items ?? []).map(({ label }, i): ReviewOutcome => {
        const entry = isRecord(entries[i]) ? entries[i] : {}
        const decision = typeof entry.decision === 'string' && decisions.includes(entry.decision) ? entry.decision : fallback
        const comment = isFilled(entry.comment) ? entry.comment.trim() : undefined
        return { label, decision, ...(comment && { comment }) }
      })
      return { header, value: review.filter((r) => r.decision === decisions[0]).map((r) => r.label), review }
    }
    case 'capture': {
      // The text verbatim, as long as it isn't all whitespace.
      const entry = isRecord(raw) ? raw : {}
      const images = (Array.isArray(entry.images) ? entry.images : []).filter(isFilled)
      return { header, value: isFilled(entry.text) ? entry.text : null, ...(images.length && { images }) }
    }
  }
}

const OWN_ANSWER = '(their own answer, not one of the options)'

// `labels` tells a choice's own-text values apart from its options.
function describe({ header, value, custom, edited }: Answer, labels: Set<string>): string {
  if (edited !== undefined) {
    if (typeof value !== 'string') return `- ${header}: (cleared the draft)`
    return edited ? `- ${header}: edited the draft:\n${indent(value)}` : `- ${header}: accepted the draft as written`
  }
  if (value === null) return `- ${header}: (left blank)`
  if (typeof value === 'boolean') return `- ${header}: ${value ? 'Yes' : 'No'}`
  if (typeof value === 'number') return `- ${header}: ${value}`
  if (Array.isArray(value)) {
    const own = (v: string) => custom !== undefined && !labels.has(v)
    return `- ${header}: ${value.map((v) => (own(v) ? `"${v}" ${OWN_ANSWER}` : v)).join(', ')}`
  }
  if (custom !== undefined) return `- ${header}: "${value}" ${OWN_ANSWER}`
  if (value.includes('\n')) return `- ${header}:\n${indent(value)}`
  return `- ${header}: ${value}`
}

// The majority decision leads, and the text lists only the exceptions: the
// minority decisions, and majority ones that came with a comment.
function describeReview(header: string, review: ReviewOutcome[]): string {
  const approved = review.filter((r) => r.decision === 'approve').length
  const lead: ReviewDecision = approved >= review.length - approved ? 'approve' : 'reject'
  const count = lead === 'approve' ? approved : review.length - approved
  const verb = lead === 'approve' ? 'approved' : 'rejected'
  const exceptions = review.filter((r) => r.decision !== lead || r.comment !== undefined)
  const lines = [`- ${header}: ${verb} ${count === review.length ? `all ${count}` : `${count} of ${review.length}`}`]
  for (const r of exceptions) {
    const name = r.decision === 'approve' ? 'Approved' : 'Rejected'
    const kind = r.decision === lead ? `${name}, with a comment` : name
    lines.push(`  - ${kind}: ${r.label}${r.comment !== undefined ? ` (${JSON.stringify(r.comment)})` : ''}`)
  }
  return lines.join('\n')
}

// A review with its own decisions: the counts, the majority decision first and
// empty ones left out, then the other decisions' items grouped by decision,
// then majority items that came with a comment. Ties go to the earlier decision.
function describeDecisions(header: string, review: ReviewOutcome[], decisions: string[]): string {
  const count = (d: string) => review.filter((r) => r.decision === d).length
  const lead = decisions.reduce((best, d) => (count(d) > count(best) ? d : best))
  const item = (r: ReviewOutcome) => `${r.label}${r.comment !== undefined ? ` (${JSON.stringify(r.comment)})` : ''}`
  const lines = [count(lead) === review.length
    ? `- ${header}: ${lead} all ${review.length}`
    : `- ${header}: ${[lead, ...decisions.filter((d) => d !== lead && count(d))].map((d) => `${d} ${count(d)}`).join(', ')} (of ${review.length})`]
  for (const d of decisions) {
    const given = review.filter((r) => r.decision === d)
    if (d !== lead && given.length) lines.push(`  - ${d}: ${given.map(item).join(', ')}`)
  }
  const commented = review.filter((r) => r.decision === lead && r.comment !== undefined)
  if (commented.length) lines.push(`  - ${lead}, with ${commented.length === 1 ? 'a comment' : 'comments'}: ${commented.map(item).join(', ')}`)
  return lines.join('\n')
}

// Pasted text is fenced verbatim, unless it's one short line; screenshots are
// listed as paths the agent can open with its own file-reading tool.
function describeCapture({ header, value, images }: Answer): string {
  const text = typeof value === 'string' ? value.replace(/\s+$/, '') : undefined
  const shots = images?.length
    ? `${images.length === 1 ? '1 screenshot (a PNG file you can read)' : `${images.length} screenshots (PNG files you can read)`}:\n${indent(images.join('\n'))}`
    : undefined
  if (text === undefined) return shots ? `- ${header}: pasted ${shots}` : `- ${header}: (left blank)`
  if (!text.includes('\n') && text.length <= SHORT_PASTE) return `- ${header}: pasted "${text.trim()}"${shots ? ` and ${shots}` : ''}`
  const lines = text.split('\n').length
  const fence = '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((m) => m[0].length + 1)))
  const block = indent(`${fence}\n${text}\n${fence}`)
  return `- ${header}: pasted ${lines === 1 ? '1 line' : `${lines} lines`}:\n${block}${shots ? `\n  and ${shots}` : ''}`
}

// A pasted line this short or shorter is quoted in the text, not fenced.
const SHORT_PASTE = 120

function duration(seconds: number): string {
  if (seconds < 120) return `${seconds} seconds`
  const minutes = Math.round(seconds / 60)
  return `${minutes} minutes`
}

function plain(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim()
}

function isFilled(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
