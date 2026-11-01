---
size: S
size-note: "one script and a fixture; the analysis was prototyped while writing the brief"
status: awaiting-review
---
# Brief 19: A usage report from real asks

Read `CLAUDE.md`, [`README.md`](README.md), [testing](../architecture/testing.md), [asks and
history](../architecture/asks-and-history.md) and `apps/server/trials/README.md` first. No
prerequisites. Briefs 20 and 21 use this report for before and after numbers.

## Goal

Add a command that measures how Parley gets used in real work, from the asks Logan has already
answered: `pnpm --filter @parley/server usage`. The trial harness scores staged prompts, and
nothing scores real use. The ideate on 2026-11-01 did this by hand with throwaway Python, and the
numbers changed what's next:

- 956 asks from 2026-10-10 to 11-01. 925 from Claude Code; 10 each from Claude Desktop's inline
  card and Copilot CLI.
- 94% answered, 40 timed out, 16 cancelled. Median time to answer 85 s, p90 8 min.
- 66 of 1,006 calls (6.6%) bounced on input validation. Brief 20 fixes most of those.
- The recommended option was picked 92% of the time, review items were approved 96%, and 78 of
  79 drafts came back unchanged. 61% of answered asks changed nothing.
- 15 option sets were asked in three or more sessions ("Commit / Not yet" 17 times, never "Not
  yet"). Brief 21 is the answer to that.

The report makes those numbers repeatable, so briefs 20 and 21 can show whether they moved them.

## Decisions already made

- **History is the default source; Claude Code's transcripts are opt-in** (`--transcripts`).
  `history.jsonl` is Parley's own format. The transcripts are Claude Code's, undocumented, and can
  change under us. Logan approved this shape from the ideate on 2026-11-01.
- **Read-only.** The script never writes the history file or the transcripts.
- **Not in the app.** No stats view in the window (ideate, 2026-11-01: a dashboard in a 440 px
  panel is for nobody).

## Already checked

All 2026-11-01, against the files on Logan's machine.

- **History file:** `~/Library/Application Support/com.loganlopez.parley/history.jsonl`
  (identifier `com.loganlopez.parley` in `apps/desktop/src-tauri/tauri.conf.json`). One full
  snapshot per line, `v: 1`; the last line per `id` wins (`fold` in
  `apps/desktop/src/asks/persist.ts`). Records older than 30 days are dropped on compaction, so
  the report covers 30 days at most.
- **Record keys** (`AskRecord` in `apps/desktop/src/asks/store.ts`): `id`, `session` (`client.name`,
  `client.version`, `cwd`, `id`, `pid`), `form` (`schema`, `title?`), `createdAt`, `expiresAt`,
  `status` (`answered`, `dismissed`, `timed_out`, `cancelled`, `orphaned`), `endedAt`,
  `endedReason?`, `data?`, `note?`, `draft?`, `answeredIn?`. Times are epoch ms.
- **Reading the compiled form:** each question is a property of `form.schema.properties`, with
  `x-widget`. A choice's options are `anyOf` entries with `const` (a free-text answer is a value
  that matches no `const`); a multi-select is `type: 'array'`. The recommendation is the `const`
  containing `(Recommended)`. A draft is `x-draft` on a `text` property, and "unchanged" means equal
  after normalising line endings and trimming (as `readAnswer` does in
  `packages/protocol/src/ask.ts`). A review's `data[id]` is an array of `{ decision, comment? }`,
  and its decisions are the `enum` on `items[].properties.decision`; the first one is the lead.
  A capture's data is `{ text?, images? }`. A skipped optional question has no key in `data`.
- **Transcripts:** `~/.claude/projects/<dir>/<session>.jsonl`, plus subagent files below them. An
  ask is a `tool_use` block named `mcp__parley__ask` inside `message.content`. **Parse the
  blocks:** the same name also appears in tool listings in those files (1,629 files contain the
  string; 1,006 real calls). The result is the `tool_result` block with the same `tool_use_id`:
  - inline: JSON text with a `status`;
  - backgrounded: text containing `moved to the background as task <id>`, and the answer arrives
    later as a `<task-notification>` containing `<task-id><id></task-id>`. Search for that in the
    raw line text, not one message type, because it shows up in more than one record kind;
  - bounced: text starting `Input validation error`, with the Zod path and message after
    `tool ask: `;
  - refused by Logan's permission prompt: `is_error` with "doesn't want to proceed".
- **Validation errors by kind, measured:** option `description` over 300: 29; `header` over 12:
  20; `label` over 60: 5; review `detail` over 300: about 10; others: 2. 66 in all.

## Open questions

- **Which window by default?** Default: everything in the file (30 days at most), with
  `--since <YYYY-MM-DD>` to narrow it.

## Shape

**`apps/server/scripts/usage.ts`**, run with tsx like the other scripts. Add
`"usage": "tsx scripts/usage.ts"` to `apps/server/package.json`. Node built-ins only, no new
dependencies.

```
pnpm --filter @parley/server usage [--since YYYY-MM-DD] [--history <file>] [--transcripts [<dir>]] [--examples] [--json]
```

It prints a markdown report to stdout (or the raw numbers as JSON with `--json`) in these
sections. Each line gives a count and a share, and examples where noted.

1. **Volume:** asks, the date range, per ISO week, per client (`session.client.name`), per
   project (basename of `session.cwd`), top 15.
2. **Outcomes:** count per status; the timeout each timed-out ask had (`expiresAt - createdAt`).
3. **Time to answer** (answered only): p25, median, p75, p90, p99; the share over 120 s (the
   asks Claude Code moved to the background); the count over 10 min.
4. **Shape:** questions per ask, the share with a title, the count per widget, options per
   single choice, single vs multi.
5. **Agreement:** recommended option picked (of choices that had one); first option picked;
   free-text answers; review decisions per label and how many reviews gave every item the lead
   decision; reviews with custom decisions; drafts unchanged vs edited; booleans true vs false;
   notes; and **asks where nothing changed**: every answer was the recommendation (or, with
   none, the first option), every review item the lead decision with no comment, every boolean
   true, every draft unchanged, and no note. Any other widget means the ask doesn't count.
6. **Asked again:** choice questions whose option set (labels with ` (Recommended)` removed,
   sorted) appears in 3+ distinct `session.id`s, with the count, the projects and the most common
   answer. This is brief 21's number.
7. **Where Logan wrote his own words:** the free-text choice answers and notes, newest first,
   each as `project · header: text` cut to 160 characters. Only with `--examples`, because they're
   private and the default report gets pasted into docs.
8. **Markdown features:** asks using `html preview`, `svg preview`, ```` ```palette ````, an
   option `x-preview`.

With `--transcripts` (default dir `~/.claude/projects`), add a **Claude Code** section:

- calls, and how each ended: inline, backgrounded, bounced, refused, other;
- bounces grouped by Zod path with indices replaced by `N` (`questions.N.options.N.description`)
  and the message, most common first;
- for backgrounded calls with a notification: whether the agent made tool calls before it
  arrived, and the count of `Edit`/`Write` calls in that window;
- asks per session: median, p90, max.

Fold history the way `persist.ts` does: the last line per id, malformed lines counted and
skipped, and a still-`pending` record reported as pending (don't apply the orphan rule; the app
may be running). Don't import from `apps/desktop`. The script is self-contained.

**`apps/server/fixtures/usage-history.jsonl`**: a small synthetic history (made up, never copied
from Logan's file) that covers every section: two clients, one of each status, a choice with a
recommendation picked and one with free text, a review with custom decisions, a draft unchanged
and one edited, a note, a repeated option set across three sessions, and one malformed line.

**Docs:**
- [testing](../architecture/testing.md): a bullet for `usage` under How it works.
- `AGENTS.md`: a row in the Commands table.
- `apps/server/trials/README.md`: a `## Real use` section after the baseline, with the report's
  numbers on the day you build it (sections 1–6, plus the Claude Code section), dated, and a line
  saying how to refresh it. No free text or notes in it.

## Out of scope

- Writing anything to the history file, settings or transcripts.
- Codex or Copilot transcripts (their asks show up in history anyway).
- A stats view in the app, charts, or an HTML report.
- Changing what the app records. If a number can't be computed from history as it is, say so in
  the report, not in the app.

## Acceptance

- `pnpm --filter @parley/server usage --history apps/server/fixtures/usage-history.jsonl` prints
  every section, with counts you can check against the fixture by hand, and reports the
  malformed line as skipped.
- `pnpm --filter @parley/server usage` on Logan's real file prints at least the 956 asks from
  2026-10-10 to 11-01 (more by the time you run it), a median time to answer near 85 s, and the
  recommendation picked about 92% of the time. Large differences mean a parsing bug, not a change
  in behavior.
- `pnpm --filter @parley/server usage --transcripts` reports about 1,006 or more calls, with 66
  or more bounces and `description` over 300 as the most common bounce.
- `--since 2026-10-25` narrows every section, and `--json` prints valid JSON (`| jq .` exits 0).
- `pnpm typecheck` passes.
- The `## Real use` section is in `apps/server/trials/README.md`, and contains no free text or
  notes.

Then stop. Report the headline numbers in the brief's report, and ask Logan before committing the
real-use section if anything in it looks private.

## Report

- **Built:**
  - `apps/server/scripts/usage.ts` and `"usage": "tsx scripts/usage.ts"` in
    `apps/server/package.json`: read-only CLI that folds `$APPDATA/history.jsonl` (or `--history
    <file>`), filters by `--since YYYY-MM-DD`, and prints markdown (or `--json`) covering volume,
    outcomes, time to answer, form shape, agreement (recommendations, first option, free text,
    review decisions and custom decision sets, drafts unchanged vs edited, booleans, notes, and
    asks where nothing changed), option sets repeated in 3+ sessions, optional `--examples`
    (free-text choice answers and notes), markdown features, and optional `--transcripts [<dir>]`
    (Claude Code calls, inline/backgrounded/bounced/refused outcomes, normalized Zod bounce paths,
    tool/edit activity while backgrounded, and asks per session).
  - `apps/server/fixtures/usage-history.jsonl`: synthetic history fixture covering two clients,
    every ask status (`answered`, `dismissed`, `timed_out`, `cancelled`, `orphaned`, `pending`,
    plus an earlier `pending` line folded into `answered`), recommended and free-text choices,
    custom review decisions, unchanged and edited drafts, a note, a repeated option set across
    three sessions, markdown preview features, and one malformed line.
  - Headline numbers on 2026-11-01, rerun after the review fixes below (`pnpm --filter
    @parley/server usage --transcripts`):
    - **Volume & outcomes:** 983 asks (2026-10-10 to 2026-11-01; 952 Claude Code, 10 each Claude
      Desktop, Copilot CLI, and `fake-ask`, 1 Codex); 921 answered (93.7%), 40 timed out (4.1%),
      16 cancelled (1.6%), 3 dismissed (0.3%), 3 orphaned (0.3%).
    - **Time to answer:** median 83 s, p90 7 min 47 s, 350 / 921 (38.0%) over 120 s, 71 (7.7%)
      over 10 min.
    - **Agreement:** recommended option picked 1,372 / 1,490 (92.1%); review items given lead
      decision 926 / 988 (93.7%); drafts unchanged 78 / 79 (98.7%); booleans true 65 / 67
      (97.0%); asks where nothing changed 638 / 921 (69.3%). The brief's 61% came from the
      ideate's hand count; recomputed independently from this brief's definition it's 69%, so
      the script is right and brief 21's baseline is 69%.
    - **Asked again:** 16 option sets in 3+ sessions, led by `Commit / Not yet` (17 asks across 14
      sessions, `Commit` 16/16) and `Not now / Yes, run them` (13 asks across 13 sessions, `Yes,
      run them` 12/12).
    - **Claude Code transcripts:** 1,037 calls (569 inline, 394 backgrounded, 70 bounced = 6.8%,
      4 refused). Bounces carrying each error, of 70: `questions.N.options.N.description` > 300
      (30), `questions.N.header` > 12 (24), `questions.N.items.N.detail` > 300 (10). Agent made
      tool calls before the background notification in 284 / 390 (72.8%) and `Edit`/`Write` in
      72 / 390 (18.5%, 216 calls).
- **Deviations:** None.
- **Review fixes (2026-11-01, after review):**
  - A bounce counts under every error it carries, not just the first (11 of the bounces carry
    more than one; `header` went from 20 to 24).
  - Dates are local time (`--since`, the date range, ISO weeks), not UTC.
  - A subagent's transcript counts with its parent session in asks per session.
  - Projects are `project-1`, `project-2`… unless `--projects`, and home paths print as `~`, so
    the default output is safe for the public repo; the Real use section was regenerated that
    way. The first version named every project.
  - Durations print as `7 min 47 s`, not a rounded minute; the palette row's label renders.
  - `testing.md`'s link to `AGENTS.md#commands` restored, brief 19 added to its History line.
  - The commit no longer carries the README's links to briefs 20 and 21, which aren't committed
    yet.
- **Defaults taken:**
  - Default window: everything in `history.jsonl` (30 days at most), with `--since <YYYY-MM-DD>` to
    narrow it.
- **Acceptance:**
  - `pnpm --filter @parley/server usage --history apps/server/fixtures/usage-history.jsonl`: passed
    (8 folded asks across 2 clients and all 6 statuses, 1 malformed line skipped, all sections
    populated and verified against the fixture).
  - `pnpm --filter @parley/server usage` on Logan's real file: passed (961 asks from 2026-10-10 to
    2026-11-01, median time to answer 84 s, recommendation picked 92.1%).
  - `pnpm --filter @parley/server usage --transcripts`: passed (1,012 calls, 67 bounces,
    `questions.N.options.N.description` over 300 most common at 30).
  - `--since 2026-10-25` and `--json`: passed (`pnpm -s --filter @parley/server usage --since
    2026-10-25 --json | jq .` exits 0 and narrows every section; note `-s` suppresses pnpm's own
    script banner on stdout).
  - `pnpm typecheck`: passed.
  - `## Real use` in `apps/server/trials/README.md`: added with dated sections 1–6 and Claude Code,
    with no free text or notes.
- **Size:** sized S, this session not measured.
- **Spot checks for Logan:**
  - Run `pnpm --filter @parley/server usage --transcripts` and `pnpm --filter @parley/server usage
    --examples` to inspect the live output and your own free-text answers/notes.
- **Docs updated:**
  - `docs/architecture/testing.md` (`usage` bullet under How it works, and converted `../../AGENTS.md#commands` link to backticked path).
  - `AGENTS.md` (`usage` row in the Commands table).
  - `apps/server/trials/README.md` (`## Real use` section).
- **Follow-ups:**
  - Pre-existing changes in the working tree (`docs/briefs/20-input-limits.md`,
    `docs/briefs/21-dont-ask-again.md`, `docs/briefs/FUTURE.md`, `docs/decisions/README.md`,
    `docs/decisions/dont-ask-again.md`, `docs/decisions/soft-input-limits.md`) were left out of
    this commit per the Git rules.

