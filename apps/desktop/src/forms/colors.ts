// Colors in model text: what counts as one, and the lines of a ```palette
// block. Hex and the CSS color functions only. A color name in a code span
// (`transparent`, say) is as likely to be an identifier.

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const FUNCTION = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)$/i

// A palette line: the color, then an optional name. A color function has
// spaces inside it, so the color ends at its closing parenthesis.
const LINE = /^(#[0-9a-z]+|[a-z]+\([^()]*\))(?:\s+(.*))?$/i

export const PALETTE_MAX = 12

export function isColor(value: string): boolean {
  if (!HEX.test(value) && !FUNCTION.test(value)) return false
  // In the app, the engine has the last word (a function with nonsense
  // inside). Tests run in Node, which has no CSS object.
  return typeof CSS === 'undefined' || CSS.supports('color', value)
}

export interface PaletteEntry {
  color: string
  name?: string
}

// Undefined when any line isn't a color, or there are none or too many: the
// block then renders as ordinary code, so nothing the agent wrote is lost.
export function parsePalette(source: string): PaletteEntry[] | undefined {
  const lines = source.split('\n').map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0 || lines.length > PALETTE_MAX) return undefined
  const entries: PaletteEntry[] = []
  for (const line of lines) {
    const match = LINE.exec(line)
    if (!match || !isColor(match[1])) return undefined
    const name = match[2]?.trim()
    entries.push(name ? { color: match[1], name } : { color: match[1] })
  }
  return entries
}
