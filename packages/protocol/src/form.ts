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
// - `number`: `type: number` or `integer`, with optional `minimum`/`maximum`.
// - `boolean`: `type: boolean` with no default, so nothing is picked at first.
// - `path`: `type: string`, or an array of strings when several are allowed.
//   `x-path-kind: 'file' | 'directory'`, `x-extensions: ['ts', 'json']`.
//
// Markdown in `description` and `x-preview` is rendered without raw HTML.

export const WIDGETS = ['choice', 'text', 'number', 'boolean', 'path'] as const
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
