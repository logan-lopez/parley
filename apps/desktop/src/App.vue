<script setup lang="ts">
// The queue of pending asks, one card at a time. After Send or Skip it moves
// to the next ask, and hides the window when none are left. An ask that ends
// under the user (cancelled, timed out, agent gone) stays up with a note
// until they move on.
import { computed, ref, watch } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import AskCard from './card/AskCard.vue'
import ZoomControl from './ZoomControl.vue'
import { sourceLabel } from './asks/source'
import { answer, dismiss, getRecord, queue, type AskRecord } from './asks/store'

const selectedId = ref<string | null>(null)
const shown = computed(() => (selectedId.value ? getRecord(selectedId.value) : undefined))
const position = computed(() => queue.value.findIndex((r) => r.id === selectedId.value) + 1)

// Unsent input per ask, so moving through the queue doesn't lose it.
const drafts = new Map<string, { data?: unknown; note?: string }>()

function draft(id: string, patch: { data?: unknown; note?: string }) {
  drafts.set(id, { ...drafts.get(id), ...patch })
}

watch(
  () => queue.value.map((r) => r.id).join(),
  () => {
    if (!shown.value) selectedId.value = queue.value[0]?.id ?? null
  },
  { immediate: true },
)

const WITHDRAWN: Partial<Record<AskRecord['status'], string>> = {
  cancelled: 'Withdrawn by the agent.',
  timed_out: 'Withdrawn: this question timed out.',
  orphaned: 'The agent disconnected. If it reconnects, this question comes back.',
}
const withdrawn = computed(() => (shown.value ? WITHDRAWN[shown.value.status] : undefined))

// Ended while shown. If nobody's looking, move on without the note.
watch(() => shown.value?.status, async (status, before) => {
  if (before !== 'pending' || !status || status === 'pending') return
  const id = selectedId.value
  if (!(await getCurrentWindow().isVisible()) && selectedId.value === id) advanceFrom(id)
})

function advanceFrom(id: string | null) {
  const pending = queue.value
  const i = pending.findIndex((r) => r.id === id)
  const next = i === -1 ? pending[0] : (pending[i + 1] ?? pending[i - 1])
  selectedId.value = next?.id ?? null
  if (!next) void getCurrentWindow().hide()
}

function step(by: number) {
  if (withdrawn.value) return advanceFrom(selectedId.value)
  const next = queue.value[position.value - 1 + by]
  if (next) selectedId.value = next.id
}

function send(data: unknown, note: string) {
  const id = selectedId.value!
  advanceFrom(id)
  drafts.delete(id)
  answer(id, data, note)
}

function skip(note: string) {
  const id = selectedId.value!
  advanceFrom(id)
  drafts.delete(id)
  dismiss(id, note)
}
</script>

<template>
  <AskCard
    v-if="shown"
    :key="shown.id"
    :form="shown.form"
    :source="sourceLabel(shown.session)"
    :created-at="shown.createdAt"
    :expires-at="shown.expiresAt"
    :position="position || undefined"
    :total="queue.length"
    :withdrawn="withdrawn"
    :initial-data="drafts.get(shown.id)?.data"
    :initial-note="drafts.get(shown.id)?.note"
    @change="draft(shown.id, { data: $event })"
    @note="draft(shown.id, { note: $event })"
    @submit="send"
    @skip="skip"
    @prev="step(-1)"
    @next="step(1)"
    @continue="advanceFrom(shown.id)"
  >
    <template #meta><ZoomControl /></template>
  </AskCard>
  <main v-else class="empty-state">
    <ZoomControl class="corner" />
    <p>Nothing is waiting.</p>
    <p class="hints"><kbd>esc</kbd> hide</p>
  </main>
</template>
