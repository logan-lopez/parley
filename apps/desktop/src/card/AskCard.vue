<script setup lang="ts">
// One ask as a card: meta line, title, the questions, Skip and Send. It knows
// nothing about the hub or Tauri, so the gallery renders it as-is.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { JsonForms, type JsonFormsChangeEvent } from '@jsonforms/vue'
import type { FormSpec } from '@parley/protocol'
import { focusQuestion, questionsIn } from '../forms/keyboard'
import { renderers } from '../forms/renderers'
import { useNow } from './now'

type ErrorObject = NonNullable<JsonFormsChangeEvent['errors']>[number]

const props = defineProps<{
  form: FormSpec
  source: string
  createdAt: number
  expiresAt?: number
  position?: number   // 1-based place in the queue
  total?: number
  withdrawn?: string  // why it ended under the user; the card goes read-only
  initialData?: unknown
}>()

const emit = defineEmits<{
  change: [data: unknown]
  submit: [data: unknown]
  skip: []
  prev: []
  next: []
  continue: []
}>()

const root = ref<HTMLElement>()
const body = ref<HTMLElement>()
const data = shallowRef<unknown>(props.initialData ?? {})
const errors = shallowRef<ErrorObject[]>([])
const nudge = ref(false)

function onChange(event: JsonFormsChangeEvent) {
  data.value = event.data
  errors.value = event.errors ?? []
  emit('change', event.data)
}

const valid = computed(() => errors.value.length === 0)

// What stands between the user and Send, by question header.
const problems = computed(() => {
  const properties = (props.form.schema.properties ?? {}) as Record<string, { title?: string }>
  const record = (data.value ?? {}) as Record<string, unknown>
  const missing = new Set<string>()
  const invalid = new Map<string, string>()
  for (const error of errors.value) {
    const key = error.keyword === 'required'
      ? String(error.params.missingProperty)
      : error.instancePath.split('/')[1]
    if (!key) continue
    const value = record[key]
    const title = properties[key]?.title ?? key
    if (value === undefined || (Array.isArray(value) && !value.length)) missing.add(title)
    else if (!invalid.has(title)) invalid.set(title, error.message ?? 'is invalid')
  }
  const parts: string[] = []
  if (missing.size) parts.push(`Still needs an answer: ${[...missing].join(', ')}`)
  for (const [title, message] of invalid) parts.push(`${title} ${message}`)
  return parts
})

function submit() {
  if (props.withdrawn) return
  if (!valid.value) {
    nudge.value = true
    setTimeout(() => (nudge.value = false), 600)
    return
  }
  emit('submit', data.value)
}

// Time.
const now = useNow()
const age = computed(() => ago(now.value - props.createdAt))
const remaining = computed(() => (props.expiresAt ? Math.max(0, props.expiresAt - now.value) : undefined))

function ago(ms: number) {
  const s = Math.floor(ms / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  return `${Math.floor(m / 60)} h ago`
}

function clock(ms: number) {
  const s = Math.ceil(ms / 1000)
  const m = Math.floor(s / 60)
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`
}

// Keyboard. Questions are found through the DOM contract in forms/keyboard.ts.
function questions() {
  return root.value ? questionsIn(root.value) : []
}

function activeQuestion(): HTMLElement | undefined {
  const all = questions()
  return all.find((q) => q.contains(document.activeElement)) ?? all[0]
}

function moveQuestion(step: number) {
  const all = questions()
  if (!all.length) return
  const i = all.findIndex((q) => q.contains(document.activeElement))
  const next = i === -1 ? (step > 0 ? 0 : all.length - 1) : (i + step + all.length) % all.length
  focusQuestion(all[next])
}

function pick(n: number) {
  const question = activeQuestion()
  const target = question?.querySelector<HTMLElement>(`[data-pick="${n}"]`)
  if (!question || !target) return
  if (target instanceof HTMLInputElement) return target.focus()
  target.click()
  if (question.hasAttribute('data-advance-on-pick')) {
    const all = questions()
    const next = all[all.indexOf(question) + 1]
    if (next) return focusQuestion(next)
  }
  target.focus()
}

function isTyping(el: Element | null) {
  return !!el?.matches('input[type="text"], input:not([type]), textarea, [contenteditable="true"]')
}

function onKey(event: KeyboardEvent) {
  const target = document.activeElement
  const mod = event.metaKey || event.ctrlKey || event.altKey

  if (event.metaKey && event.key === '[') return void (event.preventDefault(), emit('prev'))
  if (event.metaKey && event.key === ']') return void (event.preventDefault(), emit('next'))

  if (props.withdrawn) {
    if (event.key === 'Enter') {
      event.preventDefault()
      emit('continue')
    }
    return
  }

  if (event.metaKey && event.key === 'Enter') return void (event.preventDefault(), submit())
  // In a text field, Cmd+Backspace keeps its usual meaning (delete to line start).
  if (event.metaKey && event.key === 'Backspace' && !isTyping(target)) return void (event.preventDefault(), emit('skip'))

  if (event.key === 'Tab' && !mod) {
    event.preventDefault()
    return moveQuestion(event.shiftKey ? -1 : 1)
  }

  if (event.key === 'Enter' && !mod && !event.shiftKey) {
    if (target?.matches('textarea')) return
    // A focused option that isn't picked yet: Enter picks it, like Space.
    if (target instanceof HTMLElement && target.matches('[data-pick]:not(input)') && target.getAttribute('aria-checked') !== 'true') {
      event.preventDefault()
      return pick(Number(target.dataset.pick))
    }
    // Other buttons (the path picker, remove) keep their own Enter.
    if (target?.matches('button:not([data-pick])')) return
    event.preventDefault()
    return submit()
  }

  if (/^[1-9]$/.test(event.key) && !mod && !isTyping(target)) {
    event.preventDefault()
    pick(Number(event.key))
  }
}

// Back in the window (hotkey, or after a link opened the browser): put focus
// back where it was, without scrolling. The first question if there's nowhere.
let lastFocused: HTMLElement | null = null
function onFocusIn(event: FocusEvent) {
  if (root.value?.contains(event.target as Node)) lastFocused = event.target as HTMLElement
}
function onWindowFocus() {
  if (root.value?.contains(document.activeElement)) return
  const target = lastFocused?.isConnected ? lastFocused : questions()[0]?.querySelector<HTMLElement>('[data-primary]')
  target?.focus({ preventScroll: true })
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('focus', onWindowFocus)
  document.addEventListener('focusin', onFocusIn)
  void nextTick(() => {
    focusQuestion(questions()[0])
    body.value?.scrollTo({ top: 0 })   // keep the title in view
  })
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('focus', onWindowFocus)
  document.removeEventListener('focusin', onFocusIn)
})
</script>

<template>
  <article ref="root" class="card" :class="{ withdrawn: !!withdrawn }">
    <header class="meta">
      <span class="source" :title="source">{{ source }}</span>
      <span class="sep">·</span>
      <span>{{ age }}</span>
      <template v-if="remaining !== undefined && !withdrawn">
        <span class="sep">·</span>
        <span :class="{ urgent: remaining < 60_000 }">expires in {{ clock(remaining) }}</span>
      </template>
      <span v-if="position && total" class="position">{{ position }} of {{ total }}</span>
    </header>

    <div v-if="withdrawn" class="banner" role="status">{{ withdrawn }}</div>

    <div ref="body" class="body">
      <h1 v-if="form.title" class="title">{{ form.title }}</h1>
      <JsonForms
        :data="data"
        :schema="form.schema"
        :renderers="renderers"
        :readonly="!!withdrawn"
        validation-mode="ValidateAndHide"
        @change="onChange"
      />
    </div>

    <footer class="actions">
      <template v-if="withdrawn">
        <span class="hints">Nothing was sent.</span>
        <button type="button" class="button primary" @click="emit('continue')">
          Continue <kbd class="key">↵</kbd>
        </button>
      </template>
      <template v-else>
        <p v-if="problems.length" class="missing" :class="{ nudge }">
          <span v-for="problem in problems" :key="problem">{{ problem }}</span>
        </p>
        <div class="buttons">
          <span class="hints">
            <kbd>1</kbd>–<kbd>9</kbd> pick · <kbd>⇥</kbd> next<template v-if="(total ?? 0) > 1"> · <kbd>⌘[</kbd> <kbd>⌘]</kbd> queue</template> · <kbd>esc</kbd> hide
          </span>
          <button type="button" class="button" @click="emit('skip')">
            Skip <kbd class="key">⌘⌫</kbd>
          </button>
          <button type="button" class="button primary" :disabled="!valid" @click="submit">
            Send <kbd class="key">↵</kbd>
          </button>
        </div>
      </template>
    </footer>
  </article>
</template>
