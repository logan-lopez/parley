// @vitest-environment jsdom
import { createApp, h, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Media } from '@parley/protocol'
import { MEDIA, inlineImageUrls, mediaContext } from './media'
import Markdown from './Markdown.vue'
import { mediaUrls, openMedia } from '../platform'

vi.mock('../platform', () => ({ mediaUrls: vi.fn(), openMedia: vi.fn(), copyText: vi.fn(), openExternal: vi.fn() }))
vi.mock('./theme-watch', () => ({ onThemeChange: () => () => {}, previewTheme: vi.fn() }))

const entries: Media = { 'a.png': { kind: 'image', files: [{ path: 'a.png', abs: '/project/a.png', sha256: 'hash', bytes: 10, mime: 'image/png' }] } }
let app: App | undefined
let root: HTMLElement
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(openMedia).mockResolvedValue()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  root = document.createElement('div')
  document.body.append(root)
})
afterEach(() => { app?.unmount(); app = undefined; root.remove(); vi.unstubAllGlobals() })
const settle = async () => { await nextTick(); await Promise.resolve(); await nextTick() }
const mount = (media = entries) => {
  app = createApp({ render: () => h(Markdown, { source: '![Caption](a.png)' }) })
  app.provide(MEDIA, mediaContext(() => media))
  app.mount(root)
}

describe('media rendering', () => {
  it('keeps an available inline payload when a same-hash alias is capped out', () => {
    const media: Media = { ...entries, 'alias.png': entries['a.png']! }
    expect(inlineImageUrls(media, { 'a.png': 'data:image/png;base64,AA' }).get('hash'))
      .toEqual({ status: 'ok', url: 'data:image/png;base64,AA' })
    expect(inlineImageUrls(media, {}).get('hash')).toEqual({ status: 'window' })
  })
  it.each([
    ['changed', 'a.png changed since this was asked'], ['missing', 'a.png is gone'],
    ['refused', "a.png couldn't be loaded"], ['window', 'Open in the Parley window'],
  ] as const)('keeps the caption and path when %s', async (status, message) => {
    vi.mocked(mediaUrls).mockResolvedValue(new Map([['hash', { status }]]))
    mount()
    await settle()
    expect(root.textContent).toContain('Caption')
    expect(root.textContent).toContain(message)
    expect(root.querySelector('img')!.hasAttribute('src')).toBe(false)
  })
  it('shows unresolved without a matching entry', async () => {
    vi.mocked(mediaUrls).mockResolvedValue(new Map())
    mount({})
    await settle()
    expect(root.textContent).toContain("a.png isn't loaded here")
  })
  it('keeps per-path status when two files had identical bytes', async () => {
    vi.mocked(mediaUrls).mockResolvedValue(new Map([['hash', {
      status: 'missing',
      byPath: new Map([
        ['/project/a.png', { status: 'changed' }], ['/project/b.png', { status: 'missing' }],
      ]),
    }]]))
    mount()
    await settle()
    expect(root.textContent).toContain('a.png changed since this was asked')
    expect(root.textContent).not.toContain('a.png is gone')
  })
  it('fills only the granted URL, then enables opening after load', async () => {
    vi.mocked(mediaUrls).mockResolvedValue(new Map([['hash', { status: 'ok', url: 'asset://localhost/project/a.png' }]]))
    mount()
    await settle()
    const image = root.querySelector('img')!
    expect(image.getAttribute('src')).toBe('asset://localhost/project/a.png')
    expect(image.hidden).toBe(true)
    image.dispatchEvent(new Event('load'))
    expect(image.hidden).toBe(false)
    root.querySelector('button')!.click()
    expect(openMedia).toHaveBeenCalledWith(entries['a.png']!.files[0])
    image.dispatchEvent(new Event('error'))
    expect(root.textContent).toContain("Couldn't draw a.png")
  })
  it('shares a grant per mounted form and rechecks on a later mount', async () => {
    vi.mocked(mediaUrls).mockResolvedValue(new Map())
    const context = mediaContext(() => entries)
    await Promise.all([context.urls(), context.urls()])
    expect(mediaUrls).toHaveBeenCalledTimes(1)
    await mediaContext(() => entries).urls()
    expect(mediaUrls).toHaveBeenCalledTimes(2)
  })
})
