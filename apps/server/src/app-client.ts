// Connection from this server instance to the desktop app's hub.
// One app, many server instances (one per agent session).

import type { AppToServer, ServerToApp } from '@parley/protocol'

export interface AppClient {
  send(message: ServerToApp): void
  onMessage(handler: (message: AppToServer) => void): void
}

export async function connectToApp(): Promise<AppClient> {
  // TODO: pick the transport (see packages/protocol/src/wire.ts), connect,
  // and decide what happens when the app isn't running.
  throw new Error('connectToApp: not implemented')
}
