/**
 * The `theme` setting: one theme id, or a light/dark pair that follows the system appearance.
 * Pure: no DOM, no Tauri.
 *
 * This file is a contract meant to be copied unchanged into inn and Quire, which take a single id
 * today. Only DEFAULT_THEME_SETTING is the app's own. Changing anything else needs Logan.
 */

export type ThemeSetting = string | { light: string; dark: string }
export type Appearance = 'light' | 'dark'

/** A theme's id is its file stem: lowercase letters, digits, `.`, `_`, `-`, not starting with a dot. As inn's. */
export const THEME_ID = /^[a-z0-9][a-z0-9._-]*$/

/** What shows with no setting. The app's own: the one line that differs between copies. */
export const DEFAULT_THEME_SETTING: ThemeSetting = { light: 'parley-light', dark: 'parley-dark' }

/** The theme id to show. A single id ignores the appearance. */
export function resolveThemeSetting(setting: ThemeSetting, appearance: Appearance): string {
  return typeof setting === 'string' ? setting : setting[appearance]
}

/** settings.json's `theme` value, or the problem with it. Missing → the default pair. */
export function parseThemeSetting(
  value: unknown,
): { ok: true; setting: ThemeSetting } | { ok: false; problem: string } {
  if (value === undefined) return { ok: true, setting: DEFAULT_THEME_SETTING }
  const shape = 'a theme id, or { "light": "<id>", "dark": "<id>" }'
  if (typeof value === 'string') {
    if (THEME_ID.test(value)) return { ok: true, setting: value }
    return { ok: false, problem: `"theme" ${JSON.stringify(value)} isn't a theme id (lowercase letters, digits, ".", "_", "-")` }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, problem: `"theme" must be ${shape}, got ${JSON.stringify(value)}` }
  }
  const pair = value as Record<string, unknown>
  const extra = Object.keys(pair).filter((key) => key !== 'light' && key !== 'dark')
  if (extra.length) {
    return { ok: false, problem: `"theme" takes only "light" and "dark", not ${extra.map((k) => JSON.stringify(k)).join(', ')}` }
  }
  for (const side of ['light', 'dark'] as const) {
    const id = pair[side]
    if (id === undefined) return { ok: false, problem: `"theme" needs both "light" and "dark"; "${side}" is missing` }
    if (typeof id !== 'string' || !THEME_ID.test(id)) {
      return { ok: false, problem: `"theme".${side} ${JSON.stringify(id)} isn't a theme id` }
    }
  }
  return { ok: true, setting: { light: pair.light as string, dark: pair.dark as string } }
}
