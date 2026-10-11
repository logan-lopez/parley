<script setup lang="ts">
// A box the user pastes into: text kept verbatim, and screenshots saved as
// PNGs through `saveImage`, which returns the path the agent gets. Holds
// paths only; nothing reads the files back.
import { computed, ref } from 'vue'
import { rendererProps, type RendererProps } from '@jsonforms/vue'
import type { ControlElement } from '@jsonforms/core'
import {
  CAPTURE_MAX_IMAGE_BYTES,
  CAPTURE_MAX_IMAGES,
  CAPTURE_MAX_TEXT,
  type CaptureAccept,
  type CaptureValue,
} from '@parley/protocol'
import { saveImage } from '../../platform'
import QuestionFrame from './QuestionFrame.vue'
import { useQuestion } from './useQuestion'

const props = defineProps(rendererProps<ControlElement>())
const { schema, data, frame, enabled, set } = useQuestion(props as RendererProps<ControlElement>)

const accept = computed(() => (schema.value['x-accept'] ?? 'any') as CaptureAccept)
const takesText = computed(() => accept.value !== 'image')
const takesImages = computed(() => accept.value !== 'text')

const value = computed<CaptureValue>(() => {
  const d = data.value
  return typeof d === 'object' && d !== null && !Array.isArray(d) ? d as CaptureValue : {}
})
const images = computed(() => value.value.images ?? [])

// Local, so whitespace-only text shows as typed but counts as no answer.
const text = ref(typeof value.value.text === 'string' ? value.value.text : '')
const problem = ref<string>()
const saving = ref(0)

// Nothing filled is no answer at all, so `required` catches it at the top.
function update(next: CaptureValue) {
  const out: CaptureValue = {}
  if (next.text?.trim()) out.text = next.text
  if (next.images?.length) out.images = next.images
  set(Object.keys(out).length ? out : undefined)
}

function onInput(event: Event) {
  text.value = (event.target as HTMLTextAreaElement).value
  update({ text: text.value, images: images.value })
  problem.value = text.value.length >= CAPTURE_MAX_TEXT ? `That's the limit: ${CAPTURE_MAX_TEXT.toLocaleString('en-US')} characters.` : undefined
}

const thumbs = cache

// A paste with an image in it adds the image; any other paste is a normal one.
async function onPaste(event: ClipboardEvent) {
  if (!enabled.value || !takesImages.value) return
  const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
  if (!files.length) return
  event.preventDefault()
  problem.value = undefined
  for (const file of files) {
    if (images.value.length + saving.value >= CAPTURE_MAX_IMAGES) {
      problem.value = `At most ${CAPTURE_MAX_IMAGES} screenshots.`
      break
    }
    saving.value++
    try {
      const png = file.type === 'image/png' ? file : await toPng(file)
      if (png.size > CAPTURE_MAX_IMAGE_BYTES) {
        problem.value = `That image is over ${CAPTURE_MAX_IMAGE_BYTES / 1024 / 1024} MB.`
        continue
      }
      const [path, thumb] = await Promise.all([saveImage(png), thumbnail(png)])
      thumbs.set(path, { url: thumb, size: png.size })
      update({ text: text.value, images: [...images.value, path] })
    } catch (error) {
      console.warn('capture: saving a screenshot failed:', error)
      problem.value = "Parley couldn't save that image."
    } finally {
      saving.value--
    }
  }
}

function remove(path: string) {
  update({ text: text.value, images: images.value.filter((p) => p !== path) })
}

// The image-only box is an input so that WebKit delivers the paste to it,
// but it takes no typing.
function refuseTyping(event: InputEvent) {
  if (event.inputType !== 'insertFromPaste') event.preventDefault()
}

const placeholder = computed(() => (schema.value['x-placeholder'] as string | undefined) ?? 'Paste here')
const status = computed(() => (saving.value ? 'Saving the screenshot…' : undefined))

function name(path: string) {
  return path.split('/').pop() ?? path
}

function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<script lang="ts">
// Thumbnails by path, kept for the session so a card that mounts again still
// has them. A screenshot restored from a draft after a restart has none:
// showing it would mean reading the file back.
const cache = new Map<string, { url: string; size: number }>()

// A screenshot pastes as a PNG; an image copied elsewhere may not (Preview
// can hand over a TIFF), so it's redrawn as one.
async function toPng(blob: Blob): Promise<Blob> {
  const image = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  canvas.getContext('2d')!.drawImage(image, 0, 0)
  image.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((png) => (png ? resolve(png) : reject(new Error('PNG encoding failed'))), 'image/png'))
}

// A small `data:` URL (the CSP allows `img-src data:`), drawn to cover 112×80.
async function thumbnail(blob: Blob): Promise<string> {
  const image = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = 112
  canvas.height = 80
  const scale = Math.max(canvas.width / image.width, canvas.height / image.height)
  const w = image.width * scale
  const h = image.height * scale
  canvas.getContext('2d')!.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
  image.close()
  return canvas.toDataURL('image/png')
}
</script>

<template>
  <QuestionFrame v-bind="frame">
    <div v-if="!enabled" class="capture">
      <pre v-if="value.text" class="capture-read">{{ value.text }}</pre>
      <ul v-if="images.length" class="paths">
        <li v-for="path in images" :key="path" class="path">
          <span class="path-text" :title="path">{{ name(path) }}</span>
        </li>
      </ul>
      <span v-if="!value.text && !images.length" class="hint">Nothing pasted.</span>
    </div>
    <div v-else class="capture" @paste="onPaste">
      <textarea
        v-if="takesText"
        class="text-input capture-text"
        rows="6"
        spellcheck="false"
        :value="text"
        :placeholder="placeholder"
        :maxlength="CAPTURE_MAX_TEXT"
        :aria-label="frame.header"
        data-primary
        @input="onInput"
      />
      <input
        v-else
        type="text"
        class="capture-drop primary"
        value=""
        placeholder="Paste a screenshot (⌘V)"
        :aria-label="frame.header"
        data-primary
        @beforeinput="refuseTyping"
      >
      <ul v-if="images.length" class="shots">
        <li v-for="path in images" :key="path" class="shot">
          <img v-if="thumbs.get(path)" class="shot-thumb" :src="thumbs.get(path)!.url" alt="">
          <span class="shot-text">
            <span class="shot-name" :title="path">{{ name(path) }}</span>
            <span v-if="thumbs.get(path)" class="shot-size">{{ size(thumbs.get(path)!.size) }}</span>
          </span>
          <button type="button" class="icon-button" :aria-label="`Remove ${name(path)}`" @click="remove(path)">×</button>
        </li>
      </ul>
      <p v-if="problem" class="field-error">{{ problem }}</p>
      <span v-else-if="status" class="hint">{{ status }}</span>
      <span v-else-if="accept === 'any'" class="hint">Paste output or a screenshot.</span>
    </div>
  </QuestionFrame>
</template>
