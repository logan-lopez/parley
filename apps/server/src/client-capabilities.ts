// What the client can do, read before the server is built. The SDK won't
// register a capability after connect, and whether to register the MCP Apps
// card (a resource) depends on what the client advertises. So the first line
// on stdin is read here, then replayed into the transport.
//
// This is stdio-only and first-message-only: one process serves one client,
// and its first message says who it is. An HTTP transport would see many
// clients, with capabilities on each request, and would need per-request
// detection instead.

import { PassThrough, type Readable } from 'node:stream'
import { getUiCapability, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import type { ClientCapabilities } from '@modelcontextprotocol/server'

export interface FirstMessage {
  stdin: Readable           // hand this to the transport, not process.stdin
  method?: string
  capabilities?: ClientCapabilities
  clientInfo?: { name?: string; version?: string }
}

interface Params {
  capabilities?: ClientCapabilities
  clientInfo?: FirstMessage['clientInfo']
  _meta?: Record<string, unknown>
}

export async function peekFirstMessage(stdin: Readable): Promise<FirstMessage> {
  const chunks: Buffer[] = []
  const first = await new Promise<string | undefined>((resolve) => {
    const onData = (chunk: Buffer) => {
      chunks.push(chunk)
      const all = Buffer.concat(chunks)
      const newline = all.indexOf(10)
      if (newline !== -1) done(all.subarray(0, newline).toString('utf8'))
    }
    const onEnd = () => done(undefined)
    const done = (line: string | undefined) => {
      stdin.off('data', onData)
      stdin.off('end', onEnd)
      stdin.pause()
      resolve(line)
    }
    stdin.on('data', onData)
    stdin.once('end', onEnd)
  })

  const replay = new PassThrough()
  replay.write(Buffer.concat(chunks))
  if (first === undefined) replay.end()
  else stdin.pipe(replay)

  // 2025-era clients (Claude Desktop) open with `initialize`. The 2026-07-28
  // era (Claude Code) opens with `server/discover` and carries capabilities and
  // client info in each request's `_meta` envelope.
  try {
    const message = JSON.parse(first ?? '') as { method?: string; params?: Params }
    const params = message.params
    const envelope = params?._meta ?? {}
    return {
      stdin: replay,
      method: message.method,
      capabilities: params?.capabilities
        ?? (envelope['io.modelcontextprotocol/clientCapabilities'] as ClientCapabilities | undefined),
      clientInfo: params?.clientInfo
        ?? (envelope['io.modelcontextprotocol/clientInfo'] as FirstMessage['clientInfo']),
    }
  } catch {
    return { stdin: replay }
  }
}

// The client renders MCP Apps views (Claude Desktop does; Claude Code doesn't).
export function supportsMcpApps(capabilities: ClientCapabilities | undefined): boolean {
  return !!getUiCapability(capabilities)?.mimeTypes?.includes(RESOURCE_MIME_TYPE)
}
