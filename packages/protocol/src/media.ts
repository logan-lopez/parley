import MarkdownIt from 'markdown-it'

// Pinned: references only. Neither the hub nor history carries image bytes.
export type MediaFile = { path: string; abs: string; sha256: string; bytes: number; mime: string }
export type MediaEntry = { kind: 'image' | 'audio'; files: MediaFile[] }
export type Media = Record<string, MediaEntry>
export type CompareSide = { src: string; label: string }
export type ComparePair = [CompareSide, CompareSide]

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

export function isCompareFence(info: string): boolean {
  return info.trim().split(/\s+/)[0] === 'compare'
}

// Two non-empty lines, each `<path>` or `<path> <label>` (`<path with spaces>`
// in angle brackets, matching `![alt](<path with spaces>)`). Without a label,
// the two sides are labelled `A` and `B`.
export function parseCompare(source: string, media?: Media): ComparePair | undefined {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length !== 2) return undefined
  const first = parseCompareSide(lines[0]!, 'A', media)
  const second = parseCompareSide(lines[1]!, 'B', media)
  return first && second ? [first, second] : undefined
}

function parseCompareSide(line: string, fallback: string, media?: Media): CompareSide | undefined {
  const match = line.startsWith('<')
    ? /^<([^>\r\n]+)>(?:\s+(.*))?$/.exec(line)
    : /^(\S+)(?:\s+(.*))?$/.exec(line)
  const src = match?.[1]
  if (!src || !src.trim() || src.startsWith('![') || !isMediaRef(src) || isMediaGlob(src) || looksLikeSound(src) || /\.svg$/i.test(src)) {
    return undefined
  }
  if (media?.[src] && media[src].kind !== 'image') return undefined
  return { src, label: match?.[2]?.trim() || fallback }
}

// Markdown-it's inline tokens exclude code spans, indented code and fences;
// it also handles escaped punctuation, angle destinations and reference images.
// A valid `compare` fence contributes both of its image paths.
export function mediaRefs(text: string): string[] {
  const refs = new Set<string>()
  for (const block of parser.parse(text, {})) {
    if (block.type === 'fence' && isCompareFence(block.info)) {
      const pair = parseCompare(block.content)
      if (pair) {
        refs.add(pair[0].src)
        refs.add(pair[1].src)
      }
      continue
    }
    for (const token of block.children ?? []) {
      if (token.type !== 'image') continue
      const src = String(token.attrGet('src') ?? '')
      if (isMediaRef(src)) refs.add(src)
    }
  }
  return [...refs]
}

export function compareFences(text: string): string[] {
  const fences: string[] = []
  for (const block of parser.parse(text, {})) {
    if (block.type === 'fence' && isCompareFence(block.info)) fences.push(block.content)
  }
  return fences
}
