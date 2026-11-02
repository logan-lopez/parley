// @vitest-environment jsdom
import { createApp, h, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Media } from '@parley/protocol'
import { audition, createCycle, escStops, setAutoplay, useAudition } from './audition'
import { MEDIA, mediaContext } from './media'
import Markdown from './Markdown.vue'
import { player } from './player'
import { mediaUrls, type MediaUrl } from '../platform'

vi.mock('../platform', () => ({ mediaUrls: vi.fn(), openMedia: vi.fn(), copyText: vi.fn(), openExternal: vi.fn() }))
vi.mock('./theme-watch', () => ({ onThemeChange: () => () => {}, previewTheme: vi.fn() }))
// The real player on a fake element that never ends, so a sound stays "playing".
vi.mock('./player', async (original) => {
  const actual = await original<typeof import('./player')>()
  const audio = { play: () => Promise.resolve(), pause: () => {}, src: '', currentTime: 0, preload: '', onended: null, onerror: null }
  return { ...actual, player: actual.createPlayer(() => audio as unknown as HTMLAudioElement), soundDuration: async () => 0.42 }
})

describe('the cycle', () => {
  const ids = ['a', 'b', 'c']
  it('starts at the first take, goes on after the last one played, and wraps', () => {
    const cycle = createCycle()
    expect(cycle.next(0, ids)).toBe('a')
    cycle.played(0, 'a')
    expect(cycle.next(0, ids)).toBe('b')
    cycle.played(0, 'c')
    expect(cycle.next(0, ids)).toBe('a')
  })
  it('replays the last one played, or the first when nothing was', () => {
    const cycle = createCycle()
    expect(cycle.replay(0, ids)).toBe('a')
    cycle.played(0, 'b')
    expect(cycle.replay(0, ids)).toBe('b')
  })
  it('remembers each row on its own, and starts over when its chips changed', () => {
    const cycle = createCycle()
    cycle.played(0, 'b')
    expect(cycle.next(1, ids)).toBe('a')
    expect(cycle.next(0, ids)).toBe('c')
    expect(cycle.next(0, ['x', 'y'])).toBe('x')
  })
})

describe('audition keys', () => {
  const take = (n: number) => ({ path: `takes/${n}.wav`, abs: `/project/takes/${n}.wav`, sha256: `h${n}`, bytes: 10, mime: 'audio/wav' })
  const media: Media = Object.fromEntries([1, 2, 3].map((n) => [`takes/${n}.wav`, { kind: 'audio' as const, files: [take(n)] }]))
  const ok = new Map<string, MediaUrl>([1, 2, 3].map((n) => [`h${n}`, { status: 'ok', url: `asset://localhost/project/takes/${n}.wav` }]))
  const source = '![Take 1](takes/1.wav) ![Take 2](takes/2.wav) ![Take 3](takes/3.wav)'

  let app: App | undefined
  let root: HTMLElement
  let aud: ReturnType<typeof useAudition>
  let allowed = true
  const settle = async () => { for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve() } }
  const press = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    // Row 0 has three chips; row 1 has none. The renderers call `key` on their row's keydown.
    const row = root.querySelector<HTMLElement>('[data-row="0"]')!
    row.dispatchEvent(event)
    return event
  }
  const pressOnEmptyRow = (key: string) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    root.querySelector<HTMLElement>('[data-row="1"]')!.dispatchEvent(event)
    return event
  }
  const chips = () => [...root.querySelectorAll<HTMLElement>('.md-sound')]

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(mediaUrls).mockResolvedValue(ok)
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    setAutoplay(false)
    allowed = true
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      setup() {
        aud = useAudition((row) => [root.querySelector(`[data-row="${row}"]`)], () => allowed)
        const keydown = (row: number) => (event: KeyboardEvent) => void aud.key(event, row)
        return () => h('div', [
          h('div', { 'data-row': 0, tabindex: 0, onKeydown: keydown(0) }, [h(Markdown, { source, scope: 'q/row-0' })]),
          h('div', { 'data-row': 1, tabindex: 0, onKeydown: keydown(1) }, 'no sounds here'),
        ])
      },
    })
    app.provide(MEDIA, mediaContext(() => media))
    app.mount(root)
    await settle()
  })
  afterEach(() => {
    player.stop()
    app?.unmount()
    app = undefined
    root.remove()
    vi.unstubAllGlobals()
  })

  it('p plays the takes in turn and wraps; Shift+p replays the last one', async () => {
    const heard: Array<string | null> = []
    for (let n = 0; n < 4; n++) {
      press('p')
      heard.push(player.state.id)
    }
    expect(heard).toEqual(['q/row-0#1', 'q/row-0#2', 'q/row-0#3', 'q/row-0#1'])
    press('p')
    press('P', { shiftKey: true })
    expect(player.state).toMatchObject({ id: 'q/row-0#2', playing: true })
    press('P', { shiftKey: true })
    expect(player.state.id).toBe('q/row-0#2')
  })

  it('Shift+p plays the first take when nothing was played yet', () => {
    press('P', { shiftKey: true })
    expect(player.state.id).toBe('q/row-0#1')
  })

  it('takes the key it uses and leaves the rest alone', () => {
    expect(press('p').defaultPrevented).toBe(true)
    expect(press('p', { ctrlKey: true }).defaultPrevented).toBe(false)
    expect(press('p', { metaKey: true }).defaultPrevented).toBe(false)
    expect(press('j').defaultPrevented).toBe(false)
  })

  it('ignores p on a row without chips', () => {
    player.stop()
    const event = pressOnEmptyRow('p')
    expect(event.defaultPrevented).toBe(false)
    expect(player.state.playing).toBe(false)
  })

  it('Esc stops what plays and stops the event; with nothing playing it passes through', () => {
    const reached = vi.fn()
    window.addEventListener('keydown', reached)
    press('p')
    reached.mockClear()   // p bubbles on; only Esc is stopped
    expect(player.state.playing).toBe(true)
    const stopped = press('Escape')
    expect(stopped.defaultPrevented).toBe(true)
    expect(player.state.playing).toBe(false)
    expect(reached).not.toHaveBeenCalled()
    const passed = press('Escape')
    expect(passed.defaultPrevented).toBe(false)
    expect(reached).toHaveBeenCalledTimes(1)
    window.removeEventListener('keydown', reached)
  })

  it('escStops needs something playing', () => {
    expect(escStops(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))).toBe(false)
  })

  it('marks the chip p plays next on the focused row, and clears it on leaving', async () => {
    const marked = () => chips().findIndex((chip) => chip.classList.contains('next'))
    await aud.enter(0, false)
    await settle()
    expect(audition.next).toBe('q/row-0#1')
    expect(marked()).toBe(0)
    press('p')
    await settle()
    expect(audition.next).toBe('q/row-0#2')
    expect(marked()).toBe(1)
    // The playing chip isn't also the next one.
    expect(chips()[0]!.classList.contains('next')).toBe(false)
    aud.leave()
    await settle()
    expect(audition.next).toBeNull()
    expect(marked()).toBe(-1)
  })

  it('follows a chip played with the mouse', async () => {
    await aud.enter(0, false)
    chips()[1]!.click()
    await settle()
    expect(audition.next).toBe('q/row-0#3')
  })

  describe('autoplay', () => {
    it('is off by default: moving onto a row plays nothing', async () => {
      await aud.enter(0, true)
      expect(player.state.playing).toBe(false)
    })
    it('plays the first take when focus moves onto a row, and p goes on from there', async () => {
      setAutoplay(true)
      await aud.enter(0, true)
      expect(player.state).toMatchObject({ id: 'q/row-0#1', playing: true })
      press('p')
      expect(player.state.id).toBe('q/row-0#2')
    })
    it('never plays on the card taking focus itself (a new ask, the window coming back)', async () => {
      setAutoplay(true)
      await aud.enter(0, false)
      expect(player.state.playing).toBe(false)
    })
    it('stays quiet in history', async () => {
      setAutoplay(true)
      allowed = false
      await aud.enter(0, true)
      expect(player.state.playing).toBe(false)
    })
    it('does not play a row focus already left', async () => {
      setAutoplay(true)
      const entering = aud.enter(0, true)
      aud.leave()
      await entering
      expect(player.state.playing).toBe(false)
    })
    it('plays nothing on a row without chips, and not twice on the same row', async () => {
      setAutoplay(true)
      await aud.enter(1, true)
      expect(player.state.playing).toBe(false)
      await aud.enter(0, true)
      player.stop()
      await aud.enter(0, true)   // a comment box inside the row took focus: same row
      expect(player.state.playing).toBe(false)
    })
  })
})
