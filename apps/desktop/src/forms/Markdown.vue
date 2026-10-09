<script setup lang="ts">
import { computed } from 'vue'
import { openExternal } from '../platform'
import { renderMarkdown } from './markdown'

const props = defineProps<{ source: string; inline?: boolean }>()
const html = computed(() => renderMarkdown(props.source, props.inline))

// Links open in the default browser; the webview never navigates.
function onClick(event: MouseEvent) {
  const link = (event.target as Element | null)?.closest('a[href]')
  if (!link) return
  event.preventDefault()
  void openExternal(link.getAttribute('href')!)
}
</script>

<template>
  <!-- markdown-it escapes HTML (html: false), so this is safe to inject. -->
  <component :is="inline ? 'span' : 'div'" class="md" v-html="html" @click="onClick" @auxclick.prevent="onClick" />
</template>
