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
  reply: string
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

export interface RunScore {
  asked: boolean
  askCount: number
  firstValid: boolean | null
  matchedExpect: boolean
  used: boolean | null
  usedStrings: string[]
  reAskedAfterSkip: boolean | null
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
  const haystack = normalize(stream.finalText + '\n' + addedLines(diff))
  const usedStrings = replies.filter((s) => normalize(s) && haystack.includes(normalize(s)))
  const used = replies.length ? usedStrings.length > 0 : null

  let reAskedAfterSkip: boolean | null = null
  if (meta.reply === 'skip' && asked) {
    const skipped = asks.findIndex((a) => a.status === 'dismissed')
    reAskedAfterSkip = skipped !== -1 && asks.length > skipped + 1
  }

  const failed: string[] = []
  if (stream.toolLoaded === false) failed.push('toolMissing')
  if (meta.timedOut) failed.push('timedOut')
  else if (meta.exitCode !== 0) failed.push('exitCode')
  if (!matchedExpect) failed.push(asked ? 'overAsked' : 'underAsked')
  if (firstValid === false) failed.push('firstValid')
  if (used === false) failed.push('used')
  if (reAskedAfterSkip) failed.push('reAskedAfterSkip')

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
    questions: asks.map((a) => a.questions),
    hubAsks: hub.filter((e) => e.type === 'ask').length,
    toolLoaded: stream.toolLoaded,
    failed,
  }
}

interface Stream {
  asks: AskCall[]
  finalText: string
  model?: string
  toolLoaded: boolean | null
}

// claude -p --output-format stream-json --verbose
function readClaude(events: any[]): Stream {
  const calls = new Map<string, AskCall>()
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
      }
      if (texts.length) lastAssistantText = texts.join('\n')
    }
    if (event.type === 'user') {
      for (const block of event.message?.content ?? []) {
        const call = block.type === 'tool_result' ? calls.get(block.tool_use_id) : undefined
        if (!call) continue
        call.error = block.is_error === true
        call.status = statusOf(event.tool_use_result) ?? statusOf(textOf(block.content))
      }
    }
    if (event.type === 'result' && typeof event.result === 'string') finalText = event.result
  }
  return { asks: [...calls.values()], finalText: finalText || lastAssistantText, model, toolLoaded }
}

// codex exec --json
function readCodex(events: any[]): Stream {
  const calls = new Map<string, AskCall>()
  let finalText = ''
  for (const event of events) {
    const item = event.item
    if (event.type !== 'item.completed' || !item) continue
    if (item.type === 'agent_message') finalText = item.text ?? ''
    if (item.type === 'mcp_tool_call' && item.server === ASK_TOOL.server && item.tool === ASK_TOOL.tool) {
      const result = item.result
      calls.set(item.id, {
        questions: questionsOf(item.arguments),
        error: item.error != null || item.status === 'failed' || result?.is_error === true,
        status: statusOf(result?.structured_content) ?? statusOf(textOf(result?.content)),
      })
    }
  }
  return { asks: [...calls.values()], finalText, toolLoaded: null }
}

function questionsOf(input: any): { header: string; type: string }[] {
  const questions = Array.isArray(input?.questions) ? input.questions : []
  return questions.map((q: any) => {
    const type = String(q?.type ?? 'choice')
    return { header: String(q?.header ?? ''), type: type === 'text' && typeof q?.draft === 'string' ? 'text+draft' : type }
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

function addedLines(diff: string): string {
  return diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).join('\n')
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
  }))
}

// Markdown, so it pastes straight into trials/README.md.
export function formatSummary(rows: Summary[]): string {
  const lines = [
    '| prompt | client | expect | asked | first call valid | used | over-asked | re-asked after skip | errors |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ]
  for (const s of rows) {
    lines.push(
      `| ${s.prompt} | ${s.client} | ${s.expect} | ${s.asked}/${s.runs} | ${s.asked ? `${s.validFirst}/${s.asked}` : '–'} | ${s.usedOf[1] ? `${s.usedOf[0]}/${s.usedOf[1]}` : '–'} | ${s.expect === 'no-ask' ? s.overAsked : '–'} | ${s.skip ? s.reAsked : '–'} | ${s.errors || ''} |`,
    )
  }
  return lines.join('\n')
}
