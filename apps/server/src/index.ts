#!/usr/bin/env node
// stdio MCP server. stdout is the protocol channel: log to stderr only.

import { McpServer } from '@modelcontextprotocol/server'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { bindServer } from './ask-lifecycle.ts'
import { registerAsk } from './tools/ask.ts'

// This decides whether models reach for the tool at all. The tool's own
// description covers the input shape.
const instructions = `
Parley shows the user a form in a desktop window and returns their answers. Use \`ask\` to get a decision from the user instead of guessing at one. Ask before you start the work when:
- the request has more than one reasonable reading that would lead to different changes, such as the scope of a refactor or a cleanup;
- you'd be choosing between approaches, libraries or designs that the user may have a view on;
- the change is large or hard to reverse: deleting files, migrations, public API changes;
- you need a detail you can't infer.

- Asking is cheap. The user is notified, not interrupted, and answers in a few keystrokes. The call waits until they answer, skip, or the timeout passes, which can take minutes.
- Ask 1–4 questions per call. Prefer choice questions with 2–6 concrete options. Put your recommendation first and add " (Recommended)" to its label.
- Don't add an "Other" option. Choice questions accept free text automatically.
- Don't ask what the conversation, the code, or sensible defaults already answer.
- Never ask for passwords, API keys, or other secrets.
- If the user skips a question, don't ask it again. Proceed and say what you assumed.
`.trim()

const server = new McpServer(
  { name: 'parley', version: '0.0.0' },
  { instructions },
)

bindServer(server)
registerAsk(server)

await server.connect(new StdioServerTransport())
