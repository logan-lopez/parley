<script setup lang="ts">
// One ended ask, read-only: the card as it was answered, or as far as it got.
import { computed } from 'vue'
import AskCard from '../card/AskCard.vue'
import ZoomControl from '../ZoomControl.vue'
import { sourceLabel } from '../asks/source'
import type { AskRecord } from '../asks/store'
import { noteOf, statusOf, timeOf } from './filter'

const props = defineProps<{ record: AskRecord }>()
const emit = defineEmits<{ back: [] }>()

const status = computed(() => statusOf(props.record))
const answered = computed(() => props.record.status === 'answered')

const sent = computed(() => {
  const r = props.record
  if (r.answeredIn === 'chat') {
    const line = r.status === 'answered' ? 'Answered in the chat' : 'Skipped in the chat'
    return `${line}${r.note ? ', with a note' : ''}.`
  }
  if (r.status === 'answered') return r.note ? 'Sent with a note.' : 'Sent.'
  const draft = r.draft?.data !== undefined ? ' This is what you had typed.' : ''
  if (r.status === 'dismissed') return (r.note ? 'Only the note was sent.' : 'Nothing was sent.') + draft
  return 'Nothing was sent.' + draft
})
</script>

<template>
  <div class="history-detail">
    <div class="detail-strip">
      <button type="button" class="link-button" @click="emit('back')">← History</button>
      <span class="status-chip" :class="status?.group">{{ status?.label }}</span>
      <span class="detail-time">{{ timeOf(record) }}</span>
      <span class="detail-sent">{{ sent }}</span>
    </div>
    <AskCard
      :key="record.id"
      readonly
      :form="record.form"
      :source="sourceLabel(record.session)"
      :created-at="record.createdAt"
      :initial-data="answered ? record.data : record.draft?.data"
      :initial-note="noteOf(record)"
    >
      <template #meta><ZoomControl /></template>
      <template #footer>
        <span class="hints"><kbd>↑</kbd> <kbd>↓</kbd> scroll · <kbd>esc</kbd> back to the list · <kbd>⌘Y</kbd> queue</span>
      </template>
    </AskCard>
  </div>
</template>
