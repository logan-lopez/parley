// The helpers tool handlers call to put a form in front of the user and wait.
// Wires MCP cancellation into the app client and keeps the client's idle
// timer alive with progress notifications.
//
// `runAsk` is the blocking ask. `showAsk`, `waitAsk` and `askStatus` are
// "show, then wait" for clients that render MCP Apps (tools/inline.ts).

import { randomUUID } from 'node:crypto'
import { CLIENT_INFO_META_KEY, type McpServer, type ServerContext } from '@modelcontextprotocol/server'
import type { FormSpec, InlineOutcome, SessionInfo } from '@parley/protocol'
import type { AskInput } from '@parley/protocol/ask'
import { getAppClient, type AskOutcome } from './app-client.ts'

const PROGRESS_INTERVAL_MS = 15_000

let server: McpServer | undefined

// Lets runAsk read the client's identity from the initialize handshake.
export function bindServer(mcp: McpServer) {
  server = mcp
}

export async function runAsk(ctx: ServerContext, form: FormSpec, timeoutMs: number): Promise<AskOutcome> {
  const stop = keepAlive(ctx)
  try {
    return await getAppClient().ask(form, { timeoutMs, signal: ctx.mcpReq.signal, client: clientInfo(ctx) })
  } finally {
    stop()
  }
}

// Progress notifications reset the client's idle timer while a call blocks.
function keepAlive(ctx: ServerContext): () => void {
  const token = ctx.mcpReq._meta?.progressToken
  if (token === undefined) return () => {}
  const started = Date.now()
  let progress = 0
  const ticker = setInterval(() => {
    // Progress must strictly increase.
    progress = Math.max(progress + 1, Math.round((Date.now() - started) / 1000))
    ctx.mcpReq
      .notify({
        method: 'notifications/progress',
        params: { progressToken: token, progress, message: 'Waiting for the user…' },
      })
      .catch((error) => console.error('[parley] progress notification failed:', error))
  }, PROGRESS_INTERVAL_MS)
  return () => clearInterval(ticker)
}

// Show, then wait. Claude Desktop mounts a tool's view only after the call
// returns, so `ask` starts the ask and returns an id, and `ask_wait` blocks
// on it. The window and the chat's card race: the first answer wins. When the
// card wins, the window's ask is aborted with the outcome, and the app records
// it as answered in the chat.

// Where the answer came from.
export type Via = 'window' | 'chat'
export type Ended = AskOutcome & { via: Via }

interface Shown {
  input: AskInput
  done: Promise<Ended>   // never rejects
  ended?: Ended
  failure?: string       // the window was unavailable, and the card can't answer this one
  answerInline(outcome: InlineOutcome): boolean   // false once ended
  cancel(): void
}

const shown = new Map<string, Shown>()

// A late `ask_wait`, or a card mounted again, still gets the answer for this long.
const KEEP_ENDED_MS = 60 * 60 * 1000

// Claude Desktop cancels a local tool call at exactly 240 s and sends no
// progress token, so nothing extends it. A wait returns before that, and the
// model calls `ask_wait` again; the ask itself stays open.
const WAIT_SLICE_MS = Number(process.env.PARLEY_WAIT_SLICE_MS) || 200_000

// `inline`: the card can answer this one too. False for asks with a path
// question (no picker in the host's iframe), which the window must announce.
export function showAsk(ctx: ServerContext, input: AskInput, form: FormSpec, timeoutMs: number, { inline }: { inline: boolean }): string {
  const askId = randomUUID()
  const windowAbort = new AbortController()
  let finish!: (ended: Ended) => void
  const entry: Shown = {
    input,
    done: new Promise<Ended>((resolve) => (finish = resolve)),
    answerInline(outcome) {
      if (!end({ ...outcome, via: 'chat' })) return false
      // Withdraws the window's card, which the app records as answered in the chat.
      windowAbort.abort(outcome)
      return true
    },
    cancel: () => windowAbort.abort(),
  }
  shown.set(askId, entry)

  function end(ended: Ended): boolean {
    if (entry.ended) return false
    entry.ended = ended
    finish(ended)
    console.error(`[parley] ask ended: ${ended.status} via ${ended.via}`)
    setTimeout(() => shown.delete(askId), KEEP_ENDED_MS).unref()
    return true
  }

  getAppClient()
    .ask(form, { timeoutMs, signal: windowAbort.signal, client: clientInfo(ctx), inline })
    .then((outcome) => end({ ...outcome, via: 'window' }))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      if (!inline) {
        entry.failure = message
        return end({ status: 'cancelled', via: 'window' })
      }
      // No window, but the card can still answer. Keep the timeout without it.
      console.error(`[parley] window unavailable, inline only: ${message}`)
      const timer = setTimeout(() => end({ status: 'timed_out', via: 'window' }), timeoutMs)
      timer.unref()
      windowAbort.signal.addEventListener('abort', () => {
        clearTimeout(timer)
        end({ status: 'cancelled', via: 'window' })
      }, { once: true })
    })

  return askId
}

export type WaitResult =
  | { kind: 'ended'; ended: Ended }
  | { kind: 'waiting' }                      // the slice ran out first
  | { kind: 'failed'; message: string }
  | { kind: 'unknown' }                      // never shown here: a restart, an old chat, or a made-up id

export function shownInput(askId: string): AskInput | undefined {
  return shown.get(askId)?.input
}

export async function waitAsk(ctx: ServerContext, askId: string): Promise<WaitResult> {
  const entry = shown.get(askId)
  if (!entry) return { kind: 'unknown' }
  if (!entry.ended) {
    const stop = keepAlive(ctx)
    // Stopping the wait (the user stops the chat) cancels the ask itself.
    const onCancel = () => entry.cancel()
    ctx.mcpReq.signal.addEventListener('abort', onCancel, { once: true })
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const slice = new Promise<'waiting'>((resolve) => (timer = setTimeout(() => resolve('waiting'), WAIT_SLICE_MS)))
      if ((await Promise.race([entry.done, slice])) === 'waiting') return { kind: 'waiting' }
    } finally {
      clearTimeout(timer)
      stop()
      ctx.mcpReq.signal.removeEventListener('abort', onCancel)
    }
  }
  if (entry.failure) return { kind: 'failed', message: entry.failure }
  return { kind: 'ended', ended: entry.ended! }
}

export type AskStatus =
  | { state: 'open' }
  | { state: 'ended'; via: Via; outcome: AskOutcome }
  | { state: 'unknown' }

export function askStatus(askId: string): AskStatus {
  const entry = shown.get(askId)
  if (!entry) return { state: 'unknown' }
  if (!entry.ended) return { state: 'open' }
  const { via, ...outcome } = entry.ended
  return { state: 'ended', via, outcome }
}

// The card's long-poll: answers at once if the ask has ended, otherwise when
// it ends or after `holdMs`, whichever comes first.
export async function awaitStatus(ctx: ServerContext, askId: string, holdMs: number): Promise<AskStatus> {
  const entry = shown.get(askId)
  if (entry && !entry.ended) {
    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    await Promise.race([
      entry.done,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, holdMs)
        onAbort = resolve
        ctx.mcpReq.signal.addEventListener('abort', onAbort, { once: true })
      }),
    ])
    clearTimeout(timer)
    ctx.mcpReq.signal.removeEventListener('abort', onAbort!)
  }
  return askStatus(askId)
}

// The card's answer or skip. `accepted` is false when the ask had already ended
// (the window won) or was never shown here; the status says which.
export function answerInline(askId: string, outcome: InlineOutcome): AskStatus & { accepted: boolean } {
  const entry = shown.get(askId)
  if (!entry) return { state: 'unknown', accepted: false }
  return { ...askStatus(askId), accepted: entry.answerInline(outcome) }
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
