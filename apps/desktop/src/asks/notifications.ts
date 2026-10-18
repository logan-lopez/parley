// A new ask announces itself; it never shows or focuses the window.

import { getCurrentWindow } from '@tauri-apps/api/window'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { readSettingsText } from '../theme'
import type { SoundSetting } from '../theme/settings'
import { DEFAULT_SOUND, parseSettingsFile } from '../theme/settings'
import { sourceLabel } from './source'
import type { AskRecord } from './store'

// A webview reload empties the store, and servers re-send their asks. The
// store reloads from disk first, so they're usually not new. When history
// writes are failing they look new, and sessionStorage, which survives the
// reload, keeps them from notifying twice.
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
  sendNotification({
    title: sourceLabel(record.session),
    body: record.form.title ?? 'New question',
    sound: notificationSound(await currentSound()),
  })
}

// Read at each notification, so an edit to settings.json counts while the
// window stays hidden. What's wrong with the file shows in the window's banner.
async function currentSound(): Promise<SoundSetting> {
  try {
    return parseSettingsFile(await readSettingsText()).sound
  } catch {
    return DEFAULT_SOUND
  }
}

// macOS takes a sound's name, or this constant for its own notification sound.
function notificationSound(sound: SoundSetting): string | undefined {
  if (sound === null) return undefined
  return sound === 'default' ? 'NSUserNotificationDefaultSoundName' : sound
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
