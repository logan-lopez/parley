// Messages between a server instance and the app hub.
// First guess, mirroring the tool list in the project doc.
// TODO: transport (localhost WebSocket vs unix socket) is undecided.

import type { FormSpec } from './form.ts'

export type ServerToApp =
  | { type: 'ask'; id: string; form: FormSpec; timeoutMs?: number }
  | { type: 'cancel'; id: string }
  | { type: 'notify'; message: string }

export type AppToServer =
  | { type: 'answer'; id: string; data: unknown; summary: string }
  | { type: 'dismissed'; id: string }
