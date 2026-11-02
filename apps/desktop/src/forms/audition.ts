// Audition keys: `p` plays the focused row's (or option's) next sound chip,
// Shift+`p` replays the last one, Esc stops what's playing. The renderers that
// hold rows with chips (review, choice) call `useAudition` and hand it the
// DOM that belongs to a row; the chips themselves are Markdown.vue's, and the
// sound is forms/player.ts's.
import { nextTick, onBeforeUnmount, reactive, watch } from 'vue'
import { player } from './player'

export const audition = reactive({
  // settings.json's `autoplay`, set by the window after it reads the file.
  autoplay: false,
  // The chip `p` plays next on the focused row, for the chips to mark. Null
  // when nothing is focused or the row has only one chip.
  next: null as string | null,
})

export function setAutoplay(on: boolean): void {
  audition.autoplay = on
}

// A chip's playable URLs, set by Markdown.vue once every variant has its grant
// and removed when one hasn't. A chip without an entry can't be played.
export const chipUrls = new WeakMap<HTMLElement, string[]>()

// Markdown.vue's media paints, in flight. Chips only become playable when one
// settles, so a row that was just focused (its preview just rendered) waits here.
const inflight = new Set<Promise<unknown>>()

export function track<T>(painting: Promise<T>): Promise<T> {
  inflight.add(painting)
  const done = () => void inflight.delete(painting)
  painting.then(done, done)
  return painting
}

export async function settled(): Promise<void> {
  while (inflight.size) await Promise.allSettled([...inflight])
}

export interface Cycle {
  /** The chip `p` plays: the one after the last played in this row, else the first. */
  next(row: number, ids: string[]): string | undefined
  /** The chip Shift+`p` plays: the last one played in this row, else the first. */
  replay(row: number, ids: string[]): string | undefined
  played(row: number, id: string): void
}

// Each row remembers what it last played, for the life of the renderer (the
// ask), so coming back to a row continues after the take heard last.
export function createCycle(): Cycle {
  const last = new Map<number, string>()
  const heard = (row: number, ids: string[]) => {
    const id = last.get(row)
    return id !== undefined && ids.includes(id) ? id : undefined
  }
  return {
    next(row, ids) {
      const id = heard(row, ids)
      return id === undefined ? ids[0] : ids[(ids.indexOf(id) + 1) % ids.length]
    },
    replay: (row, ids) => heard(row, ids) ?? ids[0],
    played: (row, id) => void last.set(row, id),
  }
}

/** The chips a row can play now, in document order across its roots. */
export function playableChips(roots: Array<Element | null | undefined>): HTMLElement[] {
  const chips = roots.flatMap((root) => [...(root?.querySelectorAll<HTMLElement>('.md-sound') ?? [])])
  return [...new Set(chips)].filter((chip) => chipUrls.has(chip))
}

/**
 * Esc while something plays stops it, and stops the event, so the window
 * doesn't hide. True when it did; with nothing playing Esc is left alone.
 */
export function escStops(event: KeyboardEvent): boolean {
  if (event.key !== 'Escape' || event.metaKey || event.ctrlKey || event.altKey || !player.state.playing) return false
  event.preventDefault()
  event.stopPropagation()
  player.stop()
  return true
}

/**
 * `rootsOf(row)` is the DOM holding that row's chips: the row itself and, while
 * it's the one previewed, the preview pane. `canAutoplay` is false in history.
 */
export function useAudition(rootsOf: (row: number) => Array<Element | null | undefined>, canAutoplay: () => boolean) {
  const cycle = createCycle()
  let current: number | null = null   // the row with focus

  const chips = (row: number) => playableChips(rootsOf(row))
  const idsOf = (list: HTMLElement[]) => list.map((chip) => chip.dataset.sound!)

  function mark() {
    if (current === null) return
    const ids = idsOf(chips(current))
    audition.next = ids.length > 1 ? (cycle.next(current, ids) ?? null) : null
  }

  function play(row: number, list: HTMLElement[], id: string | undefined) {
    const chip = list.find((c) => c.dataset.sound === id)
    if (!chip) return
    cycle.played(row, id!)
    player.play(id!, chipUrls.get(chip)!)
    mark()
  }

  /** `p` and Shift+`p` on a focused row, and Esc. True when the key was used. */
  function key(event: KeyboardEvent, row: number): boolean {
    if (escStops(event)) return true
    if (event.metaKey || event.ctrlKey || event.altKey || event.key.toLowerCase() !== 'p') return false
    const list = chips(row)
    if (!list.length) return false
    event.preventDefault()
    const ids = idsOf(list)
    play(row, list, event.shiftKey ? cycle.replay(row, ids) : cycle.next(row, ids))
    return true
  }

  /**
   * Focus arrived on a row. `moved` is true when it came from another element
   * (a key or a click) and false when the card took it itself, on a new ask or
   * when the window got focus back: autoplay only follows the first.
   */
  async function enter(row: number, moved: boolean): Promise<void> {
    if (current === row) return
    current = row
    audition.next = null
    await nextTick()
    await settled()
    if (current !== row) return
    mark()
    if (!moved || !audition.autoplay || !canAutoplay()) return
    const list = chips(row)
    play(row, list, idsOf(list)[0])
  }

  function leave() {
    current = null
    audition.next = null
  }

  // A chip clicked by hand moves the cycle on too.
  watch(() => player.state.id, (id) => {
    if (current === null || id === null) return
    if (idsOf(chips(current)).includes(id)) {
      cycle.played(current, id)
      mark()
    }
  })
  onBeforeUnmount(leave)

  return { key, enter, leave }
}
