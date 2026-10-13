import type { Appearance, ThemeSetting } from './setting'
import { resolveThemeSetting, THEME_ID } from './setting'
import type { Theme, ThemeSource } from './theme'
import { parseTheme } from './theme'

/**
 * The themes on disk, beside the bundled ones, and which one shows. Pure over `ThemeFs`, so it's
 * tested without Tauri.
 */

/** What the loader needs from a file system. */
export interface ThemeFs {
  /** File names in `dir`, or null when the folder doesn't exist. */
  list(dir: string): Promise<string[] | null>
  read(path: string): Promise<string>
}

/** A theme folder, later ones winning over earlier ones on the same id. */
export interface ThemeDir {
  path: string
  source: Exclude<ThemeSource, 'bundled'>
  /** How errors name the folder: `inn themes`, `themes`. */
  label: string
}

/** A file that didn't parse, with the reason. It can't show. */
export interface BrokenTheme {
  id: string
  name: string
  source: Exclude<ThemeSource, 'bundled'>
  broken: string
}

export type ThemeEntry = Theme | BrokenTheme

export function isBroken(entry: ThemeEntry): entry is BrokenTheme {
  return 'broken' in entry
}

/**
 * The bundled themes, then each folder's in order; on the same id a later folder's file takes the
 * earlier one's place, so `~/.config/parley/themes/` wins over inn's, and inn's over a bundled
 * theme. Lists each folder (a missing one means none) and parses every `<id>.yaml` whose stem is a
 * theme id. A file that throws is a `BrokenTheme` with the reason. Anything else is skipped.
 */
export async function loadThemes(
  fs: ThemeFs,
  dirs: readonly ThemeDir[],
  bundled: readonly Theme[],
): Promise<ThemeEntry[]> {
  const byId = new Map<string, ThemeEntry>(bundled.map((t) => [t.id, t]))
  for (const dir of dirs) {
    const names = (await fs.list(dir.path)) ?? []
    const ids = names
      .filter((name) => name.endsWith('.yaml'))
      .map((name) => name.slice(0, -'.yaml'.length))
      .filter((id) => THEME_ID.test(id))
      .sort()
    const entries = await Promise.all(
      ids.map(async (id): Promise<ThemeEntry> => {
        const file = `${dir.label}/${id}.yaml`
        try {
          return parseTheme(id, await fs.read(`${dir.path}/${id}.yaml`), { source: dir.source, file })
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err)
          // parseTheme's messages name the file already; a read error doesn't.
          const broken = reason.startsWith(`${file}: `) ? reason : `${file}: ${reason}`
          return { id, name: id, source: dir.source, broken }
        }
      }),
    )
    for (const entry of entries) byId.set(entry.id, entry)
  }
  return [...byId.values()]
}

/** A theme the setting names that can't show. */
export interface ThemeProblem {
  id: string
  /** The side of a pair it was named for; null for a single id, which is both. */
  appearance: Appearance | null
  reason: string
}

/**
 * The theme for each appearance. A side whose theme is missing or broken shows that appearance's
 * fallback (the bundled theme) instead, and is listed in `problems`.
 */
export function pickThemes(
  setting: ThemeSetting,
  entries: readonly ThemeEntry[],
  fallback: Record<Appearance, Theme>,
  dirs: readonly ThemeDir[],
): { themes: Record<Appearance, Theme>; problems: ThemeProblem[] } {
  const themes = { ...fallback }
  const problems: ThemeProblem[] = []
  const sides = typeof setting === 'string' ? [null] : (['light', 'dark'] as const)
  for (const side of sides) {
    const id = resolveThemeSetting(setting, side ?? 'light')
    const entry = entries.find((t) => t.id === id)
    if (entry && !isBroken(entry)) {
      if (side) themes[side] = entry
      else themes.light = themes.dark = entry
      continue
    }
    const files = [...dirs].reverse().map((d) => `${d.label}/${id}.yaml`).join(' or ')
    problems.push({ id, appearance: side, reason: entry ? entry.broken : `there's no ${files}` })
  }
  return { themes, problems }
}
