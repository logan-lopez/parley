<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { copyText, openExternal, openMedia } from '../platform'
import { MEDIA } from './media'
import { renderMarkdown } from './markdown'
import { previewSrc, scaled, type PreviewKind } from './preview'
import { onThemeChange, previewTheme } from './theme-watch'

const props = defineProps<{ source: string; inline?: boolean }>()
const html = computed(() => renderMarkdown(props.source, props.inline))

// After every render: v-html replaces the DOM. Swatch colors go through the
// CSSOM, which the CSP allows; a `style` attribute in the markup it drops.
const root = ref<HTMLElement>()
const media = inject(MEDIA, undefined)

function paint() {
  for (const el of root.value?.querySelectorAll<HTMLElement>('[data-color]') ?? []) {
    el.style.setProperty('--swatch', el.dataset.color!)
  }
  paintPreviews()
  void paintMedia()
}

async function paintMedia() {
  const figures = [...(root.value?.querySelectorAll<HTMLElement>('.md-media') ?? [])]
  if (!figures.length || !media) return
  const entries = media.entries()
  for (const figure of figures) {
    if (Object.prototype.hasOwnProperty.call(entries, figure.dataset.media!)) figure.querySelector('.md-media-status')!.textContent = 'Loading…'
  }
  const urls = await media.urls().catch(() => new Map())
  // v-html or the form may have changed while the grant was being checked.
  if (entries !== media.entries()) return
  for (const figure of figures) {
    if (!root.value?.contains(figure)) continue
    const src = figure.dataset.media!
    const file = Object.prototype.hasOwnProperty.call(entries, src) ? entries[src]?.files[0] : undefined
    const byHash = file && urls.get(file.sha256)
    const result = file && (byHash?.byPath?.get(file.abs) ?? byHash)
    const status = figure.querySelector<HTMLElement>('.md-media-status')!
    if (file) figure.querySelector('.md-media-path')!.textContent = file.path
    const img = figure.querySelector<HTMLImageElement>('.md-media-img')!
    const button = figure.querySelector<HTMLButtonElement>('[data-media-open]')!
    if (result?.status === 'ok' && result.url) {
      status.textContent = 'Loading…'
      img.onload = () => {
        img.hidden = false
        status.textContent = ''
        button.disabled = false
      }
      img.onerror = () => {
        img.hidden = true
        button.disabled = true
        status.textContent = `Couldn't draw ${file!.path}`
      }
      img.src = result.url
    } else {
      img.hidden = true
      button.disabled = true
      img.removeAttribute('src')
      const path = file?.path ?? src
      status.textContent = result?.status === 'changed' ? `${path} changed since this was asked`
        : result?.status === 'missing' ? `${path} is gone`
        : result?.status === 'window' ? 'Open in the Parley window'
        : result?.status === 'refused' ? `${path} couldn't be loaded`
        : `${path} isn't loaded here`
    }
  }
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
watch(() => media?.entries(), () => void paintMedia(), { flush: 'post' })

// Links open in the default browser; the webview never navigates. A code
// block's button copies it, and a preview's flips between picture and source.
function onClick(event: MouseEvent) {
  const target = event.target as Element | null
  const image = target?.closest<HTMLButtonElement>('[data-media-open]')
  if (image) {
    event.preventDefault()
    if (event.type === 'click' && !image.disabled && media) {
      const src = image.closest<HTMLElement>('[data-media]')!.dataset.media!
      const entries = media.entries()
      const file = Object.prototype.hasOwnProperty.call(entries, src) ? entries[src]?.files[0] : undefined
      if (file) void openMedia(file).catch((error) => console.warn('open image failed:', error))
    }
    return
  }
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
  if ((event.target as Element | null)?.closest('[data-preview-source], [data-copy], [data-media-open]')) event.preventDefault()
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
