// Page zoom for the app window: Cmd+= (or Cmd++) and Cmd+-, 80–150%, kept
// across launches. Cmd+0 belongs to AeroSpace, so there's no reset key.

const KEY = 'parley:zoom'
const DEFAULT = 1.1
const MIN = 0.8
const MAX = 1.5

function load(): number {
  try {
    const saved = Number(localStorage.getItem(KEY))
    if (saved >= MIN && saved <= MAX) return saved
  } catch {
    // Storage unavailable: use the default.
  }
  return DEFAULT
}

function apply(zoom: number) {
  document.documentElement.style.setProperty('zoom', String(zoom))
}

export function initZoom() {
  let zoom = load()
  apply(zoom)
  window.addEventListener('keydown', (event) => {
    if (!event.metaKey || event.ctrlKey || event.altKey) return
    const step = ['=', '+'].includes(event.key) ? 0.1 : ['-', '_'].includes(event.key) ? -0.1 : 0
    if (!step) return
    event.preventDefault()
    zoom = Math.round(Math.min(MAX, Math.max(MIN, zoom + step)) * 10) / 10
    apply(zoom)
    try {
      localStorage.setItem(KEY, String(zoom))
    } catch {
      // Not remembered; fine.
    }
  })
}
