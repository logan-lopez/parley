import { parse as parseYaml } from 'yaml'

/**
 * Themes, in three layers, as inn and Quire do them (ported from Quire's `theme/theme.ts`):
 *
 * 1. A theme file (`<id>.yaml`) is a base24 or base16 scheme in the tinted-theming shape
 *    (`system`, `name`, `variant`, `palette: {base00: "#rrggbb", …}`), so a scheme from a base16
 *    or base24 repo loads unchanged. It may add `overrides: {token: slot-or-color}`, and a
 *    `parley: {token: slot-or-color}` block that inn and Quire ignore, so one file serves all
 *    three apps. Other top-level keys (`slug`, `author`, `quire:` …) are ignored.
 * 2. Semantic tokens: CSS custom properties named for their role, with inn's names. TOKENS is the
 *    default mapping from slots to tokens; a theme's `overrides`, then its `parley:` block,
 *    replace single entries. `highlight` follows `accent`'s final color unless set. `overrides`
 *    may also name inn's other tokens (INN_TOKENS): checked, then dropped.
 * 3. Components use tokens only, plus the shades `tokens.css` derives from them with
 *    `color-mix()`. A test fails on any color literal or slot name outside `src/theme/`.
 *
 * Pure: no DOM. `paint.ts` applies a theme to the document.
 */

export type Variant = 'dark' | 'light'

export const BASE16_SLOTS = [
  'base00', 'base01', 'base02', 'base03', 'base04', 'base05', 'base06', 'base07',
  'base08', 'base09', 'base0A', 'base0B', 'base0C', 'base0D', 'base0E', 'base0F',
] as const
export const BASE24_EXTRA_SLOTS = [
  'base10', 'base11', 'base12', 'base13', 'base14', 'base15', 'base16', 'base17',
] as const
export const SLOTS = [...BASE16_SLOTS, ...BASE24_EXTRA_SLOTS] as const
export type Slot = (typeof SLOTS)[number]

/** base24's fallback for base16 schemes: darker backgrounds repeat the background, brights repeat the normals. */
const BASE16_FALLBACK: Record<(typeof BASE24_EXTRA_SLOTS)[number], Slot> = {
  base10: 'base00',
  base11: 'base00',
  base12: 'base08',
  base13: 'base0A',
  base14: 'base0B',
  base15: 'base0C',
  base16: 'base0D',
  base17: 'base0E',
}

/** A slot, or another token's final color (which must map to a slot: no chains). */
type Mapping = Slot | { token: string }

/**
 * Every token Parley draws, and its default. These names are what theme files set, so they're a
 * user-facing contract: inn's names, a subset of inn's set. Tokens are added, never renamed.
 */
export const TOKENS = {
  // Surfaces
  bg: 'base00', // the window
  'surface-raised': 'base01', // option cards, inputs, lists, buttons
  // Text
  text: 'base05',
  'text-muted': 'base04',
  'text-faint': 'base03',
  // Lines
  border: 'base02',
  'border-strong': 'base03',
  // Accents
  accent: 'base0D', // actions and marks: Send, the lead decision, the question chip
  highlight: { token: 'accent' }, // what's picked or selected: options, segments, history rows
  link: 'base0D', // markdown links, link buttons
  'accent-text': 'base00', // text on an accent fill
  'focus-ring': 'base0D',
  // Status
  danger: 'base08',
  warning: 'base0A',
  success: 'base0B',
} as const satisfies Record<string, Mapping>

export type TokenName = keyof typeof TOKENS
export const TOKEN_NAMES = Object.keys(TOKENS) as TokenName[]

/**
 * inn's tokens that Parley doesn't draw, so an inn theme's `overrides` load unchanged: each is
 * checked like a token (a slot or `#rrggbb`) and then dropped. Copied from `TOKENS` in inn's
 * `apps/chat/server/utils/theme.ts` on 2026-10-12, leaving out the names Parley has. Add inn's
 * new ones here; a name in neither list is an error, so a typo still shows.
 */
export const INN_TOKENS: readonly string[] = [
  'surface',
  'surface-sunken',
  'text-strong',
  'selection',
  'info',
  'caret',
  'shadow-color',
  'search-match',
  'role-user',
  'role-assistant',
  'role-system',
  'mode-normal',
  'mode-insert',
  'mode-visual',
  'mode-replace',
  'syntax-comment',
  'syntax-keyword',
  'syntax-string',
  'syntax-number',
  'syntax-constant',
  'syntax-function',
  'syntax-type',
  'syntax-variable',
  'syntax-property',
  'syntax-operator',
  'syntax-punctuation',
  'syntax-regexp',
  'syntax-tag',
  'syntax-attribute',
  'syntax-builtin',
  'syntax-meta',
  'syntax-inserted',
  'syntax-deleted',
  'syntax-changed',
  'md-heading',
  'md-emphasis',
  'md-strong',
  'md-link',
  'md-url',
  'md-code',
  'md-quote',
  'md-list',
  'md-mark',
  'macro',
]

/** Bundled with the app, a file in `~/.config/inn/themes/`, or one in `~/.config/parley/themes/`. */
export type ThemeSource = 'bundled' | 'inn' | 'yours'

export interface Theme {
  id: string
  name: string
  variant: Variant
  system: 'base16' | 'base24'
  source: ThemeSource
  /** All 24 slots, `#rrggbb` lowercase. */
  palette: Record<Slot, string>
  /** Every token's final color. */
  tokens: Record<TokenName, string>
}

export interface ParseOptions {
  source?: ThemeSource
  /** How errors name the file. Default `theme <id>.yaml`. */
  file?: string
}

const HEX = /^#?([0-9a-fA-F]{6})$/

function parseColor(value: unknown, where: string, fail: (m: string) => never): string {
  if (typeof value !== 'string') return fail(`${where} must be a "#rrggbb" string`)
  const match = HEX.exec(value.trim())
  if (!match) return fail(`${where} must be "#rrggbb", got ${JSON.stringify(value)}`)
  return `#${match[1]!.toLowerCase()}`
}

/** Parse and validate a theme file. Problems throw an Error naming the file. */
export function parseTheme(id: string, text: string, options: ParseOptions = {}): Theme {
  const { source = 'bundled', file = `theme ${id}.yaml` } = options
  const fail = (message: string): never => {
    throw new Error(`${file}: ${message}`)
  }
  let data: unknown
  try {
    data = parseYaml(text, { uniqueKeys: true })
  } catch (err) {
    return fail(`invalid YAML: ${(err as Error).message}`)
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return fail('must be a YAML mapping')
  }
  const doc = data as Record<string, unknown>

  const system = doc.system
  if (system !== 'base24' && system !== 'base16') {
    return fail(`system must be "base24" or "base16", got ${JSON.stringify(system)}`)
  }
  const variant = doc.variant
  if (variant !== 'dark' && variant !== 'light') {
    return fail(`variant must be "dark" or "light", got ${JSON.stringify(variant)}`)
  }
  if (typeof doc.name !== 'string' || doc.name.trim() === '') {
    return fail('name must be a non-empty string')
  }

  const raw = doc.palette
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return fail('palette must be a mapping')
  }
  const expected: readonly Slot[] = system === 'base24' ? SLOTS : BASE16_SLOTS
  const given = raw as Record<string, unknown>
  for (const key of Object.keys(given)) {
    if (!expected.includes(key as Slot)) fail(`palette has unknown slot ${key} for a ${system} scheme`)
  }
  const palette = {} as Record<Slot, string>
  for (const slot of expected) {
    if (!(slot in given)) fail(`palette.${slot} is missing`)
    palette[slot] = parseColor(given[slot], `palette.${slot}`, fail)
  }
  if (system === 'base16') {
    for (const [slot, from] of Object.entries(BASE16_FALLBACK)) {
      palette[slot as Slot] = palette[from]
    }
  }

  // Slot defaults, then `overrides`, then `parley:`, then the tokens that follow another token's
  // final color.
  const tokens = {} as Record<TokenName, string>
  const follows: [TokenName, TokenName][] = []
  for (const name of TOKEN_NAMES) {
    const mapping: Mapping = TOKENS[name]
    if (typeof mapping === 'string') tokens[name] = palette[mapping]
    else follows.push([name, mapping.token as TokenName])
  }
  const overridden = new Set<string>()
  for (const block of ['overrides', 'parley'] as const) {
    const given = doc[block]
    if (given === undefined || given === null) continue
    if (typeof given !== 'object' || Array.isArray(given)) {
      return fail(`${block} must be a mapping of token: slot-or-color`)
    }
    for (const [name, value] of Object.entries(given as Record<string, unknown>)) {
      const color =
        typeof value === 'string' && (SLOTS as readonly string[]).includes(value)
          ? palette[value as Slot]
          : parseColor(value, `${block}.${name}`, fail)
      if (name in TOKENS) {
        tokens[name as TokenName] = color
        overridden.add(name)
      } else if (block === 'overrides' && INN_TOKENS.includes(name)) {
        // inn's, and Parley doesn't draw it.
      } else if (INN_TOKENS.includes(name)) {
        fail(`parley.${name} is an inn token Parley doesn't draw; it belongs in overrides`)
      } else {
        fail(`${block}.${name} is not a token (known: ${TOKEN_NAMES.join(', ')})`)
      }
    }
  }
  for (const [name, from] of follows) if (!overridden.has(name)) tokens[name] = tokens[from]

  return { id, name: doc.name, variant, system, source, palette, tokens }
}
