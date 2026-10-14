// ```html preview and ```svg preview blocks, drawn as a picture: an SVG image
// from a `data:` URL, with HTML inside a <foreignObject>. A browser draws an
// SVG used as an image with no scripts, no network and no interaction, so the
// picture is static by construction, and the CSP's `img-src data:` already
// allows it in the window and in the inline card. Model HTML never reaches
// the page any other way.

export type PreviewKind = 'html' | 'svg'

export interface PreviewSize { width: number; height: number }

/**
 * What's baked into a picture: the theme's token values (by name, without `--`), its font family
 * and scheme, and the plain light page HTML is drawn on whatever the theme.
 */
export interface PreviewTheme {
  vars: Record<string, string>
  font: string
  scheme: 'light' | 'dark'
  page: { background: string; color: string }
}

export const PREVIEW_DEFAULT: PreviewSize = { width: 400, height: 200 }
const WIDTH = { min: 200, max: 800 }
const HEIGHT = { min: 40, max: 800 }

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'

/** The width and height clamped quietly to 200–800 by 40–800. Missing or unreadable is the default. */
export function clampSize(width?: number, height?: number): PreviewSize {
  const clamp = (value: number | undefined, fallback: number, { min, max }: { min: number; max: number }) =>
    value === undefined || !Number.isFinite(value) ? fallback : Math.round(Math.min(max, Math.max(min, value)))
  return { width: clamp(width, PREVIEW_DEFAULT.width, WIDTH), height: clamp(height, PREVIEW_DEFAULT.height, HEIGHT) }
}

/**
 * A fence's info string, when it marks a preview: `html preview` or `svg preview`, then optional
 * `width=N` and `height=N` in any order. Anything else after `preview` is ignored.
 */
export function parsePreviewInfo(info: string): ({ kind: PreviewKind } & PreviewSize) | undefined {
  const [lang, marker, ...rest] = info.trim().split(/\s+/)
  if ((lang !== 'html' && lang !== 'svg') || marker !== 'preview') return undefined
  const given: Partial<Record<'width' | 'height', number>> = {}
  for (const word of rest) {
    const match = /^(width|height)=(\d+(?:\.\d+)?)$/.exec(word)
    if (match) given[match[1] as 'width' | 'height'] = Number(match[2])
  }
  return { kind: lang, ...clampSize(given.width, given.height) }
}

// paint() runs on every render and every theme change, so built pictures are
// kept, the oldest dropped first.
const CACHE_MAX = 50
const cache = new Map<string, string | undefined>()

/**
 * The picture as a `data:image/svg+xml` URL, or undefined when the source can't be drawn (SVG
 * that doesn't parse, or whose root isn't `<svg>`).
 *
 * `scale` (at most 1) shrinks it to fit a narrower column. The image is built at the size it's
 * shown at, never scaled down by CSS: WebKit drawing a foreignObject image smaller than its own
 * size leaves positioned elements (`position: relative`, say) unscaled, out of place. So HTML is
 * laid out at the given size and shrunk with `zoom` inside the image. Scaling up (page zoom, a
 * Retina screen) draws fine.
 */
export function previewSrc(kind: PreviewKind, source: string, size: PreviewSize, theme: PreviewTheme, scale = 1): string | undefined {
  const { width, height } = clampSize(size.width, size.height)
  const shown = scaled({ width, height }, scale)
  const key = JSON.stringify([kind, width, height, shown.width, theme, source])
  if (cache.has(key)) return cache.get(key)
  let src: string | undefined
  try {
    const svg = kind === 'html'
      ? fromHtml(source, { width, height }, shown, theme)
      : fromSvg(source, { width, height }, shown, theme)
    src = svg === undefined ? undefined : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  } catch {
    src = undefined
  }
  cache.set(key, src)
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!)
  return src
}

/** The size a picture is shown at: `size` times `scale`, which is kept within (0, 1]. */
export function scaled(size: PreviewSize, scale: number): PreviewSize {
  const factor = Number.isFinite(scale) && scale > 0 ? Math.min(1, scale) : 1
  const width = Math.max(1, Math.floor(size.width * factor))
  return { width, height: Math.max(1, Math.round((size.height * width) / size.width)) }
}

function fromHtml(source: string, { width }: PreviewSize, shown: PreviewSize, theme: PreviewTheme): string {
  const doc = new DOMParser().parseFromString(xmlSafe(source), 'text/html')
  clean(doc, ['script', 'iframe', 'frame', 'object', 'embed', 'link', 'meta', 'base'])
  const base = doc.createElement('style')
  const zoom = shown.width === width ? '' : ` zoom: ${shown.width / width};`
  // A browser's default page, light whatever the theme: models write previews for one, setting
  // backgrounds and leaving text to the default. The theme's tokens are there for var().
  base.textContent = `html { ${rootRules(theme, 'light')} height: 100%;${zoom} }
html, body { margin: 0; }
body { min-height: 100%; background: ${theme.page.background}; color: ${theme.page.color}; font: 13px/1.45 ${theme.font}; }`
  doc.head.prepend(base)
  // The XHTML namespace, and well-formed for the image's XML parser.
  const xhtml = new XMLSerializer().serializeToString(doc.documentElement)
  return `<svg xmlns="${SVG_NS}" width="${shown.width}" height="${shown.height}" viewBox="0 0 ${shown.width} ${shown.height}">`
    + `<foreignObject x="0" y="0" width="100%" height="100%">${xhtml}</foreignObject></svg>`
}

function fromSvg(source: string, { width, height }: PreviewSize, shown: PreviewSize, theme: PreviewTheme): string | undefined {
  const doc = new DOMParser().parseFromString(declare(xmlSafe(source)), 'image/svg+xml')
  const root = doc.documentElement
  if (doc.getElementsByTagNameNS('*', 'parsererror').length || root.localName !== 'svg' || root.namespaceURI !== SVG_NS) {
    return undefined
  }
  clean(doc, ['script'])
  // The picture is always the size the info string gives (times the scale); the drawing scales
  // to fit it. Its own width and height, when they're numbers, become its viewBox if it has none.
  if (!root.hasAttribute('viewBox')) {
    const own = (name: string) => {
      const value = root.getAttribute(name)?.trim()
      return value && /^\d+(\.\d+)?(px)?$/.test(value) ? parseFloat(value) : undefined
    }
    root.setAttribute('viewBox', `0 0 ${own('width') ?? width} ${own('height') ?? height}`)
  }
  root.setAttribute('width', String(shown.width))
  root.setAttribute('height', String(shown.height))
  const base = doc.createElementNS(SVG_NS, 'style')
  base.textContent = `:root { ${rootRules(theme, theme.scheme)} color: var(--text); font: 13px/1.45 ${theme.font}; }`
  root.insertBefore(base, root.firstChild)
  return new XMLSerializer().serializeToString(root)
}

// Tokens and color-scheme on the root, so the agent's CSS can use var(--accent). An SVG takes the
// theme's scheme, so a host's light-dark() value resolves as it does in the card.
function rootRules(theme: PreviewTheme, scheme: 'light' | 'dark'): string {
  const vars = Object.entries(theme.vars).map(([name, value]) => `--${name}: ${value};`).join(' ')
  return `color-scheme: ${scheme}; ${vars}`
}

// None of these could run or load inside an image anyway; removing them keeps
// the markup honest and small. Attributes XML can't name would make the image
// fail to parse.
function clean(doc: Document, tags: string[]) {
  for (const el of doc.querySelectorAll(tags.join(','))) el.remove()
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.localName) || (attr.namespaceURI === null && !/^[A-Za-z_][\w.-]*$/.test(attr.name))) {
        el.removeAttributeNode(attr)
      }
    }
  }
}

// Characters XML 1.0 refuses.
function xmlSafe(source: string): string {
  return source.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
}

// Hand-written SVG often leaves out its namespaces, which a browser's HTML parser forgives and
// an image's XML parser doesn't: add them to the root's start tag.
function declare(source: string): string {
  return source.replace(/<svg\b[^>]*>/, (tag) => {
    let attrs = ''
    if (!/\sxmlns\s*=/.test(tag)) attrs += ` xmlns="${SVG_NS}"`
    if (/\bxlink:/.test(source) && !/\sxmlns:xlink\s*=/.test(tag)) attrs += ` xmlns:xlink="${XLINK_NS}"`
    return attrs ? `<svg${attrs}${tag.slice(4)}` : tag
  })
}
