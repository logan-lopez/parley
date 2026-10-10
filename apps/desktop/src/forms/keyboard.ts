// The DOM contract between question renderers and whatever hosts them (the
// card), so keyboard handling lives in one place and renderers stay plain:
//
// - `[data-question]` marks each question's root, in order.
// - `[data-pick="n"]` is what number key n picks: clicked, or focused if it's
//   a text input (the Other row). `aria-checked` says whether it's picked.
// - `[data-primary]` is where focus lands when the question becomes active.
// - `[data-advance-on-pick]` on the root moves focus to the next question
//   after a number-key pick (single choice, boolean).
//
// The card claims digits, Enter, Tab and Cmd chords; the window claims Esc
// (hide). Other plain keys are the renderer's own, handled on its elements
// (the review renderer's j/k/a/r/c). A renderer that needs Esc for itself, like
// leaving a review comment, stops its propagation so the window stays up.

export const QUESTION = '[data-question]'

export function questionsIn(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(QUESTION)]
}

export function focusQuestion(question: HTMLElement | undefined) {
  if (!question) return
  const target = question.querySelector<HTMLElement>('[data-primary]')
    ?? question.querySelector<HTMLElement>('input, textarea, button, [tabindex]')
  // Focusing would scroll to the widget; a long question would lose its text.
  target?.focus({ preventScroll: true })
  reveal(question)
}

// Leaves a question alone if it's fully in view. Otherwise scrolls its top to
// the top of the view, so the next question lands in a predictable place.
function reveal(question: HTMLElement) {
  let scroller = question.parentElement
  while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
  if (!scroller) return
  const view = scroller.getBoundingClientRect()
  const box = question.getBoundingClientRect()
  if (box.top >= view.top && box.bottom <= view.bottom) return
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
  scroller.scrollBy({ top: box.top - view.top - 12, behavior: smooth ? 'smooth' : 'auto' })
}

// Arrow-key movement between a question's pickable items.
export function moveAmongPicks(event: KeyboardEvent, keys: { prev: string[]; next: string[] }) {
  const step = keys.next.includes(event.key) ? 1 : keys.prev.includes(event.key) ? -1 : 0
  if (!step) return
  const question = (event.target as HTMLElement).closest<HTMLElement>(QUESTION)
  const items = [...(question?.querySelectorAll<HTMLElement>('[data-pick]') ?? [])]
  const i = items.indexOf(event.target as HTMLElement)
  const next = items[i + step]
  if (i === -1 || !next) return
  event.preventDefault()
  next.focus()
}
