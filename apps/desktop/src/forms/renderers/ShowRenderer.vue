<script setup lang="ts">
// Something to look at, with nothing to answer: a plan, a file, a design. The
// body is markdown in its own pane, which scrolls inside and takes Tab like a
// question, so the arrow keys, Page Up/Down and Space scroll it. The questions
// about it come after it in the same card.
//
// An editable show (`x-editable`, a whole file) opens on Edit: the file's text
// in a monospace box. View renders the current text the way the file would
// show. The server saves the edit and diffs it; the card never does.
import { computed, onMounted, ref } from 'vue'
import { rendererProps, type RendererProps } from '@jsonforms/vue'
import type { ControlElement } from '@jsonforms/core'
import { fileMarkdown, type ShowEditValue, type ShowSource } from '@parley/protocol'
import Markdown from '../Markdown.vue'
import QuestionFrame from './QuestionFrame.vue'
import { useQuestion } from './useQuestion'

const props = defineProps(rendererProps<ControlElement>())
const { schema, data, frame, enabled, set } = useQuestion(props as RendererProps<ControlElement>)

const source = computed(() => schema.value['x-source'] as ShowSource | undefined)
const original = computed(() => (schema.value['x-editable'] === true && typeof schema.value['x-original'] === 'string'
  ? schema.value['x-original'] as string
  : undefined))
const editable = computed(() => original.value !== undefined)

const value = computed<ShowEditValue>(() => {
  const d = data.value
  return typeof d === 'object' && d !== null && !Array.isArray(d) ? d as ShowEditValue : {}
})
const text = ref(typeof value.value.text === 'string' ? value.value.text : original.value ?? '')
const mode = ref<'edit' | 'view'>(enabled.value ? 'edit' : 'view')
const editing = computed(() => editable.value && enabled.value && mode.value === 'edit')

// A textarea gives back `\n`, so a CRLF file isn't edited until its text is.
const lf = (s: string) => s.replace(/\r\n/g, '\n')
const changed = computed(() => editable.value && lf(text.value) !== lf(original.value!))

// Written on mount, as a draft is, so the server knows which version the text
// started from. Data already there wins: a restored draft, or history.
onMounted(() => {
  if (!enabled.value || !editable.value || typeof value.value.text === 'string') return
  set({ text: original.value, base: source.value?.sha256 })
})

function write(next: string) {
  text.value = next
  set({ text: next, base: value.value.base ?? source.value?.sha256 })
}

const box = ref<HTMLTextAreaElement>()
let placed = false

// Setting the value leaves the caret at the end; a file reads from the top.
function onFocus() {
  if (placed || !box.value) return
  placed = true
  box.value.setSelectionRange(0, 0)
  box.value.scrollTop = 0
}

function reset() {
  if (!enabled.value || original.value === undefined) return
  write(original.value)
  mode.value = 'edit'
  box.value?.focus({ preventScroll: true })
}

const content = computed(() => {
  if (editable.value && source.value) return fileMarkdown(source.value.path, text.value)
  return schema.value['x-content'] as string | undefined
})

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
  <QuestionFrame v-bind="frame" :passive="!editable">
    <div v-if="editable && enabled" class="segmented show-mode" role="group" aria-label="Edit or view">
      <button type="button" class="segment" :class="{ picked: mode === 'edit' }" tabindex="-1" :aria-pressed="mode === 'edit'" @click="mode = 'edit'">Edit</button>
      <button type="button" class="segment" :class="{ picked: mode === 'view' }" tabindex="-1" :aria-pressed="mode === 'view'" @click="mode = 'view'">View</button>
    </div>
    <textarea
      v-if="editing"
      ref="box"
      class="text-input show-edit"
      rows="12"
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      :value="text"
      :aria-label="frame.header"
      data-primary
      @input="write(($event.target as HTMLTextAreaElement).value)"
      @focus="onFocus"
    />
    <div v-else class="show-pane" tabindex="0" data-primary role="region" :aria-label="frame.header">
      <Markdown v-if="content" :source="content" />
      <p v-else class="show-missing"><code>{{ source?.path ?? 'This' }}</code> isn't loaded here.</p>
    </div>
    <div v-if="caption || (enabled && changed)" class="show-foot">
      <p v-if="caption" class="show-caption" :title="caption">
        {{ caption }}<span v-if="changed && !enabled" class="show-edited"> · edited</span>
      </p>
      <button
        v-if="enabled && changed"
        type="button"
        class="link-button show-reset"
        tabindex="-1"
        @click="reset"
      >Reset to original</button>
    </div>
  </QuestionFrame>
</template>
