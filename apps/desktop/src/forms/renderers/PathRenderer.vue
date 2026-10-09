<script setup lang="ts">
// A native picker. Holds paths only; nothing reads the files.
import { computed } from 'vue'
import { rendererProps, type RendererProps } from '@jsonforms/vue'
import type { ControlElement } from '@jsonforms/core'
import type { PathKind } from '@parley/protocol'
import { pickPaths } from '../../platform'
import QuestionFrame from './QuestionFrame.vue'
import { useQuestion } from './useQuestion'

const props = defineProps(rendererProps<ControlElement>())
const { schema, data, frame, enabled, set } = useQuestion(props as RendererProps<ControlElement>)

const multiple = computed(() => schema.value.type === 'array')
const kind = computed(() => (schema.value['x-path-kind'] ?? 'file') as PathKind)
const extensions = computed(() => schema.value['x-extensions'] as string[] | undefined)
const paths = computed<string[]>(() => {
  const d = data.value
  return Array.isArray(d) ? d : typeof d === 'string' && d ? [d] : []
})

const noun = computed(() => {
  const base = kind.value === 'directory' ? 'folder' : 'file'
  return multiple.value ? `${base}s` : base
})

async function choose() {
  const picked = await pickPaths({
    kind: kind.value,
    multiple: multiple.value,
    extensions: extensions.value,
    title: frame.value.header,
  })
  if (!picked.length) return
  if (multiple.value) set([...new Set([...paths.value, ...picked])])
  else set(picked[0])
}

function remove(path: string) {
  const rest = paths.value.filter((p) => p !== path)
  set(multiple.value ? (rest.length ? rest : undefined) : undefined)
}
</script>

<template>
  <QuestionFrame v-bind="frame">
    <ul v-if="paths.length" class="paths">
      <li v-for="path in paths" :key="path" class="path">
        <span class="path-text" :title="path">{{ path }}</span>
        <button
          type="button"
          class="icon-button"
          :aria-label="`Remove ${path}`"
          :disabled="!enabled"
          @click="remove(path)"
        >
          ×
        </button>
      </li>
    </ul>
    <div class="path-row">
      <button type="button" class="button" :disabled="!enabled" data-primary @click="choose">
        {{ paths.length && !multiple ? `Change ${noun}…` : `Choose ${noun}…` }}
      </button>
      <span v-if="extensions?.length" class="hint">{{ extensions.map((e) => `.${e}`).join(', ') }}</span>
    </div>
  </QuestionFrame>
</template>
