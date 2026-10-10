// The host's look, applied to the card: light or dark (`data-theme`), its
// fonts, and its surface and text colors mapped onto our tokens. Accents and
// status colors stay ours. A token the host doesn't send keeps our value.

import {
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
  type McpUiStyleVariableKey,
} from '@modelcontextprotocol/ext-apps'

const MAPPED: Record<string, McpUiStyleVariableKey> = {
  '--bg': '--color-background-primary',
  '--surface': '--color-background-secondary',
  '--surface-2': '--color-background-tertiary',
  '--text': '--color-text-primary',
  '--muted': '--color-text-secondary',
  '--faint': '--color-text-tertiary',
  '--border': '--color-border-primary',
  '--border-strong': '--color-border-secondary',
}

export function applyHostContext(context: McpUiHostContext | undefined) {
  if (!context) return
  if (context.theme) applyDocumentTheme(context.theme)
  const variables = context.styles?.variables
  if (variables) {
    applyHostStyleVariables(variables)
    const root = document.documentElement.style
    for (const [ours, theirs] of Object.entries(MAPPED)) {
      if (variables[theirs]) root.setProperty(ours, `var(${theirs})`)
      else root.removeProperty(ours)
    }
  }
  if (context.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts)
}
