<script setup lang="ts">
import { computed, ref } from 'vue'
import { rendererProps, type RendererProps } from '@jsonforms/vue'
import type { ControlElement } from '@jsonforms/core'
import QuestionFrame from './QuestionFrame.vue'
import { useQuestion } from './useQuestion'

const props = defineProps(rendererProps<ControlElement>())
const { schema, data, frame, enabled, set } = useQuestion(props as RendererProps<ControlElement>)

const integer = computed(() => schema.value.type === 'integer')
const min = computed(() => schema.value.minimum as number | undefined)
const max = computed(() => schema.value.maximum as number | undefined)

const range = computed(() => {
  if (min.value !== undefined && max.value !== undefined) return `${min.value} to ${max.value}`
  if (min.value !== undefined) return `at least ${min.value}`
  if (max.value !== undefined) return `at most ${max.value}`
  return undefined
})

const text = ref(typeof data.value === 'number' ? String(data.value) : '')

// Shown under the field; the card's summary says the same from validation.
const error = computed(() => {
  if (!text.value.trim()) return undefined
  const n = Number(text.value)
  if (!Number.isFinite(n)) return 'Enter a number.'
  if (integer.value && !Number.isInteger(n)) return 'Enter a whole number.'
  if ((min.value !== undefined && n < min.value) || (max.value !== undefined && n > max.value)) return `Enter a number ${range.value}.`
  return undefined
})

function onInput(event: Event) {
  text.value = (event.target as HTMLInputElement).value
  const n = Number(text.value)
  set(text.value.trim() && Number.isFinite(n) ? n : undefined)
}
</script>

<template>
  <QuestionFrame v-bind="frame" :error="error">
    <div class="number-row">
      <input
        type="text"
        :inputmode="integer ? 'numeric' : 'decimal'"
        class="text-input number-input"
        :value="text"
        :disabled="!enabled"
        :aria-label="frame.header"
        :aria-invalid="!!error"
        data-primary
        @input="onInput"
      >
      <span v-if="range" class="hint">{{ integer ? 'Whole number, ' : '' }}{{ range }}</span>
      <span v-else-if="integer" class="hint">Whole number</span>
    </div>
  </QuestionFrame>
</template>
