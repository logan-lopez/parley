import type { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'

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
        timeoutSeconds: z.number().int().positive().optional(),
      }),
    },
    async () => {
      // TODO: validate the schema, send it to the app, wait for the answer.
      return {
        content: [{ type: 'text', text: 'Parley: ask is not implemented yet.' }],
        isError: true,
      }
    },
  )
}
