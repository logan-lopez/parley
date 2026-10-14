import { TOKEN_NAMES } from '../theme/theme'
import type { PreviewTheme } from './preview'

// Previews are pictures with the theme baked in, so they're drawn again when
// it changes. src/theme/ (the window) and src/mcp-app/theme.ts (the card's
// host colors) both write the tokens and color-scheme onto :root's style, so
// one observer on :root sees every change; the media query covers the scheme
// fallback. One for the whole page, shared by every Markdown instance.

const QUERY = '(prefers-color-scheme: dark)'
const listeners = new Set<() => void>()
let stop: (() => void) | undefined

/** Calls `listener` after the theme may have changed. Returns a function that stops it. */
export function onThemeChange(listener: () => void): () => void {
  listeners.add(listener)
  stop ??= start()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      stop?.()
      stop = undefined
    }
  }
}

function start(): () => void {
  const notify = () => {
    for (const listener of listeners) listener()
  }
  // Mutations arrive batched, one call for a whole repaint.
  const observer = new MutationObserver(notify)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme'] })
  const query = matchMedia(QUERY)
  query.addEventListener('change', notify)
  return () => {
    observer.disconnect()
    query.removeEventListener('change', notify)
  }
}

/**
 * The theme as it's painted now: every token's resolved value (a host's `var(--color-…)` comes
 * back substituted), the font family, the scheme from `color-scheme` on :root, else the system,
 * and the preview page's colors from tokens.css.
 */
export function previewTheme(): PreviewTheme {
  const root = getComputedStyle(document.documentElement)
  const vars: Record<string, string> = {}
  for (const name of TOKEN_NAMES) {
    const value = root.getPropertyValue(`--${name}`).trim()
    if (value) vars[name] = value
  }
  const declared = root.colorScheme.split(/\s+/)
  const scheme = declared.length === 1 && (declared[0] === 'light' || declared[0] === 'dark')
    ? declared[0]
    : matchMedia(QUERY).matches ? 'dark' : 'light'
  const page = {
    background: root.getPropertyValue('--preview-paper').trim(),
    color: root.getPropertyValue('--preview-ink').trim(),
  }
  return { vars, font: getComputedStyle(document.body).fontFamily, scheme, page }
}
