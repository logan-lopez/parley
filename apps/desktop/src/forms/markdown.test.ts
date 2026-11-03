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
  it('emits caption and local media placeholders, with no src from model text', () => {
    const html = renderMarkdown('![A & B](<shots/a b.png>)')
    expect(html).toContain('data-media="shots/a b.png"')
    expect(html).toContain('<figcaption>A &amp; B</figcaption>')
    expect(html).not.toMatch(/\ssrc=/)
    expect(renderMarkdown('![remote](https://example.com/a.png)')).not.toContain('<img')
    expect(renderMarkdown('![remote](//example.com/a.png)')).not.toContain('<img')
    expect(renderMarkdown('![local](a.png)', true)).toContain('data-media="a.png"')
  })
  it('escapes media captions and paths, leaving code inert', () => {
    expect(renderMarkdown('![<script>](<a"b.png>)')).not.toContain('<script>')
    expect(renderMarkdown('![x](<a"b.png>)')).toContain('data-media="a&quot;b.png"')
    expect(renderMarkdown('`![x](a.png)`')).not.toContain('data-media')
    expect(renderMarkdown('```\n![x](a.png)\n```')).not.toContain('data-media')
  })
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

  it('wraps an html preview block in a figure around its code block', () => {
    const html = renderMarkdown('```html preview height=240\n<div class="a">x</div>\n```')
    expect(html).toBe('<figure class="md-preview" data-preview="html" data-width="400" data-height="240">'
      + '<img class="md-preview-img" alt="Preview (HTML)">'
      + '<figcaption><span class="md-preview-status">Preview</span>'
      + '<button type="button" class="md-preview-toggle" data-preview-source tabindex="-1">Source</button></figcaption>'
      + '<div class="md-preview-source"><div class="code-block"><pre><code class="language-html">'
      + '&lt;div class=&quot;a&quot;&gt;x&lt;/div&gt;\n</code></pre>\n'
      + '<button type="button" class="code-copy" data-copy tabindex="-1" aria-label="Copy the code">Copy</button></div>'
      + '</div></figure>\n')
  })

  it('reads an svg preview and its size in any order', () => {
    const html = renderMarkdown('```svg preview height=90 width=5000 dark\n<svg/>\n```')
    expect(html).toContain('<figure class="md-preview" data-preview="svg" data-width="800" data-height="90">')
    expect(html).toContain('alt="Preview (SVG)"')
  })

  it('leaves html and svg without the marker as code', () => {
    for (const info of ['html', 'svg', 'html previewx', 'css preview']) {
      const html = renderMarkdown(`\`\`\`${info}\n<b>x</b>\n\`\`\``)
      expect(html).not.toContain('md-preview')
      expect(html).toMatch(/^<div class="code-block"><pre><code class="language-\w+">&lt;b&gt;x&lt;\/b&gt;/)
    }
  })

  it('draws a compare block with two local image placeholders, labels and no src', () => {
    const html = renderMarkdown('```compare\nshots/menu-now.png Now\n<shots/menu big.png> Bigger & better\n```')
    expect(html).toContain('<figure class="md-compare" data-compare tabindex="0">')
    expect(html).toContain('data-media="shots/menu-now.png" data-label="Now"')
    expect(html).toContain('data-media="shots/menu big.png" data-label="Bigger &amp; better"')
    expect(html).toContain('<span class="md-compare-path">shots/menu-now.png · shots/menu big.png</span>')
    expect(html).not.toMatch(/\ssrc=/)
  })

  it('falls back to a code block when a compare fence is malformed or resolves to audio', () => {
    const bad = renderMarkdown('```compare\nonly-one.png\n```')
    expect(bad).toContain('<div class="code-block"><pre><code class="language-compare">')
    expect(bad).not.toContain('md-compare')
    const file = { path: 'b.bin', abs: '/b.bin', sha256: 'h', bytes: 1, mime: 'audio/wav' }
    const audio = renderMarkdown('```compare\na.png\nb.bin\n```', false, { media: { 'b.bin': { kind: 'audio', files: [file] } } })
    expect(audio).not.toContain('md-compare')
  })
})

describe('sound chips', () => {
  it('draws an audio ref as a chip with no URL from the text, ids scoped and counted', () => {
    const html = renderMarkdown('![Take 1](a.wav) ![Take "2"](takes/2_*.wav) ![Shot](a.png)', false, { scope: 'q/preview-0' })
    expect(html).toContain('<button type="button" class="md-sound" data-media="a.wav" data-sound="q/preview-0#1" tabindex="-1" aria-disabled="true"')
    expect(html).toContain('data-sound="q/preview-0#2"')
    expect(html).toContain('Take &quot;2&quot;')
    expect(html).not.toMatch(/\ssrc=/)
    expect(html).toContain('class="md-media" data-media="a.png"')
  })
  it('takes the kind from the resolved entry over the name', () => {
    const file = { path: 'x', abs: '/x', sha256: 'h', bytes: 1, mime: 'audio/wav' }
    expect(renderMarkdown('![x](clip.bin)', false, { media: { 'clip.bin': { kind: 'audio', files: [file] } } })).toContain('md-sound')
    expect(renderMarkdown('![x](odd.wav)', false, { media: { 'odd.wav': { kind: 'image', files: [file] } } })).toContain('md-media')
  })
  it('names an uncaptioned chip by its file, and restarts the count per render', () => {
    const html = renderMarkdown('![](dir/take.wav)', true, { scope: 's' })
    expect(html).toContain('<span class="md-sound-caption">take.wav</span>')
    expect(renderMarkdown('![](dir/take.wav)', true, { scope: 's' })).toContain('data-sound="s#1"')
  })
})
