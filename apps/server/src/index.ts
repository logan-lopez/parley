#!/usr/bin/env node
// stdio MCP server. stdout is the protocol channel: log to stderr only.

import { McpServer } from '@modelcontextprotocol/server'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { registerAsk } from './tools/ask.ts'

// TODO: this is most of what decides whether models reach for the tool.
const instructions = `
Parley lets you ask the user questions through a form in a desktop window.
`.trim()

const server = new McpServer(
  { name: 'parley', version: '0.0.0' },
  { instructions },
)

registerAsk(server)

await server.connect(new StdioServerTransport())
