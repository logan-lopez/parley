import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppToServer, ServerToApp } from '@parley/protocol'

// The hub client and the store together, with Tauri faked: messages go in
// through the `hub:message` listener, and replies come out of `hub_send`.
const tauri = vi.hoisted(() => {
  // store.ts flushes drafts on `pagehide`.
  ;(globalThis as { window?: unknown }).window = { addEventListener() {} }
  return {
    listeners: new Map<string, (event: { payload: unknown }) => void>(),
    sent: [] as { conn: number; message: AppToServer }[],
  }
})

vi.mock('@tauri-apps/api/app', () => ({ getVersion: async () => 'test' }))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (command: string, args: { conn: number; message: AppToServer }) => {
    if (command === 'hub_send') tauri.sent.push(args)
  },
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (event: string, handler: (event: { payload: unknown }) => void) => {
    tauri.listeners.set(event, handler)
  },
}))
vi.mock('./notifications', () => ({ notifyNewAsk: vi.fn(async () => {}) }))
vi.mock('./persist', () => ({ append: vi.fn(), rewrite: vi.fn(async () => {}) }))

const { startHub } = await import('../hub/client')
const { answer, getRecord, hubHandlers } = await import('./store')
const { notifyNewAsk } = await import('./notifications')

const CONN = 7
let nextId = 0

function deliver(message: ServerToApp | Record<string, unknown>, conn = CONN) {
  tauri.listeners.get('hub:message')!({ payload: { conn, message } })
}

function ask(extra: Record<string, unknown> = {}): string {
  const id = `ask-${++nextId}`
  deliver({ type: 'ask', id, form: { schema: { type: 'object', properties: {} } }, createdAt: Date.now(), ...extra })
  return id
}

beforeAll(async () => {
  await startHub(hubHandlers)
  deliver({ type: 'hello', protocol: 1, session: { id: 's', client: { name: 'claude-ai' }, cwd: '/tmp/p', pid: 1 } })
})

beforeEach(() => {
  tauri.sent.length = 0
  vi.mocked(notifyNewAsk).mockClear()
})

describe('resolved', () => {
  it('ends a pending ask as answered in the chat, with the data and note', () => {
    const id = ask({ inline: true })
    deliver({ type: 'resolved', id, outcome: { status: 'answered', data: { q: 'yes' }, note: ' ok ' } })
    expect(getRecord(id)).toMatchObject({ status: 'answered', answeredIn: 'chat', data: { q: 'yes' }, note: 'ok' })
    expect(getRecord(id)!.endedAt).toBeTypeOf('number')
    // Nothing goes back: the server already has the answer.
    expect(tauri.sent).toEqual([])
  })

  it('ends a pending ask as skipped in the chat', () => {
    const id = ask({ inline: true })
    deliver({ type: 'resolved', id, outcome: { status: 'dismissed' } })
    expect(getRecord(id)).toMatchObject({ status: 'dismissed', answeredIn: 'chat' })
    expect(getRecord(id)).not.toHaveProperty('note')
  })

  it('ends an orphaned ask too', () => {
    const id = ask({ inline: true })
    hubHandlers.disconnected(CONN)
    expect(getRecord(id)!.status).toBe('orphaned')
    deliver({ type: 'resolved', id, outcome: { status: 'answered', data: { q: 1 } } })
    expect(getRecord(id)).toMatchObject({ status: 'answered', answeredIn: 'chat' })
    expect(getRecord(id)).not.toHaveProperty('endedReason')
  })

  it("replaces an answer from the window that lost the race", () => {
    const id = ask({ inline: true })
    answer(id, { q: 'window' }, 'from here')
    deliver({ type: 'resolved', id, outcome: { status: 'answered', data: { q: 'chat' } } })
    expect(getRecord(id)).toMatchObject({ status: 'answered', answeredIn: 'chat', data: { q: 'chat' } })
    expect(getRecord(id)).not.toHaveProperty('note')
  })

  it('answers an unknown id with unknown_ask', () => {
    deliver({ type: 'resolved', id: 'nope', outcome: { status: 'dismissed' } })
    expect(tauri.sent).toEqual([
      { conn: CONN, message: expect.objectContaining({ type: 'error', code: 'unknown_ask', id: 'nope' }) },
    ])
  })

  it("answers another connection's ask with unknown_ask", () => {
    const id = ask()
    deliver({ type: 'resolved', id, outcome: { status: 'dismissed' } }, CONN + 1)
    expect(tauri.sent[0]?.message).toMatchObject({ type: 'error' })
    expect(getRecord(id)!.status).toBe('pending')
  })

  it('rejects a malformed outcome as invalid_message', () => {
    const id = ask()
    deliver({ type: 'resolved', id, outcome: { status: 'answered' } })   // no data
    deliver({ type: 'resolved', id, outcome: { status: 'cancelled' } })
    expect(tauri.sent.map((s) => (s.message as { code?: string }).code)).toEqual(['invalid_message', 'invalid_message'])
    expect(getRecord(id)!.status).toBe('pending')
  })
})

describe('inline asks', () => {
  it("don't notify", () => {
    const id = ask({ inline: true })
    expect(getRecord(id)!.inline).toBe(true)
    expect(notifyNewAsk).not.toHaveBeenCalled()
  })

  it('others still do', () => {
    const id = ask()
    expect(getRecord(id)).not.toHaveProperty('inline')
    expect(notifyNewAsk).toHaveBeenCalledOnce()
  })
})
