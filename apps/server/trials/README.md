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
