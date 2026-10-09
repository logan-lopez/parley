// Acts as one MCP server session without an MCP client: connects to the hub,
// sends a FormSpec from a JSON file, and prints the outcome.
//
//   pnpm --filter @parley/server fake-ask <file.json> [--timeout <s>]
//
// Ctrl-C kills the process without a cancel, which exercises the app's
// disconnect path (the card goes away as orphaned).

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import type { FormSpec } from '@parley/protocol'
import { getAppClient } from '../src/app-client.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { timeout: { type: 'string', default: '600' } },
})

const file = positionals[0]
if (!file) {
  console.error('usage: fake-ask <form.json> [--timeout <seconds>]')
  process.exit(2)
}

// pnpm --filter runs scripts from the package dir. Act from where the user ran
// it, so the session's cwd is theirs. Fall back to the package dir for the file.
const packageDir = process.cwd()
if (process.env.INIT_CWD) process.chdir(process.env.INIT_CWD)
const path = [resolve(file), resolve(packageDir, file)].find(existsSync)
if (!path) {
  console.error(`fake-ask: can't find ${file}`)
  process.exit(2)
}

const form = JSON.parse(readFileSync(path, 'utf8')) as FormSpec
const timeoutMs = Number(values.timeout) * 1000

try {
  const outcome = await getAppClient().ask(form, {
    timeoutMs,
    signal: new AbortController().signal,
    client: { name: 'fake-ask' },
  })
  console.log(JSON.stringify(outcome, null, 2))
} catch (error) {
  console.error(`fake-ask: ${error instanceof Error ? error.message : error}`)
  process.exit(1)
}
