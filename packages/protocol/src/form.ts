// The form spec the app renders: JSON Schema plus `x-*` hints. JSON Forms
// renders it; the testers in apps/desktop/src/forms match on `x-widget`.
//
// The root is `type: object` with one property per question, in order, and a
// `required` array. Every property carries `title` (a short header),
// `description` (markdown) and `x-widget`. The vocabulary:
//
// - `choice`: options are titled consts, `{ const, title, description?, 'x-preview'? }`,
//   in `oneOf`, or in `anyOf` followed by `{ type: 'string', minLength: 1, title: 'Other' }`
//   when free text is allowed. Single select is `type: string` with the
//   options on the property. Multi select is `type: array, uniqueItems: true`
//   with the options on `items`. This is MCP elicitation's titled-enum shape.
// - `text`: `type: string`. `x-multiline: true` for a textarea, `x-placeholder`.
//   `x-draft`: text the agent wrote, which the renderer writes into the data on
//   mount for the user to edit or send as it is. A draft with a line break
//   always comes with `x-multiline`. Elicitation downgrade: `x-draft` becomes
//   `default` on the string field.
// - `number`: `type: number` or `integer`, with optional `minimum`/`maximum`.
// - `boolean`: `type: boolean` with no default, so nothing is picked at first.
// - `path`: `type: string`, or an array of strings when several are allowed.
//   `x-path-kind: 'file' | 'directory'`, `x-extensions: ['ts', 'json']`.
// - `review`: approve or reject each of a list of items. A tuple array, one
//   `{ type: object, title, description?, 'x-preview'?, properties: { decision, comment } }`
//   per item, index-aligned with the data, with `minItems`, `maxItems` and
//   `additionalItems: false` pinning the length. `decision` is
//   `'approve' | 'reject'`. `x-default-decision: 'approve' | 'reject' | 'none'`:
//   the renderer writes the default into every entry when it mounts; under
//   `'none'` each item has `required: ['decision']` instead. There's no
//   elicitation downgrade for this one: elicitation forms are flat, with no
//   arrays of objects.
//
// Markdown in `description` and `x-preview` is rendered without raw HTML.

export const WIDGETS = ['choice', 'text', 'number', 'boolean', 'path', 'review'] as const
export type Widget = (typeof WIDGETS)[number]

export type PathKind = 'file' | 'directory'

// Loose on purpose: a raw-schema `ask_form` later passes schemas straight through.
export type JsonSchema = Record<string, unknown>

export interface ChoiceOptionSchema {
  const: string
  title: string
  description?: string
  'x-preview'?: string
}

export const REVIEW_DECISIONS = ['approve', 'reject'] as const
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number]
export type DefaultDecision = ReviewDecision | 'none'

// One entry of a review's tuple `items`.
export interface ReviewItemSchema {
  type: 'object'
  title: string
  description?: string
  'x-preview'?: string
  properties: {
    decision: { type: 'string'; enum: ReviewDecision[] }
    comment: { type: 'string' }
  }
  required?: ['decision']
}

// A review's data entry, at the item's index.
export interface ReviewEntry {
  decision?: ReviewDecision
  comment?: string
}

// The free-text branch of an `anyOf` choice.
export interface OtherOptionSchema {
  type: 'string'
  minLength: 1
  title: 'Other'
}

export interface FormSpec {
  title?: string
  description?: string
  schema: JsonSchema
}

// A form with a file picker can't be answered in an MCP Apps card (no picker
// in the host's iframe), so it goes to the window, which notifies.
export function hasPathQuestion(form: FormSpec): boolean {
  const properties = (form.schema.properties ?? {}) as Record<string, { 'x-widget'?: unknown }>
  return Object.values(properties).some((p) => p?.['x-widget'] === 'path')
}
