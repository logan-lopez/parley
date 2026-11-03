import type { ThemeSetting } from './setting'
import { DEFAULT_THEME_SETTING, parseThemeSetting } from './setting'

/**
 * `~/.config/parley/settings.json`: Parley's own file, not part of the shared contract. Read-only
 * for Parley, which never writes it or creates the folder. Its keys are `theme`, `sound`, `autoplay` and `hideOnBlur`. Pure.
 */

export const SETTINGS_KEYS = ['theme', 'sound', 'autoplay', 'hideOnBlur'] as const

/**
 * `sound`: the name of a sound in one of `SOUND_FOLDERS`, `"default"` for the system's
 * notification sound, or null for none.
 */
export type SoundSetting = string | null

export const DEFAULT_SOUND: SoundSetting = 'default'

/** Where macOS looks a notification sound's name up, for the problem text. */
export const SOUND_FOLDERS = ['~/Library/Sounds', '/Library/Sounds', '/System/Library/Sounds'] as const

const SOUND_FILE = /^(.+)\.(aiff?|wav|caf|m4a|mp3)$/i

/**
 * `autoplay`: whether moving onto a review row or a choice option that has sound chips plays its
 * first one. Off unless the file says `true`: a window that starts making noise is a surprise.
 */
export const DEFAULT_AUTOPLAY = false

/**
 * `hideOnBlur`: whether the window hides when it loses focus (a click on another app or the
 * desktop). On unless the file says `false`: a floating panel that stays up after you've gone
 * elsewhere is what this setting exists to stop. Parley's own native dialogs don't count.
 */
export const DEFAULT_HIDE_ON_BLUR = true

export interface Settings {
  theme: ThemeSetting
  sound: SoundSetting
  autoplay: boolean
  hideOnBlur: boolean
}

const DEFAULTS: Settings = {
  theme: DEFAULT_THEME_SETTING,
  sound: DEFAULT_SOUND,
  autoplay: DEFAULT_AUTOPLAY,
  hideOnBlur: DEFAULT_HIDE_ON_BLUR,
}

/**
 * The settings to use, and what was wrong with the file. Null text (no file) is no settings.
 * A file that isn't a JSON object means the defaults; a bad key means its default and doesn't stop
 * the other working; an unknown key is only reported, so a typo shows.
 */
export function parseSettingsFile(text: string | null): Settings & { problems: string[] } {
  if (text === null) return { ...DEFAULTS, problems: [] }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (err) {
    return { ...DEFAULTS, problems: [`settings.json isn't JSON: ${(err as Error).message}`] }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ...DEFAULTS, problems: ['settings.json must be a JSON object'] }
  }
  const settings = data as Record<string, unknown>
  const problems: string[] = []
  const theme = parseThemeSetting(settings.theme)
  if (!theme.ok) problems.push(`settings.json: ${theme.problem}`)
  const sound = parseSoundSetting(settings.sound)
  if (!sound.ok) problems.push(`settings.json: ${sound.problem}`)
  const autoplay = parseAutoplaySetting(settings.autoplay)
  if (!autoplay.ok) problems.push(`settings.json: ${autoplay.problem}`)
  const hideOnBlur = parseHideOnBlurSetting(settings.hideOnBlur)
  if (!hideOnBlur.ok) problems.push(`settings.json: ${hideOnBlur.problem}`)
  problems.push(
    ...Object.keys(settings)
      .filter((key) => !(SETTINGS_KEYS as readonly string[]).includes(key))
      .map((key) => `settings.json: unknown key ${JSON.stringify(key)}`),
  )
  return {
    theme: theme.ok ? theme.setting : DEFAULT_THEME_SETTING,
    sound: sound.ok ? sound.sound : DEFAULT_SOUND,
    autoplay: autoplay.ok ? autoplay.autoplay : DEFAULT_AUTOPLAY,
    hideOnBlur: hideOnBlur.ok ? hideOnBlur.hideOnBlur : DEFAULT_HIDE_ON_BLUR,
    problems,
  }
}

/** settings.json's `sound` value, or the problem with it. Missing → the system's sound. */
export function parseSoundSetting(value: unknown): { ok: true; sound: SoundSetting } | { ok: false; problem: string } {
  if (value === undefined) return { ok: true, sound: DEFAULT_SOUND }
  if (value === null || (typeof value === 'string' && value.trim() !== '')) return { ok: true, sound: value }
  return { ok: false, problem: `"sound" must be a sound's name, "default", or null, got ${JSON.stringify(value)}` }
}

/** settings.json's `autoplay` value, or the problem with it. Missing → off. */
export function parseAutoplaySetting(value: unknown): { ok: true; autoplay: boolean } | { ok: false; problem: string } {
  if (value === undefined) return { ok: true, autoplay: DEFAULT_AUTOPLAY }
  if (typeof value === 'boolean') return { ok: true, autoplay: value }
  return { ok: false, problem: `"autoplay" must be true or false, got ${JSON.stringify(value)}` }
}

/** settings.json's `hideOnBlur` value, or the problem with it. Missing → on. */
export function parseHideOnBlurSetting(value: unknown): { ok: true; hideOnBlur: boolean } | { ok: false; problem: string } {
  if (value === undefined) return { ok: true, hideOnBlur: DEFAULT_HIDE_ON_BLUR }
  if (typeof value === 'boolean') return { ok: true, hideOnBlur: value }
  return { ok: false, problem: `"hideOnBlur" must be true or false, got ${JSON.stringify(value)}` }
}

/** The sound names in a folder's file names: the stems of the audio files. */
export function soundNames(files: string[]): string[] {
  return files.flatMap((file) => SOUND_FILE.exec(file)?.[1] ?? [])
}

/**
 * The problem with `sound` given the names in the sound folders, or null. Names match without
 * case, as the file system does.
 */
export function soundProblem(sound: SoundSetting, available: string[]): string | null {
  if (sound === null || sound === 'default') return null
  const wanted = sound.toLowerCase()
  if (available.some((name) => name.toLowerCase() === wanted)) return null
  return `settings.json: no sound ${JSON.stringify(sound)} in ${SOUND_FOLDERS.join(', ')}`
}
