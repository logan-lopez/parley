// Scores one trial run from what it left on disk, so a saved run can be
// re-scored without running anything:
//
//   pnpm --filter @parley/server trial --score <run dir>
//
// A run dir holds meta.json (written by trial.ts), events.jsonl (the client's
// event stream), hub.jsonl (fake-hub's log) and diff.patch (the scratch copy's
// changes). Only the client's stream sees every `ask` call: input that fails
// validation is rejected in the server and never reaches fake-hub.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type Client = 'claude' | 'codex'

export interface RunMeta {
  prompt: string
  client: Client
  run: number
  expect: 'ask' | 'no-ask'
  reply: string            // the first reply policy
  replies?: string[]       // all of them, in the order the asks arrive, when the prompt has more than one
  match?: string           // searched for instead of the reply, when set
  model: string
  clientVersion: string
  startedAt: string
  durationMs: number
  exitCode: number | null
  timedOut: boolean
}

export interface AskCall {
  questions: { header: string; type: string }[]
  error: boolean | null    // null: no result in the stream (killed mid-call)
  status: string | null    // answered | dismissed | timed_out | cancelled, from the result
}

// What happened in the run, in the order the client's stream says: a Parley ask got its result
// (`draft`: it had a `text` question with a draft), or a file was written.
export type Op =
  | { kind: 'ask-result'; draft: boolean; answered: boolean }
  | { kind: 'write'; path: string }

export interface RunScore {
  asked: boolean
  askCount: number
  firstValid: boolean | null
  matchedExpect: boolean
  used: boolean | null
  usedStrings: string[]
  reAskedAfterSkip: boolean | null
  // Prompts whose replies include `remember:` (brief 21), else null:
  drafted: boolean | null      // a later ask has a `text` question with a draft
  saved: boolean | null        // the diff adds a line to AGENTS.md or CLAUDE.md
  savedEarly: boolean | null   // ...before the draft was answered, or with no draft at all
  questions: { header: string; type: string }[][]
  hubAsks: number          // asks that reached fake-hub; fewer than askCount means rejected input
  toolLoaded: boolean | null // the client had the ask tool; null when its stream doesn't say (Codex)
  failed: string[]         // the checks this run failed; empty is a pass
}

export type RunResult = RunMeta & RunScore & { model: string }

export const ASK_TOOL = { claude: 'mcp__parley__ask', server: 'parley', tool: 'ask' }

export function scoreRun(dir: string): RunResult {
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as RunMeta
  const events = readJsonl(join(dir, 'events.jsonl'))
  const hub = readJsonl(join(dir, 'hub.jsonl'))
  const diff = existsSync(join(dir, 'diff.patch')) ? readFileSync(join(dir, 'diff.patch'), 'utf8') : ''

  const stream = meta.client === 'claude' ? readClaude(events) : readCodex(events)
  const asks = stream.asks
  const asked = asks.length > 0

  const firstValid = asked ? asks[0]!.error === false : null
  const matchedExpect = asked === (meta.expect === 'ask')

  const replies = meta.match ? (hubReplied(hub) ? [meta.match] : []) : replyStrings(hub)
  const haystack = normalize(stream.finalText + '\n' + addedLines(diff).join('\n'))
  const usedStrings = replies.filter((s) => normalize(s) && haystack.includes(normalize(s)))
  const used = replies.length ? usedStrings.length > 0 : null

  let reAskedAfterSkip: boolean | null = null
  if (meta.reply === 'skip' && asked) {
    const skipped = asks.findIndex((a) => a.status === 'dismissed')
    reAskedAfterSkip = skipped !== -1 && asks.length > skipped + 1
  }

  // "Don't ask again" runs: did the model draft the standing line, and save it only after the
  // draft was answered? Saves are placed by the stream's order of events.
  let drafted: boolean | null = null
  let saved: boolean | null = null
  let savedEarly: boolean | null = null
  if ((meta.replies ?? [meta.reply]).some((r) => r.startsWith('remember:'))) {
    drafted = asks.slice(1).some((a) => a.questions.some((q) => q.type === 'text+draft'))
    saved = addedLines(diff, isInstructions).length > 0
    const draftAnswered = stream.ops.findIndex((o) => o.kind === 'ask-result' && o.draft && o.answered)
    const firstWrite = stream.ops.findIndex((o) => o.kind === 'write' && isInstructions(o.path))
    savedEarly = !saved ? null : draftAnswered === -1 ? true : firstWrite === -1 ? false : firstWrite < draftAnswered
  }

  const failed: string[] = []
  if (stream.toolLoaded === false) failed.push('toolMissing')
  if (meta.timedOut) failed.push('timedOut')
  else if (meta.exitCode !== 0) failed.push('exitCode')
  if (!matchedExpect) failed.push(asked ? 'overAsked' : 'underAsked')
  if (firstValid === false) failed.push('firstValid')
  if (used === false) failed.push('used')
  if (reAskedAfterSkip) failed.push('reAskedAfterSkip')
  if (drafted === false) failed.push('notDrafted')
  if (saved === false) failed.push('notSaved')
  if (savedEarly) failed.push('savedEarly')

  return {
    ...meta,
    model: stream.model ?? meta.model,
    asked,
    askCount: asks.length,
    firstValid,
    matchedExpect,
    used,
    usedStrings,
    reAskedAfterSkip,
    drafted,
    saved,
    savedEarly,
    questions: asks.map((a) => a.questions),
    hubAsks: hub.filter((e) => e.type === 'ask').length,
    toolLoaded: stream.toolLoaded,
    failed,
  }
}

interface Stream {
  asks: AskCall[]
  ops: Op[]
  finalText: string
  model?: string
  toolLoaded: boolean | null
}

// claude -p --output-format stream-json --verbose
function readClaude(events: any[]): Stream {
  const calls = new Map<string, AskCall>()
  const ops: Op[] = []
  let finalText = ''
  let lastAssistantText = ''
  let model: string | undefined
  let toolLoaded: boolean | null = null
  for (const event of events) {
    if (event.type === 'system' && event.subtype === 'init') {
      model = event.model
      toolLoaded = Array.isArray(event.tools) ? event.tools.includes(ASK_TOOL.claude) : null
    }
    if (event.type === 'assistant') {
      const texts: string[] = []
      for (const block of event.message?.content ?? []) {
        if (block.type === 'text') texts.push(block.text)
        if (block.type === 'tool_use' && block.name === ASK_TOOL.claude) {
          calls.set(block.id, { questions: questionsOf(block.input), error: null, status: null })
        }
        if (block.type === 'tool_use' && CLAUDE_WRITERS.has(block.name) && typeof block.input?.file_path === 'string') {
          ops.push({ kind: 'write', path: block.input.file_path })
        }
      }
      if (texts.length) lastAssistantText = texts.join('\n')
    }
    if (event.type === 'user') {
      for (const block of event.message?.content ?? []) {
        const call = block.type === 'tool_result' ? calls.get(block.tool_use_id) : undefined
        if (!call) continue
        call.error = block.is_error === true
        call.status = statusOf(event.tool_use_result) ?? statusOf(textOf(block.content))
        ops.push(askResult(call))
      }
    }
    if (event.type === 'result' && typeof event.result === 'string') finalText = event.result
  }
  return { asks: [...calls.values()], ops, finalText: finalText || lastAssistantText, model, toolLoaded }
}

// codex exec --json
function readCodex(events: any[]): Stream {
  const calls = new Map<string, AskCall>()
  const ops: Op[] = []
  let finalText = ''
  for (const event of events) {
    const item = event.item
    if (event.type !== 'item.completed' || !item) continue
    if (item.type === 'agent_message') finalText = item.text ?? ''
    if (item.type === 'file_change') {
      for (const change of Array.isArray(item.changes) ? item.changes : []) {
        if (typeof change?.path === 'string') ops.push({ kind: 'write', path: change.path })
      }
    }
    if (item.type === 'mcp_tool_call' && item.server === ASK_TOOL.server && item.tool === ASK_TOOL.tool) {
      const result = item.result
      const call: AskCall = {
        questions: questionsOf(item.arguments),
        error: item.error != null || item.status === 'failed' || result?.is_error === true,
        status: statusOf(result?.structured_content) ?? statusOf(textOf(result?.content)),
      }
      calls.set(item.id, call)
      ops.push(askResult(call))
    }
  }
  return { asks: [...calls.values()], ops, finalText, toolLoaded: null }
}

const CLAUDE_WRITERS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

function askResult(call: AskCall): Op {
  return { kind: 'ask-result', draft: call.questions.some((q) => q.type === 'text+draft'), answered: call.error === false && call.status === 'answered' }
}

function questionsOf(input: any): { header: string; type: string }[] {
  const questions = Array.isArray(input?.questions) ? input.questions : []
  return questions.map((q: any) => {
    const type = String(q?.type ?? 'choice')
    const variant = type === 'text' && typeof q?.draft === 'string' ? 'text+draft'
      : type === 'review' && Array.isArray(q?.decisions) ? 'review+decisions'
      : type === 'show' && q?.editable === true ? 'show+editable'
      : type
    return { header: String(q?.header ?? ''), type: variant }
  })
}

function statusOf(value: unknown): string | null {
  if (value && typeof value === 'object' && typeof (value as any).status === 'string') return (value as any).status
  if (typeof value === 'string') {
    try {
      return statusOf(JSON.parse(value))
    } catch {
      return /"status"\s*:\s*"(\w+)"/.exec(value)?.[1] ?? null
    }
  }
  return null
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((c) => (typeof c?.text === 'string' ? c.text : '')).join('\n')
  return ''
}

function hubReplied(hub: any[]): boolean {
  return hub.some((e) => e.type === 'reply')
}

// The choice answers fake-hub sent. Text, number, boolean and path answers are
// fake-hub's filler, not something the model should repeat.
function replyStrings(hub: any[]): string[] {
  const forms = new Map<string, any>()
  for (const e of hub) if (e.type === 'ask') forms.set(e.id, e.form)
  const strings = new Set<string>()
  for (const e of hub) {
    if (e.type !== 'reply') continue
    const properties = forms.get(e.id)?.schema?.properties ?? {}
    for (const [key, value] of Object.entries(e.data ?? {})) {
      if (properties[key]?.['x-widget'] !== 'choice') continue
      for (const s of [value].flat()) {
        if (typeof s === 'string') strings.add(s.replace(/\s*\(recommended\)\s*$/i, ''))
      }
    }
  }
  return [...strings]
}

// The lines the diff adds, to the files `only` accepts (by path) or to every file.
function addedLines(diff: string, only?: (path: string) => boolean): string[] {
  const added: string[] = []
  let counts = !only
  for (const line of diff.split('\n')) {
    const file = /^\+\+\+ (?:b\/)?(.*)$/.exec(line)
    if (file) counts = !only || only(file[1]!)
    else if (counts && line.startsWith('+')) added.push(line.slice(1))
  }
  return added
}

// The files a standing answer is saved to.
function isInstructions(path: string): boolean {
  return /(^|\/)(AGENTS|CLAUDE)\.md$/.test(path)
}

// Case, punctuation and markdown don't count against a match.
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function readJsonl(path: string): any[] {
  if (!existsSync(path)) return []
  const out: any[] = []
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line))
    } catch {
      // Clients print the odd non-JSON line; it isn't an event.
    }
  }
  return out
}

export interface Summary {
  prompt: string
  client: Client
  expect: string
  skip: boolean
  runs: number
  asked: number
  validFirst: number
  usedOf: [number, number]
  overAsked: number
  underAsked: number
  reAsked: number
  errors: number
  standing?: { drafted: number; saved: number; early: number }   // "Don't ask again" prompts only
}

export function summarize(results: RunResult[]): Summary[] {
  const groups = new Map<string, RunResult[]>()
  for (const r of results) {
    const key = `${r.prompt}\0${r.client}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  return [...groups.values()].map((rs) => ({
    prompt: rs[0]!.prompt,
    client: rs[0]!.client,
    expect: rs[0]!.expect,
    skip: rs[0]!.reply === 'skip',
    runs: rs.length,
    asked: rs.filter((r) => r.asked).length,
    validFirst: rs.filter((r) => r.firstValid).length,
    usedOf: [rs.filter((r) => r.used === true).length, rs.filter((r) => r.used !== null).length],
    overAsked: rs.filter((r) => r.failed.includes('overAsked')).length,
    underAsked: rs.filter((r) => r.failed.includes('underAsked')).length,
    reAsked: rs.filter((r) => r.reAskedAfterSkip).length,
    errors: rs.filter((r) => r.failed.includes('timedOut') || r.failed.includes('exitCode')).length,
    ...(rs.some((r) => r.drafted !== null) && {
      standing: {
        drafted: rs.filter((r) => r.drafted).length,
        saved: rs.filter((r) => r.saved).length,
        early: rs.filter((r) => r.savedEarly).length,
      },
    }),
  }))
}

// Markdown, so it pastes straight into trials/README.md.
export function formatSummary(rows: Summary[]): string {
  // The "Don't ask again" columns appear only when a prompt in the run has them.
  const standing = rows.some((s) => s.standing)
  const lines = [
    `| prompt | client | expect | asked | first call valid | used | over-asked | re-asked after skip |${standing ? ' drafted | saved | saved early |' : ''} errors |`,
    `| --- | --- | --- | --- | --- | --- | --- | --- |${standing ? ' --- | --- | --- |' : ''} --- |`,
  ]
  for (const s of rows) {
    const extra = standing ? ` ${s.standing ? `${s.standing.drafted}/${s.runs} | ${s.standing.saved}/${s.runs} | ${s.standing.early}` : '– | – | –'} |` : ''
    lines.push(
      `| ${s.prompt} | ${s.client} | ${s.expect} | ${s.asked}/${s.runs} | ${s.asked ? `${s.validFirst}/${s.asked}` : '–'} | ${s.usedOf[1] ? `${s.usedOf[0]}/${s.usedOf[1]}` : '–'} | ${s.expect === 'no-ask' ? s.overAsked : '–'} | ${s.skip ? s.reAsked : '–'} |${extra} ${s.errors || ''} |`,
    )
  }
  return lines.join('\n')
}
