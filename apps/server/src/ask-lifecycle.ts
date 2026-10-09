// The helper tool handlers call to put a form in front of the user and wait.
// Wires MCP cancellation into the app client and keeps the client's idle
// timer alive with progress notifications.

import { CLIENT_INFO_META_KEY, type McpServer, type ServerContext } from '@modelcontextprotocol/server'
import type { FormSpec, SessionInfo } from '@parley/protocol'
import { getAppClient, type AskOutcome } from './app-client.ts'

const PROGRESS_INTERVAL_MS = 15_000

let server: McpServer | undefined

// Lets runAsk read the client's identity from the initialize handshake.
export function bindServer(mcp: McpServer) {
  server = mcp
}

export async function runAsk(ctx: ServerContext, form: FormSpec, timeoutMs: number): Promise<AskOutcome> {
  const token = ctx.mcpReq._meta?.progressToken
  const started = Date.now()
  let progress = 0
  const ticker = token === undefined ? undefined : setInterval(() => {
    // Progress must strictly increase.
    progress = Math.max(progress + 1, Math.round((Date.now() - started) / 1000))
    ctx.mcpReq
      .notify({
        method: 'notifications/progress',
        params: { progressToken: token, progress, message: 'Waiting for the user…' },
      })
      .catch((error) => console.error('[parley] progress notification failed:', error))
  }, PROGRESS_INTERVAL_MS)

  try {
    return await getAppClient().ask(form, { timeoutMs, signal: ctx.mcpReq.signal, client: clientInfo(ctx) })
  } finally {
    clearInterval(ticker)
  }
}

// 2025-era clients send their identity in `initialize`. The 2026-07-28 era
// carries it per request in the `_meta` envelope; SDK 2.3.1 backfills
// getClientVersion() from that too, so the envelope read is a fallback.
function clientInfo(ctx: ServerContext): SessionInfo['client'] {
  const info = server?.server.getClientVersion()
    ?? (ctx.mcpReq.envelope as Record<string, { name?: unknown; version?: unknown }> | undefined)?.[CLIENT_INFO_META_KEY]
  if (!info || typeof info.name !== 'string') return null
  return { name: info.name, ...(typeof info.version === 'string' && { version: info.version }) }
}
