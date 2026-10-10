// Runs each trial prompt through a real client, with fake-hub answering for
// the user, and scores whether the model used `ask` and used it well.
//
//   pnpm --filter @parley/server trial [--client claude|codex|all] [--runs N]
//     [--prompt <name>]... [--model <id>] [--timeout <s>] [--keep]
//   pnpm --filter @parley/server trial --score <run dir>        re-score a saved run
//   pnpm --filter @parley/server trial --summary <results.jsonl> re-print a summary
//
// Each run gets a fresh copy of trials/project under $TMPDIR, its own fake-hub
// and socket, and the built server (dist/index.mjs). See trials/README.md.

import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, openSync, closeSync, readFileSync, readdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { formatSummary, scoreRun, summarize, type Client, type RunMeta, type RunResult } from './trial-score.ts'

const { values } = parseArgs({
  options: {
    client: { type: 'string', default: 'claude' },
    runs: { type: 'string', default: '1' },
    prompt: { type: 'string', multiple: true },
    model: { type: 'string' },
    timeout: { type: 'string', default: '300' },
    score: { type: 'string' },
    summary: { type: 'string' },
    keep: { type: 'boolean', default: false },
  },
})

// pnpm --filter runs this from apps/server.
const serverDir = process.cwd()
const trialsDir = join(serverDir, 'trials')
const dist = join(serverDir, 'dist/index.mjs')

// What the baseline ran with. --model overrides both.
const DEFAULT_MODELS: Record<Client, string> = { claude: 'claude-opus-5-5', codex: 'gpt-6-astra' }

if (values.score) {
  console.log(JSON.stringify(scoreRun(userPath(values.score)), null, 2))
  process.exit(0)
}
if (values.summary) {
  const results = readFileSync(userPath(values.summary), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as RunResult)
  console.log(formatSummary(summarize(results)))
  process.exit(0)
}

const clients: Client[] = values.client === 'all' ? ['claude', 'codex'] : [values.client as Client]
if (!clients.every((c) => c === 'claude' || c === 'codex')) usage(`unknown client: ${values.client}`)
const runs = Number(values.runs)
const timeoutMs = Number(values.timeout) * 1000
if (!(runs >= 1) || !(timeoutMs > 0)) usage('--runs and --timeout take positive numbers')

const prompts = loadPrompts(values.prompt)

// Children of the run in flight, so Ctrl-C can clean up after itself.
const live = { procs: new Set<ChildProcess>(), dirs: new Set<string>() }
process.on('SIGINT', () => {
  console.error('\ntrial: interrupted, cleaning up')
  cleanup()
  process.exit(130)
})

console.error('trial: building the server')
execFileSync('pnpm', ['run', 'build'], { cwd: serverDir, stdio: ['ignore', 'ignore', 'inherit'] })

const versions = Object.fromEntries(clients.map((c) => [c, version(c)])) as Record<Client, string>
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const resultsDir = join(trialsDir, 'results')
const resultsFile = join(resultsDir, `${stamp}.jsonl`)
const transcriptsDir = join(resultsDir, stamp)
mkdirSync(transcriptsDir, { recursive: true })

const results: RunResult[] = []
for (const prompt of prompts) {
  for (const client of clients) {
    for (let run = 1; run <= runs; run++) {
      const label = `${prompt.name} · ${client} · ${run}/${runs}`
      console.error(`trial: ${label}`)
      const result = await runOne(prompt, client, run)
      results.push(result)
      appendFileSync(resultsFile, JSON.stringify(result) + '\n')
      console.error(`trial: ${label} → ${result.failed.length ? `failed ${result.failed.join(', ')}` : 'pass'}${result.asked ? ` (asked ${result.askCount}×)` : ''}`)
    }
  }
}
if (!readdirSync(transcriptsDir).length) rmSync(transcriptsDir, { recursive: true })

console.log(`\n${formatSummary(summarize(results))}\n`)
console.log(`Results: ${resultsFile}`)
console.log(`Clients: ${clients.map((c) => `${versions[c]} (${results.find((r) => r.client === c)?.model})`).join(', ')}`)

interface Prompt {
  name: string
  text: string
  expect: 'ask' | 'no-ask'
  reply: string
  match?: string
}

async function runOne(prompt: Prompt, client: Client, run: number): Promise<RunResult> {
  const transcript = join(transcriptsDir, `${prompt.name}.${client}.${run}`)
  mkdirSync(transcript)

  // Scratch copy of the project, committed so the diff shows only this run's changes.
  const work = track(mkdtempSync(join(tmpdir(), 'parley-trial-')))
  cpSync(join(trialsDir, 'project'), work, { recursive: true })
  git(work, 'init', '-q')
  git(work, 'add', '-A')
  git(work, '-c', 'user.name=trial', '-c', 'user.email=trial@localhost', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'start')

  // Socket and MCP config live outside the copy, so they don't show in the diff.
  // macOS caps socket paths at 104 bytes.
  const side = track(mkdtempSync(join(tmpdir(), 'pt-')))
  const socket = join(side, 'hub.sock')
  if (Buffer.byteLength(socket) > 103) throw new Error(`socket path too long: ${socket}`)

  const hub = await startHub(socket, join(transcript, 'hub.jsonl'), prompt.reply)
  const model = values.model ?? DEFAULT_MODELS[client]
  const startedAt = new Date()
  const { exitCode, timedOut } = await runClient(client, { prompt, work, side, socket, model, transcript })
  stop(hub)

  writeFileSync(join(transcript, 'diff.patch'), diff(work))
  const meta: RunMeta = {
    prompt: prompt.name,
    client,
    run,
    expect: prompt.expect,
    reply: prompt.reply,
    ...(prompt.match ? { match: prompt.match } : {}),
    model,
    clientVersion: versions[client],
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    exitCode,
    timedOut,
  }
  writeFileSync(join(transcript, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')
  writeFileSync(join(transcript, 'prompt.md'), prompt.text + '\n')

  for (const dir of [work, side]) untrack(dir)
  const result = scoreRun(transcript)
  // Keep transcripts only for runs worth reading, unless asked to keep them all.
  if (!result.failed.length && !values.keep) rmSync(transcript, { recursive: true })
  return result
}

interface ClientRun {
  prompt: Prompt
  work: string
  side: string
  socket: string
  model: string
  transcript: string
}

function runClient(client: Client, r: ClientRun): Promise<{ exitCode: number | null; timedOut: boolean }> {
  const serverEnv = { PARLEY_SOCKET: r.socket, PARLEY_NO_LAUNCH: '1' }
  let command: string
  let args: string[]
  if (client === 'claude') {
    const config = join(r.side, 'mcp.json')
    writeFileSync(config, JSON.stringify({ mcpServers: { parley: { command: process.execPath, args: [dist], env: serverEnv } } }))
    command = 'claude'
    args = [
      '-p', r.prompt.text,
      '--output-format', 'stream-json', '--verbose',
      '--setting-sources', 'project,local',
      '--strict-mcp-config', '--mcp-config', config,
      '--no-session-persistence',
      // Edits inside the copy are allowed. Anything that would prompt (Bash,
      // paths outside the copy) is denied, since nobody is there to answer.
      '--permission-mode', 'acceptEdits',
      '--model', r.model,
    ]
  } else {
    const toml = (s: string) => JSON.stringify(s)
    command = 'codex'
    args = [
      'exec', '--json', '--ephemeral', '--skip-git-repo-check',
      // Keeps Logan's other MCP servers, hooks and notify out of the run.
      '--ignore-user-config',
      // Writes only inside the copy. exec never asks for approval, so the ask
      // tool is pre-approved; anything else that needs approval is refused.
      '-s', 'workspace-write',
      '-C', r.work,
      '-m', r.model,
      '-c', `mcp_servers.parley.command=${toml(process.execPath)}`,
      '-c', `mcp_servers.parley.args=[${toml(dist)}]`,
      '-c', `mcp_servers.parley.env={${Object.entries(serverEnv).map(([k, v]) => `${k}=${toml(v)}`).join(',')}}`,
      '-c', 'mcp_servers.parley.tools.ask.approval_mode="approve"',
      r.prompt.text,
    ]
  }

  const out = openSync(join(r.transcript, 'events.jsonl'), 'w')
  const err = openSync(join(r.transcript, 'stderr.log'), 'w')
  // Its own process group, so a timeout takes the MCP server down with it.
  const child = spawn(command, args, { cwd: r.work, env: clientEnv(), stdio: ['ignore', out, err], detached: true })
  live.procs.add(child)
  return new Promise((done) => {
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      killGroup(child, 'SIGTERM')
      setTimeout(() => killGroup(child, 'SIGKILL'), 5000).unref()
    }, timeoutMs)
    child.on('exit', (code) => {
      clearTimeout(timer)
      // Reap anything the client left running in its group.
      killGroup(child, 'SIGKILL')
      live.procs.delete(child)
      closeSync(out)
      closeSync(err)
      done({ exitCode: code, timedOut })
    })
  })
}

// A nested client shouldn't inherit this session's identity, effort or messaging socket.
function clientEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key === 'CLAUDECODE' || key === 'CLAUDE_PID' || key === 'CLAUDE_EFFORT' || key.startsWith('CLAUDE_CODE_')) delete env[key]
  }
  return env
}

function startHub(socket: string, log: string, reply: string): Promise<ChildProcess> {
  const tsx = createRequire(import.meta.url).resolve('tsx/cli')
  const hub = spawn(process.execPath, [tsx, join(serverDir, 'scripts/fake-hub.ts'), socket, '--log', log, '--reply', reply], {
    cwd: serverDir,
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true,
  })
  live.procs.add(hub)
  return new Promise((ready, fail) => {
    let stderr = ''
    hub.stderr!.setEncoding('utf8')
    hub.stderr!.on('data', (chunk: string) => {
      stderr += chunk
      if (stderr.includes('listening on')) ready(hub)
    })
    hub.on('exit', (code) => fail(new Error(`fake-hub exited (${code}): ${stderr}`)))
  })
}

function stop(child: ChildProcess) {
  killGroup(child, 'SIGTERM')
  live.procs.delete(child)
}

function killGroup(child: ChildProcess, signal: NodeJS.Signals) {
  try {
    process.kill(-child.pid!, signal)
  } catch {
    // Already gone.
  }
}

function track(dir: string) {
  live.dirs.add(dir)
  return dir
}

function untrack(dir: string) {
  rmSync(dir, { recursive: true, force: true })
  live.dirs.delete(dir)
}

function cleanup() {
  for (const child of live.procs) {
    killGroup(child, 'SIGKILL')
    child.kill('SIGKILL')
  }
  for (const dir of live.dirs) rmSync(dir, { recursive: true, force: true })
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

// Everything the run changed, including new and deleted files.
function diff(work: string): string {
  git(work, 'add', '-A')
  return git(work, 'diff', '--cached', '--no-color', 'HEAD')
}

function version(client: Client): string {
  return execFileSync(client, ['--version'], { encoding: 'utf8', env: clientEnv() }).trim()
}

function loadPrompts(names: string[] | undefined): Prompt[] {
  const dir = join(trialsDir, 'prompts')
  const all = readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map((f) => parsePrompt(join(dir, f)))
  if (!names?.length) return all
  return names.map((n) => all.find((p) => p.name === n) ?? usage(`no prompt named ${n} (have: ${all.map((p) => p.name).join(', ')})`))
}

// Frontmatter is flat `key: value` lines; `#` starts a comment.
function parsePrompt(path: string): Prompt {
  const source = readFileSync(path, 'utf8')
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source)
  if (!match) throw new Error(`${path}: missing frontmatter`)
  const fields: Record<string, string> = {}
  for (const line of match[1]!.split('\n')) {
    const at = line.indexOf(':')
    if (at === -1) continue
    fields[line.slice(0, at).trim()] = line.slice(at + 1).replace(/\s+#.*$/, '').trim()
  }
  const expect = fields.expect
  if (expect !== 'ask' && expect !== 'no-ask') throw new Error(`${path}: expect must be ask or no-ask`)
  return {
    name: basename(path, '.md'),
    text: match[2]!.trim(),
    expect,
    reply: fields.reply || 'first',
    ...(fields.match ? { match: fields.match } : {}),
  }
}

// Relative to where the user ran pnpm, falling back to apps/server.
function userPath(path: string): string {
  const fromUser = resolve(process.env.INIT_CWD ?? '.', path)
  return existsSync(fromUser) ? fromUser : resolve(serverDir, path)
}

function usage(message: string): never {
  console.error(`trial: ${message}`)
  console.error('usage: trial [--client claude|codex|all] [--runs N] [--prompt <name>]... [--model <id>] [--timeout <s>] [--keep]')
  console.error('       trial --score <run dir> | --summary <results.jsonl>')
  process.exit(2)
}
