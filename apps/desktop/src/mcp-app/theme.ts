// The host's look, applied to the card: Parley Light or Parley Dark by the
// host's `theme`, then its fonts, and its surface and text colors mapped over
// our tokens. Accents and status colors stay ours, and the shades in
// tokens.css mix from whatever the tokens end up as. A token the host doesn't
// send keeps the bundled theme's value. The card never reads settings.json or
// the theme folders.

import {
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
  type McpUiStyles,
  type McpUiStyleVariableKey,
} from '@modelcontextprotocol/ext-apps'
import { currentAppearance } from '../theme/appearance'
import type { Appearance } from '../theme/setting'
import { BUNDLED, paint } from '../theme/paint'
import type { TokenName } from '../theme/theme'

const MAPPED: Partial<Record<TokenName, McpUiStyleVariableKey>> = {
  bg: '--color-background-primary',
  'surface-raised': '--color-background-secondary',
  text: '--color-text-primary',
  'text-muted': '--color-text-secondary',
  'text-faint': '--color-text-tertiary',
  border: '--color-border-primary',
  'border-strong': '--color-border-secondary',
}

let appearance: Appearance = 'light'
// The host sends only what changed, so the variables are kept for the next
// repaint, which writes every token and so wipes the mapping.
let variables: McpUiStyles | undefined

/** Before the host has said anything: the bundled theme for the system appearance. */
export function initCardTheme() {
  appearance = currentAppearance()
  paint(BUNDLED[appearance])
}

export function applyHostContext(context: McpUiHostContext | undefined) {
  if (!context) return
  if (context.theme) appearance = context.theme
  const repainted = context.theme ? paint(BUNDLED[appearance]) : false
  if (context.styles?.variables) {
    variables = context.styles.variables
    applyHostStyleVariables(variables)
  }
  if (variables && (repainted || context.styles?.variables)) {
    const root = document.documentElement.style
    for (const [ours, theirs] of Object.entries(MAPPED) as [TokenName, McpUiStyleVariableKey][]) {
      root.setProperty(`--${ours}`, variables[theirs] ? `var(${theirs})` : BUNDLED[appearance].tokens[ours])
    }
  }
  if (context.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts)
}
