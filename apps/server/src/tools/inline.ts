// The tool surface for clients that render MCP Apps (Claude Desktop): show,
// then wait. Desktop mounts a tool's view only after the call returns, so
// `ask` shows the form (inline in the chat and in the window) and returns an
// `askId` at once, and `ask_wait` blocks until the answer. The card answers
// and watches the ask through two app-only tools the model never sees.
// Other clients get tools/ask.ts instead, and none of this.

import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import type { McpServer } from '@modelcontextprotocol/server'
import { hasPathQuestion, type InlineOutcome } from '@parley/protocol'
import { askInputSchema, compileQuestions, DEFAULT_TIMEOUT_SECONDS, shapeAnswer } from '@parley/protocol/ask'
import * as z from 'zod'
import { answerInline, awaitStatus, showAsk, shownInput, waitAsk, type AskStatus } from '../ask-lifecycle.ts'
import { CARD_URI, readCard } from '../card.ts'
import { description } from './ask.ts'

const askDescription = `${description}

In this client the form appears inline in the chat, and in the Parley window. \`ask\` shows it and returns at once with an \`askId\`. Then call \`ask_wait\` with that \`askId\` right away, in the same turn: it waits for the answers and returns them. Don't continue the task until it does.`

const waitDescription = `
Wait for the user's answers to a form that \`ask\` showed, and return them. Call it right after \`ask\`, with the \`askId\` it returned. It waits until the user answers, skips, or the ask times out, but at most about 3 minutes per call: if the user hasn't answered by then, it says so, and you call it again with the same \`askId\`.
`.trim()

// The card's long-poll holds this long before answering "still open".
const STATUS_HOLD_MS = 25_000

const appOnly = { ui: { resourceUri: CARD_URI, visibility: ['app' as const] } }

export function registerInline(server: McpServer) {
  registerAppResource(server, 'Parley card', CARD_URI, { description: 'The Parley question card.' }, async () => ({
    contents: [{ uri: CARD_URI, mimeType: RESOURCE_MIME_TYPE, text: await readCard() }],
  }))

  registerAppTool(
    server,
    'ask',
    {
      title: 'Ask the user',
      description: askDescription,
      inputSchema: askInputSchema,
      outputSchema: z.object({ askId: z.string(), message: z.string() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
      // registerAppTool also writes the older flat `ui/resourceUri` key.
      _meta: { 'anthropic/alwaysLoad': true, ui: { resourceUri: CARD_URI } },
    },
    async (input, ctx) => {
      const form = compileQuestions(input)
      const timeoutMs = (input.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000
      const askId = showAsk(ctx, input, form, timeoutMs, { inline: !hasPathQuestion(form) })
      const message = `The form is in front of the user. Now call \`ask_wait\` with {"askId": "${askId}"} to get their answers. Don't continue the task until it returns.`
      return {
        content: [{ type: 'text', text: message }],
        structuredContent: { askId, message },
        _meta: { 'parley/askId': askId },
      }
    },
  )

  server.registerTool(
    'ask_wait',
    {
      title: "Wait for the user's answers",
      description: waitDescription,
      inputSchema: z.object({ askId: z.string() }),
      // No outputSchema: a wait can also end with "still waiting", which isn't an AskResult.
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { 'anthropic/alwaysLoad': true },
    },
    async ({ askId }, ctx) => {
      const input = shownInput(askId)
      const result = await waitAsk(ctx, askId)
      if (result.kind === 'unknown' || !input) {
        const text = `No ask with id ${askId}. It may be from before Parley restarted. Call \`ask\` again if you still need the answer.`
        return { content: [{ type: 'text', text }], isError: true }
      }
      if (result.kind === 'failed') return { content: [{ type: 'text', text: result.message }], isError: true }
      if (result.kind === 'waiting') {
        const text = `The user hasn't answered yet, and the form is still open. Call \`ask_wait\` again with {"askId": "${askId}"} to keep waiting. Don't continue the task until it returns their answers.`
        return { content: [{ type: 'text', text }] }
      }
      const { via: _via, ...outcome } = result.ended
      const { structured, text } = shapeAnswer(input, outcome)
      return { content: [{ type: 'text', text }], structuredContent: structured }
    },
  )

  registerAppTool(
    server,
    'parley_submit',
    {
      title: 'Answer from the inline card',
      description: "Answers or skips an open ask from Parley's inline card. Called by the card, not the model.",
      inputSchema: z.object({
        askId: z.string(),
        kind: z.enum(['answer', 'skip']),
        data: z.unknown().optional(),
        note: z.string().optional(),
      }),
      _meta: appOnly,
    },
    async ({ askId, kind, data, note }) => {
      if (kind === 'answer' && data === undefined) {
        return { content: [{ type: 'text', text: 'An answer needs `data`.' }], isError: true }
      }
      const withNote = note?.trim() ? { note: note.trim() } : {}
      const outcome: InlineOutcome = kind === 'answer' ? { status: 'answered', data, ...withNote } : { status: 'dismissed', ...withNote }
      const { accepted, ...status } = answerInline(askId, outcome)
      const text = accepted ? 'Sent.' : status.state === 'unknown' ? 'No ask with that id.' : `That ask already ended: ${describe(status)}.`
      return { content: [{ type: 'text', text }], structuredContent: { accepted, ...status } }
    },
  )

  registerAppTool(
    server,
    'parley_status',
    {
      title: 'Watch an ask',
      description: `Whether an ask is still open, and how it ended. Holds up to ${STATUS_HOLD_MS / 1000} s while it's open. Called by Parley's inline card, not the model.`,
      inputSchema: z.object({ askId: z.string() }),
      _meta: appOnly,
    },
    async ({ askId }, ctx) => {
      const status = await awaitStatus(ctx, askId, STATUS_HOLD_MS)
      return { content: [{ type: 'text', text: describe(status) }], structuredContent: status }
    },
  )
}

function describe(status: AskStatus): string {
  if (status.state !== 'ended') return status.state
  const where = status.via === 'chat' ? 'in the chat' : 'in Parley'
  switch (status.outcome.status) {
    case 'answered': return `answered ${where}`
    case 'dismissed': return `skipped ${where}`
    case 'cancelled': return 'cancelled'
    case 'timed_out': return 'timed out'
  }
}
