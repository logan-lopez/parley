import MarkdownIt from 'markdown-it'
import { isColor, parsePalette } from './colors'
import { parsePreviewInfo } from './preview'

// Model-written text: no raw HTML, and no images (they'd load remote URLs).
// HTML and SVG reach the screen only as a picture the app builds itself.
// Code blocks stay plain monospace, except that ```diff blocks color their
// added, removed and hunk-header lines.
const md = new MarkdownIt({
  html: false,
  linkify: true,
  highlight: (source, lang) => (lang === 'diff' ? diff(source) : ''),
})
md.disable('image')

// Every fenced block gets a copy button. It carries nothing: Markdown.vue's
// click handler copies the block's `<code>` text. A ```palette block that
// parses draws its colors instead, and an ```html preview or ```svg preview
// block becomes a figure around its code block.
const fence = md.renderer.rules.fence!
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  if (token.info.trim().split(/\s+/)[0] === 'palette') {
    const entries = parsePalette(token.content)
    if (entries) return palette(entries)
  }
  const block = `<div class="code-block">${fence(tokens, idx, options, env, self)}`
    + '<button type="button" class="code-copy" data-copy tabindex="-1" aria-label="Copy the code">Copy</button></div>'
  const preview = parsePreviewInfo(token.info)
  return preview ? figure(preview, block) : block
}

// The picture is an image Markdown.vue builds from the code block's text
// (forms/preview.ts), so the img has no src here. The code block stays: it's
// the source, what the Source button shows, and what shows when drawing fails.
function figure({ kind, width, height }: NonNullable<ReturnType<typeof parsePreviewInfo>>, block: string): string {
  return `<figure class="md-preview" data-preview="${kind}" data-width="${width}" data-height="${height}">`
    + `<img class="md-preview-img" alt="Preview (${kind.toUpperCase()})">`
    + '<figcaption><span class="md-preview-status">Preview</span>'
    + '<button type="button" class="md-preview-toggle" data-preview-source tabindex="-1">Source</button></figcaption>'
    + `<div class="md-preview-source">${block}</div></figure>\n`
}

// A color in a code span gets a swatch. Its color is set by Markdown.vue
// through the CSSOM from `data-color`: the release CSP drops `style`
// attributes (dev allows them, so a `style` would look fine there).
const codeInline = md.renderer.rules.code_inline!
md.renderer.rules.code_inline = (tokens, idx, options, env, self) => {
  const value = tokens[idx].content.trim()
  if (!isColor(value)) return codeInline(tokens, idx, options, env, self)
  const text = md.utils.escapeHtml(value)
  return `<code class="color-chip" data-color="${text}"><span class="swatch" aria-hidden="true"></span>${text}</code>`
}

function palette(entries: { color: string; name?: string }[]): string {
  const items = entries.map(({ color, name }) => {
    const value = md.utils.escapeHtml(color)
    const label = name ? `<span class="palette-name">${md.utils.escapeHtml(name)}</span>` : ''
    return `<div class="palette-entry" role="listitem" data-color="${value}">`
      + `<span class="swatch" aria-hidden="true"></span>${label}<code class="palette-value" title="${value}">${value}</code></div>`
  })
  return `<div class="palette" role="list">${items.join('')}</div>\n`
}

function diff(source: string): string {
  return source.split('\n').map((line) => {
    const kind = /^(\+\+\+|---)( |$)/.test(line) ? 'meta'
      : line.startsWith('@@') ? 'hunk'
      : line.startsWith('+') ? 'add'
      : line.startsWith('-') ? 'del'
      : undefined
    const text = md.utils.escapeHtml(line)
    return kind ? `<span class="diff-${kind}">${text}</span>` : text
  }).join('\n')
}

export function renderMarkdown(source: string, inline = false): string {
  return inline ? md.renderInline(source) : md.render(source)
}
