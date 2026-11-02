import MarkdownIt from 'markdown-it'

// Pinned: references only. Neither the hub nor history carries image bytes.
export type MediaFile = { path: string; abs: string; sha256: string; bytes: number; mime: string }
export type MediaEntry = { kind: 'image' | 'audio'; files: MediaFile[] }
export type Media = Record<string, MediaEntry>

export const MEDIA_FILE_MAX_BYTES = 25 * 1024 * 1024
export const MEDIA_ASK_MAX_FILES = 200
export const INLINE_MEDIA_FILE_MAX_BYTES = 2 * 1024 * 1024
export const INLINE_MEDIA_ASK_MAX_BYTES = 8 * 1024 * 1024
// A sound ref may be a glob of variants (`takes/1_*.wav`), played in order.
export const MEDIA_VARIANTS_MAX = 12
export const SOUND_GAP_MS = 150

// A `*` or `?` in the last path segment makes a ref a glob of variants.
export function isMediaGlob(src: string): boolean {
  return /[*?]/.test(src.slice(src.lastIndexOf('/') + 1))
}

// Before the server has resolved a ref (the gallery, an unresolved ref), its
// shape is guessed from the name: a glob or a sound extension draws a chip.
export function looksLikeSound(src: string): boolean {
  return isMediaGlob(src) || /\.(?:wav|wave|aiff?|aifc|mp3|m4a|aac|flac|ogg|oga|opus)$/i.test(src)
}

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
