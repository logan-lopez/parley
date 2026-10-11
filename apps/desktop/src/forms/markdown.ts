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

// Every fenced block gets a copy button. It carries nothing: Markdown.vue's
// click handler copies the block's `<code>` text.
const fence = md.renderer.rules.fence!
md.renderer.rules.fence = (tokens, idx, options, env, self) =>
  `<div class="code-block">${fence(tokens, idx, options, env, self)}`
  + '<button type="button" class="code-copy" data-copy tabindex="-1" aria-label="Copy the code">Copy</button></div>'

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
