import { describe, expect, it } from 'vitest'
import claudeDark from './fixtures/claude-dark.yaml?raw'
import telnet from './fixtures/telnet.yaml?raw'
import { BUNDLED_THEMES } from './paint'
import { parseTheme, SLOTS } from './theme'
import parleyLight from './themes/parley-light.yaml?raw'

// The token values from styles.css's two token blocks before themes (brief 15).
const TODAY = {
  'parley-light': {
    bg: '#f6f6f4',
    'surface-raised': '#ffffff',
    text: '#1d1d1b',
    'text-muted': '#6b6a66',
    'text-faint': '#9a9893',
    border: '#dddbd6',
    'border-strong': '#c4c1ba',
    accent: '#2f5bd3',
    highlight: '#2f5bd3',
    link: '#2f5bd3',
    'accent-text': '#ffffff',
    'focus-ring': '#2f5bd3',
    danger: '#b4232a',
    warning: '#b5530b',
    success: '#2b7a3d',
  },
  'parley-dark': {
    bg: '#1b1b1d',
    'surface-raised': '#242427',
    text: '#ececea',
    'text-muted': '#a3a29e',
    'text-faint': '#75746f',
    border: '#38383c',
    'border-strong': '#4a4a50',
    accent: '#7d9cf5',
    highlight: '#7d9cf5',
    link: '#7d9cf5',
    'accent-text': '#10131c',
    'focus-ring': '#7d9cf5',
    danger: '#f07a7f',
    warning: '#f0a35e',
    success: '#7ccf8f',
  },
}

const BASE16 = `
system: base16
name: Tiny
variant: dark
palette:
  base00: "#000000"
  base01: "#111111"
  base02: "#222222"
  base03: "#333333"
  base04: "#444444"
  base05: "#555555"
  base06: "#666666"
  base07: "#777777"
  base08: "#880000"
  base09: "#884400"
  base0A: "#888800"
  base0B: "#008800"
  base0C: "#008888"
  base0D: "#000088"
  base0E: "#880088"
  base0F: "#442200"
`

describe('the bundled pair', () => {
  it('reproduces the colors from before themes', () => {
    expect(BUNDLED_THEMES.map((t) => [t.id, t.variant])).toEqual([
      ['parley-light', 'light'],
      ['parley-dark', 'dark'],
    ])
    for (const theme of BUNDLED_THEMES) {
      expect(theme.tokens).toEqual(TODAY[theme.id as keyof typeof TODAY])
    }
  })
})

describe('parseTheme', () => {
  it("reads inn's Claude Dark, with accent, highlight and link apart", () => {
    const theme = parseTheme('claude-dark', claudeDark, { source: 'inn' })
    expect(theme.name).toBe('Claude Dark')
    expect(theme.variant).toBe('dark')
    expect(theme.tokens.accent).toBe('#d97757')
    expect(theme.tokens.highlight).toBe('#bbbaaf')
    expect(theme.tokens.link).toBe('#e98e70')
    expect(theme.tokens.bg).toBe('#151515')
    expect(theme.tokens['surface-raised']).toBe('#1d1d1d')
  })

  it("reads inn's Telnet, where highlight follows a slot-named accent", () => {
    const theme = parseTheme('telnet', telnet, { source: 'inn' })
    expect(theme.tokens.accent).toBe('#f2b84b')
    expect(theme.tokens.highlight).toBe('#f2b84b')
    expect(theme.tokens.link).toBe('#6aa8ff')
    expect(theme.tokens.warning).toBe('#f08a4b')
  })

  it('applies a parley: block after overrides', () => {
    const text = `${parleyLight}parley:\n  accent: base0B\n  link: "#123456"\n`
    const theme = parseTheme('x', text)
    expect(theme.tokens.accent).toBe('#2b7a3d')
    expect(theme.tokens.highlight).toBe('#2b7a3d')
    expect(theme.tokens.link).toBe('#123456')
  })

  it('ignores a quire: block and unknown top-level keys', () => {
    const text = `${parleyLight}quire:\n  cursor: base0A\nslug: x\n`
    expect(parseTheme('x', text).tokens.accent).toBe('#2f5bd3')
  })

  it('fills base10 to base17 in a base16 scheme', () => {
    const theme = parseTheme('tiny', BASE16)
    expect(Object.keys(theme.palette)).toEqual([...SLOTS])
    expect(theme.palette.base10).toBe('#000000')
    expect(theme.palette.base11).toBe('#000000')
    expect(theme.palette.base12).toBe('#880000')
    expect(theme.palette.base16).toBe('#000088')
    expect(theme.palette.base17).toBe('#880088')
  })

  it('throws on an unknown token, naming the file', () => {
    const text = `${parleyLight}  acent: base0D\n`
    expect(() => parseTheme('x', text, { file: 'themes/x.yaml' })).toThrow(/^themes\/x\.yaml: overrides\.acent is not a token/)
  })

  it("throws on an inn token in parley:, which belongs in overrides", () => {
    const text = `${parleyLight}parley:\n  caret: base0D\n`
    expect(() => parseTheme('x', text, { file: 'themes/x.yaml' })).toThrow(/^themes\/x\.yaml: parley\.caret is an inn token/)
  })

  it('accepts inn tokens it does not draw in overrides', () => {
    const text = `${parleyLight}  caret: base0D\n  syntax-keyword: "#abcdef"\n`
    expect(() => parseTheme('x', text)).not.toThrow()
  })

  it('throws on a bad color, naming the file', () => {
    const text = parleyLight.replace('"#2f5bd3"', '"#2f5bd"')
    expect(() => parseTheme('x', text, { file: 'inn themes/x.yaml' })).toThrow(/^inn themes\/x\.yaml: palette\.base0D must be "#rrggbb"/)
  })

  it('throws on a missing slot, naming the file', () => {
    const text = parleyLight.replace(/^ {2}base0D:.*\n/m, '')
    expect(() => parseTheme('x', text, { file: 'themes/x.yaml' })).toThrow('themes/x.yaml: palette.base0D is missing')
  })
})
