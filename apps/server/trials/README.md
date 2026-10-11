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

The question types are in the `questions` field of each result, not scored. Check them by eye for
`prune-unused`, `config-format`, `changelog-draft`, `sort-helpers` and `crash-output`; a text question with a
draft shows as `text+draft`, and a review with its own decisions as `review+decisions`.

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

2026-10-11, Claude Code 2.1.296, `claude-opus-5-5`, `--runs 3`: the first full pass with `draft`
on text (brief 10), review `decisions` (brief 11), and `capture` and copy buttons (brief 12) in the
tool description, on top of 8b8525b. From `results/2026-10-11T04-22-35-638Z.jsonl`:

| prompt | expect | asked | first call valid | used | over-asked | re-asked after skip | was (2026-10-10) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| changelog-draft | ask | 3/3 | 3/3 | 3/3 | – | – | new |
| config-format | ask | 2/3 | 2/2 | 1/2 | – | – | asked 0/3 |
| crash-output | ask | 0/3 | – | – | – | – | new |
| date-library | ask | 3/3 | 3/3 | 3/3 | – | – | same |
| dead-code-cleanup | ask | 3/3 | 3/3 | 0/3 | – | – | same |
| explain-by-category | no-ask | 0/3 | – | – | 0 | – | same |
| export-sentinel | ask | 3/3 | 3/3 | 3/3 | – | – | same |
| fix-negative-cents | no-ask | 0/3 | – | – | 0 | – | same |
| json-flag | no-ask | 0/3 | – | – | 0 | – | same |
| naming-skip | ask | 3/3 | 3/3 | – | – | 0 | same |
| prune-unused | ask | 3/3 | 3/3 | 2/3 | – | – | used 3/3 |
| refactor-reports | ask | 3/3 | 3/3 | 0/3 | – | – | same |
| sort-helpers | ask | 3/3 | 2/3 | 0/1 | – | – | new |

- **The old prompts are within run-to-run noise.** `config-format` asked 2/3 (0/3 last time,
  4 of 8 across the earlier reruns), always with `choice`, never a `review`. `prune-unused` asked
  with a plain `review` in all three runs (one run asked two); its one `used` miss is the
  generic-label problem below. One `dead-code-cleanup` run led with a `review` again.
- **`changelog-draft`:** a `text` with a `draft` in all three runs, beside a `choice`.
- **`sort-helpers`:** a `review` with `decisions` in all three runs. Run 3's first call had a
  13-character header and was rejected; it retried and asked three times in all. `used` is null
  when the reply is `first` on a review, hence 0/1.
- **`crash-output` never asked.** In all three runs the model reproduced a real crash path from
  the code (`src/format.ts:5` reading `length` of an undefined category, from a short line),
  then ended its turn with an `awk` command for the user to run and report back in chat. That's
  the "run this and paste the output" moment `capture` is for, and the model treated it as the end
  of the turn instead. The prompt is answerable enough from the code that a no-ask is defensible;
  whether a real debugging session reaches for `capture` is a hands-on check. Note that fake-hub
  answers a plain `text` question with 'as you see fit', so a model that asked with `text` instead
  of `capture` would score `used` 0 here.
- `used` 0/3 on `dead-code-cleanup` and `refactor-reports` is still the generic-label problem, not
  ignored answers.
- Not recorded: a Codex baseline. Run `--client codex --runs 1` before the next model-facing
  change, so there's something to compare Codex against.
