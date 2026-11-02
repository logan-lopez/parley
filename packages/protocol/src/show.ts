// Show blocks: the caps, and how a file the server read becomes the markdown a
// show renders. No Zod here, so the window's renderer can import it from the
// root entry.

// Inline `content`, checked by the tool's input schema.
export const SHOW_CONTENT_MAX = 20_000
// A file's text after `lines` slicing, and what's read from disk at most.
export const SHOW_FILE_MAX_CHARS = 100_000
export const SHOW_FILE_MAX_BYTES = 2 * 1024 * 1024
// Everything one ask shows, content and files together. Keeps a form well
// under the hub's 1 MiB line, after JSON escaping.
export const SHOW_ASK_MAX_CHARS = 200_000

// HTML and SVG files are drawn as brief 14 pictures at this size, scaled to fit.
export const SHOW_PICTURE = { width: 640, height: 480 }

const LANGUAGES: Record<string, string> = {
  ts: 'ts', mts: 'ts', cts: 'ts', tsx: 'tsx',
  js: 'js', mjs: 'js', cjs: 'js', jsx: 'jsx',
  json: 'json', jsonc: 'json', jsonl: 'json',
  rs: 'rust', go: 'go', swift: 'swift', kt: 'kotlin', java: 'java',
  c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', m: 'objc',
  py: 'python', rb: 'ruby', php: 'php', lua: 'lua',
  vue: 'vue', css: 'css', scss: 'scss',
  sh: 'sh', bash: 'bash', zsh: 'zsh', fish: 'fish',
  toml: 'toml', yaml: 'yaml', yml: 'yaml', xml: 'xml', ini: 'ini',
  sql: 'sql', graphql: 'graphql',
  diff: 'diff', patch: 'diff',
}

// The markdown a show renders for a file: markdown as is, HTML and SVG as
// pictures, anything else as a fenced code block in its language. Pure.
export function fileMarkdown(path: string, text: string): string {
  const name = path.split('/').pop() ?? path
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
  if (ext === 'md' || ext === 'markdown' || ext === 'mdx') return text
  const size = `width=${SHOW_PICTURE.width} height=${SHOW_PICTURE.height}`
  const info = ext === 'html' || ext === 'htm' ? `html preview ${size}`
    : ext === 'svg' ? `svg preview ${size}`
    : LANGUAGES[ext] ?? ''
  return fenced(text, info)
}

// A fence longer than any run of backticks in the text, so nothing in it ends
// the block early.
function fenced(text: string, info: string): string {
  const fence = '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((m) => m[0].length + 1)))
  const body = text.endsWith('\n') ? text : `${text}\n`
  return `${fence}${info}\n${body}${fence}`
}
