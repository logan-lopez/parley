<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { copyText, openExternal } from '../platform'
import { renderMarkdown } from './markdown'
import { previewSrc, scaled, type PreviewKind } from './preview'
import { onThemeChange, previewTheme } from './theme-watch'

const props = defineProps<{ source: string; inline?: boolean }>()
const html = computed(() => renderMarkdown(props.source, props.inline))

// After every render: v-html replaces the DOM. Swatch colors go through the
// CSSOM, which the CSP allows; a `style` attribute in the markup it drops.
const root = ref<HTMLElement>()

function paint() {
  for (const el of root.value?.querySelectorAll<HTMLElement>('[data-color]') ?? []) {
    el.style.setProperty('--swatch', el.dataset.color!)
  }
  paintPreviews()
}

// A preview's picture is built from its code block's text with the theme as
// it is now (forms/preview.ts caches it), and drawn again when the theme or
// the column's width changes. The size is the info string's, shrunk to fit
// the column by the builder, not by CSS (see previewSrc).
function paintPreviews() {
  const figures = root.value?.querySelectorAll<HTMLElement>('.md-preview')
  if (!figures?.length) return
  const theme = previewTheme()
  for (const figure of figures) {
    const img = figure.querySelector<HTMLImageElement>('.md-preview-img')!
    const source = (figure.querySelector('.md-preview-source code')?.textContent ?? '').replace(/\n$/, '')
    const size = { width: Number(figure.dataset.width), height: Number(figure.dataset.height) }
    // The column, less the frame's two hairlines. Unmeasured (hidden) is full size.
    const column = (figure.parentElement?.clientWidth ?? 0) - 2
    const scale = column > 0 ? column / size.width : 1
    const src = previewSrc(figure.dataset.preview as PreviewKind, source, size, theme, scale)
    if (!src) {
      fail(figure)
      continue
    }
    if (img.getAttribute('src') === src) continue
    const shown = scaled(size, scale)
    figure.classList.remove('failed')
    img.onerror = () => fail(figure)
    img.width = shown.width
    img.height = shown.height
    img.src = src
  }
}

function fail(figure: HTMLElement) {
  figure.classList.add('failed')
  figure.querySelector('.md-preview-status')!.textContent = "Couldn't draw this preview"
}

let stopWatching: (() => void) | undefined
let width = 0
const resize = new ResizeObserver(([entry]) => {
  if (entry!.contentRect.width === width) return
  width = entry!.contentRect.width
  paintPreviews()
})
onMounted(() => {
  paint()
  stopWatching = onThemeChange(paintPreviews)
  resize.observe(root.value!)
})
onBeforeUnmount(() => {
  stopWatching?.()
  resize.disconnect()
})
watch(html, paint, { flush: 'post' })

// Links open in the default browser; the webview never navigates. A code
// block's button copies it, and a preview's flips between picture and source.
function onClick(event: MouseEvent) {
  const target = event.target as Element | null
  const toggle = target?.closest<HTMLButtonElement>('[data-preview-source]')
  if (toggle) {
    event.preventDefault()
    if (event.type === 'click') {
      const figure = toggle.closest('.md-preview')!
      const showing = figure.classList.toggle('showing-source')
      figure.querySelector('.md-preview-status')!.textContent = showing ? 'Source' : 'Preview'
      toggle.textContent = showing ? 'Preview' : 'Source'
    }
    return
  }
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

// An option's preview belongs to the option that has focus, and goes away
// when focus leaves it: pressing Source or Copy in it mustn't move focus.
function onMouseDown(event: MouseEvent) {
  if ((event.target as Element | null)?.closest('[data-preview-source], [data-copy]')) event.preventDefault()
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
  <component :is="inline ? 'span' : 'div'" ref="root" class="md" v-html="html" @click="onClick" @auxclick.prevent="onClick" @mousedown="onMouseDown" />
</template>
