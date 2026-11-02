import type { McpServer } from '@modelcontextprotocol/server'
import {
  askInputSchema,
  askResultSchema,
  compileQuestions,
  DEFAULT_TIMEOUT_SECONDS,
  shapeAnswer,
} from '@parley/protocol/ask'
import { runAsk } from '../ask-lifecycle.ts'
import { applyShowEdits } from '../show-edits.ts'
import { readShowFiles } from '../show-files.ts'
import { readShowMedia } from '../show-media.ts'

// About the input shape. When to ask lives in the server instructions.
export const description = `
Ask the user 1–4 questions in a form and wait for their answers.

Each question has a \`header\` (a chip of 12 characters or fewer), the \`question\` (markdown) and a \`type\`:
- choice (default): 2–6 \`options\`, each { label (60 characters at most), description? (300), preview? }. \`preview\` is markdown shown while the option is focused, such as a code sketch. \`multiSelect\` allows several. The user can always type their own answer instead, unless \`allowOther: false\`.
- text: \`multiline\`, \`placeholder\`. \`draft\`: text you wrote for the user to edit in place, such as a commit message or PR description; the answer says whether they changed it.
- number: \`min\`, \`max\`, \`integer\`.
- boolean: an explicit Yes or No.
- path: a native file or folder picker that returns paths only. \`pathKind\` ('file' or 'directory'), \`multiple\`, \`extensions\`.
- review: the user approves or rejects each of 1–30 \`items\` (files to delete, changes to apply), each { label (120 characters at most), detail? (300), preview? }, and can comment on any. Labels must be unique. \`defaultDecision\` is 'approve' (default), 'reject', or 'none' when every item needs an explicit decision, so a hurried Enter doesn't approve everything. The answer is the approved labels, plus each item's decision and comment. \`decisions\`: 2–4 short labels to use instead of approve/reject, such as ['Keep', 'Move', 'Delete'], with the most cautious one last; \`defaultDecision\` is then one of them or 'none', and the answer is the items given the first decision.
- capture: a box the user pastes into, for something only they can get, such as command output, a console dump or a screenshot. \`accept\` is 'text', 'image' or 'any' (default). Text comes back verbatim; screenshots come back as PNG file paths you can read. Put commands for the user to run in fenced code blocks in \`question\`: they get a copy button.
- show: something to look at, not answer, such as a plan, a file or a design. Give \`content\` (markdown, up to 20,000 characters) or \`path\`, a file in the project that Parley reads, so you don't repeat it (\`lines: [start, end]\` for part of it). Markdown files render, HTML and SVG files are drawn as pictures, and other files show as code. Put the questions about it after it in the same call, which needs at least one question besides show. With \`editable: true\` (a whole file given by \`path\`), the user can edit it in place. Parley saves their change to the file and returns a diff, so don't apply it yourself unless the answer says it wasn't saved.

In markdown, a color in a code span (\`#38bdf8\`, \`oklch(70% 0.15 230)\`) shows with a swatch, and a \`\`\`palette block, one color per line with an optional name after it, shows large labelled swatches. A \`\`\`html preview or \`\`\`svg preview block (static HTML and CSS, or SVG: no scripts, no external images or fonts) is drawn as a picture instead of shown as code, 400×200 by default; set the size on its first line, such as \`\`\`html preview width=400 height=240. Use it in an option's \`preview\` for layouts, UI options and visual designs.

An image file in the project, written as \`![caption](path)\`, is shown as the picture: use it for screenshots instead of asking the user to open them. An audio file, or a glob of variants (\`takes/1_*.wav\`), is a play button.

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
      const timeoutMs = (input.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000
      try {
        const files = await readShowFiles(input)
        const media = await readShowMedia(input, files)
        const outcome = await runAsk(ctx, compileQuestions(input, files, media), timeoutMs)
        console.error(`[parley] ask ended: ${outcome.status}`)
        // Only an answer writes; a skip leaves every file alone.
        const edits = outcome.status === 'answered' ? await applyShowEdits(input, files, outcome.data) : undefined
        const { structured, text } = shapeAnswer(input, outcome, { edits })
        return { content: [{ type: 'text', text }], structuredContent: structured }
      } catch (error) {
        // A show's file was refused, the app is unavailable, or an edit's write
        // threw something unexpected. Invalid input never
        // gets here: the SDK rejects it first.
        return {
          content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
          isError: true,
        }
      }
    },
  )
}
