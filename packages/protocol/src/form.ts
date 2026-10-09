// The form spec the model writes: JSON Schema plus `x-widget` hints.
// JSON Forms renders it; the testers in apps/desktop match on `x-widget`.

// TODO: tighten. Kept loose until the spec settles.
export type JsonSchema = Record<string, unknown>

export interface FormSpec {
  title?: string
  description?: string
  schema: JsonSchema
}
