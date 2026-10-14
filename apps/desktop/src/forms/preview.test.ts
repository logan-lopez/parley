// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { clampSize, parsePreviewInfo, previewSrc, scaled, type PreviewTheme } from './preview'

const theme: PreviewTheme = {
  vars: { bg: '#ffffff', text: '#1f2328', accent: '#0969da' },
  font: 'system-ui, sans-serif',
  scheme: 'dark',
  page: { background: '#ffffff', color: '#000000' },
}
const size = { width: 400, height: 200 }
const PREFIX = 'data:image/svg+xml;charset=utf-8,'

function svgOf(src: string | undefined): string {
  expect(src).toBeDefined()
  expect(src!.startsWith(PREFIX)).toBe(true)
  return decodeURIComponent(src!.slice(PREFIX.length))
}

// What the image's own parser does with it.
function reparse(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  expect(doc.getElementsByTagNameNS('*', 'parsererror')).toHaveLength(0)
  return doc
}

describe('parsePreviewInfo', () => {
  it('reads the marker and the size in any order', () => {
    expect(parsePreviewInfo('html preview')).toEqual({ kind: 'html', width: 400, height: 200 })
    expect(parsePreviewInfo('svg preview height=240 width=320')).toEqual({ kind: 'svg', width: 320, height: 240 })
    expect(parsePreviewInfo('  html   preview  width=500  ')).toEqual({ kind: 'html', width: 500, height: 200 })
  })

  it('ignores anything else after preview', () => {
    expect(parsePreviewInfo('html preview dark width=abc height=300 title="x"'))
      .toEqual({ kind: 'html', width: 400, height: 300 })
  })

  it('needs both the language and the marker', () => {
    for (const info of ['html', 'svg', 'preview', 'css preview', 'html previews', 'htmlpreview', 'ts preview', '']) {
      expect(parsePreviewInfo(info)).toBeUndefined()
    }
  })
})

describe('clampSize', () => {
  it('clamps width to 200–800 and height to 40–800', () => {
    expect(clampSize(10, 10)).toEqual({ width: 200, height: 40 })
    expect(clampSize(5000, 5000)).toEqual({ width: 800, height: 800 })
    expect(clampSize(320.6, 99)).toEqual({ width: 321, height: 99 })
  })

  it('defaults to 400 by 200', () => {
    expect(clampSize()).toEqual({ width: 400, height: 200 })
    expect(clampSize(Number.NaN, undefined)).toEqual({ width: 400, height: 200 })
  })

  it('is applied by previewSrc too', () => {
    const svg = svgOf(previewSrc('svg', '<svg><rect width="10" height="10"/></svg>', { width: 9999, height: 1 }, theme))
    const root = reparse(svg).documentElement
    expect(root.getAttribute('width')).toBe('800')
    expect(root.getAttribute('height')).toBe('40')
  })
})

describe('previewSrc, html', () => {
  const source = '<style>.row{display:flex;gap:8px}.row > .box{flex:1}</style>\n'
    + '<div class="row"><div class="box">A &amp; B</div><br><input value="x"><img src="https://example.com/a.png"></div>'

  it('wraps the HTML in a foreignObject as well-formed XHTML', () => {
    const doc = reparse(svgOf(previewSrc('html', source, size, theme)))
    const root = doc.documentElement
    expect(root.localName).toBe('svg')
    expect(root.getAttribute('viewBox')).toBe('0 0 400 200')
    const html = root.querySelector('foreignObject > html')!
    expect(html.namespaceURI).toBe('http://www.w3.org/1999/xhtml')
    expect(html.querySelector('.box')!.textContent).toBe('A & B')
    // The agent's CSS survives XML escaping.
    expect(html.querySelectorAll('style')[1]!.textContent).toContain('.row > .box')
  })

  it('keeps form controls', () => {
    const doc = reparse(svgOf(previewSrc('html', '<button>Save</button><input type="checkbox" checked>', size, theme)))
    expect(doc.querySelector('button')!.textContent).toBe('Save')
    expect(doc.querySelector('input')!.getAttribute('type')).toBe('checkbox')
  })

  it('strips scripts, frames, links, meta and on* handlers', () => {
    const svg = svgOf(previewSrc('html', '<link rel="stylesheet" href="https://x/y.css"><meta http-equiv="refresh" content="0">'
      + '<base href="https://x/"><script>alert(1)</script><iframe src="https://x"></iframe><object data="x"></object>'
      + '<embed src="x"><div onclick="alert(1)" ONMOUSEOVER="x" class="keep">hi</div>', size, theme))
    for (const gone of ['<link', '<meta', '<base', '<script', '<iframe', '<object', '<embed', 'onclick', 'ONMOUSEOVER', 'onmouseover', 'alert']) {
      expect(svg).not.toContain(gone)
    }
    expect(reparse(svg).querySelector('.keep')!.textContent).toBe('hi')
  })

  it('drops attributes XML cannot name', () => {
    const svg = svgOf(previewSrc('html', '<div @click="x" :class="y" class="ok">z</div>', size, theme))
    expect(reparse(svg).querySelector('.ok')!.textContent).toBe('z')
  })

  it('puts the base style before the agent’s: a light page, with the theme’s tokens on the root', () => {
    const doc = reparse(svgOf(previewSrc('html', '<style>body{background:#000}</style><p>x</p>', size, theme)))
    const styles = [...doc.querySelectorAll('style')].map((s) => s.textContent!)
    expect(styles).toHaveLength(2)
    // A dark theme still gets a light page: models write for a browser's default.
    expect(styles[0]).toContain('color-scheme: light')
    expect(styles[0]).toContain('background: #ffffff; color: #000000;')
    expect(styles[0]).toContain('--bg: #ffffff;')
    expect(styles[0]).toContain('--accent: #0969da;')
    expect(styles[0]).toContain('font: 13px/1.45 system-ui, sans-serif')
    expect(styles[1]).toBe('body{background:#000}')
  })

  it('removes characters XML refuses', () => {
    reparse(svgOf(previewSrc('html', '<p>a\u0001b\u000Bc</p>', size, theme)))
  })
})

describe('previewSrc, svg', () => {
  it('adds the namespace, size and viewBox when they are missing', () => {
    const root = reparse(svgOf(previewSrc('svg', '<svg><circle cx="5" cy="5" r="4"/></svg>', { width: 240, height: 120 }, theme))).documentElement
    expect(root.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(root.getAttribute('width')).toBe('240')
    expect(root.getAttribute('height')).toBe('120')
    expect(root.getAttribute('viewBox')).toBe('0 0 240 120')
  })

  it('makes its own size the viewBox, and draws at the given size', () => {
    const root = reparse(svgOf(previewSrc('svg', '<svg width="24" height="24px"><path d="M0 0h24v24z"/></svg>', size, theme))).documentElement
    expect(root.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(root.getAttribute('width')).toBe('400')
  })

  it('keeps a viewBox it has', () => {
    const root = reparse(svgOf(previewSrc('svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"/>', size, theme))).documentElement
    expect(root.getAttribute('viewBox')).toBe('0 0 16 16')
  })

  it('declares xlink when it is used', () => {
    const doc = reparse(svgOf(previewSrc('svg', '<svg><defs><path id="p" d="M0 0"/></defs><use xlink:href="#p"/></svg>', size, theme)))
    expect(doc.querySelector('use')!.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe('#p')
  })

  it('strips script and on* handlers, and inserts the base style first', () => {
    const svg = svgOf(previewSrc('svg', '<svg onload="alert(1)"><script>alert(2)</script><rect onclick="x" width="5" height="5"/></svg>', size, theme))
    expect(svg).not.toMatch(/onload|onclick|<script|alert/)
    const root = reparse(svg).documentElement
    expect(root.firstElementChild!.localName).toBe('style')
    expect(root.firstElementChild!.textContent).toContain('color-scheme: dark')
    expect(root.firstElementChild!.textContent).toContain('color: var(--text)')
  })

  it('returns undefined for malformed SVG or another root', () => {
    expect(previewSrc('svg', '<svg><rect></svg>', size, theme)).toBeUndefined()
    expect(previewSrc('svg', '<div>not svg</div>', size, theme)).toBeUndefined()
    expect(previewSrc('svg', 'just text', size, theme)).toBeUndefined()
  })
})

describe('previewSrc, scaled to fit', () => {
  it('keeps the aspect, and never scales up', () => {
    expect(scaled({ width: 400, height: 200 }, 0.95)).toEqual({ width: 380, height: 190 })
    expect(scaled({ width: 400, height: 240 }, 2)).toEqual({ width: 400, height: 240 })
    expect(scaled({ width: 400, height: 240 }, 0)).toEqual({ width: 400, height: 240 })
  })

  it('builds HTML at the shown size, laid out at the given size with zoom', () => {
    const doc = reparse(svgOf(previewSrc('html', '<p>x</p>', size, theme, 0.95)))
    const root = doc.documentElement
    expect([root.getAttribute('width'), root.getAttribute('height'), root.getAttribute('viewBox')])
      .toEqual(['380', '190', '0 0 380 190'])
    expect(doc.querySelector('style')!.textContent).toContain('zoom: 0.95;')
  })

  it('leaves zoom out at full size', () => {
    expect(svgOf(previewSrc('html', '<p>full</p>', size, theme))).not.toContain('zoom')
  })

  it('shrinks SVG through its size, keeping its viewBox', () => {
    const root = reparse(svgOf(previewSrc('svg', '<svg viewBox="0 0 24 24"/>', size, theme, 0.5))).documentElement
    expect([root.getAttribute('width'), root.getAttribute('height'), root.getAttribute('viewBox')])
      .toEqual(['200', '100', '0 0 24 24'])
  })
})

describe('previewSrc cache', () => {
  it('returns the cached picture for the same input, and builds again for a new theme', () => {
    const parse = DOMParser.prototype.parseFromString
    let calls = 0
    DOMParser.prototype.parseFromString = function (this: DOMParser, ...args) {
      calls++
      return parse.apply(this, args)
    }
    try {
      const source = '<p>cached</p>'
      const first = previewSrc('html', source, size, theme)
      expect(calls).toBe(1)
      expect(previewSrc('html', source, size, theme)).toBe(first)
      expect(calls).toBe(1)
      const dark = previewSrc('html', source, size, { ...theme, vars: { ...theme.vars, bg: '#000000' } })
      expect(calls).toBe(2)
      expect(dark).not.toBe(first)
    } finally {
      DOMParser.prototype.parseFromString = parse
    }
  })
})
