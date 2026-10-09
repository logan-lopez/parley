import { vanillaRenderers } from '@jsonforms/vue-vanilla'
import BooleanRenderer from './renderers/BooleanRenderer.vue'
import ChoiceRenderer from './renderers/ChoiceRenderer.vue'
import NumberRenderer from './renderers/NumberRenderer.vue'
import PathRenderer from './renderers/PathRenderer.vue'
import TextRenderer from './renderers/TextRenderer.vue'
import { widgetTester } from './renderers/useQuestion'

// Each question renderer matches the schema's `x-widget` and ranks above the
// vanilla set, which stays as the fallback for anything else.
export const renderers = Object.freeze([
  ...vanillaRenderers,
  { tester: widgetTester('choice'), renderer: ChoiceRenderer },
  { tester: widgetTester('text'), renderer: TextRenderer },
  { tester: widgetTester('number'), renderer: NumberRenderer },
  { tester: widgetTester('boolean'), renderer: BooleanRenderer },
  { tester: widgetTester('path'), renderer: PathRenderer },
])
