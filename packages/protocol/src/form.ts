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
// - `show`: something to look at, with nothing to answer. `type: 'null'`, never
//   in `required`, and no data. `x-content` is the markdown body: the agent's
//   `content`, or a file the server read, turned into markdown by `fileMarkdown`
//   (show.ts). `x-source: { path, lines?, totalLines? }` says which file it came
//   from. A path-backed show compiled without its file has `x-source: { path }`
//   and no `x-content`; the renderer says it isn't loaded. No elicitation
//   downgrade: there's no field to fill, so a downgraded form would drop it.
//   An editable show (`x-editable: true`, a whole file) is `type: object` with
//   `properties: { text: string, base: string }` and `additionalProperties:
//   false` instead, still never required. `x-original` is the file's text as
//   read, which the editor starts from, and `x-source.sha256` its hash. The
//   renderer writes `{ text, base }` on mount: `base` is the sha256 of the
//   version the text started from, so the server can tell what an edit was
//   made against.
//
// Root `x-media` holds Media references (media.ts), keyed by markdown destination.
// Markdown in `description`, `x-preview` and `x-content` is rendered without raw HTML.

export const WIDGETS = ['choice', 'text', 'number', 'boolean', 'path', 'review', 'capture', 'show'] as const
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

// A show block's file, read by the server. Keyed by question id.
export interface ShowFile {
  path: string                 // as the agent gave it, relative to the project
  text: string                 // the file, or the requested lines
  lines?: [number, number]     // the range actually shown, after clamping to the file
  totalLines: number
  sha256: string               // of the whole file's bytes at read time, even with `lines`
}
export type ShowFiles = Record<string, ShowFile>

// Where a show's body came from, on the compiled property.
export interface ShowSource {
  path: string
  lines?: [number, number]
  totalLines?: number          // absent when compiled without the file
  sha256?: string              // an editable show's file hash, the `base` its edit starts from
}

// An editable show's data.
export interface ShowEditValue {
  text?: string
  base?: string
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

// Shared with answer shaping; renderer textareas normalise line endings.
export function plain(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim()
}

export type StampState =
  | { kind: 'none' }
  | { kind: 'blocked'; reasons: string[] }
  | { kind: 'ready'; data: Record<string, unknown> }

export function stampState(schema: FormSpec['schema'], value: unknown): StampState {
  const data: Record<string, unknown> = value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value as Record<string, unknown> } : {}
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>
  const required = new Set((schema.required ?? []) as string[])
  const reasons: string[] = []
  let recommendations = 0
  for (const [id, prop] of Object.entries(properties)) {
    const title = prop.title ?? id
    const raw = data[id]
    const blank = raw == null || raw === '' || (Array.isArray(raw) && !raw.length)
      || (typeof raw === 'object' && !Object.keys(raw).length)
      || (prop['x-widget'] === 'review' && Array.isArray(raw) && raw.every((entry) => !entry?.decision))
    const different = () => reasons.push(`You chose differently on: ${title}`)
    let recommended = false
    switch (prop['x-widget']) {
      case 'choice': {
        const multi = prop.type === 'array'
        const options = (multi ? prop.items : prop) as JsonSchema
        const branches = (options.oneOf ?? options.anyOf ?? []) as ChoiceOptionSchema[]
        const picks = branches.filter((o) => /\(recommended\)$/i.test(o.title ?? '') && typeof o.const === 'string').map((o) => o.const)
        if (!(multi ? picks.length : picks.length === 1)) break
        recommended = true
        if (blank) data[id] = multi ? picks : picks[0]
        else if (multi ? !Array.isArray(raw) || raw.length !== picks.length || new Set(raw).size !== picks.length || picks.some((p) => !raw.includes(p)) : raw !== picks[0]) different()
        break
      }
      case 'text': {
        const draft = prop['x-draft']
        if (typeof draft !== 'string') break
        recommended = true
        if (typeof raw !== 'string' || !raw.trim() || plain(raw) !== plain(draft)) different()
        break
      }
      case 'review': {
        const preset = prop['x-default-decision']
        if (typeof preset !== 'string' || preset === 'none') break
        recommended = true
        const items = (prop.items ?? []) as ReviewItemSchema[]
        const entries = Array.isArray(raw) ? raw : []
        let differs = entries.length > items.length
        data[id] = items.map((_, i) => {
          const entry = (entries[i] ?? {}) as ReviewEntry
          if (entry.decision && entry.decision !== preset) differs = true
          return { ...entry, decision: entry.decision || preset }
        })
        if (differs) different()
        break
      }
      case 'show': {
        if (prop['x-editable'] && raw != null && (raw as ShowEditValue).text !== prop['x-original']) different()
        continue
      }
    }
    if (recommended) recommendations++
    else if (required.has(id) && blank) reasons.push(`Still needs an answer: ${title}`)
  }
  return !recommendations ? { kind: 'none' } : reasons.length ? { kind: 'blocked', reasons } : { kind: 'ready', data }
}
