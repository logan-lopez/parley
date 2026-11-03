import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { DEFAULT_HIDE_ON_BLUR } from './theme/settings'

/**
 * `hideOnBlur`: the window hides when it loses focus, unless settings.json says `false` or one of
 * Parley's own native dialogs (the file picker) has just taken the focus. Drafts survive a hide,
 * so it costs one hotkey press. The window only: the inline card and the gallery never start it.
 */

let on = DEFAULT_HIDE_ON_BLUR
let dialogs = 0

/** settings.json's `hideOnBlur`, pushed by `refreshTheme` on every focus. */
export function setHideOnBlur(next: boolean): void {
  on = next
}

/** Whether losing focus now should hide the window. */
export function shouldHideOnBlur(): boolean {
  return on && dialogs === 0
}

/**
 * Runs `work`, a native dialog, with blur-hiding paused. A counter, so two overlapping dialogs
 * don't unpause each other.
 */
export async function duringDialog<T>(work: () => Promise<T>): Promise<T> {
  dialogs++
  try {
    return await work()
  } finally {
    dialogs--
  }
}

/** In the window, after mounting. */
export async function startBlurHide(): Promise<void> {
  if (!isTauri()) return
  const win = getCurrentWindow()
  await win.onFocusChanged(({ payload: focused }) => {
    if (!focused && shouldHideOnBlur()) void win.hide()
  })
}
