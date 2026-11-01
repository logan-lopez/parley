// Measures how Parley gets used in real work, from `$APPDATA/history.jsonl`
// and (with `--transcripts`) Claude Code's session transcripts. Read-only.
//
//   pnpm --filter @parley/server usage [--since YYYY-MM-DD] [--history <file>]
//     [--transcripts [<dir>]] [--examples] [--projects] [--json]
//
// Dates (`--since`, the date range, ISO weeks) are local time. Projects are
// `project-1`, `project-2`… by count unless `--projects` is given, so the
// default report is safe to paste into the public repo.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'

const DEFAULT_HISTORY = join(homedir(), 'Library/Application Support/com.loganlopez.parley/history.jsonl')
const DEFAULT_TRANSCRIPTS = join(homedir(), '.claude/projects')
const serverDir = process.cwd()

interface Options {
  since?: string
  sinceMs?: number
  historyPath: string
  transcriptsDir?: string
  examples: boolean
  projects: boolean
  json: boolean
}

interface Snapshot {
  id: string
  session: {
    id?: string
    pid?: number
    cwd?: string
    client?: { name?: string; version?: string }
  }
  form: {
    title?: string
    description?: string
    schema?: {
      properties?: Record<string, Record<string, any>>
      required?: string[]
    }
  }
  createdAt: number
  expiresAt?: number
  inline?: boolean
  status: string
  endedAt?: number
  endedReason?: string
  data?: Record<string, unknown>
  note?: string
  answeredIn?: string
}

interface CountShare {
  key: string
  count: number
  share: number
}

interface RepeatedOptionSet {
  options: string
  asks: number
  sessions: number
  projects: string[]
  mostCommonAnswer: { label: string; count: number; share: number } | null
}

interface ExampleLine {
  at: number
  project: string
  header: string
  text: string
  formatted: string
}

interface TranscriptReport {
  dir: string
  calls: number
  outcomes: CountShare[]
  bounces: { pathAndMessage: string; count: number; shareOfBounces: number }[]
  backgroundedWithNotification: {
    total: number
    shareOfBackgrounded: number
    madeToolCalls: number
    madeToolCallsShare: number
    withEditOrWrite: number
    withEditOrWriteShare: number
    editOrWriteCalls: number
  }
  asksPerSession: {
    sessions: number
    median: number
    p90: number
    max: number
  }
}

interface UsageReport {
  since: string | null
  historyFile: string
  malformedLinesSkipped: number
  volume: {
    asks: number
    dateRange: { from: string | null; to: string | null }
    perIsoWeek: CountShare[]
    perClient: CountShare[]
    perProjectTop15: CountShare[]
  }
  outcomes: {
    perStatus: CountShare[]
    timedOutTimeouts: { seconds: number | null; label: string; count: number; share: number }[]
  }
  timeToAnswer: {
    answered: number
    p25Seconds: number | null
    medianSeconds: number | null
    p75Seconds: number | null
    p90Seconds: number | null
    p99Seconds: number | null
    over120s: { count: number; share: number }
    over10m: { count: number; share: number }
  }
  shape: {
    questions: number
    withTitle: { count: number; share: number }
    questionsPerAsk: { questions: number; count: number; share: number }[]
    perWidget: CountShare[]
    choiceMode: {
      single: { count: number; share: number }
      multi: { count: number; share: number }
    }
    optionsPerSingleChoice: { options: number; count: number; share: number }[]
  }
  agreement: {
    recommendedPicked: { count: number; total: number; share: number }
    firstOptionPicked: { count: number; total: number; share: number }
    freeTextAnswers: { count: number; total: number; share: number }
    reviewLeadItems: { count: number; total: number; share: number }
    reviewDecisions: CountShare[]
    reviewsAllLead: { count: number; total: number; share: number }
    reviewsWithCustomDecisions: { count: number; total: number; share: number }
    drafts: {
      total: number
      unchanged: { count: number; share: number }
      edited: { count: number; share: number }
    }
    booleans: {
      total: number
      true: { count: number; share: number }
      false: { count: number; share: number }
    }
    notes: { count: number; total: number; share: number }
    nothingChanged: { count: number; total: number; share: number }
  }
  askedAgain: RepeatedOptionSet[]
  examples?: ExampleLine[]
  markdownFeatures: {
    htmlPreview: { count: number; share: number }
    svgPreview: { count: number; share: number }
    palette: { count: number; share: number }
    optionPreview: { count: number; share: number }
  }
  claudeCode?: TranscriptReport
}

const opts = parseCliArgs(process.argv.slice(2))
const { records: folded, bad } = foldHistory(opts.historyPath)
const records = opts.sinceMs !== undefined ? folded.filter((r) => r.createdAt >= opts.sinceMs!) : folded
const report = buildReport(records, bad, opts)

if (opts.json) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(formatMarkdown(report, opts))
}

function parseCliArgs(argv: string[]): Options {
  let since: string | undefined
  let sinceMs: number | undefined
  let historyPath = DEFAULT_HISTORY
  let transcriptsDir: string | undefined
  let examples = false
  let projects = false
  let json = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--examples') {
      examples = true
    } else if (arg === '--projects') {
      projects = true
    } else if (arg === '--json') {
      json = true
    } else if (arg === '--since' || arg.startsWith('--since=')) {
      const val = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++i]
      if (!val || !/^\d{4}-\d{2}-\d{2}$/.test(val)) die('--since expects YYYY-MM-DD')
      const [y, m, d] = val.split('-').map(Number)
      const ms = new Date(y!, m! - 1, d!).getTime()
      if (!Number.isFinite(ms) || isoDate(ms) !== val) die(`invalid --since date: ${val}`)
      since = val
      sinceMs = ms
    } else if (arg === '--history' || arg.startsWith('--history=')) {
      const val = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++i]
      if (!val) die('--history expects a file path')
      historyPath = userPath(val)
    } else if (arg === '--transcripts' || arg.startsWith('--transcripts=')) {
      if (arg.includes('=')) {
        const val = arg.slice(arg.indexOf('=') + 1)
        if (!val) die('--transcripts expects a directory path')
        transcriptsDir = userPath(val)
      } else if (argv[i + 1] && !argv[i + 1]!.startsWith('-')) {
        transcriptsDir = userPath(argv[++i]!)
      } else {
        transcriptsDir = DEFAULT_TRANSCRIPTS
      }
    } else if (arg === '-h' || arg === '--help') {
      printUsage()
      process.exit(0)
    } else {
      die(`unknown argument: ${arg}`)
    }
  }

  return { since, sinceMs, historyPath, transcriptsDir, examples, projects, json }
}

function printUsage() {
  console.error('usage: usage [--since YYYY-MM-DD] [--history <file>] [--transcripts [<dir>]] [--examples] [--projects] [--json]')
}

function die(message: string): never {
  console.error(`usage: ${message}`)
  printUsage()
  process.exit(2)
}

function userPath(p: string): string {
  if (p.startsWith('~/')) return join(homedir(), p.slice(2))
  const fromUser = resolve(process.env.INIT_CWD ?? '.', p)
  return existsSync(fromUser) ? fromUser : resolve(serverDir, p)
}

// Last line per id wins; malformed lines are counted and skipped; pending
// records stay pending (no orphan rule, since the app may be running).
function foldHistory(path: string): { records: Snapshot[]; bad: number } {
  if (!existsSync(path)) die(`history file not found: ${path}`)
  const text = readFileSync(path, 'utf8')
  const byId = new Map<string, Snapshot>()
  let bad = 0
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      bad++
      continue
    }
    if (!isSnapshotLine(parsed)) {
      bad++
      continue
    }
    const { v: _v, ...snapshot } = parsed
    byId.delete(snapshot.id)
    byId.set(snapshot.id, snapshot)
  }
  return { records: [...byId.values()], bad }
}

function isSnapshotLine(value: unknown): value is Snapshot & { v: 1 } {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return r.v === 1
    && typeof r.id === 'string'
    && typeof r.status === 'string'
    && typeof r.createdAt === 'number'
    && typeof r.form === 'object' && r.form !== null
    && typeof r.session === 'object' && r.session !== null
}

function buildReport(records: Snapshot[], bad: number, options: Options): UsageReport {
  const totalAsks = records.length
  const projectName = projectNamer(records, options.projects)

  // 1. Volume
  const createdTimes = records.map((r) => r.createdAt).sort((a, b) => a - b)
  const dateRange = {
    from: createdTimes.length ? isoDate(createdTimes[0]!) : null,
    to: createdTimes.length ? isoDate(createdTimes[createdTimes.length - 1]!) : null,
  }
  const weekCounts = new Map<string, number>()
  const clientCounts = new Map<string, number>()
  const projectCounts = new Map<string, number>()
  for (const r of records) {
    inc(weekCounts, isoWeek(r.createdAt))
    inc(clientCounts, clientOf(r))
    inc(projectCounts, projectName(r))
  }
  const perIsoWeek = [...weekCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count, share: share(count, totalAsks) }))
  const perClient = toCountShares(clientCounts, totalAsks)
  const perProjectTop15 = toCountShares(projectCounts, totalAsks).slice(0, 15)

  // 2. Outcomes
  const statusCounts = new Map<string, number>()
  const timeoutCounts = new Map<number | null, number>()
  for (const r of records) {
    inc(statusCounts, r.status)
    if (r.status === 'timed_out') {
      const sec = typeof r.expiresAt === 'number' ? Math.round((r.expiresAt - r.createdAt) / 1000) : null
      timeoutCounts.set(sec, (timeoutCounts.get(sec) ?? 0) + 1)
    }
  }
  const perStatus = toCountShares(statusCounts, totalAsks)
  const timedOutTotal = statusCounts.get('timed_out') ?? 0
  const timedOutTimeouts = [...timeoutCounts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] ?? 0) - (b[0] ?? 0))
    .map(([seconds, count]) => ({
      seconds,
      label: seconds === null ? 'none' : formatDuration(seconds),
      count,
      share: share(count, timedOutTotal),
    }))

  // 3. Time to answer (answered only)
  const answeredRecords = records.filter((r) => r.status === 'answered')
  const durations = answeredRecords
    .filter((r) => typeof r.endedAt === 'number' && r.endedAt >= r.createdAt)
    .map((r) => (r.endedAt! - r.createdAt) / 1000)
    .sort((a, b) => a - b)
  const over120 = durations.filter((d) => d > 120).length
  const over600 = durations.filter((d) => d > 600).length
  const timeToAnswer = {
    answered: durations.length,
    p25Seconds: percentile(durations, 0.25),
    medianSeconds: percentile(durations, 0.5),
    p75Seconds: percentile(durations, 0.75),
    p90Seconds: percentile(durations, 0.9),
    p99Seconds: percentile(durations, 0.99),
    over120s: { count: over120, share: share(over120, durations.length) },
    over10m: { count: over600, share: share(over600, durations.length) },
  }

  // 4. Shape, 5. Agreement, 6. Asked again, 7. Examples, 8. Markdown features
  let totalQuestions = 0
  let withTitleCount = 0
  const qPerAskCounts = new Map<number, number>()
  const widgetCounts = new Map<string, number>()
  let singleChoiceCount = 0
  let multiChoiceCount = 0
  const optsPerSingleCounts = new Map<number, number>()

  let recPicked = 0
  let recTotal = 0
  let firstPicked = 0
  let singleChoiceAnswered = 0
  let freeTextCount = 0
  let choiceQuestionsAnswered = 0

  let reviewItemsLead = 0
  let reviewItemsTotal = 0
  const reviewDecisionCounts = new Map<string, number>()
  let reviewsAllLead = 0
  let reviewsAnswered = 0
  let reviewsCustom = 0
  let reviewsTotal = 0

  let draftsTotal = 0
  let draftsUnchanged = 0
  let draftsEdited = 0

  let boolTrue = 0
  let boolFalse = 0

  let notesCount = 0
  let nothingChangedCount = 0

  const optionSets = new Map<string, {
    asks: number
    sessions: Set<string>
    projects: Set<string>
    answers: Map<string, number>
    answeredCount: number
  }>()

  const exampleLines: ExampleLine[] = []

  let htmlPreviewCount = 0
  let svgPreviewCount = 0
  let paletteCount = 0
  let optionPreviewCount = 0

  for (const r of records) {
    const project = projectName(r)
    const eventTime = r.endedAt ?? r.createdAt
    const hasNote = typeof r.note === 'string' && r.note.trim().length > 0
    if (hasNote) {
      notesCount++
      const text = oneLine(r.note!, 160)
      exampleLines.push({
        at: eventTime,
        project,
        header: 'note',
        text,
        formatted: `${project} · note: ${text}`,
      })
    }

    if (typeof r.form?.title === 'string' && r.form.title.trim().length > 0) {
      withTitleCount++
    }

    const props = Object.entries(r.form?.schema?.properties ?? {})
    totalQuestions += props.length
    qPerAskCounts.set(props.length, (qPerAskCounts.get(props.length) ?? 0) + 1)

    const isAnswered = r.status === 'answered'
    const data = isRecord(r.data) ? r.data : {}
    let askNothingChanged = isAnswered && !hasNote && props.length > 0

    let askHasOptionPreview = false
    const markdownTexts: string[] = []
    if (typeof r.form?.description === 'string') markdownTexts.push(r.form.description)

    for (const [qid, prop] of props) {
      if (!isRecord(prop)) continue
      const widget = typeof prop['x-widget'] === 'string' ? prop['x-widget'] : 'unknown'
      inc(widgetCounts, widget)
      const header = typeof prop.title === 'string' ? prop.title : qid
      if (typeof prop.description === 'string') markdownTexts.push(prop.description)

      const val = data[qid]

      if (widget === 'choice') {
        const isMulti = prop.type === 'array'
        const target = isMulti && isRecord(prop.items) ? prop.items : prop
        const branches: any[] = Array.isArray(target.anyOf) ? target.anyOf : Array.isArray(target.oneOf) ? target.oneOf : []
        const consts: string[] = []
        for (const b of branches) {
          if (isRecord(b) && typeof b.const === 'string') {
            consts.push(b.const)
            if (typeof b.description === 'string') markdownTexts.push(b.description)
            if (typeof b['x-preview'] === 'string' && b['x-preview'].trim()) {
              askHasOptionPreview = true
              markdownTexts.push(b['x-preview'])
            }
          }
        }
        const constSet = new Set(consts)
        const rec = consts.find((c) => c.includes('(Recommended)'))

        if (isMulti) {
          multiChoiceCount++
        } else {
          singleChoiceCount++
          optsPerSingleCounts.set(consts.length, (optsPerSingleCounts.get(consts.length) ?? 0) + 1)
        }

        // Option set tracking for "Asked again"
        if (consts.length > 0) {
          const stripped = consts.map(stripRecommended).sort()
          const setKey = stripped.join(' / ')
          let setEntry = optionSets.get(setKey)
          if (!setEntry) {
            setEntry = { asks: 0, sessions: new Set(), projects: new Set(), answers: new Map(), answeredCount: 0 }
            optionSets.set(setKey, setEntry)
          }
          setEntry.asks++
          if (r.session?.id) setEntry.sessions.add(r.session.id)
          setEntry.projects.add(project)
          if (isAnswered) {
            const values = (Array.isArray(val) ? val : [val]).filter(isFilled)
            if (values.length > 0) {
              setEntry.answeredCount++
              for (const v of values) {
                inc(setEntry.answers, stripRecommended(v))
              }
            }
          }
        }

        if (isAnswered) {
          const values = (Array.isArray(val) ? val : [val]).filter(isFilled)
          if (values.length > 0) {
            choiceQuestionsAnswered++
            const custom = values.filter((v) => !constSet.has(v))
            if (custom.length > 0) {
              freeTextCount++
              for (const c of custom) {
                const text = oneLine(c, 160)
                exampleLines.push({
                  at: eventTime,
                  project,
                  header,
                  text,
                  formatted: `${project} · ${header}: ${text}`,
                })
              }
            }
            if (!isMulti) {
              const picked = values[0]!
              singleChoiceAnswered++
              if (picked === consts[0]) firstPicked++
              if (rec !== undefined) {
                recTotal++
                if (picked === rec) recPicked++
              }
              const expectedDefault = rec ?? consts[0]
              if (picked !== expectedDefault) askNothingChanged = false
            } else {
              askNothingChanged = false
            }
          } else {
            askNothingChanged = false
          }
        }
      } else if (widget === 'review') {
        const items: any[] = Array.isArray(prop.items) ? prop.items : []
        for (const it of items) {
          if (isRecord(it)) {
            if (typeof it.description === 'string') markdownTexts.push(it.description)
            if (typeof it['x-preview'] === 'string') markdownTexts.push(it['x-preview'])
          }
        }
        const decisions: string[] = Array.isArray(items[0]?.properties?.decision?.enum)
          ? items[0].properties.decision.enum
          : ['approve', 'reject']
        const isCustom = !(decisions.length === 2 && decisions[0] === 'approve' && decisions[1] === 'reject')
        reviewsTotal++
        if (isCustom) reviewsCustom++

        if (isAnswered) {
          reviewsAnswered++
          const entries = Array.isArray(val) ? val : []
          const lead = decisions[0]!
          let allLead = items.length > 0 && entries.length === items.length
          let anyComment = false
          for (let i = 0; i < items.length; i++) {
            const entry = isRecord(entries[i]) ? entries[i] : {}
            const dec = typeof entry.decision === 'string' && decisions.includes(entry.decision) ? entry.decision : lead
            inc(reviewDecisionCounts, dec)
            reviewItemsTotal++
            if (dec === lead) reviewItemsLead++
            else allLead = false
            if (isFilled(entry.comment)) anyComment = true
          }
          if (allLead) reviewsAllLead++
          if (!allLead || anyComment) askNothingChanged = false
        }
      } else if (widget === 'text') {
        const draft = typeof prop['x-draft'] === 'string' ? prop['x-draft'] : undefined
        if (draft !== undefined) {
          if (isAnswered) {
            draftsTotal++
            if (isFilled(val) && plain(val) === plain(draft)) {
              draftsUnchanged++
            } else {
              draftsEdited++
              askNothingChanged = false
            }
          }
        } else {
          askNothingChanged = false
        }
      } else if (widget === 'boolean') {
        if (isAnswered) {
          if (val === true) {
            boolTrue++
          } else if (val === false) {
            boolFalse++
            askNothingChanged = false
          } else {
            askNothingChanged = false
          }
        }
      } else {
        askNothingChanged = false
      }
    }

    if (askNothingChanged) nothingChangedCount++

    const joinedMd = markdownTexts.join('\n')
    if (/```+html\s+preview\b/i.test(joinedMd)) htmlPreviewCount++
    if (/```+svg\s+preview\b/i.test(joinedMd)) svgPreviewCount++
    if (/```+palette\b/i.test(joinedMd)) paletteCount++
    if (askHasOptionPreview) optionPreviewCount++
  }

  const questionsPerAsk = [...qPerAskCounts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([questions, count]) => ({ questions, count, share: share(count, totalAsks) }))
  const perWidget = toCountShares(widgetCounts, totalQuestions)
  const totalChoices = singleChoiceCount + multiChoiceCount
  const optionsPerSingleChoice = [...optsPerSingleCounts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([options, count]) => ({ options, count, share: share(count, singleChoiceCount) }))

  const boolTotal = boolTrue + boolFalse
  const askedAgain: RepeatedOptionSet[] = [...optionSets.entries()]
    .filter(([, v]) => v.sessions.size >= 3)
    .sort((a, b) => b[1].asks - a[1].asks || b[1].sessions.size - a[1].sessions.size || a[0].localeCompare(b[0]))
    .map(([optionsKey, v]) => {
      const top = [...v.answers.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
      return {
        options: optionsKey,
        asks: v.asks,
        sessions: v.sessions.size,
        projects: [...v.projects].sort(),
        mostCommonAnswer: top
          ? { label: top[0], count: top[1], share: share(top[1], v.answeredCount) }
          : null,
      }
    })

  exampleLines.sort((a, b) => b.at - a.at)

  const out: UsageReport = {
    since: options.since ?? null,
    historyFile: tildePath(options.historyPath),
    malformedLinesSkipped: bad,
    volume: {
      asks: totalAsks,
      dateRange,
      perIsoWeek,
      perClient,
      perProjectTop15,
    },
    outcomes: {
      perStatus,
      timedOutTimeouts,
    },
    timeToAnswer,
    shape: {
      questions: totalQuestions,
      withTitle: { count: withTitleCount, share: share(withTitleCount, totalAsks) },
      questionsPerAsk,
      perWidget,
      choiceMode: {
        single: { count: singleChoiceCount, share: share(singleChoiceCount, totalChoices) },
        multi: { count: multiChoiceCount, share: share(multiChoiceCount, totalChoices) },
      },
      optionsPerSingleChoice,
    },
    agreement: {
      recommendedPicked: { count: recPicked, total: recTotal, share: share(recPicked, recTotal) },
      firstOptionPicked: { count: firstPicked, total: singleChoiceAnswered, share: share(firstPicked, singleChoiceAnswered) },
      freeTextAnswers: { count: freeTextCount, total: choiceQuestionsAnswered, share: share(freeTextCount, choiceQuestionsAnswered) },
      reviewLeadItems: { count: reviewItemsLead, total: reviewItemsTotal, share: share(reviewItemsLead, reviewItemsTotal) },
      reviewDecisions: toCountShares(reviewDecisionCounts, reviewItemsTotal),
      reviewsAllLead: { count: reviewsAllLead, total: reviewsAnswered, share: share(reviewsAllLead, reviewsAnswered) },
      reviewsWithCustomDecisions: { count: reviewsCustom, total: reviewsTotal, share: share(reviewsCustom, reviewsTotal) },
      drafts: {
        total: draftsTotal,
        unchanged: { count: draftsUnchanged, share: share(draftsUnchanged, draftsTotal) },
        edited: { count: draftsEdited, share: share(draftsEdited, draftsTotal) },
      },
      booleans: {
        total: boolTotal,
        true: { count: boolTrue, share: share(boolTrue, boolTotal) },
        false: { count: boolFalse, share: share(boolFalse, boolTotal) },
      },
      notes: { count: notesCount, total: totalAsks, share: share(notesCount, totalAsks) },
      nothingChanged: { count: nothingChangedCount, total: answeredRecords.length, share: share(nothingChangedCount, answeredRecords.length) },
    },
    askedAgain,
    ...(options.examples ? { examples: exampleLines } : {}),
    markdownFeatures: {
      htmlPreview: { count: htmlPreviewCount, share: share(htmlPreviewCount, totalAsks) },
      svgPreview: { count: svgPreviewCount, share: share(svgPreviewCount, totalAsks) },
      palette: { count: paletteCount, share: share(paletteCount, totalAsks) },
      optionPreview: { count: optionPreviewCount, share: share(optionPreviewCount, totalAsks) },
    },
    ...(options.transcriptsDir ? { claudeCode: readTranscripts(options.transcriptsDir, options.sinceMs) } : {}),
  }

  return out
}

function readTranscripts(dir: string, sinceMs?: number): TranscriptReport {
  if (!existsSync(dir)) die(`transcripts directory not found: ${dir}`)
  const files = walkJsonl(dir)

  let totalCalls = 0
  const outcomeCounts = new Map<string, number>([
    ['inline', 0],
    ['backgrounded', 0],
    ['bounced', 0],
    ['refused', 0],
    ['other', 0],
  ])
  const bounceCounts = new Map<string, number>()
  let bgWithNotif = 0
  let bgMadeTools = 0
  let bgWithEditWrite = 0
  let bgEditWriteCalls = 0
  const callsBySession = new Map<string, number>()

  for (const file of files) {
    let raw: string
    try {
      raw = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (!raw.includes('mcp__parley__ask')) continue

    const lines = raw.split('\n')
    const events: { idx: number; raw: string; obj: any }[] = []
    for (let idx = 0; idx < lines.length; idx++) {
      const l = lines[idx]!
      if (!l.trim()) continue
      try {
        events.push({ idx, raw: l, obj: JSON.parse(l) })
      } catch {
        // Skip unreadable lines.
      }
    }

    const calls = new Map<string, {
      id: string
      useIdx: number
      ts: number | null
      resIdx: number | null
      resText: string
      isError: boolean
    }>()

    for (const { idx, obj } of events) {
      if (obj?.type === 'assistant') {
        const ts = typeof obj.timestamp === 'string' ? Date.parse(obj.timestamp) : null
        for (const block of obj?.message?.content ?? []) {
          if (block?.type === 'tool_use' && block.name === 'mcp__parley__ask' && typeof block.id === 'string' && !calls.has(block.id)) {
            calls.set(block.id, {
              id: block.id,
              useIdx: idx,
              ts: Number.isFinite(ts) ? ts : null,
              resIdx: null,
              resText: '',
              isError: false,
            })
          }
        }
      }
      if (obj?.type === 'user') {
        for (const block of obj?.message?.content ?? []) {
          if (block?.type === 'tool_result' && typeof block.tool_use_id === 'string') {
            const call = calls.get(block.tool_use_id)
            if (call && call.resIdx === null) {
              call.resIdx = idx
              call.isError = block.is_error === true
              call.resText = extractText(block.content)
            }
          }
        }
      }
    }

    const keptCalls = [...calls.values()].filter((c) => sinceMs === undefined || (c.ts !== null && c.ts >= sinceMs))
    if (!keptCalls.length) continue
    const sessionKey = sessionOf(file)
    callsBySession.set(sessionKey, (callsBySession.get(sessionKey) ?? 0) + keptCalls.length)

    for (const call of keptCalls) {
      totalCalls++
      const txt = call.resText.trim()
      const bgMatch = /moved to the background as task (\S+)/i.exec(txt)
      if (txt.startsWith('Input validation error')) {
        inc(outcomeCounts, 'bounced')
        for (const error of bounceErrors(txt)) inc(bounceCounts, error)
      } else if (call.isError && txt.includes("doesn't want to proceed")) {
        inc(outcomeCounts, 'refused')
      } else if (bgMatch) {
        inc(outcomeCounts, 'backgrounded')
        const taskId = bgMatch[1]!.replace(/[.,;)"']+$/, '')
        const taskTag = `<task-id>${taskId}</task-id>`
        const afterIdx = call.resIdx ?? call.useIdx
        const notif = events.find(
          (e) => e.idx > afterIdx && e.obj?.type !== 'api-request-blob' && e.raw.includes('<task-notification>') && e.raw.includes(taskTag),
        )
        if (notif) {
          bgWithNotif++
          const seenToolIds = new Set<string>()
          let toolsInWindow = 0
          let editWritesInWindow = 0
          for (const e of events) {
            if (e.idx <= afterIdx || e.idx >= notif.idx) continue
            if (e.obj?.type !== 'assistant') continue
            for (const b of e.obj?.message?.content ?? []) {
              if (b?.type === 'tool_use') {
                const tid = typeof b.id === 'string' ? b.id : `${e.idx}:${b.name}`
                if (seenToolIds.has(tid)) continue
                seenToolIds.add(tid)
                toolsInWindow++
                if (b.name === 'Edit' || b.name === 'Write') editWritesInWindow++
              }
            }
          }
          if (toolsInWindow > 0) bgMadeTools++
          if (editWritesInWindow > 0) bgWithEditWrite++
          bgEditWriteCalls += editWritesInWindow
        }
      } else if (isInlineOutcome(txt)) {
        inc(outcomeCounts, 'inline')
      } else {
        inc(outcomeCounts, 'other')
      }
    }
  }

  const callsPerSession = [...callsBySession.values()].sort((a, b) => a - b)
  const bgTotal = outcomeCounts.get('backgrounded') ?? 0
  const bounceTotal = outcomeCounts.get('bounced') ?? 0

  return {
    dir: tildePath(dir),
    calls: totalCalls,
    outcomes: ['inline', 'backgrounded', 'bounced', 'refused', 'other']
      .filter((k) => (outcomeCounts.get(k) ?? 0) > 0 || k !== 'other')
      .map((key) => {
        const count = outcomeCounts.get(key) ?? 0
        return { key, count, share: share(count, totalCalls) }
      }),
    bounces: [...bounceCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([pathAndMessage, count]) => ({
        pathAndMessage,
        count,
        shareOfBounces: share(count, bounceTotal),
      })),
    backgroundedWithNotification: {
      total: bgWithNotif,
      shareOfBackgrounded: share(bgWithNotif, bgTotal),
      madeToolCalls: bgMadeTools,
      madeToolCallsShare: share(bgMadeTools, bgWithNotif),
      withEditOrWrite: bgWithEditWrite,
      withEditOrWriteShare: share(bgWithEditWrite, bgWithNotif),
      editOrWriteCalls: bgEditWriteCalls,
    },
    asksPerSession: {
      sessions: callsPerSession.length,
      median: percentile(callsPerSession, 0.5) ?? 0,
      p90: percentile(callsPerSession, 0.9) ?? 0,
      max: callsPerSession.length ? callsPerSession[callsPerSession.length - 1]! : 0,
    },
  }
}

function walkJsonl(dir: string, out: string[] = []): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const ent of entries) {
    const full = join(dir, ent.name)
    if (ent.isDirectory()) walkJsonl(full, out)
    else if (ent.isFile() && ent.name.endsWith('.jsonl')) out.push(full)
  }
  return out
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((c) => (isRecord(c) && typeof c.text === 'string' ? c.text : '')).join('\n')
  }
  return ''
}

// Every error in one bounce, normalised (indices as N) and deduplicated, so a
// call with a long description and a long header counts under both, once each.
function bounceErrors(text: string): string[] {
  const after = (text.split('tool ask: ')[1] ?? text).trim()
  const errors = after.split(/,\s*(?=(?:questions|title|timeoutSeconds)\b)/)
  return [...new Set(errors.map((e) => e.trim()
    .replace(/\.\d+(?=\.|:)/g, '.N')
    .replace(/\bquestions?\s+\d+(?:\s+and\s+\d+)?\b/g, (m) => m.replace(/\d+/g, 'N'))))]
}

// Subagent transcripts live under `<dir>/<session>/subagents/…`; count their
// asks with the session that started them.
function sessionOf(file: string): string {
  const parts = file.split(sep)
  const at = parts.indexOf('subagents')
  return at > 0 ? parts.slice(0, at).join(sep) : file.replace(/\.jsonl$/, '')
}

function isInlineOutcome(txt: string): boolean {
  return /"status"\s*:\s*"(answered|dismissed|timed_out|cancelled)"/.test(txt)
    || txt.startsWith('The user answered:')
    || txt.startsWith('The user skipped')
    || txt.startsWith('No answer after')
    || txt.startsWith('The question was cancelled')
}

function formatMarkdown(r: UsageReport, options: Options): string {
  const lines: string[] = ['# Parley usage report', '']

  // 1. Volume
  lines.push('## 1. Volume')
  const range = r.volume.dateRange.from ? `${r.volume.dateRange.from} to ${r.volume.dateRange.to}` : 'no asks'
  const skipped = r.malformedLinesSkipped > 0 ? `; ${r.malformedLinesSkipped} malformed line(s) skipped` : ''
  lines.push(`- **Asks:** ${r.volume.asks} (${range}${options.since ? `, since ${options.since}` : ''}${skipped})`)
  lines.push(`- **Per ISO week:** ${r.volume.perIsoWeek.map((w) => `${w.key}: ${w.count} (${pct(w.share)})`).join(', ') || 'none'}`)
  lines.push(`- **Per client:** ${r.volume.perClient.map((c) => `${c.key}: ${c.count} (${pct(c.share)})`).join(', ') || 'none'}`)
  lines.push(`- **Per project (top 15):** ${r.volume.perProjectTop15.map((p) => `${p.key}: ${p.count} (${pct(p.share)})`).join(', ') || 'none'}`)
  lines.push('')

  // 2. Outcomes
  lines.push('## 2. Outcomes')
  for (const s of r.outcomes.perStatus) {
    lines.push(`- **${s.key}:** ${s.count} (${pct(s.share)})`)
  }
  if (r.outcomes.timedOutTimeouts.length) {
    lines.push(`- **Timeouts on timed-out asks:** ${r.outcomes.timedOutTimeouts.map((t) => `${t.label}: ${t.count} (${pct(t.share)})`).join(', ')}`)
  }
  lines.push('')

  // 3. Time to answer
  lines.push('## 3. Time to answer')
  if (r.timeToAnswer.answered > 0) {
    lines.push(
      `- **Percentiles (${r.timeToAnswer.answered} answered):** `
      + `p25 ${ formatSec(r.timeToAnswer.p25Seconds!) }, `
      + `median ${ formatSec(r.timeToAnswer.medianSeconds!) }, `
      + `p75 ${ formatSec(r.timeToAnswer.p75Seconds!) }, `
      + `p90 ${ formatSec(r.timeToAnswer.p90Seconds!) }, `
      + `p99 ${ formatSec(r.timeToAnswer.p99Seconds!) }`,
    )
    lines.push(`- **Over 120 s (backgrounded in Claude Code):** ${r.timeToAnswer.over120s.count} / ${r.timeToAnswer.answered} (${pct(r.timeToAnswer.over120s.share)})`)
    lines.push(`- **Over 10 min:** ${r.timeToAnswer.over10m.count} / ${r.timeToAnswer.answered} (${pct(r.timeToAnswer.over10m.share)})`)
  } else {
    lines.push('- No answered asks.')
  }
  lines.push('')

  // 4. Shape
  lines.push('## 4. Shape')
  lines.push(`- **Questions:** ${r.shape.questions} across ${r.volume.asks} asks`)
  lines.push(`- **With a title:** ${r.shape.withTitle.count} / ${r.volume.asks} (${pct(r.shape.withTitle.share)})`)
  lines.push(`- **Questions per ask:** ${r.shape.questionsPerAsk.map((q) => `${q.questions}: ${q.count} (${pct(q.share)})`).join(', ') || 'none'}`)
  lines.push(`- **By widget:** ${r.shape.perWidget.map((w) => `${w.key}: ${w.count} (${pct(w.share)})`).join(', ') || 'none'}`)
  lines.push(
    `- **Choice mode:** single ${r.shape.choiceMode.single.count} (${pct(r.shape.choiceMode.single.share)}), `
    + `multi ${r.shape.choiceMode.multi.count} (${pct(r.shape.choiceMode.multi.share)})`,
  )
  lines.push(
    `- **Options per single choice:** ${r.shape.optionsPerSingleChoice.map((o) => `${o.options}: ${o.count} (${pct(o.share)})`).join(', ') || 'none'}`,
  )
  lines.push('')

  // 5. Agreement
  lines.push('## 5. Agreement')
  const ag = r.agreement
  lines.push(`- **Recommended option picked:** ${ag.recommendedPicked.count} / ${ag.recommendedPicked.total} (${pct(ag.recommendedPicked.share)})`)
  lines.push(`- **First option picked:** ${ag.firstOptionPicked.count} / ${ag.firstOptionPicked.total} (${pct(ag.firstOptionPicked.share)})`)
  lines.push(`- **Free-text choice answers:** ${ag.freeTextAnswers.count} / ${ag.freeTextAnswers.total} (${pct(ag.freeTextAnswers.share)})`)
  lines.push(
    `- **Review items given lead decision:** ${ag.reviewLeadItems.count} / ${ag.reviewLeadItems.total} (${pct(ag.reviewLeadItems.share)}); `
    + `reviews where every item got lead: ${ag.reviewsAllLead.count} / ${ag.reviewsAllLead.total} (${pct(ag.reviewsAllLead.share)}); `
    + `reviews with custom decisions: ${ag.reviewsWithCustomDecisions.count} / ${ag.reviewsWithCustomDecisions.total} (${pct(ag.reviewsWithCustomDecisions.share)})`,
  )
  if (ag.reviewDecisions.length) {
    lines.push(`- **Review decisions by label:** ${ag.reviewDecisions.map((d) => `${d.key}: ${d.count} (${pct(d.share)})`).join(', ')}`)
  }
  lines.push(
    `- **Drafts:** ${ag.drafts.unchanged.count} / ${ag.drafts.total} unchanged (${pct(ag.drafts.unchanged.share)}), `
    + `${ag.drafts.edited.count} edited (${pct(ag.drafts.edited.share)})`,
  )
  lines.push(
    `- **Booleans:** ${ag.booleans.true.count} / ${ag.booleans.total} true (${pct(ag.booleans.true.share)}), `
    + `${ag.booleans.false.count} false (${pct(ag.booleans.false.share)})`,
  )
  lines.push(`- **Notes:** ${ag.notes.count} / ${ag.notes.total} (${pct(ag.notes.share)})`)
  lines.push(`- **Asks where nothing changed:** ${ag.nothingChanged.count} / ${ag.nothingChanged.total} (${pct(ag.nothingChanged.share)})`)
  lines.push('')

  // 6. Asked again
  lines.push(`## 6. Asked again (${r.askedAgain.length} option sets in 3+ sessions)`)
  if (r.askedAgain.length) {
    for (const set of r.askedAgain) {
      const top = set.mostCommonAnswer
        ? `${set.mostCommonAnswer.label} (${set.mostCommonAnswer.count}, ${pct(set.mostCommonAnswer.share)})`
        : 'none'
      lines.push(`- **${set.options}:** ${set.asks} asks across ${set.sessions} sessions (${set.projects.join(', ')}) — most common: ${top}`)
    }
  } else {
    lines.push('- None.')
  }
  lines.push('')

  // 7. Where Logan wrote his own words (only with --examples)
  if (r.examples) {
    lines.push(`## 7. Where Logan wrote his own words (${r.examples.length})`)
    if (r.examples.length) {
      for (const ex of r.examples) {
        lines.push(`- ${ex.formatted}`)
      }
    } else {
      lines.push('- None.')
    }
    lines.push('')
  }

  // 8. Markdown features
  lines.push('## 8. Markdown features')
  const mf = r.markdownFeatures
  lines.push(`- **\`html preview\`:** ${mf.htmlPreview.count} / ${r.volume.asks} (${pct(mf.htmlPreview.share)})`)
  lines.push(`- **\`svg preview\`:** ${mf.svgPreview.count} / ${r.volume.asks} (${pct(mf.svgPreview.share)})`)
  lines.push(`- **\`\` \`\`\`palette \`\`:** ${mf.palette.count} / ${r.volume.asks} (${pct(mf.palette.share)})`)
  lines.push(`- **Option \`x-preview\`:** ${mf.optionPreview.count} / ${r.volume.asks} (${pct(mf.optionPreview.share)})`)

  // Claude Code (--transcripts)
  if (r.claudeCode) {
    const cc = r.claudeCode
    lines.push('')
    lines.push('## Claude Code')
    lines.push(`- **Calls:** ${cc.calls} (${cc.outcomes.map((o) => `${o.key}: ${o.count}, ${pct(o.share)}`).join('; ')})`)
    if (cc.bounces.length) {
      const bounced = cc.outcomes.find((o) => o.key === 'bounced')?.count ?? 0
      lines.push(`- **Bounces by Zod path and message** (bounces carrying each error, of ${bounced}; one bounce can carry several):`)
      for (const b of cc.bounces) {
        lines.push(`  - \`\` ${b.pathAndMessage} \`\`: ${b.count} (${pct(b.shareOfBounces)})`)
      }
    }
    const bg = cc.backgroundedWithNotification
    lines.push(
      `- **Backgrounded with notification:** ${bg.total} (${pct(bg.shareOfBackgrounded)} of backgrounded); `
      + `agent made tool calls before notification in ${bg.madeToolCalls} / ${bg.total} (${pct(bg.madeToolCallsShare)}); `
      + `\`Edit\`/\`Write\` in ${bg.withEditOrWrite} / ${bg.total} (${pct(bg.withEditOrWriteShare)}, ${bg.editOrWriteCalls} calls total)`,
    )
    const aps = cc.asksPerSession
    lines.push(`- **Asks per session (${aps.sessions} sessions):** median ${aps.median}, p90 ${aps.p90}, max ${aps.max}`)
  }

  return lines.join('\n')
}

function clientOf(r: Snapshot): string {
  return r.session?.client?.name?.trim() || 'unknown'
}

function projectOf(r: Snapshot): string {
  const cwd = r.session?.cwd?.trim() ?? ''
  return basename(cwd) || cwd || 'unknown'
}

// Real names with `--projects`; otherwise `project-1` for the most asked, and so on.
function projectNamer(records: Snapshot[], real: boolean): (r: Snapshot) => string {
  if (real) return projectOf
  const counts = new Map<string, number>()
  for (const r of records) inc(counts, projectOf(r))
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const alias = new Map(ranked.map(([name], i) => [name, `project-${i + 1}`]))
  return (r) => alias.get(projectOf(r))!
}

function tildePath(p: string): string {
  const home = homedir()
  return p === home || p.startsWith(home + sep) ? '~' + p.slice(home.length) : p
}

function stripRecommended(label: string): string {
  return label.replace(/\s*\(Recommended\)/g, '').trim()
}

function oneLine(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : clean.slice(0, max - 1) + '…'
}

function plain(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim()
}

function isFilled(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function inc<K>(map: Map<K, number>, key: K) {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function share(count: number, total: number): number {
  if (!total) return 0
  return Math.round((count / total) * 1000) / 1000
}

function pct(s: number): string {
  return `${(s * 100).toFixed(1)}%`
}

function toCountShares(map: Map<string, number>, total: number): CountShare[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count, share: share(count, total) }))
}

function percentile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * q))
  return Math.round(sorted[idx]! * 10) / 10
}

// Local date, YYYY-MM-DD.
function isoDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ISO week of the local date.
function isoWeek(ms: number): string {
  const d = new Date(ms)
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = (utc.getUTCDay() + 6) % 7 // Monday = 0 .. Sunday = 6
  utc.setUTCDate(utc.getUTCDate() - day + 3) // Thursday of the ISO week
  const year = utc.getUTCFullYear()
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Day = (jan4.getUTCDay() + 6) % 7
  const week1Mon = new Date(Date.UTC(year, 0, 4 - jan4Day))
  const week = 1 + Math.round((utc.getTime() - week1Mon.getTime() - 3 * 86400000) / (7 * 86400000))
  return `${year}-W${String(week).padStart(2, '0')}`
}

function formatDuration(seconds: number): string {
  if (seconds < 120 || seconds % 60 !== 0) return `${seconds}s`
  return `${seconds / 60}m (${seconds}s)`
}

function formatSec(seconds: number): string {
  const s = Math.round(seconds)
  if (s < 120) return `${s} s`
  return s % 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s / 60} min`
}
