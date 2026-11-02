// Pinned (brief 24 drives it). One audio element for the window: playing a
// chip stops whatever was playing. A chip plays its urls in order, a short
// gap between variants. `state` is reactive, for chips to paint from.
import { reactive, readonly } from 'vue'
import { SOUND_GAP_MS } from '@parley/protocol'

export interface PlayerState {
  id: string | null   // the chip playing, or last played while `playing` is false
  variant: number     // 0-based index into its urls
  count: number
  playing: boolean
}

export interface Player {
  state: Readonly<PlayerState>
  play(id: string, urls: string[], gapMs?: number): void
  stop(): void
  // After the last variant finishes on its own; not after stop() or a new play().
  onEnd(listener: (id: string) => void): () => void
}

export function createPlayer(make: () => HTMLAudioElement = () => new Audio()): Player {
  const state = reactive<PlayerState>({ id: null, variant: 0, count: 0, playing: false })
  const listeners = new Set<(id: string) => void>()
  let audio: HTMLAudioElement | undefined
  let gap: ReturnType<typeof setTimeout> | undefined
  let run = 0   // a stop or a new play bumps it; stale callbacks see the difference

  function element(): HTMLAudioElement {
    if (!audio) {
      audio = make()
      audio.preload = 'auto'
    }
    return audio
  }

  function halt() {
    run++
    clearTimeout(gap)
    if (audio) {
      audio.onended = audio.onerror = null
      audio.pause()
    }
  }

  function stop() {
    halt()
    state.playing = false
  }

  function play(id: string, urls: string[], gapMs = SOUND_GAP_MS) {
    halt()
    if (!urls.length) {
      state.playing = false
      return
    }
    const token = run
    const el = element()
    Object.assign(state, { id, variant: 0, count: urls.length, playing: true })

    const finish = () => {
      if (token !== run) return
      state.playing = false
      for (const listener of listeners) listener(id)
    }
    // A variant that fails to load or play is skipped, as if it had ended.
    const advance = () => {
      if (token !== run) return
      if (state.variant + 1 >= urls.length) return finish()
      gap = setTimeout(() => start(state.variant + 1), gapMs)
    }
    const start = (i: number) => {
      if (token !== run) return
      state.variant = i
      el.onended = advance
      el.onerror = advance
      el.src = urls[i]!
      el.currentTime = 0
      void el.play()?.catch?.(() => {
        // A newer play() or stop() interrupting this one rejects too.
        if (token === run) advance()
      })
    }
    start(0)
  }

  return {
    state: readonly(state) as Readonly<PlayerState>,
    play,
    stop,
    onEnd(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export const player = createPlayer()

// A sound's length, for its chip, from metadata only. Cached per URL; a
// separate element each time, so probing never interrupts what's playing.
const durations = new Map<string, Promise<number | undefined>>()

export function soundDuration(url: string, make: () => HTMLAudioElement = () => new Audio()): Promise<number | undefined> {
  let pending = durations.get(url)
  if (!pending) {
    pending = new Promise((resolve) => {
      const el = make()
      el.preload = 'metadata'
      el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? el.duration : undefined)
      el.onerror = () => resolve(undefined)
      el.src = url
    })
    durations.set(url, pending)
  }
  return pending
}

// 0.4 s, 1.2 s, 12 s, 1:05.
export function formatDuration(seconds: number): string {
  if (seconds < 9.95) return `${Math.max(seconds, 0.1).toFixed(1)} s`
  if (seconds < 60) return `${Math.round(seconds)} s`
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
