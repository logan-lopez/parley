// @vitest-environment jsdom
import { createApp, h, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Media } from '@parley/protocol'
import { MEDIA, inlineImageUrls, mediaContext } from './media'
import Markdown from './Markdown.vue'
import { mediaUrls, openMedia, type MediaUrl } from '../platform'

vi.mock('../platform', () => ({ mediaUrls: vi.fn(), openMedia: vi.fn(), copyText: vi.fn(), openExternal: vi.fn() }))
vi.mock('./theme-watch', () => ({ onThemeChange: () => () => {}, previewTheme: vi.fn() }))
// The real player on a fake element, and a duration without loading anything.
vi.mock('./player', async (original) => {
  const actual = await original<typeof import('./player')>()
  const audio = { play: () => Promise.resolve(), pause: () => {}, src: '', currentTime: 0, preload: '', onended: null, onerror: null }
  return { ...actual, player: actual.createPlayer(() => audio as unknown as HTMLAudioElement), soundDuration: async () => 0.42 }
})

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
const mount = (media = entries, source = '![Caption](a.png)') => {
  app = createApp({ render: () => h(Markdown, { source, scope: 'q/show' }) })
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

describe('sound chips', () => {
  const take = (name: string, sha256 = name) => ({ path: `takes/${name}`, abs: `/project/takes/${name}`, sha256, bytes: 10, mime: 'audio/wav' })
  const sounds: Media = {
    'takes/1_*.wav': { kind: 'audio', files: [take('1_a.wav'), take('1_b.wav')] },
    'takes/2.wav': { kind: 'audio', files: [take('2.wav')] },
  }
  const source = '![Take 1](takes/1_*.wav) ![Take 2](takes/2.wav)'
  const ok = new Map<string, MediaUrl>(['1_a.wav', '1_b.wav', '2.wav'].map((n) => [n, { status: 'ok', url: `asset://localhost/project/takes/${n}` }]))
  afterEach(async () => (await import('./player')).player.stop())

  it('shows variants and duration, plays one chip at a time, and stops on a second click', async () => {
    const { player } = await import('./player')
    vi.mocked(mediaUrls).mockResolvedValue(ok)
    mount(sounds, source)
    await settle()
    await settle()
    const [one, two] = [...root.querySelectorAll<HTMLButtonElement>('.md-sound')]
    expect(one!.getAttribute('aria-disabled')).toBe('false')
    expect(one!.textContent).toBe('▶Take 12 variants · 0.4 s')
    expect(two!.textContent).toBe('▶Take 20.4 s')
    expect(one!.title).toBe('takes/1_a.wav\ntakes/1_b.wav')
    one!.click()
    await nextTick()
    expect(player.state).toMatchObject({ id: 'q/show#1', count: 2, playing: true })
    expect(one!.classList.contains('playing')).toBe(true)
    expect(one!.textContent).toBe('■Take 11/2')
    two!.click()
    await nextTick()
    expect(player.state).toMatchObject({ id: 'q/show#2', playing: true })
    expect(one!.textContent).toBe('▶Take 12 variants · 0.4 s')
    expect(two!.textContent).toBe('■Take 20.4 s')
    two!.click()
    await nextTick()
    expect(player.state.playing).toBe(false)
    expect(two!.classList.contains('playing')).toBe(false)
  })
  it.each([
    ['changed', 'takes/1_b.wav changed since this was asked'], ['missing', 'takes/1_b.wav is gone'],
    ['window', 'Plays in the Parley window'], ['refused', "takes/1_b.wav couldn't be loaded"],
  ] as const)('disables the chip when a variant is %s, saying why', async (status, message) => {
    const { player } = await import('./player')
    vi.mocked(mediaUrls).mockResolvedValue(new Map([...ok, ['1_b.wav', { status }]]))
    mount(sounds, source)
    await settle()
    const chip = root.querySelector<HTMLButtonElement>('.md-sound')!
    expect(chip.getAttribute('aria-disabled')).toBe('true')
    expect(chip.textContent).toContain(message)
    chip.click()
    expect(player.state.playing).toBe(false)
  })
  it('shows an unresolved sound as not loaded', async () => {
    vi.mocked(mediaUrls).mockResolvedValue(new Map())
    mount({}, '![Take](takes/9.wav)')
    await settle()
    expect(root.querySelector('.md-sound')!.textContent).toContain("takes/9.wav isn't loaded here")
  })
  it('keeps focus where it was: mousedown on a chip is prevented', async () => {
    vi.mocked(mediaUrls).mockResolvedValue(ok)
    mount(sounds, source)
    await settle()
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    root.querySelector('.md-sound')!.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
  })
})
