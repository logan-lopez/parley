import { computed } from 'vue'
import { useJsonFormsControl, type RendererProps } from '@jsonforms/vue'
import { and, isControl, rankWith, schemaMatches, type ControlElement } from '@jsonforms/core'
import type { Widget } from '@parley/protocol'

// Above every vanilla renderer.
const RANK = 10

export function widgetTester(widget: Widget) {
  return rankWith(RANK, and(isControl, schemaMatches((schema) => (schema as Record<string, unknown>)['x-widget'] === widget)))
}

// The parts of a JSON Forms control every question renderer uses.
export function useQuestion(props: RendererProps<ControlElement>) {
  const { control, handleChange } = useJsonFormsControl(props)
  // Our own compiled schemas; `x-*` keys aren't in JSON Forms' type.
  const schema = computed(() => control.value.schema as Record<string, any>)
  return {
    control,
    schema,
    data: computed(() => control.value.data as unknown),
    frame: computed(() => ({
      header: String(schema.value.title ?? control.value.label),
      question: schema.value.description as string | undefined,
      required: control.value.required,
    })),
    enabled: computed(() => control.value.enabled),
    set: (value: unknown) => handleChange(control.value.path, value),
  }
}
