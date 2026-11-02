<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { copyText, openExternal, openMedia, type MediaUrl } from '../platform'
import type { MediaEntry } from '@parley/protocol'
import { audition, chipUrls, track } from './audition'
import { MEDIA } from './media'
import { renderMarkdown } from './markdown'
import { formatDuration, player, soundDuration } from './player'
import { previewSrc, scaled, type PreviewKind } from './preview'
import { onThemeChange, previewTheme } from './theme-watch'

// `scope` names this surface within the form (the question id and which
// field), so a sound chip's id stays the same when a preview is shown again.
const props = defineProps<{ source: string; inline?: boolean; scope?: string }>()
const media = inject(MEDIA, undefined)
const fallbackScope = `md${++instances}`
const html = computed(() => renderMarkdown(props.source, props.inline, {
  media: media?.entries(),
  scope: props.scope ?? fallbackScope,
}))

// After every render: v-html replaces the DOM. Swatch colors go through the
// CSSOM, which the CSP allows; a `style` attribute in the markup it drops.
const root = ref<HTMLElement>()

function paint() {
  for (const el of root.value?.querySelectorAll<HTMLElement>('[data-color]') ?? []) {
    el.style.setProperty('--swatch', el.dataset.color!)
  }
  paintPreviews()
  void track(paintMedia())
}

async function paintMedia() {
  const figures = [...(root.value?.querySelectorAll<HTMLElement>('.md-media') ?? [])]
  const chips = [...(root.value?.querySelectorAll<HTMLElement>('.md-sound') ?? [])]
  if ((!figures.length && !chips.length) || !media) return
  const entries = media.entries()
  for (const el of [...figures, ...chips]) {
    if (own(entries, el.dataset.media!)) el.querySelector('.md-media-status, .md-sound-status')!.textContent = 'Loading…'
  }
  const urls = await media.urls().catch(() => new Map<string, MediaUrl>())
  // v-html or the form may have changed while the grant was being checked.
  if (entries !== media.entries()) return
  for (const figure of figures) {
    if (!root.value?.contains(figure)) continue
    const src = figure.dataset.media!
    const file = own(entries, src) ? entries[src]?.files[0] : undefined
    const result = file && resolved(urls, file)
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
      status.textContent = failure(result?.status, file?.path ?? src, 'Open in the Parley window')
    }
  }
  for (const chip of chips) {
    if (root.value?.contains(chip)) paintChip(chip, own(entries, chip.dataset.media!) ? entries[chip.dataset.media!] : undefined, urls)
  }
}

function own(entries: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(entries, key)
}

// Equal hashes can belong to different files: prefer the file's own status.
function resolved(urls: Map<string, MediaUrl>, file: { sha256: string; abs: string }): MediaUrl | undefined {
  const byHash = urls.get(file.sha256)
  return byHash?.byPath?.get(file.abs) ?? byHash
}

function failure(status: string | undefined, path: string, window: string): string {
  return status === 'changed' ? `${path} changed since this was asked`
    : status === 'missing' ? `${path} is gone`
    : status === 'window' ? window
    : status === 'refused' ? `${path} couldn't be loaded`
    : `${path} isn't loaded here`
}

// A chip plays only when every variant has its grant (`chipUrls`, shared with
// the audition keys); otherwise it's disabled and says why, naming the first
// file that failed.
function paintChip(chip: HTMLElement, entry: MediaEntry | undefined, urls: Map<string, MediaUrl>) {
  const status = chip.querySelector<HTMLElement>('.md-sound-status')!
  const files = entry?.kind === 'audio' ? entry.files : []
  if (files.length) chip.title = files.map((file) => file.path).join('\n')
  const results = files.map((file) => resolved(urls, file))
  const bad = results.findIndex((result) => result?.status !== 'ok' || !result.url)
  chip.dataset.variants = String(files.length)
  if (files.length && bad === -1) {
    const playable = results.map((result) => result!.url!)
    chipUrls.set(chip, playable)
    chip.setAttribute('aria-disabled', 'false')
    status.textContent = ''
    void soundDuration(playable[0]!).then((seconds) => {
      if (seconds === undefined || chipUrls.get(chip) !== playable) return
      chip.dataset.duration = formatDuration(seconds)
      paintSounds()
    })
  } else {
    chipUrls.delete(chip)
    chip.setAttribute('aria-disabled', 'true')
    const path = files[bad]?.path ?? chip.dataset.media!
    status.textContent = failure(results[bad]?.status, path, 'Plays in the Parley window')
  }
  paintSounds()
}

// From the player's state: ■ and "2/4" on the chip that's playing; ▶, the
// variant count and the first variant's length on the rest.
function paintSounds() {
  const { id, variant, count, playing } = player.state
  for (const chip of root.value?.querySelectorAll<HTMLElement>('.md-sound') ?? []) {
    const on = playing && chip.dataset.sound === id
    const variants = Number(chip.dataset.variants ?? 0)
    chip.classList.toggle('playing', on)
    chip.classList.toggle('next', !on && chip.dataset.sound === audition.next)
    chip.setAttribute('aria-pressed', String(on))
    chip.querySelector('.md-sound-icon')!.textContent = on ? '■' : '▶'
    const meta = on && count > 1 ? `${variant + 1}/${count}`
      : [variants > 1 ? `${variants} variants` : '', chip.dataset.duration ?? ''].filter(Boolean).join(' · ')
    chip.querySelector('.md-sound-meta')!.textContent = meta
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
watch(() => media?.entries(), () => void track(paintMedia()), { flush: 'post' })
watch(() => ({ ...player.state }), paintSounds, { flush: 'post' })
watch(() => audition.next, paintSounds, { flush: 'post' })

// Links open in the default browser; the webview never navigates. A code
// block's button copies it, and a preview's flips between picture and source.
function onClick(event: MouseEvent) {
  const target = event.target as Element | null
  const chip = target?.closest<HTMLElement>('[data-sound]')
  if (chip) {
    // A chip in an option's description mustn't pick the option.
    event.preventDefault()
    event.stopPropagation()
    const urls = chipUrls.get(chip)
    if (event.type !== 'click' || chip.getAttribute('aria-disabled') === 'true' || !urls) return
    const id = chip.dataset.sound!
    if (player.state.playing && player.state.id === id) player.stop()
    else player.play(id, urls)
    return
  }
  const image = target?.closest<HTMLButtonElement>('[data-media-open]')
  if (image) {
    event.preventDefault()
    if (event.type === 'click' && !image.disabled && media) {
      const src = image.closest<HTMLElement>('[data-media]')!.dataset.media!
      const entries = media.entries()
      const file = own(entries, src) ? entries[src]?.files[0] : undefined
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
  if ((event.target as Element | null)?.closest('[data-preview-source], [data-copy], [data-media-open], [data-sound]')) event.preventDefault()
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

<script lang="ts">
let instances = 0
</script>

<template>
  <!-- markdown-it escapes HTML (html: false), so this is safe to inject. -->
  <component :is="inline ? 'span' : 'div'" ref="root" class="md" v-html="html" @click="onClick" @auxclick.prevent="onClick" @mousedown="onMouseDown" />
</template>
