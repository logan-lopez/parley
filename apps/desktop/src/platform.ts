// What renderers may ask of the host. Renderers import this, never
// `@tauri-apps/*`, so they also run in the MCP Apps card, which overrides
// what it needs with `setPlatform`. Outside Tauri (the gallery in a plain
// browser) it falls back to browser APIs.

import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core'
import type { Media, MediaFile } from '@parley/protocol'
import { appDataDir, join } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-dialog'
import { BaseDirectory, mkdir, writeFile } from '@tauri-apps/plugin-fs'
import { openUrl } from '@tauri-apps/plugin-opener'
import { duringDialog } from './blur'

export interface PickOptions {
  kind: 'file' | 'directory'
  multiple: boolean
  extensions?: string[]   // without dots
  title?: string
}

// Paths only, never contents. Empty when the user cancels.
export async function pickPaths(opts: PickOptions): Promise<string[]> {
  if (!isTauri()) {
    const typed = window.prompt(`Path${opts.multiple ? 's, comma-separated' : ''}:`)
    return typed ? typed.split(',').map((p) => p.trim()).filter(Boolean) : []
  }
  // The dialog takes focus from the window; `hideOnBlur` mustn't read that as leaving.
  const picked = await duringDialog(() => open({
    directory: opts.kind === 'directory',
    multiple: opts.multiple,
    ...(opts.title && { title: opts.title }),
    ...(opts.kind === 'file' && opts.extensions?.length && {
      filters: [{ name: opts.extensions.join(', '), extensions: opts.extensions }],
    }),
  }))
  if (picked === null) return []
  return Array.isArray(picked) ? picked : [picked]
}

// Opens a link in the default browser. Anything but http(s) and mailto is ignored.
export async function openExternal(url: string): Promise<void> {
  if (!/^(https?|mailto):/i.test(url)) return
  if (overrides.openExternal) await overrides.openExternal(url)
  else if (isTauri()) await openUrl(url)
  else window.open(url, '_blank', 'noopener')
}

// Puts text on the clipboard. False when the host won't allow it (an MCP Apps
// host can withhold clipboard access), so the caller can fall back to a selection.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (overrides.copyText) return await overrides.copyText(text)
    await navigator.clipboard.writeText(text)
    return true
  } catch (error) {
    console.warn('copy failed:', error)
    return false
  }
}

// Saves a pasted screenshot as `$APPDATA/captures/<YYYY-MM-DD>/<random>.png`
// and returns its absolute path, which goes to the agent to read. History's
// startup compaction and Clear remove them (asks/persist.ts). Outside Tauri
// (the gallery) it saves nothing and returns a made-up path.
export async function saveImage(png: Blob): Promise<string> {
  if (overrides.saveImage) return overrides.saveImage(png)
  if (!isTauri()) return `/tmp/parley-capture-${++fakeImages}.png`
  const now = new Date()
  const day = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, '0')).join('-')
  const name = `${crypto.randomUUID().slice(0, 8)}.png`
  const opts = { baseDir: BaseDirectory.AppData }
  await mkdir(`captures/${day}`, { ...opts, recursive: true })
  await writeFile(`captures/${day}/${name}`, new Uint8Array(await png.arrayBuffer()), opts)
  return join(await appDataDir(), 'captures', day, name)
}

let fakeImages = 0

export type MediaStatus = 'ok' | 'changed' | 'missing' | 'refused' | 'unresolved' | 'window'
// Equal hashes can belong to different files; one may have disappeared while
// the other is still there. Keep those individual statuses under the hash.
export type MediaUrl = { url?: string; status: MediaStatus; byPath?: Map<string, MediaUrl> }

// One batch per mounted form. The caller shares its promise with every
// markdown surface, and drops it on unmount so history checks the disk again.
export async function mediaUrls(entries: Media): Promise<Map<string, MediaUrl>> {
  if (overrides.mediaUrls) return overrides.mediaUrls(entries)
  const files = Object.values(entries).flatMap((entry) => entry.files)
  if (!files.length) return new Map()
  if (!isTauri()) return new Map(files.map((file) => [file.sha256, { status: 'unresolved' }]))
  const statuses = await invoke<MediaStatus[]>('allow_media', {
    entries: files.map(({ abs, sha256 }) => ({ abs, sha256 })),
  })
  const urls = new Map<string, MediaUrl>()
  files.forEach((file, i) => {
    const result: MediaUrl = {
      status: statuses[i] ?? 'refused',
      ...(statuses[i] === 'ok' && { url: convertFileSrc(file.abs) }),
    }
    const previous = urls.get(file.sha256)
    const byPath = previous?.byPath ?? new Map<string, MediaUrl>()
    byPath.set(file.abs, result)
    urls.set(file.sha256, { ...result, byPath })
  })
  return urls
}

// Call only for an image in this form whose grant succeeded. Inline hosts
// have no local file opener. Rust rechecks the grant and hash before opening.
export async function openMedia(file: MediaFile): Promise<void> {
  if (isTauri()) await invoke('open_media', { entry: { abs: file.abs, sha256: file.sha256 } })
}

// A host that isn't Tauri or a plain browser (the MCP Apps card) swaps in its own.
interface Overrides {
  openExternal?: (url: string) => Promise<void>
  copyText?: (text: string) => Promise<boolean>
  saveImage?: (png: Blob) => Promise<string>
  mediaUrls?: (entries: Media) => Promise<Map<string, MediaUrl>>
}

const overrides: Overrides = {}

export function setPlatform(next: Overrides) {
  Object.assign(overrides, next)
}
