# Trials

Do models use `ask`, and use it well? This runs a fixed set of prompts through real clients, with
`fake-hub` answering for the user, and scores each run. Rerun it after any change to the tool
description or the server instructions, and compare against the baseline below.

It measures. It doesn't tune.

## Running

```sh
pnpm --filter @parley/server trial [--client claude|codex|all] [--runs N] [--prompt <name>]...
                                   [--model <id>] [--timeout <s>] [--keep]
pnpm --filter @parley/server trial --score <run dir>          # re-score a saved run
pnpm --filter @parley/server trial --summary <results.jsonl>  # re-print a summary table
```

- `--client` defaults to `claude`. `--runs` defaults to 1, `--timeout` to 300 s per run.
- `--model` overrides the default for every client in the invocation: `claude-opus-5-5` for Claude
  Code and `gpt-6-astra` for Codex (Codex at its default effort, since `--ignore-user-config` drops
  `model_reasoning_effort`). With `--client all`, pass `--model` only if both clients take that id.
- `--keep` keeps every transcript, not only the failing ones.
- Runs are sequential. A full Claude pass at `--runs 3` takes about half an hour.

## What a run does

1. Builds the server once per invocation. Runs use `dist/index.mjs`, the bundle that ships, not
   `tsx`.
2. Copies `project/` to a fresh dir under `$TMPDIR` and commits it in a throwaway git repo, so the
   diff shows only what the run changed.
3. Starts `fake-hub` on a socket in its own short dir under `$TMPDIR` (macOS caps socket paths at
   104 bytes), with the prompt's `reply` policy and `--log`.
4. Runs the client in the copy, in its own process group, and kills the group on timeout or exit, so
   the MCP server goes with it.
   - **Claude Code:** `claude -p --output-format stream-json --verbose` (print mode needs
     `--verbose` for stream-json), `--setting-sources project,local --strict-mcp-config
     --no-session-persistence`, a generated `--mcp-config`, and `--permission-mode acceptEdits`.
     User settings and `~/.claude/CLAUDE.md` don't load, which matters because the global
     CLAUDE.md tells the model to use Parley. The project's `.claude/settings.local.json` denies
     `AskUserQuestion`, allows `mcp__parley__ask`, and turns on Claude Code's sandbox: Bash runs
     auto-approved under an OS sandbox that can write only inside the copy, with no unsandboxed
     fallback. Anything else that would prompt is denied, since nobody is there to answer. The
     runner strips `CLAUDECODE`, `CLAUDE_CODE_*`, `CLAUDE_PID` and `CLAUDE_EFFORT` from the
     environment, so a nested run doesn't inherit the parent session's effort or messaging socket.
   - **Codex:** `codex exec --json --ephemeral --skip-git-repo-check --ignore-user-config -s
     workspace-write -C <copy>`, with the server added through `-c mcp_servers.parley.*`.
     `--ignore-user-config` keeps your other MCP servers, hooks and `notify` out (auth still
     loads). `exec` forces `approval_policy=never`, which rejects any MCP call that needs approval,
     so the runner sets `mcp_servers.parley.tools.ask.approval_mode="approve"`. The
     `workspace-write` sandbox limits writes to the copy.
5. Scores the run from the client's event stream, the fake-hub log and the diff (see below), and
   removes the copy and the socket dir.

Ctrl-C kills the run in flight and cleans up.

## Prompts

`prompts/*.md`, one per file. The file name is the prompt's name.

```markdown
---
expect: ask          # ask | no-ask
reply: first         # a fake-hub policy: first | second | other:<text> | skip | none
match: zephyrExport  # optional: what to search for instead of the reply
---
Add a way to export the ledger.
```

`match` exists for `other:` replies. fake-hub sends the same free text to every choice question,
so the text has to read sensibly whatever the model asks, which makes it a sentence. `match` is the
distinctive part of that sentence to search for.

The prompts were reviewed by Logan on 2026-10-10. They're the spec, so change them deliberately.
A changed prompt resets the comparison for that prompt.

| prompt | expect | reply | checks |
| --- | --- | --- | --- |
| refactor-reports | ask | first | an ambiguous refactor |
| date-library | ask | first | a choice between libraries |
| dead-code-cleanup | ask | first | a destructive cleanup |
| fix-negative-cents | no-ask | first | a clear, specific bug fix |
| explain-by-category | no-ask | first | a question the code answers |
| json-flag | no-ask | first | a clear, specified feature |
| naming-skip | ask | skip | no re-ask after a skip |
| export-sentinel | ask | other:… | acted on a free-text answer |
| prune-unused | ask | other:… | a list to sign off on: should be one `review` question |
| config-format | ask | first | a single decision: should be a choice, not a `review` |
| changelog-draft | ask | other:… | an edit-in-place draft: should be one `text` with a `draft` |
| sort-helpers | ask | first | a per-item assignment: should be one `review` with `decisions` |
| crash-output | ask | other:… | output only the user can get: should be one `capture` |
| report-look | ask | first | a visual choice: should preview layouts or colors (`html preview`, chips, a palette) |

The question types are in the `questions` field of each result, not scored. Check them by eye for
`prune-unused`, `config-format`, `changelog-draft`, `sort-helpers` and `crash-output`; a text question with a
draft shows as `text+draft`, and a review with its own decisions as `review+decisions`. For
`report-look`, read the questions themselves in the transcript: which of chips, a palette, an
`html preview` and an `svg preview` they use.

`project/` is `tally`, a small expense-CSV CLI with a planted sign bug in `fromCents`, unused
helpers, unwired `reports/monthly.ts` and `reports/yearly.ts`, a superseded `utils/format-old.ts`
and `parse-tsv.ts`, unused `constants.ts`, a v0.1 `data/sample-v1.csv`, and a one-off
`scripts/migrate-v1.ts` that still imports `utils/dates.ts`. That's about 11 deletion candidates,
counting unused exports, for `prune-unused`. It has no `node_modules` and runs have
no network, so `tsc` can't find `@types/node` in a run. Models often say so; it's expected.

## Scoring

One JSON line per run in `results/<timestamp>.jsonl` (gitignored). Transcripts of runs that failed a
check go in `results/<timestamp>/<prompt>.<client>.<run>/`: `events.jsonl`, `hub.jsonl`,
`diff.patch`, `stderr.log`, `prompt.md`, `meta.json`. That dir is what `--score` reads.

| Field | How |
| --- | --- |
| `asked`, `askCount` | calls to the Parley `ask` tool in the client's event stream |
| `firstValid` | the first call's result isn't an error. Validation failures never reach fake-hub, so this comes from the stream. |
| `matchedExpect` | `asked` agrees with `expect` |
| `used` | a choice answer fake-hub sent (minus " (Recommended)"), or `match`, appears in the final message or the diff's added lines, ignoring case and punctuation. Null when there was no choice answer to use. |
| `reAskedAfterSkip` | `reply: skip` only: another `ask` after the first dismissed one |
| `questions` | the headers and types the model wrote, per call, for reading by eye |
| `hubAsks` | asks that reached fake-hub. Fewer than `askCount` means rejected input. |
| `toolLoaded` | Claude only: `mcp__parley__ask` was in the init event's tool list. Codex doesn't report one, so it's null. |
| `failed` | the checks the run failed: `overAsked`, `underAsked`, `firstValid`, `used`, `reAskedAfterSkip`, `toolMissing`, `timedOut`, `exitCode` |

**`used` is approximate, on purpose.** It's a string search, so it misses paraphrases, and
`reply: first` makes that worse: models write short generic labels (`Keep`, `Remove all`), then
report "Kept, as you chose". A low `used` means read the transcripts, not that the model ignored
the answer. Trust it more on `export-sentinel`, where the string is distinctive.

`fixtures/invalid-first-ask.{claude,codex}/` are real runs whose first call failed validation (a
40-character header). `trial --score trials/fixtures/invalid-first-ask.claude` should give
`firstValid: false` and `hubAsks: 0`.

## Baseline

2026-10-14, Claude Code 2.1.299, `claude-opus-5-5`, `--runs 3`: the first full pass with color
chips and palettes (brief 13) and `html preview`/`svg preview` blocks (brief 14) in the tool
description, which grew by those two paragraphs' sentences; on top of 1f96382. From
`results/2026-10-14T14-07-12-828Z.jsonl`, plus `--keep` reruns for reading by eye
(`2026-10-14T14-39-33-419Z`, `report-look` ×3, and `2026-10-14T14-41-59-854Z`, every prompt ×1):

| prompt | expect | asked | first call valid | used | over-asked | re-asked after skip | was (2026-10-11) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| changelog-draft | ask | 3/3 | 3/3 | 3/3 | – | – | same |
| config-format | ask | 1/3 | 1/1 | 1/1 | – | – | asked 2/3 |
| crash-output | ask | 2/3 | 2/2 | 2/2 | – | – | asked 0/3 |
| date-library | ask | 3/3 | 3/3 | 2/3 | – | – | used 3/3 |
| dead-code-cleanup | ask | 3/3 | 3/3 | 1/2 | – | – | used 0/3 |
| explain-by-category | no-ask | 0/3 | – | – | 0 | – | same |
| export-sentinel | ask | 3/3 | 3/3 | 3/3 | – | – | same |
| fix-negative-cents | no-ask | 0/3 | – | – | 0 | – | same |
| json-flag | no-ask | 0/3 | – | – | 0 | – | same |
| naming-skip | ask | 3/3 | 3/3 | – | – | 0 | same |
| prune-unused | ask | 3/3 | 3/3 | 3/3 | – | – | used 2/3 |
| refactor-reports | ask | 3/3 | 3/3 | 0/3 | – | – | same |
| report-look | ask | 3/3 | 3/3 | 3/3 | – | – | new |
| sort-helpers | ask | 3/3 | 3/3 | 2/2 | – | – | first call valid 2/3 |

- **`report-look`:** every run, the three in the pass and four with `--keep`, asked one `choice`
  ("Look") whose options each carried an `html preview`, mostly `width=400 height=220`, beside a
  second choice for where the file goes. Twelve previews read by eye, all HTML with inline
  `style` attributes: no chips, no palette, no `svg preview`. The model set backgrounds and left
  text to the default, which is why HTML previews are now drawn on a light page in any theme.
- **No `html preview` where code was meant.** None appeared outside `report-look` in the 14
  `--keep` runs or the 8 failed runs' transcripts, and no plain `html` or `svg` fences either.
- **Ask rates are within noise.** `config-format` asked 1/3 (2/3 last time, 0/3 the time before),
  always with `choice`. `crash-output` asked for the first time, 2/3 here and 1/1 with `--keep`,
  twice with a `capture` and once with a `choice` offering the error; it was 0/3.
- **`sort-helpers` regressed in shape.** Last time it was a `review` with `decisions` in all three
  runs. Here, runs 1 and 3 asked four `choice` questions, one per helper file, and run 2 a plain
  `review`; the `--keep` run used `review+decisions` again. One more paragraph in the description
  may be crowding the review example; rerun before reading much into three runs.
- `used` misses are the label problem again: `date-library` run 3's label was a sentence ("Use
  date-fns, you install") and the run did use date-fns; `refactor-reports` 0/3 as before.
- Not recorded: a Codex baseline, still. Run `--client codex --runs 1` before the next
  model-facing change.

## Real use

2026-11-01, from `$APPDATA/history.jsonl` and `~/.claude/projects`. Refresh with
`pnpm --filter @parley/server usage --transcripts`. Paste its default output only: projects are
`project-1`, `project-2`… by ask count, and `--projects` (real names) and `--examples` (your own
free-text answers and notes) are for reading locally, never for this file.

### 1. Volume
- **Asks:** 983 (2026-10-10 to 2026-11-01)
- **Per ISO week:** 2026-W41: 180 (18.3%), 2026-W42: 287 (29.2%), 2026-W43: 266 (27.1%), 2026-W44: 250 (25.4%)
- **Per client:** claude-code: 952 (96.8%), claude-ai: 10 (1.0%), copilot-cli: 10 (1.0%), fake-ask: 10 (1.0%), codex-mcp-client: 1 (0.1%)
- **Per project (top 15):** project-1: 169 (17.2%), project-2: 168 (17.1%), project-3: 155 (15.8%), project-4: 77 (7.8%), project-5: 74 (7.5%), project-6: 63 (6.4%), project-7: 55 (5.6%), project-8: 46 (4.7%), project-9: 37 (3.8%), project-10: 22 (2.2%), project-11: 17 (1.7%), project-12: 16 (1.6%), project-13: 12 (1.2%), project-14: 10 (1.0%), project-15: 8 (0.8%)

### 2. Outcomes
- **answered:** 921 (93.7%)
- **timed_out:** 40 (4.1%)
- **cancelled:** 16 (1.6%)
- **dismissed:** 3 (0.3%)
- **orphaned:** 3 (0.3%)
- **Timeouts on timed-out asks:** 30m (1800s): 25 (62.5%), 15m (900s): 7 (17.5%), 60m (3600s): 3 (7.5%), 5m (300s): 2 (5.0%), 20m (1200s): 2 (5.0%), 10m (600s): 1 (2.5%)

### 3. Time to answer
- **Percentiles (921 answered):** p25 32 s, median 83 s, p75 3 min 27 s, p90 7 min 47 s, p99 21 min 22 s
- **Over 120 s (backgrounded in Claude Code):** 350 / 921 (38.0%)
- **Over 10 min:** 71 / 921 (7.7%)

### 4. Shape
- **Questions:** 2160 across 983 asks
- **With a title:** 906 / 983 (92.2%)
- **Questions per ask:** 1: 406 (41.3%), 2: 213 (21.7%), 3: 128 (13.0%), 4: 236 (24.0%)
- **By widget:** choice: 1791 (82.9%), text: 137 (6.3%), review: 126 (5.8%), boolean: 75 (3.5%), capture: 24 (1.1%), path: 6 (0.3%), number: 1 (0.0%)
- **Choice mode:** single 1718 (95.9%), multi 73 (4.1%)
- **Options per single choice:** 2: 797 (46.4%), 3: 835 (48.6%), 4: 82 (4.8%), 5: 4 (0.2%)

### 5. Agreement
- **Recommended option picked:** 1372 / 1490 (92.1%)
- **First option picked:** 1474 / 1654 (89.1%)
- **Free-text choice answers:** 69 / 1724 (4.0%)
- **Review items given lead decision:** 926 / 988 (93.7%); reviews where every item got lead: 98 / 119 (82.4%); reviews with custom decisions: 32 / 126 (25.4%)
- **Review decisions by label:** approve: 775 (78.4%), Pass: 64 (6.5%), reject: 24 (2.4%), Archive: 23 (2.3%), Worked: 20 (2.0%), Keep: 16 (1.6%), Brief: 14 (1.4%), Fine: 6 (0.6%), Port: 6 (0.6%), Take 2: 6 (0.6%), Take 3: 5 (0.5%), Fail: 4 (0.4%), Push+migrate: 4 (0.4%), Take 1: 4 (0.4%), Partial: 3 (0.3%), Accept: 2 (0.2%), Confirm: 2 (0.2%), Drop: 2 (0.2%), Off: 2 (0.2%), Change: 1 (0.1%), Failed: 1 (0.1%), None: 1 (0.1%), Not run: 1 (0.1%), Skip: 1 (0.1%), TODO: 1 (0.1%)
- **Drafts:** 78 / 79 unchanged (98.7%), 1 edited (1.3%)
- **Booleans:** 65 / 67 true (97.0%), 2 false (3.0%)
- **Notes:** 30 / 983 (3.1%)
- **Asks where nothing changed:** 638 / 921 (69.3%)

### 6. Asked again (16 option sets in 3+ sessions)
- **Commit / Not yet:** 17 asks across 14 sessions (project-1, project-17, project-3, project-4, project-6, project-7) — most common: Commit (16, 100.0%)
- **Not now / Yes, run them:** 13 asks across 13 sessions (project-2) — most common: Yes, run them (12, 100.0%)
- **24 LTS / 26 current:** 8 asks across 5 sessions (project-14, project-6) — most common: 26 current (2, 66.7%)
- **Separate repos / Single package / Workspace:** 8 asks across 5 sessions (project-14, project-6) — most common: Single package (3, 100.0%)
- **Go ahead / Not now:** 7 asks across 7 sessions (project-16, project-2, project-4, project-5) — most common: Go ahead (7, 100.0%)
- **Run it now / Skip it:** 6 asks across 6 sessions (project-11, project-2, project-5, project-8, project-9) — most common: Run it now (3, 100.0%)
- **Not now / Yes, run it:** 5 asks across 5 sessions (project-2, project-5) — most common: Yes, run it (4, 100.0%)
- **Commit / Leave uncommitted:** 4 asks across 4 sessions (project-3, project-4, project-6) — most common: Commit (3, 100.0%)
- **Don't commit yet / One commit / Two commits:** 4 asks across 4 sessions (project-1, project-7) — most common: Two commits (4, 100.0%)
- **Not now / Yes, capture freely:** 4 asks across 4 sessions (project-2) — most common: Yes, capture freely (4, 100.0%)
- **Run it / Skip it:** 4 asks across 4 sessions (project-2, project-3, project-5) — most common: Run it (3, 75.0%)
- **Commit with this message / Not yet:** 3 asks across 3 sessions (project-1, project-7) — most common: Commit with this message (2, 100.0%)
- **Don't launch / Launch it now:** 3 asks across 3 sessions (project-1) — most common: Launch it now (3, 100.0%)
- **Go ahead / Wait:** 3 asks across 3 sessions (project-2, project-5) — most common: Go ahead (2, 100.0%)
- **Go now / Not now:** 3 asks across 3 sessions (project-1, project-6) — most common: Not now (2, 66.7%)
- **One brief / Three briefs / Two briefs:** 3 asks across 3 sessions (project-1, project-2, project-7) — most common: Three briefs (2, 66.7%)

### Claude Code
- **Calls:** 1037 (inline: 569, 54.9%; backgrounded: 394, 38.0%; bounced: 70, 6.8%; refused: 4, 0.4%)
- **Bounces by Zod path and message** (bounces carrying each error, of 70; one bounce can carry several):
  - `` questions.N.options.N.description: Too big: expected string to have <=300 characters ``: 30 (42.9%)
  - `` questions.N.header: header is a short chip of 12 characters or fewer, like "Auth method"; the full question goes in `question` ``: 24 (34.3%)
  - `` questions.N.items.N.detail: Too big: expected string to have <=300 characters ``: 10 (14.3%)
  - `` questions.N.options.N.label: option labels are 60 characters or fewer; put detail in `description` ``: 5 (7.1%)
  - `` questions.N.items.N.label: item labels are 120 characters or fewer; put detail in `detail` ``: 2 (2.9%)
  - `` questions.N.options: a choice question needs at least 2 options ``: 1 (1.4%)
  - `` questions.N.options.N.label: question N has an option labelled 'Other, after v2 (Recommended)'; leave it out, because choice questions already let the user type their own answer ``: 1 (1.4%)
- **Backgrounded with notification:** 390 (99.0% of backgrounded); agent made tool calls before notification in 284 / 390 (72.8%); `Edit`/`Write` in 72 / 390 (18.5%, 216 calls total)
- **Asks per session (679 sessions):** median 1, p90 2, max 23
