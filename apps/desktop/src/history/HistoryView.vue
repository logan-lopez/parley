<script setup lang="ts">
// Ended asks, newest first, grouped by day. Pending asks aren't here: they're
// the queue. Esc here goes back (detail → list → queue); it never hides.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ZoomControl from '../ZoomControl.vue'
import { sourceLabel } from '../asks/source'
import { clearHistory, getRecord, history, queue } from '../asks/store'
import { saveFailing } from '../asks/persist'
import HistoryDetail from './HistoryDetail.vue'
import { apply, byDay, filters, noteOf, statusOf, timeOf, titleOf, type StatusGroup } from './filter'

const emit = defineEmits<{ back: [] }>()

const shown = computed(() => apply(history.value))
const groups = computed(() => byDay(shown.value))
const indexById = computed(() => new Map(shown.value.map((r, i) => [r.id, i])))

const selectedId = ref<string | null>(null)
const openId = ref<string | null>(null)
const opened = computed(() => (openId.value ? getRecord(openId.value) : undefined))
const confirming = ref(false)

const list = ref<HTMLElement>()
const filterInput = ref<HTMLInputElement>()
const clearButton = ref<HTMLButtonElement>()

// Keep a selection while the filtered list changes under it.
watch(shown, (records) => {
  if (!records.some((r) => r.id === selectedId.value)) selectedId.value = records[0]?.id ?? null
}, { immediate: true })

const STATUSES: { value: StatusGroup | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'answered', label: 'Answered' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'withdrawn', label: 'Withdrawn' },
]

function move(by: number) {
  const records = shown.value
  if (!records.length) return
  const i = indexById.value.get(selectedId.value ?? '') ?? -1
  const next = records[Math.max(0, Math.min(records.length - 1, i + by))]
  selectedId.value = next.id
  void nextTick(() => list.value?.querySelector(`[data-id="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: 'nearest' }))
}

function open(id: string | null) {
  if (!id) return
  selectedId.value = id
  openId.value = id
}

async function close() {
  const id = openId.value
  openId.value = null
  await nextTick()
  list.value?.focus({ preventScroll: true })
  if (id) list.value?.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' })
}

async function askClear() {
  confirming.value = true
  await nextTick()
  clearButton.value?.focus()
}

function cancelClear() {
  confirming.value = false
  list.value?.focus({ preventScroll: true })
}

function confirmClear() {
  clearHistory()
  cancelClear()
}

function onKey(event: KeyboardEvent) {
  const mod = event.metaKey || event.ctrlKey || event.altKey
  const typing = document.activeElement === filterInput.value

  if (event.key === 'Escape') {
    event.preventDefault()
    if (confirming.value) return cancelClear()
    if (opened.value) return void close()
    if (typing) return list.value?.focus({ preventScroll: true })
    return emit('back')
  }
  if (opened.value || confirming.value || mod) return

  if (event.key === 'ArrowDown' || (event.key === 'j' && !typing)) return void (event.preventDefault(), move(1))
  if (event.key === 'ArrowUp' || (event.key === 'k' && !typing)) return void (event.preventDefault(), move(-1))
  if (event.key === '/' && !typing) return void (event.preventDefault(), filterInput.value?.focus())
  if (event.key === 'Enter') {
    // A focused chip or button keeps its own Enter.
    if ((event.target as Element | null)?.matches('button')) return
    event.preventDefault()
    open(selectedId.value)
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  list.value?.focus({ preventScroll: true })
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <HistoryDetail v-if="opened" :record="opened" @back="close" />
  <section v-else class="history">
    <header class="meta">
      <span class="history-title">History</span>
      <span v-if="saveFailing" class="not-saving" title="Writing history.jsonl failed. Asks still work; see the console for the error.">
        · not being saved
      </span>
      <span class="meta-end">
        <ZoomControl />
        <button v-if="queue.length" type="button" class="waiting" @click="emit('back')">
          {{ queue.length }} waiting <kbd>⌘Y</kbd>
        </button>
      </span>
    </header>

    <div class="history-tools">
      <input
        ref="filterInput"
        v-model="filters.text"
        class="text-input filter-input"
        type="search"
        placeholder="Filter titles, answers and notes"
        aria-label="Filter"
      >
      <div class="filter-row">
        <button
          v-for="s in STATUSES"
          :key="s.label"
          type="button"
          class="filter-chip"
          :aria-pressed="filters.status === s.value"
          @click="filters.status = s.value"
        >{{ s.label }}</button>
        <button type="button" class="filter-chip" :aria-pressed="filters.hasNote" @click="filters.hasNote = !filters.hasNote">
          Has a note
        </button>
      </div>
    </div>

    <div ref="list" class="history-list" tabindex="-1" role="listbox" aria-label="History" :aria-activedescendant="selectedId ? `row-${selectedId}` : undefined">
      <p v-if="!history.length" class="history-empty">Nothing yet. Answered, skipped and withdrawn asks land here.</p>
      <p v-else-if="!shown.length" class="history-empty">Nothing matches.</p>
      <template v-for="group in groups" :key="group.label">
        <h2 class="day">{{ group.label }}</h2>
        <div
          v-for="record in group.records"
          :id="`row-${record.id}`"
          :key="record.id"
          :data-id="record.id"
          class="row"
          role="option"
          :aria-selected="record.id === selectedId"
          @click="open(record.id)"
        >
          <span class="row-source">{{ sourceLabel(record.session) }}</span>
          <span class="row-time">{{ timeOf(record) }}</span>
          <span class="row-title">{{ titleOf(record) }}</span>
          <span class="row-end">
            <span v-if="noteOf(record)" class="note-mark" title="Has a note">✎</span>
            <span class="status-chip" :class="statusOf(record)?.group">{{ statusOf(record)?.label }}</span>
          </span>
        </div>
      </template>
    </div>

    <footer class="actions">
      <div v-if="confirming" class="buttons">
        <span class="hints confirm-text">Clear {{ history.length }} ended {{ history.length === 1 ? 'ask' : 'asks' }}? Waiting ones stay.</span>
        <button type="button" class="button" @click="cancelClear">Cancel <kbd class="key">esc</kbd></button>
        <button ref="clearButton" type="button" class="button danger" @click="confirmClear">Clear <kbd class="key">↵</kbd></button>
      </div>
      <div v-else class="buttons">
        <span class="hints">
          <kbd>↑</kbd><kbd>↓</kbd> move · <kbd>↵</kbd> open · <kbd>/</kbd> filter · <kbd>esc</kbd> back to the queue
        </span>
        <button type="button" class="button" :disabled="!history.length" @click="askClear">Clear…</button>
      </div>
    </footer>
  </section>
</template>
