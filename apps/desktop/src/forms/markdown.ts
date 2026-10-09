import MarkdownIt from 'markdown-it'

// Model-written text: no raw HTML, and no images (they'd load remote URLs).
// Code blocks stay plain monospace.
const md = new MarkdownIt({ html: false, linkify: true })
md.disable('image')

export function renderMarkdown(source: string, inline = false): string {
  return inline ? md.renderInline(source) : md.render(source)
}
