// Stands in for an MCP Apps host (Claude Desktop) without one: a stdio client
// that advertises the extension, spawns the server, and plays both the model
// (`ask`, `ask_wait`) and the inline card (`parley_submit`, `parley_status`).
// Each scenario gets its own fake-hub as the window, with the reply it needs,
// and reads the hub's log to check what the app was told.
//
//   pnpm --filter @parley/server fake-host [scenario...] [--server dist] [--verbose]
//
// Scenarios (all by default): card-wins, window-wins, skip, slice, unknown-id,
// path, old-app, plain. `--server dist` runs dist/index.mjs instead of src/ under tsx.
// `--verbose` passes the server's and the hub's stderr through.

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    server: { type: 'string', default: 'src' },
    verbose: { type: 'boolean', default: false },
  },
})

const packageDir = process.cwd()
const tsx = resolve(packageDir, 'node_modules/.bin/tsx')
const fixture = (name: string) =>
  JSON.parse(readFileSync(resolve(packageDir, `../../packages/protocol/fixtures/${name}.json`), 'utf8')) as Record<string, unknown>

const MCP_APPS = { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [RESOURCE_MIME_TYPE] } } }
const CARD_URI = 'ui://parley/card.html'

interface Session {
  client: Client
  hubLog: () => Record<string, any>[]
}

type Check = (name: string, ok: boolean, detail?: unknown) => void

interface Scenario {
  reply: string[]
  hubFlags?: string[]
  inline?: boolean   // advertise MCP Apps; default true
  env?: Record<string, string>
  run(session: Session, check: Check): Promise<void>
}

const scenarios: Record<string, Scenario> = {
  // The card answers first. The app hears `resolved` with the data, never `cancel`.
  'card-wins': {
    reply: ['none'],
    async run({ client, hubLog }, check) {
      const tools = (await client.listTools()).tools.map((t) => t.name).sort()
      check('tools are ask, ask_wait and the app-only pair', same(tools, ['ask', 'ask_wait', 'parley_status', 'parley_submit']), tools)

      const resources = (await client.listResources()).resources.map((r) => r.uri)
      check('the card resource is listed', resources.includes(CARD_URI), resources)
      try {
        const card = (await client.readResource({ uri: CARD_URI })).contents[0] as { mimeType?: string; text?: string }
        check('the card reads as an MCP App', card?.mimeType === RESOURCE_MIME_TYPE && !!card.text?.includes('<html'), card?.mimeType)
      } catch (error) {
        check('the card reads as an MCP App (is it built?)', false, message(error))
      }

      const askId = await ask(client, fixture('choice'))
      const wait = callText(client, 'ask_wait', { askId })
      const status = structured(client, 'parley_status', { askId })
      await sleep(300)
      const data = { layout: 'Workspace (Recommended)', node_version: '24 LTS (Recommended)' }
      const submit = await structured(client, 'parley_submit', { askId, kind: 'answer', data, note: ' from the card ' })
      check('parley_submit is accepted', submit.accepted === true, submit)

      const watched = await status
      check('the held parley_status returns ended in the chat', watched.state === 'ended' && watched.via === 'chat', watched)
      const result = await wait
      check('ask_wait returns the answer', result.text.includes('Workspace') && result.text.includes('from the card'), result.text)

      await sleep(300)
      const log = hubLog()
      const sent = log.find((l) => l.type === 'ask')
      check('the window got the ask with inline: true', sent?.inline === true, sent && { inline: sent.inline })
      const resolved = log.find((l) => l.type === 'resolved')
      check('the app got resolved with the data and note',
        resolved?.id === sent?.id && resolved?.outcome?.status === 'answered'
          && JSON.stringify(resolved.outcome.data) === JSON.stringify(data) && resolved.outcome.note === 'from the card',
        resolved)
      check('the app got no cancel', !log.some((l) => l.type === 'cancel'), log.map((l) => l.type))
    },
  },

  // The window answers first. The card is told so, and can't answer after.
  'window-wins': {
    reply: ['delay:1:first'],
    async run({ client }, check) {
      const askId = await ask(client, fixture('choice'))
      const status = structured(client, 'parley_status', { askId })
      const result = await callText(client, 'ask_wait', { askId })
      check('ask_wait returns the window\'s answer', result.text.includes('Workspace'), result.text)
      const watched = await status
      check('the held parley_status returns ended in Parley', watched.state === 'ended' && watched.via === 'window', watched)
      const submit = await call(client, 'parley_submit', { askId, kind: 'answer', data: { layout: 'Single package' } })
      const text = textOf(submit)
      check('parley_submit says it already ended', (submit.structuredContent as any)?.accepted === false && text.includes('already ended'), text)
    },
  },

  // The card skips, with a note.
  skip: {
    reply: ['none'],
    async run({ client, hubLog }, check) {
      const askId = await ask(client, fixture('choice'))
      const wait = callText(client, 'ask_wait', { askId })
      const submit = await structured(client, 'parley_submit', { askId, kind: 'skip', note: 'not now' })
      check('parley_submit is accepted', submit.accepted === true, submit)
      const result = await wait
      check('ask_wait says it was skipped, with the note', /skip/i.test(result.text) && result.text.includes('not now'), result.text)
      await sleep(300)
      const resolved = hubLog().find((l) => l.type === 'resolved')
      check('the app got resolved as dismissed', resolved?.outcome?.status === 'dismissed' && resolved.outcome.note === 'not now', resolved)
    },
  },

  // Waits come back "still waiting" after a slice, and the next one gets the answer.
  slice: {
    reply: ['delay:3:first'],
    env: { PARLEY_WAIT_SLICE_MS: '1000' },
    async run({ client }, check) {
      const askId = await ask(client, fixture('choice'))
      const texts: string[] = []
      for (let i = 0; i < 6; i++) {
        const { text } = await callText(client, 'ask_wait', { askId })
        texts.push(text)
        if (!text.includes("hasn't answered yet")) break
      }
      check('the first wait says still waiting, call again', !!texts[0]?.includes("hasn't answered yet") && texts[0].includes('Call `ask_wait` again'), texts[0])
      check('a later wait returns the answer', texts.length > 1 && !!texts.at(-1)?.includes('Workspace'), `${texts.length} waits`)
    },
  },

  // An id this server never showed: a restart, or an old chat.
  'unknown-id': {
    reply: ['none'],
    async run({ client }, check) {
      const wait = await call(client, 'ask_wait', { askId: 'not-an-ask' })
      check('ask_wait is an error', wait.isError === true && textOf(wait).includes('No ask'), textOf(wait))
      const status = await structured(client, 'parley_status', { askId: 'not-an-ask' })
      check('parley_status says unknown', status.state === 'unknown', status)
      const submit = await structured(client, 'parley_submit', { askId: 'not-an-ask', kind: 'skip' })
      check('parley_submit says unknown', submit.accepted === false && submit.state === 'unknown', submit)
    },
  },

  // A file picker can't work in the card, so the window gets it without `inline`, and notifies.
  path: {
    reply: ['first'],
    async run({ client, hubLog }, check) {
      const askId = await ask(client, fixture('path'))
      const result = await callText(client, 'ask_wait', { askId })
      check('ask_wait returns the window\'s answer', result.text.includes('/tmp/example'), result.text)
      const sent = hubLog().find((l) => l.type === 'ask')
      check('the window got the ask without inline', !!sent && !('inline' in sent), sent && Object.keys(sent))
    },
  },

  // An app from before inline cards rejects `resolved`; the server withdraws its card instead.
  'old-app': {
    reply: ['none'],
    hubFlags: ['--old-app'],
    async run({ client, hubLog }, check) {
      const askId = await ask(client, fixture('choice'))
      const wait = callText(client, 'ask_wait', { askId })
      await structured(client, 'parley_submit', { askId, kind: 'answer', data: { layout: 'Single package' } })
      check('ask_wait still returns the answer', (await wait).text.includes('Single package'), (await wait).text)
      await sleep(500)
      const types = hubLog().filter((l) => l.type !== 'hello').map((l) => l.type)
      check('the app got resolved, then cancel', same(types, ['ask', 'resolved', 'cancel']) && types.indexOf('cancel') > types.indexOf('resolved'), types)
    },
  },

  // A client without MCP Apps (Claude Code, Codex) sees main's server.
  plain: {
    reply: ['first'],
    inline: false,
    async run({ client, hubLog }, check) {
      const { tools } = await client.listTools()
      check('the tool list is ask alone', same(tools.map((t) => t.name), ['ask']), tools.map((t) => t.name))
      check("ask's _meta is anthropic/alwaysLoad only", JSON.stringify(tools[0]?._meta) === JSON.stringify({ 'anthropic/alwaysLoad': true }), tools[0]?._meta)
      check('no resources capability', !client.getServerCapabilities()?.resources, client.getServerCapabilities())
      try {
        await client.request({ method: 'resources/list', params: {} })
        check('resources/list is method not found', false, 'it answered')
      } catch (error) {
        check('resources/list is method not found', /not found|-32601/i.test(message(error)), message(error))
      }
      const result = await callText(client, 'ask', fixture('choice'))
      check('ask blocks and returns the answer', result.text.includes('Workspace'), result.text)
      const sent = hubLog().find((l) => l.type === 'ask')
      check('the window got the ask without inline', !!sent && !('inline' in sent), sent && Object.keys(sent))
    },
  },
}

const chosen = positionals.length ? positionals : Object.keys(scenarios)
const unknown = chosen.filter((name) => !scenarios[name])
if (unknown.length) {
  console.error(`fake-host: unknown scenario ${unknown.join(', ')}. Known: ${Object.keys(scenarios).join(', ')}`)
  process.exit(2)
}

let failed = 0
for (const name of chosen) {
  const results = await runScenario(name, scenarios[name]!)
  const ok = results.every((r) => r.ok)
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
  for (const r of results) {
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok || r.detail === undefined ? '' : `: ${JSON.stringify(r.detail)?.slice(0, 400)}`}`)
  }
}
console.log(failed ? `\n${failed} of ${chosen.length} scenarios failed` : `\nall ${chosen.length} scenarios passed`)
process.exit(failed ? 1 : 0)

async function runScenario(name: string, scenario: Scenario) {
  const results: { name: string; ok: boolean; detail?: unknown }[] = []
  const check: Check = (what, ok, detail) => results.push({ name: what, ok, detail })
  // macOS caps socket paths at 104 bytes: keep it short, under $TMPDIR.
  const dir = mkdtempSync(join(tmpdir(), 'ph-'))
  const socket = join(dir, 'hub.sock')
  const logFile = join(dir, 'hub.jsonl')
  const stderr: string[] = []

  const hub = spawn(tsx, ['scripts/fake-hub.ts', socket, '--log', logFile, ...scenario.reply.flatMap((r) => ['--reply', r]), ...(scenario.hubFlags ?? [])], {
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  collect(hub, 'hub', stderr)
  let client: Client | undefined
  try {
    await waitFor(() => existsSync(socket), 10_000, 'fake-hub to listen')
    const command = values.server === 'dist' ? [process.execPath, resolve(packageDir, 'dist/index.mjs')] : [tsx, resolve(packageDir, 'src/index.ts')]
    const transport = new StdioClientTransport({
      command: command[0]!,
      args: command.slice(1),
      env: { ...process.env as Record<string, string>, PARLEY_SOCKET: socket, PARLEY_NO_LAUNCH: '1', ...scenario.env },
      stderr: 'pipe',
    })
    transport.stderr?.on('data', (chunk) => record('server', String(chunk), stderr))
    client = new Client({ name: 'fake-host', version: '0.0.0' }, { capabilities: scenario.inline === false ? {} : MCP_APPS })
    await client.connect(transport)
    const hubLog = () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])
    await withTimeout(scenario.run({ client, hubLog }, check), 60_000, name)
  } catch (error) {
    check('ran without throwing', false, message(error))
  } finally {
    await client?.close().catch(() => {})
    hub.kill()
    rmSync(dir, { recursive: true, force: true })
  }
  if (!values.verbose && results.some((r) => !r.ok)) console.log(stderr.map((l) => `  | ${l}`).join('\n'))
  return results
}

// The model's `ask`: returns the askId.
async function ask(client: Client, input: Record<string, unknown>): Promise<string> {
  const result = await call(client, 'ask', input)
  const askId = (result.structuredContent as { askId?: unknown } | undefined)?.askId
  if (typeof askId !== 'string') throw new Error(`ask returned no askId: ${textOf(result)}`)
  return askId
}

function call(client: Client, name: string, args: Record<string, unknown>) {
  return client.callTool({ name, arguments: args }, { timeout: 120_000 })
}

async function callText(client: Client, name: string, args: Record<string, unknown>) {
  const result = await call(client, name, args)
  return { text: textOf(result), isError: result.isError === true }
}

async function structured(client: Client, name: string, args: Record<string, unknown>): Promise<Record<string, any>> {
  return ((await call(client, name, args)).structuredContent ?? {}) as Record<string, any>
}

function textOf(result: { content?: unknown }): string {
  const content = (result.content ?? []) as { type: string; text?: string }[]
  return content.filter((c) => c.type === 'text').map((c) => c.text).join('\n')
}

function collect(child: ChildProcess, label: string, into: string[]) {
  child.stderr?.on('data', (chunk) => record(label, String(chunk), into))
}

function record(label: string, chunk: string, into: string[]) {
  for (const line of chunk.split('\n').filter(Boolean)) {
    into.push(`${label}: ${line}`)
    if (values.verbose) console.error(`${label}: ${line}`)
  }
}

function same(a: string[], b: string[]) {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function waitFor(condition: () => boolean, ms: number, what: string) {
  const deadline = Date.now() + ms
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await sleep(50)
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => (timer = setTimeout(() => reject(new Error(`${what} took over ${ms / 1000} s`)), ms))),
  ])
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
