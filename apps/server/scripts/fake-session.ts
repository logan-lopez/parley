// Acts as one MCP server session without an MCP client: connects to the hub,
// sends a form from a JSON file, and prints the outcome.
//
//   pnpm --filter @parley/server fake-ask <file.json | fixture name> [--timeout <s>]
//
// The file is either `ask` tool input (`{ questions: [...] }`, as in
// packages/protocol/fixtures, which a bare name like `choice` resolves to)
// or a raw FormSpec. Tool input goes through the same validation, compiler
// and answer shaping as the tool, and prints the text and structured result.
//
// Ctrl-C kills the process without a cancel, which exercises the app's
// disconnect path (the card goes away as orphaned).

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import type { FormSpec } from '@parley/protocol'
import { askInputSchema, compileQuestions, DEFAULT_TIMEOUT_SECONDS, shapeAnswer } from '@parley/protocol/ask'
import { getAppClient } from '../src/app-client.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { timeout: { type: 'string' } },
})

const file = positionals[0]
if (!file) {
  console.error('usage: fake-ask <form.json | fixture name> [--timeout <seconds>]')
  process.exit(2)
}

// pnpm --filter runs scripts from the package dir. Act from where the user ran
// it, so the session's cwd is theirs. Fall back to the package dir for the file.
const packageDir = process.cwd()
if (process.env.INIT_CWD) process.chdir(process.env.INIT_CWD)
const fixtures = resolve(packageDir, '../../packages/protocol/fixtures')
const path = [resolve(file), resolve(packageDir, file), resolve(fixtures, `${file}.json`)].find(existsSync)
if (!path) {
  console.error(`fake-ask: can't find ${file}`)
  process.exit(2)
}

const json: unknown = JSON.parse(readFileSync(path, 'utf8'))
const isToolInput = typeof json === 'object' && json !== null && 'questions' in json

try {
  if (isToolInput) {
    const parsed = askInputSchema.safeParse(json)
    if (!parsed.success) {
      // What the model would see from the SDK.
      console.error(`fake-ask: invalid tool input:\n${parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n')}`)
      process.exit(2)
    }
    // --timeout overrides the input's, and the shaped text should say so.
    const input = { ...parsed.data, timeoutSeconds: seconds(parsed.data.timeoutSeconds) }
    const outcome = await ask(compileQuestions(input), input.timeoutSeconds)
    const { structured, text } = shapeAnswer(input, outcome)
    console.log(text)
    console.log(JSON.stringify(structured, null, 2))
  } else {
    console.log(JSON.stringify(await ask(json as FormSpec, seconds(undefined)), null, 2))
  }
} catch (error) {
  console.error(`fake-ask: ${error instanceof Error ? error.message : error}`)
  process.exit(1)
}

function seconds(fromInput: number | undefined): number {
  return Number(values.timeout ?? fromInput ?? DEFAULT_TIMEOUT_SECONDS)
}

function ask(form: FormSpec, timeoutSeconds: number) {
  return getAppClient().ask(form, {
    timeoutMs: timeoutSeconds * 1000,
    signal: new AbortController().signal,
    client: { name: 'fake-ask' },
  })
}
