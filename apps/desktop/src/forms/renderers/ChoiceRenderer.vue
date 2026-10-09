<script setup lang="ts">
// Option cards that act as radios (single) or checkboxes (multi). With an
// `anyOf` Other branch, the last row is a text input; typing in it selects it.
import { computed, ref } from 'vue'
import { rendererProps, type RendererProps } from '@jsonforms/vue'
import type { ControlElement } from '@jsonforms/core'
import type { ChoiceOptionSchema } from '@parley/protocol'
import Markdown from '../Markdown.vue'
import { moveAmongPicks } from '../keyboard'
import QuestionFrame from './QuestionFrame.vue'
import { useQuestion } from './useQuestion'

const props = defineProps(rendererProps<ControlElement>())
const { schema, data, frame, enabled, set } = useQuestion(props as RendererProps<ControlElement>)

const multi = computed(() => schema.value.type === 'array')
const branches = computed<Record<string, unknown>[]>(() => {
  const s = multi.value ? schema.value.items : schema.value
  return s?.anyOf ?? s?.oneOf ?? []
})
const options = computed(() => branches.value.filter((b) => 'const' in b) as unknown as ChoiceOptionSchema[])
const allowOther = computed(() => branches.value.some((b) => !('const' in b)))
const labels = computed(() => new Set(options.value.map((o) => o.const)))

const values = computed<string[]>(() => {
  const d = data.value
  return Array.isArray(d) ? d : typeof d === 'string' ? [d] : []
})
const picked = computed(() => values.value.filter((v) => labels.value.has(v)))

// Kept locally so unselecting Other doesn't lose what was typed.
const initialOther = values.value.find((v) => !labels.value.has(v))
const otherText = ref(initialOther ?? '')
const otherOn = ref(initialOther !== undefined)

function commit(nextPicked: string[]) {
  const custom = otherOn.value && otherText.value.trim() ? [otherText.value.trim()] : []
  if (multi.value) {
    const ordered = options.value.map((o) => o.const).filter((l) => nextPicked.includes(l))
    const all = [...ordered, ...custom]
    set(all.length ? all : undefined)
  } else {
    set(custom[0] ?? nextPicked[0])
  }
}

function choose(label: string) {
  if (!enabled.value) return
  if (multi.value) {
    const has = picked.value.includes(label)
    commit(has ? picked.value.filter((l) => l !== label) : [...picked.value, label])
  } else {
    otherOn.value = false
    commit([label])
  }
}

function toggleOther() {
  if (!enabled.value) return
  otherOn.value = multi.value ? !otherOn.value : true
  commit(multi.value ? picked.value : [])
}

function onOtherInput(event: Event) {
  otherText.value = (event.target as HTMLInputElement).value
  if (otherText.value.trim()) otherOn.value = true
  commit(multi.value || !otherOn.value ? picked.value : [])
}

function onOptionKey(event: KeyboardEvent, label: string) {
  if (event.key === ' ') {
    event.preventDefault()
    choose(label)
  }
}

// Focus lands on the first picked option, or the first option.
const primary = computed(() => {
  if (otherOn.value && !picked.value.length) return options.value.length
  const i = options.value.findIndex((o) => picked.value.includes(o.const))
  return i === -1 ? 0 : i
})

// Previews: the focused option's, else the (last) picked option's.
const hasPreview = computed(() => options.value.some((o) => o['x-preview']))
const focused = ref<number | null>(null)
const preview = computed(() => {
  if (!hasPreview.value) return undefined
  const option = focused.value !== null
    ? options.value[focused.value]
    : options.value.find((o) => o.const === picked.value[picked.value.length - 1])
  return option ? { label: option.title, source: option['x-preview'] } : undefined
})
</script>

<template>
  <QuestionFrame v-bind="frame" :advance-on-pick="!multi">
    <div
      class="options"
      :role="multi ? 'group' : 'radiogroup'"
      :aria-label="frame.header"
      @keydown="moveAmongPicks($event, { prev: ['ArrowUp'], next: ['ArrowDown'] })"
    >
      <div
        v-for="(option, i) in options"
        :key="option.const"
        class="option"
        :class="{ picked: picked.includes(option.const), disabled: !enabled }"
        :role="multi ? 'checkbox' : 'radio'"
        :aria-checked="picked.includes(option.const)"
        :aria-disabled="!enabled"
        :tabindex="i === primary ? 0 : -1"
        :data-pick="i + 1"
        :data-primary="i === primary || undefined"
        @click="choose(option.const)"
        @keydown="onOptionKey($event, option.const)"
        @focus="focused = i"
        @blur="focused = null"
      >
        <span class="indicator" :class="multi ? 'box' : 'dot'" aria-hidden="true" />
        <span class="option-body">
          <span class="option-label">{{ option.title }}</span>
          <Markdown v-if="option.description" inline class="option-desc" :source="option.description" />
        </span>
        <kbd class="key">{{ i + 1 }}</kbd>
      </div>

      <div v-if="allowOther" class="option other" :class="{ picked: otherOn, disabled: !enabled }">
        <span
          class="indicator"
          :class="multi ? 'box' : 'dot'"
          role="presentation"
          @mousedown.prevent="toggleOther"
        />
        <input
          type="text"
          class="other-input"
          placeholder="Other…"
          aria-label="Your own answer"
          :value="otherText"
          :disabled="!enabled"
          :aria-checked="otherOn"
          :tabindex="primary === options.length ? 0 : -1"
          :data-pick="options.length + 1"
          :data-primary="primary === options.length || undefined"
          @input="onOtherInput"
          @focus="!multi && otherText.trim() && !otherOn && toggleOther()"
        >
        <kbd class="key">{{ options.length + 1 }}</kbd>
      </div>
    </div>

    <div v-if="preview?.source" class="preview" aria-live="polite">
      <div class="preview-label">{{ preview.label }}</div>
      <Markdown :source="preview.source" />
    </div>
    <div v-else-if="hasPreview" class="preview empty">Focus an option to preview it.</div>
  </QuestionFrame>
</template>
