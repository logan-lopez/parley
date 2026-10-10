import MarkdownIt from 'markdown-it'

// Model-written text: no raw HTML, and no images (they'd load remote URLs).
// Code blocks stay plain monospace, except that ```diff blocks color their
// added, removed and hunk-header lines.
const md = new MarkdownIt({
  html: false,
  linkify: true,
  highlight: (source, lang) => (lang === 'diff' ? diff(source) : ''),
})
md.disable('image')

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
