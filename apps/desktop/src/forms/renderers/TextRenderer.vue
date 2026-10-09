<script setup lang="ts">
import { ref } from 'vue'
import { rendererProps, type RendererProps } from '@jsonforms/vue'
import type { ControlElement } from '@jsonforms/core'
import QuestionFrame from './QuestionFrame.vue'
import { useQuestion } from './useQuestion'

const props = defineProps(rendererProps<ControlElement>())
const { schema, data, frame, enabled, set } = useQuestion(props as RendererProps<ControlElement>)

// Local, so whitespace-only text shows as typed but counts as no answer.
const text = ref(typeof data.value === 'string' ? data.value : '')

function onInput(event: Event) {
  text.value = (event.target as HTMLInputElement | HTMLTextAreaElement).value
  set(text.value.trim() ? text.value : undefined)
}
</script>

<template>
  <QuestionFrame v-bind="frame">
    <textarea
      v-if="schema['x-multiline']"
      class="text-input"
      rows="4"
      :value="text"
      :placeholder="schema['x-placeholder']"
      :disabled="!enabled"
      :aria-label="frame.header"
      data-primary
      @input="onInput"
    />
    <input
      v-else
      type="text"
      class="text-input"
      :value="text"
      :placeholder="schema['x-placeholder']"
      :disabled="!enabled"
      :aria-label="frame.header"
      data-primary
      @input="onInput"
    >
  </QuestionFrame>
</template>
