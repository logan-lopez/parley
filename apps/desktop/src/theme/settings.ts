import type { ThemeSetting } from './setting'
import { DEFAULT_THEME_SETTING, parseThemeSetting } from './setting'

/**
 * `~/.config/parley/settings.json`: Parley's own file, not part of the shared contract. Read-only
 * for Parley, which never writes it or creates the folder. `theme` is its only key. Pure.
 */

export const SETTINGS_KEYS = ['theme'] as const

/**
 * The setting to use, and what was wrong with the file. Null text (no file) is no settings.
 * A problem with `theme`, or a file that isn't a JSON object, means the default pair; an unknown
 * key is only reported, so a typo shows.
 */
export function parseSettingsFile(text: string | null): { setting: ThemeSetting; problems: string[] } {
  if (text === null) return { setting: DEFAULT_THEME_SETTING, problems: [] }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (err) {
    return { setting: DEFAULT_THEME_SETTING, problems: [`settings.json isn't JSON: ${(err as Error).message}`] }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { setting: DEFAULT_THEME_SETTING, problems: ['settings.json must be a JSON object'] }
  }
  const settings = data as Record<string, unknown>
  const problems = Object.keys(settings)
    .filter((key) => !(SETTINGS_KEYS as readonly string[]).includes(key))
    .map((key) => `settings.json: unknown key ${JSON.stringify(key)}`)
  const theme = parseThemeSetting(settings.theme)
  if (!theme.ok) return { setting: DEFAULT_THEME_SETTING, problems: [`settings.json: ${theme.problem}`, ...problems] }
  return { setting: theme.setting, problems }
}
