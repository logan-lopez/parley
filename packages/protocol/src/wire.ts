// Messages between a server instance and the app hub, protocol v1.
// Framing: newline-delimited JSON over a unix socket, one object per line,
// UTF-8. Either side closes the connection if a line goes over 1 MiB.
// One connection = one server process = one session; `hello` comes first.

import type { FormSpec } from './form.ts'

export const PROTOCOL_VERSION = 1
export const APP_IDENTIFIER = 'com.loganlopez.parley'
export const SOCKET_FILENAME = 'hub.sock'
export const MAX_LINE_BYTES = 1024 * 1024

export interface SessionInfo {
  id: string                                            // random per server process
  client: { name: string; version?: string } | null     // from the MCP client
  cwd: string
  pid: number
}

export type CancelReason = 'client_cancelled' | 'timed_out'

export type ServerToApp =
  | { type: 'hello'; protocol: number; session: SessionInfo }
  // Idempotent by id: re-sending the same id updates the record (reconnect relies on it).
  // `inline`: the client also shows this ask in the chat. The app queues it but doesn't notify.
  | { type: 'ask'; id: string; form: FormSpec; createdAt: number; expiresAt?: number; inline?: boolean }
  | { type: 'cancel'; id: string; reason: CancelReason }
  // The user answered or skipped in the chat. The app ends the record with this outcome.
  | { type: 'resolved'; id: string; outcome: InlineOutcome }

export type InlineOutcome =
  | { status: 'answered'; data: unknown; note?: string }
  | { status: 'dismissed'; note?: string }

export type AppToServer =
  | { type: 'welcome'; protocol: number; appVersion: string }
  // `note`: optional free text the user added for the agent, with an answer or a skip.
  | { type: 'answer'; id: string; data: unknown; note?: string }
  | { type: 'dismissed'; id: string; note?: string }
  | { type: 'error'; id?: string; code: 'version_mismatch' | 'invalid_message' | 'unknown_ask'; message: string }
