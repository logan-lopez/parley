import { isTauri } from '@tauri-apps/api/core'
import type { Appearance } from './setting'

/**
 * The system appearance, light or dark, and its changes while the app runs: a switch in System
 * Settings, and Auto's own at sunrise and sunset. Written to be copied into inn and Quire beside
 * `setting.ts`; outside Tauri (a browser, the gallery) it's the media query alone.
 */

const QUERY = '(prefers-color-scheme: dark)'

export function currentAppearance(): Appearance {
  return matchMedia(QUERY).matches ? 'dark' : 'light'
}

/**
 * Calls `onChange` with the appearance whenever it may have changed: on the media query's `change`
 * and, in Tauri, on the window's own theme events, which also arrive while it's hidden. Either may
 * repeat the other; callers make that cheap. Returns a function that stops watching.
 */
export function watchAppearance(onChange: (appearance: Appearance) => void): () => void {
  const query = matchMedia(QUERY)
  const onQuery = () => onChange(query.matches ? 'dark' : 'light')
  query.addEventListener('change', onQuery)
  let stopped = false
  let unlisten: (() => void) | undefined
  if (isTauri()) {
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const window = getCurrentWindow()
      const stop = await window.onThemeChanged(({ payload }) => onChange(payload))
      if (stopped) stop()
      else unlisten = stop
      const now = await window.theme()
      if (now && !stopped) onChange(now)
    }).catch((error: unknown) => console.warn('theme events unavailable:', error))
  }
  return () => {
    stopped = true
    query.removeEventListener('change', onQuery)
    unlisten?.()
  }
}
