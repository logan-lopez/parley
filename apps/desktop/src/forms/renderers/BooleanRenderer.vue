<script setup lang="ts">
// Yes/No with nothing picked at first: a required boolean needs an explicit answer.
import { rendererProps, type RendererProps } from '@jsonforms/vue'
import type { ControlElement } from '@jsonforms/core'
import { moveAmongPicks } from '../keyboard'
import QuestionFrame from './QuestionFrame.vue'
import { useQuestion } from './useQuestion'

const props = defineProps(rendererProps<ControlElement>())
const { data, frame, enabled, set } = useQuestion(props as RendererProps<ControlElement>)

const choices = [
  { value: true, label: 'Yes', key: 'y' },
  { value: false, label: 'No', key: 'n' },
]

function pick(value: boolean) {
  if (enabled.value) set(data.value === value && !frame.value.required ? undefined : value)
}

function onKey(event: KeyboardEvent) {
  moveAmongPicks(event, { prev: ['ArrowLeft', 'ArrowUp'], next: ['ArrowRight', 'ArrowDown'] })
  const i = choices.findIndex((c) => c.key === event.key.toLowerCase())
  if (i !== -1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault()
    pick(choices[i]!.value)
    // Focus follows, so Enter sends instead of picking the other segment.
    ;(event.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-pick="${i + 1}"]`)?.focus()
  }
}
</script>

<template>
  <QuestionFrame v-bind="frame" advance-on-pick>
    <div class="segmented" role="radiogroup" :aria-label="frame.header" @keydown="onKey">
      <button
        v-for="(choice, i) in choices"
        :key="choice.label"
        type="button"
        class="segment"
        :class="{ picked: data === choice.value }"
        role="radio"
        :aria-checked="data === choice.value"
        :disabled="!enabled"
        :tabindex="(data === undefined ? i === 0 : data === choice.value) ? 0 : -1"
        :data-pick="i + 1"
        :data-primary="(data === undefined ? i === 0 : data === choice.value) || undefined"
        @click="pick(choice.value)"
      >
        {{ choice.label }}<kbd class="key">{{ i + 1 }}</kbd>
      </button>
    </div>
  </QuestionFrame>
</template>
