import MarkdownIt from 'markdown-it'

// Pinned: references only. Neither the hub nor history carries image bytes.
export type MediaFile = { path: string; abs: string; sha256: string; bytes: number; mime: string }
export type MediaEntry = { kind: 'image' | 'audio'; files: MediaFile[] }
export type Media = Record<string, MediaEntry>

export const MEDIA_FILE_MAX_BYTES = 25 * 1024 * 1024
export const MEDIA_ASK_MAX_FILES = 200
export const INLINE_MEDIA_FILE_MAX_BYTES = 2 * 1024 * 1024
export const INLINE_MEDIA_ASK_MAX_BYTES = 8 * 1024 * 1024

export function isMediaRef(src: string): boolean {
  return !!src && !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(src)
}

// Use the same grammar and src spelling on the server and in the renderer.
// A local filename isn't a URL: preserve spaces, Unicode and literal percent
// signs rather than percent-encoding them. validateLink still blocks unsafe links.
export function mediaMarkdown() {
  const md = new MarkdownIt({ html: false, linkify: true })
  md.normalizeLink = (src) => src
  return md
}

const parser = mediaMarkdown()

// Markdown-it's inline tokens exclude code spans, indented code and fences;
// it also handles escaped punctuation, angle destinations and reference images.
export function mediaRefs(text: string): string[] {
  const refs = new Set<string>()
  for (const block of parser.parse(text, {})) {
    for (const token of block.children ?? []) {
      if (token.type !== 'image') continue
      const src = String(token.attrGet('src') ?? '')
      if (isMediaRef(src)) refs.add(src)
    }
  }
  return [...refs]
}
