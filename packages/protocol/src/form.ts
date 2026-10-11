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
// - `review`: one decision for each of a list of items. A tuple array, one
//   `{ type: object, title, description?, 'x-preview'?, properties: { decision, comment } }`
//   per item, index-aligned with the data, with `minItems`, `maxItems` and
//   `additionalItems: false` pinning the length. `decision.enum` is the
//   decisions, the same on every item: `['approve', 'reject']`, or the agent's
//   own 2–4 labels (`['Port', 'TODO', 'Skip']`), the first one the positive
//   one. The renderer reads them from the enum. `x-default-decision` is one of
//   them or `'none'`: the renderer writes the default into every entry when it
//   mounts; under `'none'` each item has `required: ['decision']` instead.
//   There's no elicitation downgrade for this one: elicitation forms are flat,
//   with no arrays of objects.
// - `capture`: a box the user pastes into. `type: object` with
//   `properties: { text: string, images: string[] }` and
//   `additionalProperties: false`. `text` is pasted text, kept verbatim;
//   `images` are absolute paths of PNGs the app saved from pasted screenshots
//   (at most 5). `x-accept: 'text' | 'image' | 'any'` says which it takes, and
//   the other property is left out. `x-placeholder` as for text. When
//   required, at least one of them is filled: an `anyOf` of the two, or a
//   plain `required` when only one is accepted. Elicitation downgrade: a
//   text-only capture becomes a string field; images have none, since a form
//   field can't carry a pasted file.
//
// Markdown in `description` and `x-preview` is rendered without raw HTML.

export const WIDGETS = ['choice', 'text', 'number', 'boolean', 'path', 'review', 'capture'] as const
export type Widget = (typeof WIDGETS)[number]

export type PathKind = 'file' | 'directory'

export type CaptureAccept = 'text' | 'image' | 'any'

// A capture's limits. Images over the size are refused in the box, before
// they're saved.
export const CAPTURE_MAX_IMAGES = 5
export const CAPTURE_MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const CAPTURE_MAX_TEXT = 50_000

// A capture's data.
export interface CaptureValue {
  text?: string
  images?: string[]
}

// Loose on purpose: a raw-schema `ask_form` later passes schemas straight through.
export type JsonSchema = Record<string, unknown>

export interface ChoiceOptionSchema {
  const: string
  title: string
  description?: string
  'x-preview'?: string
}

// A review's decisions when the agent names none of its own.
export const REVIEW_DECISIONS = ['approve', 'reject'] as const
// A decision label: 'approve' or 'reject', or one of the agent's own.
export type ReviewDecision = string
// A decision label, or 'none' for no default.
export type DefaultDecision = string

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

// A form with a file picker or a pasted screenshot can't be answered in an MCP
// Apps card (no picker in the host's iframe, and nowhere to save an image), so
// it goes to the window, which notifies. A text-only capture works inline.
export function isWindowOnly(form: FormSpec): boolean {
  const properties = (form.schema.properties ?? {}) as Record<string, { 'x-widget'?: unknown; 'x-accept'?: unknown }>
  return Object.values(properties).some((p) =>
    p?.['x-widget'] === 'path' || (p?.['x-widget'] === 'capture' && p['x-accept'] !== 'text'))
}
