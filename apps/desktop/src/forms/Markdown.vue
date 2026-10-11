<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { copyText, openExternal } from '../platform'
import { renderMarkdown } from './markdown'

const props = defineProps<{ source: string; inline?: boolean }>()
const html = computed(() => renderMarkdown(props.source, props.inline))

// After every render: v-html replaces the DOM. Swatch colors go through the
// CSSOM, which the CSP allows; a `style` attribute in the markup it drops.
const root = ref<HTMLElement>()

function paint() {
  for (const el of root.value?.querySelectorAll<HTMLElement>('[data-color]') ?? []) {
    el.style.setProperty('--swatch', el.dataset.color!)
  }
}

onMounted(paint)
watch(html, paint, { flush: 'post' })

// Links open in the default browser; the webview never navigates. A code
// block's button copies it.
function onClick(event: MouseEvent) {
  const target = event.target as Element | null
  const button = target?.closest<HTMLButtonElement>('[data-copy]')
  if (button) {
    event.preventDefault()
    if (event.type === 'click') void copyBlock(button)
    return
  }
  const link = target?.closest('a[href]')
  if (!link) return
  event.preventDefault()
  void openExternal(link.getAttribute('href')!)
}

// "Copied" for a moment. When the host won't allow the clipboard (an MCP Apps
// host can withhold it), the block's text is selected instead for ⌘C.
const resets = new WeakMap<HTMLButtonElement, ReturnType<typeof setTimeout>>()

async function copyBlock(button: HTMLButtonElement) {
  const code = button.closest('.code-block')?.querySelector('code')
  if (!code) return
  const copied = await copyText((code.textContent ?? '').replace(/\n$/, ''))
  if (!copied) {
    const range = document.createRange()
    range.selectNodeContents(code)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }
  button.textContent = copied ? 'Copied' : 'Press ⌘C'
  button.classList.toggle('done', copied)
  clearTimeout(resets.get(button))
  resets.set(button, setTimeout(() => {
    button.textContent = 'Copy'
    button.classList.remove('done')
  }, copied ? 1500 : 3000))
}
</script>

<template>
  <!-- markdown-it escapes HTML (html: false), so this is safe to inject. -->
  <component :is="inline ? 'span' : 'div'" ref="root" class="md" v-html="html" @click="onClick" @auxclick.prevent="onClick" />
</template>
