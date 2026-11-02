import type { InjectionKey } from 'vue'
import type { Media } from '@parley/protocol'
import { mediaUrls, type MediaUrl } from '../platform'

export interface MediaContext {
  entries: () => Media
  urls: () => Promise<Map<string, MediaUrl>>
}
export const MEDIA: InjectionKey<MediaContext> = Symbol('media')

// Several refs may name identical bytes. A capped-out alias can reuse the
// payload already sent for that hash, without sending another copy.
export function inlineImageUrls(entries: Media, urls: Record<string, string>): Map<string, MediaUrl> {
  const resolved = new Map<string, MediaUrl>()
  for (const [src, entry] of Object.entries(entries)) {
    const url = Object.prototype.hasOwnProperty.call(urls, src) ? urls[src] : undefined
    for (const file of entry.files) {
      if (!resolved.has(file.sha256) || url) {
        resolved.set(file.sha256, url ? { status: 'ok', url } : { status: 'window' })
      }
    }
  }
  return resolved
}

// All Markdown instances in a card share the same grant, including previews
// mounted later. Reopening a card creates a new context and rechecks hashes.
export function mediaContext(entries: () => Media): MediaContext {
  let previous: Media | undefined
  let pending: Promise<Map<string, MediaUrl>> | undefined
  return {
    entries,
    urls() {
      const current = entries()
      if (current !== previous || !pending) {
        previous = current
        pending = mediaUrls(current)
      }
      return pending
    },
  }
}
