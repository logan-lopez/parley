// Computed filters over the store's ended records. The filter state lives
// here, not in the view, so it survives a trip back to the queue.

import { reactive } from 'vue'
import { endedAt, type AskRecord, type AskStatus } from '../asks/store'
import { sourceLabel } from '../asks/source'

export type StatusGroup = 'answered' | 'skipped' | 'withdrawn'

export const filters = reactive({
  status: null as StatusGroup | null,
  hasNote: false,
  text: '',
})

export const STATUS: Record<Exclude<AskStatus, 'pending'>, { label: string; group: StatusGroup }> = {
  answered: { label: 'Answered', group: 'answered' },
  dismissed: { label: 'Skipped', group: 'skipped' },
  cancelled: { label: 'Withdrawn', group: 'withdrawn' },
  timed_out: { label: 'Timed out', group: 'withdrawn' },
  orphaned: { label: 'Disconnected', group: 'withdrawn' },
}

export function statusOf(record: AskRecord) {
  return STATUS[record.status as Exclude<AskStatus, 'pending'>]
}

// What the user wrote for the agent: the sent note, or the unsent one.
export function noteOf(record: AskRecord): string | undefined {
  return record.note ?? record.draft?.note
}

// The form title, or the first question's header.
export function titleOf(record: AskRecord): string {
  if (record.form.title) return record.form.title
  const properties = (record.form.schema.properties ?? {}) as Record<string, { title?: string }>
  return Object.values(properties)[0]?.title ?? 'Untitled'
}

export function apply(records: AskRecord[]): AskRecord[] {
  const words = filters.text.toLowerCase().split(/\s+/).filter(Boolean)
  return records.filter((r) =>
    (!filters.status || statusOf(r)?.group === filters.status)
    && (!filters.hasNote || !!noteOf(r))
    && (!words.length || words.every((w) => haystack(r).includes(w))),
  )
}

// Titles, headers, answers (or the draft) and notes, lowercased. An ended
// record only changes if it's revived and ends again, so it's cached per end.
const haystacks = new WeakMap<AskRecord, { at: number; text: string }>()

function haystack(record: AskRecord): string {
  const cached = haystacks.get(record)
  if (cached?.at === endedAt(record)) return cached.text
  const properties = (record.form.schema.properties ?? {}) as Record<string, { title?: string; description?: string }>
  const parts = [record.form.title, sourceLabel(record.session), noteOf(record)]
  for (const p of Object.values(properties)) parts.push(p.title, p.description)
  collect(record.data ?? record.draft?.data, parts)
  const text = parts.filter(Boolean).join('\n').toLowerCase()
  haystacks.set(record, { at: endedAt(record), text })
  return text
}

function collect(value: unknown, into: (string | undefined)[]) {
  if (value === null || value === undefined) return
  if (typeof value === 'object') {
    for (const v of Object.values(value)) collect(v, into)
  } else {
    into.push(String(value))
  }
}

// Newest first, grouped by local day.
export function byDay(records: AskRecord[], now = Date.now()): { label: string; records: AskRecord[] }[] {
  const groups: { label: string; records: AskRecord[] }[] = []
  for (const record of records) {
    const label = dayLabel(endedAt(record), now)
    const last = groups[groups.length - 1]
    if (last?.label === label) last.records.push(record)
    else groups.push({ label, records: [record] })
  }
  return groups
}

function dayLabel(ms: number, now: number): string {
  const day = (t: number) => new Date(t).toDateString()
  if (day(ms) === day(now)) return 'Today'
  if (day(ms) === day(now - 86_400_000)) return 'Yesterday'
  const date = new Date(ms)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(!sameYear && { year: 'numeric' }) })
}

export function timeOf(record: AskRecord): string {
  return new Date(endedAt(record)).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
