// The store's disk: one JSONL file, `$APPDATA/history.jsonl`. Every line is a
// snapshot of one record, and the last line for an id wins. Appends are cheap,
// and a half-written last line after a crash loses only that line. At startup
// the file is folded to one line per id and rewritten.
//
// Writes never block the UI or break the ask flow: a failed write is logged,
// and `saveFailing` tells the history view to say so.

import { ref } from 'vue'
import { BaseDirectory, readTextFile, rename, writeTextFile } from '@tauri-apps/plugin-fs'
import type { AskRecord } from './store'

// `conn` is per-connection runtime state; it isn't saved.
export type Snapshot = Omit<AskRecord, 'conn'>

const FILE = 'history.jsonl'
const TEMP = 'history.jsonl.tmp'   // both are scoped in capabilities/default.json
const opts = { baseDir: BaseDirectory.AppData }

export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000

export const saveFailing = ref(false)

// The last line per id, minus records that ended over 30 days ago. A record
// still pending lost its server with the last run, so it comes back orphaned:
// the store revives it if the server re-sends within its reconnect window.
export function fold(text: string, now: number): { records: Snapshot[]; bad: number } {
  const byId = new Map<string, Snapshot>()
  let bad = 0
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      bad++
      continue
    }
    if (!isSnapshotLine(parsed)) {
      bad++
      continue
    }
    const { v: _v, ...snapshot } = parsed
    byId.delete(snapshot.id)   // re-insert, so the map keeps last-write order
    byId.set(snapshot.id, snapshot)
  }

  const records: Snapshot[] = []
  for (const record of byId.values()) {
    if (record.status === 'pending') {
      Object.assign(record, { status: 'orphaned', endedReason: 'disconnected', endedAt: now })
    }
    if (now - (record.endedAt ?? record.createdAt) > RETENTION_MS) continue
    records.push(record)
  }
  return { records, bad }
}

function isSnapshotLine(value: unknown): value is Snapshot & { v: 1 } {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return r.v === 1
    && typeof r.id === 'string'
    && typeof r.status === 'string'
    && typeof r.createdAt === 'number'
    && typeof r.form === 'object' && r.form !== null
    && typeof r.session === 'object' && r.session !== null
}

function line(record: Snapshot | AskRecord): string {
  const { conn: _conn, ...snapshot } = record as AskRecord
  return JSON.stringify({ v: 1, ...snapshot }) + '\n'
}

// Reads and compacts the file, and returns what to hydrate the store with.
// Never throws: an unreadable file starts an empty history.
export async function load(now = Date.now()): Promise<Snapshot[]> {
  let text = ''
  try {
    text = await readTextFile(FILE, opts)
  } catch (error) {
    // Missing on the first run; anything else means history starts empty.
    if (!/not found|no such file/i.test(String(error))) fail('read', error)
  }
  const { records, bad } = fold(text, now)
  if (bad) console.warn(`history: skipped ${bad} unreadable line(s)`)
  await rewrite(records)
  return records
}

// Writes go one at a time, in order. Appends made while one is in flight are
// batched into the next write, and never into one queued before a rewrite.
let tail: Promise<void> = Promise.resolve()
let batch: string[] | null = null

export function append(record: Snapshot | AskRecord) {
  if (!batch) {
    const lines: string[] = (batch = [])
    tail = tail.then(() => {
      if (batch === lines) batch = null
      return write('append', () => writeTextFile(FILE, lines.join(''), { ...opts, append: true }))
    })
  }
  batch.push(line(record))
}

// Replaces the whole file, through a temp file so a crash can't leave it half-written.
export function rewrite(records: (Snapshot | AskRecord)[]): Promise<void> {
  const text = records.map(line).join('')
  batch = null
  tail = tail.then(() =>
    write('rewrite', async () => {
      await writeTextFile(TEMP, text, opts)
      await rename(TEMP, FILE, { oldPathBaseDir: BaseDirectory.AppData, newPathBaseDir: BaseDirectory.AppData })
    }),
  )
  return tail
}

async function write(what: string, op: () => Promise<void>) {
  try {
    await op()
    saveFailing.value = false
  } catch (error) {
    fail(what, error)
  }
}

function fail(what: string, error: unknown) {
  saveFailing.value = true
  console.warn(`history: ${what} failed:`, error)
}
