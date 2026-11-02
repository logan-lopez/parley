import { isMediaRef, looksLikeSound, mediaMarkdown, type Media } from '@parley/protocol'
import { isColor, parsePalette } from './colors'
import { parsePreviewInfo } from './preview'

// Model-written text: no raw HTML or source URLs from model text.
// HTML and SVG reach the screen only as a picture the app builds itself.
// Code blocks stay plain monospace, except that ```diff blocks color their
// added, removed and hunk-header lines.
const md = mediaMarkdown()
md.options.highlight = (source, lang) => (lang === 'diff' ? diff(source) : '')
md.renderer.rules.image = (tokens, idx, _options, renderEnv, self) => {
  const env = (renderEnv ?? {}) as RenderEnv
  const token = tokens[idx]
  const src = String(token.attrGet('src') ?? '')
  const caption = self.renderInlineAsText(token.children ?? [], md.options, {})
  const escape = md.utils.escapeHtml
  // A scheme or protocol-relative URL stays text. No remote fetch is tried.
  if (!isMediaRef(src)) return escape(`![${caption}](${src})`)
  const entry = env.media && Object.prototype.hasOwnProperty.call(env.media, src) ? env.media[src] : undefined
  if (entry ? entry.kind === 'audio' : looksLikeSound(src)) {
    env.sounds = (env.sounds ?? 0) + 1
    return sound(src, caption, `${env.scope ?? ''}#${env.sounds}`)
  }
  return `<figure class="md-media" data-media="${escape(src)}">`
    + `<button type="button" class="md-media-open" data-media-open tabindex="-1" disabled aria-label="Open ${escape(caption || src)}">`
    + `<img class="md-media-img" alt="${escape(caption)}" hidden></button>`
    + `<figcaption>${escape(caption)}</figcaption><span class="md-media-path">${escape(src)}</span>`
    + `<span class="md-media-status" role="status">${escape(src)} isn't loaded here</span></figure>`
}

// What a render knows beyond the text: the form's resolved media, so a ref
// draws as the kind the server sniffed, and a scope that makes each chip's id
// stable within the form (the question id and the surface; then the ref's
// position in that markdown).
export interface RenderEnv {
  media?: Media
  scope?: string
  sounds?: number
}

// A sound is a play chip, disabled until Markdown.vue has the file's grant.
// Like an image, it carries no URL from model text: `data-media` is the key
// into `x-media`, and the path goes in a title once it's resolved.
function sound(src: string, caption: string, id: string): string {
  const escape = md.utils.escapeHtml
  const name = caption || src.slice(src.lastIndexOf('/') + 1)
  return `<button type="button" class="md-sound" data-media="${escape(src)}" data-sound="${escape(id)}" tabindex="-1" aria-disabled="true" title="${escape(src)}">`
    + '<span class="md-sound-icon" aria-hidden="true">▶</span>'
    + `<span class="md-sound-caption">${escape(name)}</span>`
    + '<span class="md-sound-meta"></span>'
    + `<span class="md-sound-status" role="status">${escape(src)} isn't loaded here</span></button>`
}

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

export function renderMarkdown(source: string, inline = false, env: RenderEnv = {}): string {
  const fresh = { ...env, sounds: 0 }
  return inline ? md.renderInline(source, fresh) : md.render(source, fresh)
}
