<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { setZoom, stepZoom, zoom, ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN } from './zoom'

const percent = computed(() => `${Math.round(zoom.value * 100)}%`)

// Brightens briefly on any change, so a hotkey change is visible too.
const flash = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
watch(zoom, () => {
  flash.value = true
  clearTimeout(timer)
  timer = setTimeout(() => (flash.value = false), 900)
})
</script>

<template>
  <span class="zoom" :class="{ flash }" role="group" aria-label="Zoom">
    <button type="button" tabindex="-1" aria-label="Zoom out (⌘−)" title="Zoom out (⌘−)" :disabled="zoom <= ZOOM_MIN" @click="stepZoom(-1)">−</button>
    <button type="button" tabindex="-1" class="zoom-value" :title="`Reset to ${ZOOM_DEFAULT * 100}%`" @click="setZoom(ZOOM_DEFAULT)">{{ percent }}</button>
    <button type="button" tabindex="-1" aria-label="Zoom in (⌘=)" title="Zoom in (⌘=)" :disabled="zoom >= ZOOM_MAX" @click="stepZoom(1)">+</button>
  </span>
</template>
