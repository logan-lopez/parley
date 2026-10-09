import type { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'
import { runAsk } from '../ask-lifecycle.ts'

// Temporary raw-schema tool for driving the pipe. Brief 2 replaces the input
// and the result shape, and keeps runAsk.
export function registerAsk(server: McpServer) {
  server.registerTool(
    'ask',
    {
      title: 'Ask the user',
      description: 'Show the user a form and wait for their answer.',
      inputSchema: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        schema: z.record(z.string(), z.unknown()).describe('JSON Schema for the answer, with optional x-widget hints'),
        timeoutSeconds: z.number().int().positive().max(3600).default(600),
      }),
    },
    async ({ title, description, schema, timeoutSeconds }, ctx) => {
      console.error(`[parley] tools/call ask: _meta=${JSON.stringify(ctx.mcpReq._meta ?? null)}`)
      try {
        const outcome = await runAsk(ctx, { title, description, schema }, timeoutSeconds * 1000)
        console.error(`[parley] ask ended: ${outcome.status}`)
        return { content: [{ type: 'text', text: JSON.stringify(outcome) }] }
      } catch (error) {
        return {
          content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
          isError: true,
        }
      }
    },
  )
}
