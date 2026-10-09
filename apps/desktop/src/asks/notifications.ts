// A new ask announces itself; it never shows or focuses the window.

import { getCurrentWindow } from '@tauri-apps/api/window'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { sourceLabel } from './source'
import type { AskRecord } from './store'

// A webview reload empties the store, and servers re-send their asks, which
// then look new. sessionStorage survives the reload, so they don't re-notify.
const NOTIFIED_KEY = 'parley:notified'

let granted = false

export async function initNotifications() {
  granted = await isPermissionGranted()
  if (!granted) granted = (await requestPermission()) === 'granted'
  if (!granted) console.warn('notification permission not granted')
}

export async function notifyNewAsk(record: AskRecord) {
  if (!granted || !markNotified(record.id)) return
  const window = getCurrentWindow()
  if ((await window.isVisible()) && (await window.isFocused())) return
  sendNotification({ title: sourceLabel(record.session), body: record.form.title ?? 'New question' })
}

// False if this id already notified.
function markNotified(id: string): boolean {
  try {
    const ids: string[] = JSON.parse(sessionStorage.getItem(NOTIFIED_KEY) ?? '[]')
    if (ids.includes(id)) return false
    sessionStorage.setItem(NOTIFIED_KEY, JSON.stringify([...ids, id].slice(-200)))
  } catch {
    // Storage unavailable: notify anyway.
  }
  return true
}
