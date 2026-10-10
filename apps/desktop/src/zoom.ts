// Page zoom for the app window: Cmd+= (or Cmd++) and Cmd+-, or the control
// in the card's meta row. 80–150%, kept across launches. Cmd+0 belongs to
// AeroSpace, so resetting is a click on the percentage instead.

import { ref, watch } from 'vue'

const KEY = 'parley:zoom'
export const ZOOM_DEFAULT = 1.1
export const ZOOM_MIN = 0.8
export const ZOOM_MAX = 1.5

export const zoom = ref(load())

function load(): number {
  try {
    const saved = Number(localStorage.getItem(KEY))
    if (saved >= ZOOM_MIN && saved <= ZOOM_MAX) return saved
  } catch {
    // Storage unavailable: use the default.
  }
  return ZOOM_DEFAULT
}

export function setZoom(value: number) {
  zoom.value = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)) * 10) / 10
}

export function stepZoom(direction: 1 | -1) {
  setZoom(zoom.value + direction * 0.1)
}

export function initZoom() {
  watch(zoom, (value) => {
    document.documentElement.style.setProperty('zoom', String(value))
    try {
      localStorage.setItem(KEY, String(value))
    } catch {
      // Not remembered; fine.
    }
  }, { immediate: true })

  window.addEventListener('keydown', (event) => {
    if (!event.metaKey || event.ctrlKey || event.altKey) return
    const direction = ['=', '+'].includes(event.key) ? 1 : ['-', '_'].includes(event.key) ? -1 : 0
    if (!direction) return
    event.preventDefault()
    stepZoom(direction)
  })
}
