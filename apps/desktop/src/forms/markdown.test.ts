import { describe, expect, it } from 'vitest'
import { isColor, parsePalette } from './colors'
import { renderMarkdown } from './markdown'

// Runs in Node: no CSS object, so `isColor` is the pattern check alone.

describe('isColor', () => {
  it.each(['#abc', '#ABCD', '#38bdf8', '#38BDF8cc', 'rgb(1, 2, 3)', 'RGBA(1,2,3,.5)', 'hsl(0 72% 51%)',
    'hsla(0, 72%, 51%, 0.4)', 'hwb(200 10% 20%)', 'lab(50% 40 59)', 'lch(52% 72 50)', 'oklab(0.7 -0.1 0.1)',
    'oklch(70% 0.15 230)', 'color(display-p3 1 0 0)'])('accepts %s', (value) => {
    expect(isColor(value)).toBe(true)
  })

  it.each(['#12', '#12345', '#ggg', 'red', 'transparent', 'rgb(1,2,3) x', 'rgb(calc(1 + 2) 0 0)', 'var(--x)', ''])(
    'rejects %s', (value) => {
      expect(isColor(value)).toBe(false)
    })
})

describe('parsePalette', () => {
  it('reads colors with and without names', () => {
    expect(parsePalette('#0f172a Ink\n\n#38bdf8\noklch(72% 0.17 142)  Leaf green\n')).toEqual([
      { color: '#0f172a', name: 'Ink' },
      { color: '#38bdf8' },
      { color: 'oklch(72% 0.17 142)', name: 'Leaf green' },
    ])
  })

  it('gives up on a line that is not a color', () => {
    expect(parsePalette('#0f172a Ink\nsky blue')).toBeUndefined()
    expect(parsePalette('#0f172a Ink\nrgb(calc(1) 0 0) Nested')).toBeUndefined()
  })

  it('takes 1 to 12 lines', () => {
    expect(parsePalette('\n\n')).toBeUndefined()
    expect(parsePalette(Array(12).fill('#fff').join('\n'))).toHaveLength(12)
    expect(parsePalette(Array(13).fill('#fff').join('\n'))).toBeUndefined()
  })
})

describe('renderMarkdown', () => {
  it('puts a swatch on a color in a code span, block and inline', () => {
    const chip = '<code class="color-chip" data-color="#38bdf8"><span class="swatch" aria-hidden="true"></span>#38bdf8</code>'
    expect(renderMarkdown('Sky is `#38bdf8`.')).toContain(chip)
    expect(renderMarkdown('`#38bdf8` `#fff`', true)).toContain(chip)
  })

  it('leaves other code spans and plain-text colors alone', () => {
    expect(renderMarkdown('`red` and #38bdf8', true)).toBe('<code>red</code> and #38bdf8')
  })

  it('escapes the value', () => {
    expect(renderMarkdown('`color(srgb 1 0 0 / 50%)`', true)).toContain('data-color="color(srgb 1 0 0 / 50%)"')
    expect(renderMarkdown('`rgb(1,2,3)"><b>`', true)).not.toContain('<b>')
  })

  it('draws a palette block', () => {
    const html = renderMarkdown('```palette\n#0f172a Ink & co\n#38bdf8\n```')
    expect(html).toBe('<div class="palette" role="list">'
      + '<div class="palette-entry" role="listitem" data-color="#0f172a"><span class="swatch" aria-hidden="true"></span>'
      + '<span class="palette-name">Ink &amp; co</span><code class="palette-value" title="#0f172a">#0f172a</code></div>'
      + '<div class="palette-entry" role="listitem" data-color="#38bdf8"><span class="swatch" aria-hidden="true"></span>'
      + '<code class="palette-value" title="#38bdf8">#38bdf8</code></div></div>\n')
  })

  it('renders a palette that does not parse as code, with its copy button', () => {
    const html = renderMarkdown('```palette\n#0f172a Ink\nsky blue\n```')
    expect(html).toContain('<div class="code-block"><pre><code class="language-palette">')
    expect(html).toContain('data-copy')
    expect(html).not.toContain('class="palette"')
  })
})
