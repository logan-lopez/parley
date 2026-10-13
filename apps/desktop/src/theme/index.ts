import { isTauri } from '@tauri-apps/api/core'
import { homeDir, join } from '@tauri-apps/api/path'
import { exists, readDir, readTextFile } from '@tauri-apps/plugin-fs'
import { ref } from 'vue'
import { currentAppearance, watchAppearance } from './appearance'
import type { ThemeDir, ThemeFs, ThemeProblem } from './load'
import { loadThemes, pickThemes } from './load'
import type { Painted } from './paint'
import { BUNDLED, BUNDLED_THEMES, paint } from './paint'
import type { Appearance } from './setting'
import { parseSettingsFile } from './settings'
import { TOKEN_NAMES } from './theme'

/**
 * The window's theme: `theme` in `~/.config/parley/settings.json`, from the bundled themes,
 * `~/.config/inn/themes/` and `~/.config/parley/themes/`, read again whenever the window gains
 * focus or the appearance changes. The gallery paints a bundled theme and reads nothing.
 */

/** Why the theme on screen isn't what settings.json asks for, one problem a line, or null. */
export const themeError = ref<string | null>(null)

/** What `initTheme` paints before anything is read, so a launch doesn't flash the default. */
const CACHE_KEY = 'parley.themeCache'

/** The theme for each appearance, and what went wrong, from the last read. */
let picked: { themes: Record<Appearance, Painted>; problems: string[]; themeProblems: ThemeProblem[] } = {
  themes: BUNDLED,
  problems: [],
  themeProblems: [],
}
let appearance: Appearance = 'light'

function toPainted({ id, name, variant, tokens }: Painted): Painted {
  return { id, name, variant, tokens }
}

function readCache(): Record<Appearance, Painted> | null {
  try {
    const data = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as Record<string, unknown> | null
    if (!data) return null
    const valid = (entry: unknown): entry is Painted => {
      const t = entry as Partial<Painted> | undefined
      if (!t || typeof t.id !== 'string' || typeof t.name !== 'string') return false
      if (t.variant !== 'dark' && t.variant !== 'light') return false
      const tokens = t.tokens as Record<string, unknown> | undefined
      // A token added since the cache was written means it's stale.
      return !!tokens && TOKEN_NAMES.every((n) => /^#[0-9a-f]{6}$/.test(String(tokens[n])))
    }
    return valid(data.light) && valid(data.dark) ? { light: data.light, dark: data.dark } : null
  } catch {
    return null
  }
}

function writeCache(themes: Record<Appearance, Painted>): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ light: toPainted(themes.light), dark: toPainted(themes.dark) }))
  } catch {
    // Storage can be unavailable; the next launch paints the bundled pair until the files are read.
  }
}

function describe(problem: ThemeProblem): string {
  const fallback = BUNDLED[problem.appearance ?? appearance].name
  if (problem.appearance === null) return `Theme "${problem.id}" didn't load: ${problem.reason}. Showing ${fallback}.`
  const which = `The ${problem.appearance} theme "${problem.id}"`
  return problem.appearance === appearance
    ? `${which} didn't load: ${problem.reason}. Showing ${fallback}.`
    : `${which} didn't load: ${problem.reason}. ${fallback} stands in for it.`
}

/** Paint the theme for the current appearance and say what's wrong. Cheap when nothing changed. */
function show(): void {
  paint(picked.themes[appearance])
  const lines = [...picked.problems, ...picked.themeProblems.map(describe)]
  themeError.value = lines.length ? lines.join('\n') : null
}

/**
 * Before mounting, synchronously: the pair last shown, from the cache, or else the bundled pair,
 * by the system appearance. `startTheme` then reads the files.
 */
export function initTheme(): void {
  appearance = currentAppearance()
  const cached = readCache()
  if (cached) picked = { ...picked, themes: cached }
  show()
}

const tauriFs: ThemeFs = {
  async list(dir) {
    if (!(await exists(dir))) return null
    return (await readDir(dir)).filter((e) => !e.isDirectory).map((e) => e.name)
  },
  read: (path) => readTextFile(path),
}

let generation = 0

/** Read settings.json and the theme folders, then show what they say. */
export async function refreshTheme(): Promise<void> {
  if (!isTauri()) return
  const mine = ++generation
  try {
    const home = await homeDir()
    const config = await join(home, '.config')
    const settingsPath = await join(config, 'parley', 'settings.json')
    const dirs: ThemeDir[] = [
      { path: await join(config, 'inn', 'themes'), source: 'inn', label: 'inn themes' },
      { path: await join(config, 'parley', 'themes'), source: 'yours', label: 'themes' },
    ]
    let text: string | null = null
    const problems: string[] = []
    try {
      if (await exists(settingsPath)) text = await readTextFile(settingsPath)
    } catch (error) {
      problems.push(`settings.json couldn't be read: ${String(error)}`)
    }
    const settings = parseSettingsFile(text)
    const entries = await loadThemes(tauriFs, dirs, BUNDLED_THEMES)
    const { themes, problems: themeProblems } = pickThemes(settings.setting, entries, BUNDLED, dirs)
    if (mine !== generation) return
    picked = { themes, problems: [...problems, ...settings.problems], themeProblems }
    writeCache(themes)
  } catch (error) {
    if (mine !== generation) return
    picked = { ...picked, problems: [`The theme files couldn't be read: ${String(error)}`], themeProblems: [] }
  }
  show()
}

/** In the window, after mounting: read the files now, on every focus, and on every appearance change. */
export function startTheme(): void {
  watchAppearance((next) => {
    appearance = next
    show()
    void refreshTheme()
  })
  window.addEventListener('focus', () => void refreshTheme())
  void refreshTheme()
}

/**
 * The gallery: `&theme=<id>` paints that bundled theme; without it, the default pair follows the
 * media query (the screenshots shoot light and dark through Playwright's `colorScheme`). No cache.
 */
export function initGalleryTheme(id: string | null): void {
  const fixed = BUNDLED_THEMES.find((t) => t.id === id)
  if (fixed) {
    paint(fixed)
    return
  }
  if (id) console.warn(`gallery: no bundled theme "${id}"; showing the default pair`)
  const follow = (next: Appearance) => void paint(BUNDLED[next])
  follow(currentAppearance())
  watchAppearance(follow)
}
