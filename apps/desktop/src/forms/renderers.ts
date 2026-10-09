import { vanillaRenderers } from '@jsonforms/vue-vanilla'

// Custom renderers go in ./renderers/, each paired with a tester that
// matches on the schema's `x-widget` hint. Register them here; testers rank
// against the vanilla set, so a higher rank wins.
export const renderers = Object.freeze([
  ...vanillaRenderers,
])
