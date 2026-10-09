// What renderers may ask of the host. Renderers import this, never
// `@tauri-apps/*`, so they can run in an MCP Apps iframe later. Outside
// Tauri (the gallery in a plain browser) it falls back to browser APIs.

import { isTauri } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'

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
  const picked = await open({
    directory: opts.kind === 'directory',
    multiple: opts.multiple,
    ...(opts.title && { title: opts.title }),
    ...(opts.kind === 'file' && opts.extensions?.length && {
      filters: [{ name: opts.extensions.join(', '), extensions: opts.extensions }],
    }),
  })
  if (picked === null) return []
  return Array.isArray(picked) ? picked : [picked]
}

// Opens a link in the default browser. Anything but http(s) and mailto is ignored.
export async function openExternal(url: string): Promise<void> {
  if (!/^(https?|mailto):/i.test(url)) return
  if (isTauri()) await openUrl(url)
  else window.open(url, '_blank', 'noopener')
}
