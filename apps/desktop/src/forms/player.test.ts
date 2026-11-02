import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlayer, formatDuration, soundDuration } from './player'

// Enough of an HTMLAudioElement to drive: what was loaded, and its events.
function fakeAudio() {
  const el = {
    src: '', currentTime: 0, preload: '', duration: NaN,
    loaded: [] as string[],
    onended: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onloadedmetadata: null as (() => void) | null,
    play: vi.fn(() => { el.loaded.push(el.src); return Promise.resolve() }),
    pause: vi.fn(),
  }
  return el
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('the player', () => {
  it('plays variants in order with a gap, then reports the end', () => {
    const audio = fakeAudio()
    const player = createPlayer(() => audio as unknown as HTMLAudioElement)
    const ended = vi.fn()
    player.onEnd(ended)
    player.play('q/preview-0#1', ['a', 'b', 'c'], 150)
    expect(player.state).toMatchObject({ id: 'q/preview-0#1', variant: 0, count: 3, playing: true })
    expect(audio.loaded).toEqual(['a'])
    audio.onended!()
    vi.advanceTimersByTime(149)
    expect(audio.loaded).toEqual(['a'])
    vi.advanceTimersByTime(1)
    expect(audio.loaded).toEqual(['a', 'b'])
    expect(player.state.variant).toBe(1)
    audio.onerror!()   // a variant that fails is skipped
    vi.advanceTimersByTime(150)
    expect(audio.loaded).toEqual(['a', 'b', 'c'])
    audio.onended!()
    expect(player.state.playing).toBe(false)
    expect(ended).toHaveBeenCalledWith('q/preview-0#1')
  })
  it('plays one sound at a time: a new play stops the last, and stop ends it without onEnd', () => {
    const audio = fakeAudio()
    const player = createPlayer(() => audio as unknown as HTMLAudioElement)
    const ended = vi.fn()
    player.onEnd(ended)
    player.play('one', ['a', 'b'])
    const stale = audio.onended!
    player.play('two', ['x'])
    expect(audio.pause).toHaveBeenCalled()
    expect(player.state).toMatchObject({ id: 'two', count: 1, playing: true })
    stale()   // the first chip's callback, arriving late, changes nothing
    vi.advanceTimersByTime(1000)
    expect(audio.loaded).toEqual(['a', 'x'])
    player.stop()
    expect(player.state.playing).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(ended).not.toHaveBeenCalled()
  })
  it('stops during the gap', () => {
    const audio = fakeAudio()
    const player = createPlayer(() => audio as unknown as HTMLAudioElement)
    player.play('one', ['a', 'b'])
    audio.onended!()
    player.stop()
    vi.advanceTimersByTime(1000)
    expect(audio.loaded).toEqual(['a'])
  })
  it('skips a variant whose play() is refused', async () => {
    const audio = fakeAudio()
    audio.play.mockImplementationOnce(() => Promise.reject(new Error('NotSupportedError')))
    const player = createPlayer(() => audio as unknown as HTMLAudioElement)
    player.play('one', ['bad', 'good'], 0)
    await vi.runAllTimersAsync()
    expect(audio.loaded).toEqual(['good'])
  })
})

describe('durations', () => {
  it('reads metadata once per URL', async () => {
    const audio = fakeAudio()
    const make = vi.fn(() => audio as unknown as HTMLAudioElement)
    const first = soundDuration('asset://a.wav', make)
    expect(audio.preload).toBe('metadata')
    audio.duration = 0.42
    audio.onloadedmetadata!()
    expect(await first).toBe(0.42)
    expect(await soundDuration('asset://a.wav', make)).toBe(0.42)
    expect(make).toHaveBeenCalledTimes(1)
  })
  it.each([[0.04, '0.1 s'], [0.42, '0.4 s'], [9.96, '10 s'], [12.4, '12 s'], [65, '1:05']])('formats %s as %s', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text)
  })
})
