<script setup lang="ts">
// Something to look at, with nothing to answer: a plan, a file, a design. The
// body is markdown in its own pane, which scrolls inside and takes Tab like a
// question, so the arrow keys, Page Up/Down and Space scroll it. The questions
// about it come after it in the same card.
import { computed } from 'vue'
import { rendererProps, type RendererProps } from '@jsonforms/vue'
import type { ControlElement } from '@jsonforms/core'
import type { ShowSource } from '@parley/protocol'
import Markdown from '../Markdown.vue'
import QuestionFrame from './QuestionFrame.vue'
import { useQuestion } from './useQuestion'

const props = defineProps(rendererProps<ControlElement>())
const { schema, frame } = useQuestion(props as RendererProps<ControlElement>)

const content = computed(() => schema.value['x-content'] as string | undefined)
const source = computed(() => schema.value['x-source'] as ShowSource | undefined)

// `docs/plan.md`, or `src/index.ts · lines 10–80 of 212`.
const caption = computed(() => {
  const s = source.value
  if (!s) return undefined
  if (!s.lines) return s.path
  const [start, end] = s.lines
  return `${s.path} · lines ${start}–${end}${s.totalLines !== undefined ? ` of ${s.totalLines}` : ''}`
})
</script>

<template>
  <QuestionFrame v-bind="frame" passive>
    <div class="show-pane" tabindex="0" data-primary role="region" :aria-label="frame.header">
      <Markdown v-if="content" :source="content" />
      <p v-else class="show-missing"><code>{{ source?.path ?? 'This' }}</code> isn't loaded here.</p>
    </div>
    <p v-if="caption" class="show-caption" :title="caption">{{ caption }}</p>
  </QuestionFrame>
</template>
