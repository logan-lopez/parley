import type { Appearance } from './setting'
import type { Theme, TokenName, Variant } from './theme'
import { parseTheme, TOKEN_NAMES } from './theme'
import parleyDark from './themes/parley-dark.yaml?raw'
import parleyLight from './themes/parley-light.yaml?raw'
import './tokens.css'

/**
 * The bundled themes and painting one onto the document. No Tauri and no settings, so the inline
 * card uses it too (`src/mcp-app/theme.ts`); the window's loading is in `index.ts`.
 */

export const BUNDLED_THEMES: readonly Theme[] = [
  parseTheme('parley-light', parleyLight),
  parseTheme('parley-dark', parleyDark),
]

/** The default pair, and what stands in for a side whose theme doesn't load. */
export const BUNDLED: Record<Appearance, Theme> = {
  light: BUNDLED_THEMES[0]!,
  dark: BUNDLED_THEMES[1]!,
}

/** What `paint` needs of a theme: also the shape of the window's cache. */
export interface Painted {
  id: string
  name: string
  variant: Variant
  tokens: Record<TokenName, string>
}

let painted = ''

/**
 * Write the tokens and `color-scheme` onto `:root` as custom properties. Through the CSSOM, not a
 * <style> element or attribute, so the release CSP (`style-src 'self'`) lets it through. The same
 * tokens again change nothing, and return false.
 */
export function paint(theme: Painted): boolean {
  const key = JSON.stringify([theme.variant, theme.tokens])
  if (key === painted) return false
  painted = key
  const root = document.documentElement.style
  root.setProperty('color-scheme', theme.variant)
  for (const name of TOKEN_NAMES) root.setProperty(`--${name}`, theme.tokens[name])
  return true
}
