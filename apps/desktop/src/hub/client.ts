// The webview end of the socket hub. Rust forwards each NDJSON line as a
// `hub:message` event tagged with its connection id; this module owns the
// handshake and hands asks and cancels to whoever started it.

import { getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  PROTOCOL_VERSION,
  type AppToServer,
  type CancelReason,
  type FormSpec,
  type InlineOutcome,
  type SessionInfo,
} from '@parley/protocol'

export interface IncomingAsk {
  id: string
  form: FormSpec
  createdAt: number
  expiresAt?: number
  inline?: boolean   // also shown in the chat, so it doesn't notify
}

export interface HubHandlers {
  ask(conn: number, session: SessionInfo, ask: IncomingAsk): void
  cancel(conn: number, id: string, reason: CancelReason): boolean // false if unknown
  resolved(conn: number, id: string, outcome: InlineOutcome): boolean // false if unknown
  disconnected(conn: number): void
}

// Sessions by connection, set once `hello` checks out.
const sessions = new Map<number, SessionInfo>()

export async function send(conn: number, message: AppToServer): Promise<void> {
  try {
    await invoke('hub_send', { conn, message })
  } catch (error) {
    // The connection is gone. The server re-sends its pending asks when it reconnects.
    console.warn(`hub_send to ${conn} failed:`, error)
  }
}

function close(conn: number) {
  void invoke('hub_close', { conn })
}

export async function startHub(handlers: HubHandlers) {
  const appVersion = await getVersion()
  const fail = (conn: number, code: 'invalid_message' | 'unknown_ask', message: string, id?: string) =>
    send(conn, { type: 'error', code, message, ...(id && { id }) })

  await listen<{ conn: number; message: unknown }>('hub:message', ({ payload: { conn, message } }) => {
    if (!isObject(message) || typeof message.type !== 'string') {
      return void fail(conn, 'invalid_message', 'expected an object with a string `type`')
    }

    if (message.type === 'hello') {
      if (message.protocol !== PROTOCOL_VERSION) {
        void send(conn, {
          type: 'error',
          code: 'version_mismatch',
          message: `app speaks protocol ${PROTOCOL_VERSION}, server sent ${String(message.protocol)}`,
        }).then(() => close(conn))
        return
      }
      if (!isSession(message.session)) return void fail(conn, 'invalid_message', 'hello needs a valid `session`')
      sessions.set(conn, message.session)
      return void send(conn, { type: 'welcome', protocol: PROTOCOL_VERSION, appVersion })
    }

    const id = typeof message.id === 'string' ? message.id : undefined
    const session = sessions.get(conn)
    if (!session) return void fail(conn, 'invalid_message', 'the first message must be `hello`', id)

    switch (message.type) {
      case 'ask': {
        const form = message.form
        if (!id || !isObject(form) || !isObject(form.schema) || typeof message.createdAt !== 'number') {
          return void fail(conn, 'invalid_message', 'ask needs `id`, `form.schema` and `createdAt`', id)
        }
        handlers.ask(conn, session, {
          id,
          form: form as unknown as FormSpec,
          createdAt: message.createdAt,
          ...(typeof message.expiresAt === 'number' && { expiresAt: message.expiresAt }),
          ...(message.inline === true && { inline: true }),
        })
        return
      }
      case 'cancel': {
        const reason = message.reason
        if (!id || (reason !== 'client_cancelled' && reason !== 'timed_out')) {
          return void fail(conn, 'invalid_message', 'cancel needs `id` and a known `reason`', id)
        }
        if (!handlers.cancel(conn, id, reason)) void fail(conn, 'unknown_ask', `no pending ask ${id}`, id)
        return
      }
      case 'resolved': {
        const outcome = inlineOutcome(message.outcome)
        if (!id || !outcome) {
          return void fail(conn, 'invalid_message', 'resolved needs `id` and an `outcome` that is answered (with `data`) or dismissed', id)
        }
        if (!handlers.resolved(conn, id, outcome)) void fail(conn, 'unknown_ask', `no pending ask ${id}`, id)
        return
      }
      default:
        return void fail(conn, 'invalid_message', `unknown message type ${message.type}`, id)
    }
  })

  await listen<{ conn: number }>('hub:disconnected', ({ payload: { conn } }) => {
    sessions.delete(conn)
    handlers.disconnected(conn)
  })

  // Only now does Rust release what it buffered while the page loaded.
  await invoke('hub_ready')
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Undefined when it isn't one. A note that isn't a string is dropped, as on `answer`.
function inlineOutcome(value: unknown): InlineOutcome | undefined {
  if (!isObject(value)) return undefined
  const note = typeof value.note === 'string' ? { note: value.note } : {}
  if (value.status === 'answered' && 'data' in value) return { status: 'answered', data: value.data, ...note }
  if (value.status === 'dismissed') return { status: 'dismissed', ...note }
  return undefined
}

function isSession(value: unknown): value is SessionInfo {
  if (!isObject(value)) return false
  const { id, client, cwd, pid } = value
  return typeof id === 'string'
    && typeof cwd === 'string'
    && typeof pid === 'number'
    && (client === null || (isObject(client) && typeof client.name === 'string'))
}
