// Every ask the app has seen, keyed by id. Ended records stay: a history or
// inbox view later is a filter over `records`, not a new store.

import { computed, reactive, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { CancelReason, FormSpec, SessionInfo } from '@parley/protocol'
import { send, type HubHandlers } from '../hub/client'
import { notifyNewAsk } from './notifications'

export type AskStatus = 'pending' | 'answered' | 'dismissed' | 'cancelled' | 'timed_out' | 'orphaned'

export interface AskRecord {
  id: string
  conn: number
  session: SessionInfo
  form: FormSpec
  createdAt: number
  expiresAt?: number
  status: AskStatus
  endedReason?: CancelReason | 'disconnected'
  data?: unknown
  note?: string   // the user's note for the agent, sent with the answer or skip
}

const records = reactive(new Map<string, AskRecord>())

export const queue = computed(() =>
  [...records.values()].filter((r) => r.status === 'pending').sort((a, b) => a.createdAt - b.createdAt),
)

export function getRecord(id: string): AskRecord | undefined {
  return records.get(id)
}

watch(() => queue.value.length, (n) => void invoke('set_pending_count', { n }), { immediate: true })

export function answer(id: string, data: unknown, note?: string) {
  const record = records.get(id)
  if (record?.status !== 'pending') return
  Object.assign(record, { status: 'answered', data, ...withNote(note) })
  void send(record.conn, { type: 'answer', id, data, ...withNote(note) })
}

export function dismiss(id: string, note?: string) {
  const record = records.get(id)
  if (record?.status !== 'pending') return
  Object.assign(record, { status: 'dismissed', ...withNote(note) })
  void send(record.conn, { type: 'dismissed', id, ...withNote(note) })
}

function withNote(note: string | undefined): { note?: string } {
  return note?.trim() ? { note: note.trim() } : {}
}

export const hubHandlers: HubHandlers = {
  ask(conn, session, ask) {
    const existing = records.get(ask.id)
    if (!existing) {
      records.set(ask.id, { ...ask, conn, session, status: 'pending' })
      void notifyNewAsk(records.get(ask.id)!)
      return
    }

    // A re-send after a reconnect. It may land on a new connection.
    Object.assign(existing, { ...ask, conn, session })
    if (existing.status === 'orphaned') {
      existing.status = 'pending'
      delete existing.endedReason
    } else if (existing.status === 'answered') {
      // The answer was sent into a connection that had just died.
      void send(conn, { type: 'answer', id: ask.id, data: existing.data, ...withNote(existing.note) })
    } else if (existing.status === 'dismissed') {
      void send(conn, { type: 'dismissed', id: ask.id, ...withNote(existing.note) })
    }
  },

  cancel(conn, id, reason) {
    const record = records.get(id)
    if (!record || record.conn !== conn) return false
    if (record.status === 'pending' || record.status === 'orphaned') {
      record.status = reason === 'timed_out' ? 'timed_out' : 'cancelled'
      record.endedReason = reason
    }
    return true
  },

  disconnected(conn) {
    for (const record of records.values()) {
      if (record.conn === conn && record.status === 'pending') {
        record.status = 'orphaned'
        record.endedReason = 'disconnected'
      }
    }
  },
}
