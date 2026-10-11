<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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

// The agent's draft, written into the data on mount (JSON Forms doesn't apply
// defaults), so an untouched draft satisfies `required` and Cmd+Enter sends it.
// Data already there wins: a restored draft, or a read-only history view.
const draft = computed(() => (typeof schema.value['x-draft'] === 'string' ? schema.value['x-draft'] as string : undefined))

onMounted(() => {
  if (!enabled.value || !draft.value || typeof data.value === 'string') return
  text.value = draft.value
  set(draft.value)
})

// The `.draft` class sizes the box to its text in CSS (field-sizing). Where
// that isn't supported, this estimate fits the draft: about 60 characters a
// line at the window's width, 4 to 12 rows.
const rows = computed(() => {
  if (!draft.value) return 4
  const lines = draft.value.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 60)), 0)
  return Math.min(12, Math.max(4, lines))
})

// The first focus puts the caret at the end of the draft. Not select-all,
// where a stray keystroke would replace it, and only the first, so coming back
// to the window keeps the caret where the user left it.
const input = ref<HTMLInputElement | HTMLTextAreaElement>()
let placed = false

function onFocus() {
  if (placed || !draft.value) return
  placed = true
  input.value?.setSelectionRange(text.value.length, text.value.length)
}

function reset() {
  if (!enabled.value || !draft.value) return
  text.value = draft.value
  set(draft.value)
  const el = input.value
  if (!el) return
  el.focus({ preventScroll: true })
  el.setSelectionRange(text.value.length, text.value.length)
}
</script>

<template>
  <QuestionFrame v-bind="frame">
    <textarea
      v-if="schema['x-multiline']"
      ref="input"
      class="text-input"
      :class="{ draft: draft !== undefined }"
      :rows="rows"
      :value="text"
      :placeholder="schema['x-placeholder']"
      :disabled="!enabled"
      :aria-label="frame.header"
      data-primary
      @input="onInput"
      @focus="onFocus"
    />
    <input
      v-else
      ref="input"
      type="text"
      class="text-input"
      :value="text"
      :placeholder="schema['x-placeholder']"
      :disabled="!enabled"
      :aria-label="frame.header"
      data-primary
      @input="onInput"
      @focus="onFocus"
    >
    <button
      v-if="enabled && draft !== undefined && text !== draft"
      type="button"
      class="link-button draft-reset"
      tabindex="-1"
      @click="reset"
    >Reset to draft</button>
  </QuestionFrame>
</template>
