// Every ask the app has seen, keyed by id. Ended records stay: the history
// view is a filter over `records`, not a new store. `persist.ts` is its disk,
// and `hydrate` loads it before the hub starts.

import { computed, reactive, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { CancelReason, FormSpec, SessionInfo } from '@parley/protocol'
import { send, type HubHandlers } from '../hub/client'
import { notifyNewAsk } from './notifications'
import { append, rewrite, type Snapshot } from './persist'

export type AskStatus = 'pending' | 'answered' | 'dismissed' | 'cancelled' | 'timed_out' | 'orphaned'

export interface Draft {
  data?: unknown
  note?: string
}

export interface AskRecord {
  id: string
  conn: number    // 0 for a record loaded from disk until its server re-sends it
  session: SessionInfo
  form: FormSpec
  createdAt: number
  expiresAt?: number
  status: AskStatus
  endedAt?: number
  endedReason?: CancelReason | 'disconnected'
  data?: unknown
  note?: string   // the user's note for the agent, sent with the answer or skip
  draft?: Draft   // unsent input; dropped on answer, kept on a skip or withdrawal
}

const records = reactive(new Map<string, AskRecord>())

export const queue = computed(() =>
  [...records.values()].filter((r) => r.status === 'pending').sort((a, b) => a.createdAt - b.createdAt),
)

// Ended asks, newest first.
export const history = computed(() =>
  [...records.values()].filter((r) => r.status !== 'pending').sort((a, b) => endedAt(b) - endedAt(a)),
)

export function endedAt(record: AskRecord): number {
  return record.endedAt ?? record.createdAt
}

export function getRecord(id: string): AskRecord | undefined {
  return records.get(id)
}

watch(() => queue.value.length, (n) => void invoke('set_pending_count', { n }), { immediate: true })

// Call before the hub starts, so re-sent asks find their records.
export function hydrate(snapshots: Snapshot[]) {
  for (const snapshot of snapshots) records.set(snapshot.id, { ...snapshot, conn: 0 })
}

// Drops every ended record, on disk too. Pending asks stay.
export function clearHistory() {
  for (const record of history.value) records.delete(record.id)
  void rewrite(queue.value)
}

// Saving. A status change saves at once; a draft change waits for a pause.
const DRAFT_DEBOUNCE_MS = 500
const draftTimers = new Map<string, ReturnType<typeof setTimeout>>()

function save(record: AskRecord) {
  clearTimeout(draftTimers.get(record.id))
  draftTimers.delete(record.id)
  append(record)
}

function end(record: AskRecord, patch: Partial<AskRecord>) {
  Object.assign(record, { endedAt: Date.now(), ...patch })
  save(record)
}

export function setDraft(id: string, patch: Draft) {
  const record = records.get(id)
  if (record?.status !== 'pending') return
  const next: Draft = { ...record.draft, ...patch }
  // JSON Forms reports its empty initial data on mount; that's not a draft.
  if (isEmptyObject(next.data)) delete next.data
  if (!next.note) delete next.note
  const before = record.draft ?? {}
  if (next.note === before.note && JSON.stringify(next.data) === JSON.stringify(before.data)) return
  record.draft = next
  clearTimeout(draftTimers.get(id))
  draftTimers.set(id, setTimeout(() => save(record), DRAFT_DEBOUNCE_MS))
}

function isEmptyObject(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !Object.keys(value).length
}

// A reload or quit mid-debounce would lose the last keystrokes.
window.addEventListener('pagehide', () => {
  for (const id of draftTimers.keys()) {
    const record = records.get(id)
    if (record) save(record)
  }
})

export function answer(id: string, data: unknown, note?: string) {
  const record = records.get(id)
  if (record?.status !== 'pending') return
  delete record.draft
  end(record, { status: 'answered', data, ...withNote(note) })
  void send(record.conn, { type: 'answer', id, data, ...withNote(note) })
}

export function dismiss(id: string, note?: string) {
  const record = records.get(id)
  if (record?.status !== 'pending') return
  end(record, { status: 'dismissed', ...withNote(note) })
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
      const record = records.get(ask.id)!
      save(record)
      void notifyNewAsk(record)
      return
    }

    // A re-send after a reconnect, or after a restart. It may land on a new connection.
    Object.assign(existing, { ...ask, conn, session })
    if (existing.status === 'orphaned') {
      existing.status = 'pending'
      delete existing.endedReason
      delete existing.endedAt
      save(existing)
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
      end(record, { status: reason === 'timed_out' ? 'timed_out' : 'cancelled', endedReason: reason })
    }
    return true
  },

  disconnected(conn) {
    for (const record of records.values()) {
      if (record.conn === conn && record.status === 'pending') {
        end(record, { status: 'orphaned', endedReason: 'disconnected' })
      }
    }
  },
}
