// "Don't ask again here": the card keeps the set of toggled question ids and
// provides it; a question's frame (choice and boolean) draws the toggle. No
// provider (the inline card, which has no way to send it) means no toggle.

import type { ComputedRef, InjectionKey, Ref } from 'vue'

export interface Remember {
  ids: Ref<string[]>
  locked: ComputedRef<boolean>   // read-only or withdrawn: the mark shows where it was on, and nothing changes
  toggle: (id: string) => void
}

export const REMEMBER: InjectionKey<Remember> = Symbol('remember')
