import type { McpServer } from '@modelcontextprotocol/server'
import {
  askInputSchema,
  askResultSchema,
  compileQuestions,
  DEFAULT_TIMEOUT_SECONDS,
  shapeAnswer,
} from '@parley/protocol/ask'
import { runAsk } from '../ask-lifecycle.ts'

// About the input shape. When to ask lives in the server instructions.
export const description = `
Ask the user 1–4 questions in a form and wait for their answers.

Each question has a \`header\` (a chip of 12 characters or fewer), the \`question\` (markdown) and a \`type\`:
- choice (default): 2–6 \`options\`, each { label, description?, preview? }. \`preview\` is markdown shown while the option is focused, such as a code sketch. \`multiSelect\` allows several. The user can always type their own answer instead, unless \`allowOther: false\`.
- text: \`multiline\`, \`placeholder\`. \`draft\`: text you wrote for the user to edit in place, such as a commit message or PR description; the answer says whether they changed it.
- number: \`min\`, \`max\`, \`integer\`.
- boolean: an explicit Yes or No.
- path: a native file or folder picker that returns paths only. \`pathKind\` ('file' or 'directory'), \`multiple\`, \`extensions\`.
- review: the user approves or rejects each of 1–30 \`items\` (files to delete, changes to apply), each { label, detail?, preview? }, and can comment on any. Labels must be unique. \`defaultDecision\` is 'approve' (default), 'reject', or 'none' when every item needs an explicit decision, so a hurried Enter doesn't approve everything. The answer is the approved labels, plus each item's decision and comment. \`decisions\`: 2–4 short labels to use instead of approve/reject, such as ['Keep', 'Move', 'Delete'], with the most cautious one last; \`defaultDecision\` is then one of them or 'none', and the answer is the items given the first decision.

Questions are required unless \`required: false\`. Answers are keyed by \`id\`, which defaults to a slug of the header.

Example:
{"questions":[{"header":"Approach","question":"How should I split the parser?","options":[{"label":"By file (Recommended)","description":"One module per grammar file."},{"label":"By phase","description":"Lexer, parser and checker modules."}]}]}
`.trim()

export function registerAsk(server: McpServer) {
  server.registerTool(
    'ask',
    {
      title: 'Ask the user',
      description,
      inputSchema: askInputSchema,
      outputSchema: askResultSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
      // Claude Code defers MCP tools behind ToolSearch unless told otherwise.
      // A tool the model has to look up first is a tool it reaches for less.
      _meta: { 'anthropic/alwaysLoad': true },
    },
    async (input, ctx) => {
      const form = compileQuestions(input)
      const timeoutMs = (input.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000
      try {
        const outcome = await runAsk(ctx, form, timeoutMs)
        console.error(`[parley] ask ended: ${outcome.status}`)
        const { structured, text } = shapeAnswer(input, outcome)
        return { content: [{ type: 'text', text }], structuredContent: structured }
      } catch (error) {
        // The app is unavailable. Invalid input never gets here: the SDK rejects it first.
        return {
          content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
          isError: true,
        }
      }
    },
  )
}
