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
| plan-check | ask | first | a plan to check: should put the file in front of the user (`show` with `path`) and ask about it |
| config-tweak | ask | other:… | a file for the user to adjust: should be a `show` with `path` and `editable` |

The question types are in the `questions` field of each result, not scored. Check them by eye for
`prune-unused`, `config-format`, `changelog-draft`, `sort-helpers` and `crash-output`; a text question with a
draft shows as `text+draft`, a review with its own decisions as `review+decisions`, and an
editable show as `show+editable`. For
`report-look`, read the questions themselves in the transcript: which of chips, a palette, an
`html preview` and an `svg preview` they use. For `plan-check`, whether a `show` appears and
whether it used `path` or `content`. For `config-tweak`, whether the show is `editable`, and whether the agent then
re-applied a change Parley had already saved: a `written: true` answer means the edit is on disk
without the agent touching the file, so the diff check finds `EUR` either way. Read the
transcript for a second write of the same line.

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

2026-11-02, Claude Code 2.1.316, `claude-opus-5-5`, `--runs 3 --keep`: the first full pass with
editable shows (brief 17) in the tool description, whose show bullet grew by one sentence, and
the new `config-tweak` prompt. From `results/2026-11-02T14-55-15-960Z.jsonl`, every transcript
kept. Compared with brief 16's pass (the section below):

| prompt | expect | asked | first call valid | used | over-asked | re-asked after skip | was (2026-11-02, brief 16) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| changelog-draft | ask | 3/3 | 2/3 | 3/3 | – | – | valid 3/3 |
| config-format | ask | 1/3 | 1/1 | 0/1 | – | – | asked 2/3 |
| config-tweak | ask | 3/3 | 3/3 | 3/3 | – | – | new |
| crash-output | ask | 0/3 | – | – | – | – | same |
| date-library | ask | 3/3 | 3/3 | 3/3 | – | – | used 1/3 |
| dead-code-cleanup | ask | 3/3 | 2/3 | 0/2 | – | – | valid 3/3 |
| explain-by-category | no-ask | 0/3 | – | – | 0 | – | same |
| export-sentinel | ask | 3/3 | 3/3 | 3/3 | – | – | same |
| fix-negative-cents | no-ask | 0/3 | – | – | 0 | – | same |
| json-flag | no-ask | 0/3 | – | – | 0 | – | same |
| naming-skip | ask | 3/3 | 3/3 | – | – | 0 | same |
| plan-check | ask | 3/3 | 3/3 | 0/3 | – | – | same |
| prune-unused | ask | 3/3 | 3/3 | 2/3 | – | – | used 3/3 |
| refactor-reports | ask | 2/3 | 2/2 | 0/2 | – | – | asked 3/3 |
| report-look | ask | 3/3 | 3/3 | 3/3 | – | – | same |
| sort-helpers | ask | 3/3 | 3/3 | 0/1 | – | – | same |

- **`config-tweak`: an editable show in all three runs.** Each wrote `tally.config.json`, then
  asked once: a `show` of it by `path` with `editable: true`, then a "Ready?" question. Each got
  "Parley saved it" with the diff. `fake-hub`'s `other:` adds the text as the file's last line,
  which for JSON lands after the closing `}`, so every run rewrote the file to move the line
  inside, and said so. That's repairing invalid JSON, not re-applying a saved edit: none wrote
  the same change twice. Runs 2 and 3 asked "Ready?" as a choice, got the EUR line as their own
  answer, and held off wiring it in, which is the reply's fault, not the model's.
- **`editable` elsewhere once:** `plan-check` run 2 made its plan editable (the `first` reply
  sends it unchanged, so the answer said it was left unchanged). The other shows were as before:
  `plan-check` 1 and 3 by `path`, `dead-code-cleanup` run 1 by `content`.
- **Two invalid first calls, both retried at once:** `changelog-draft` run 1 left `type: 'text'`
  off its draft question, and `dead-code-cleanup` run 1 left `question` off a show. Neither is
  about `editable`.
- **Asking dipped on two prompts:** `refactor-reports` run 1 judged the refactor clear and went
  ahead (a first in its history), and `config-format` asked once, as on 2026-10-14. `date-library`
  went back to 3/3 used. Every `used` miss elsewhere is the label problem.

## After show blocks (brief 16)

2026-11-02, Claude Code 2.1.316, `claude-opus-5-5`, `--runs 3 --keep`: the first full pass with
`show` blocks (brief 16) in the tool description, which grew by one bullet, and the new
`plan-check` prompt. On top of the soft input limits (brief 20). From
`results/2026-11-02T05-54-19-377Z.jsonl`, every transcript kept. Compared with brief 20's pass
(the section below), the last one before this change; brief 14's baseline of 2026-10-14 is in
git history:

| prompt | expect | asked | first call valid | used | over-asked | re-asked after skip | was (2026-11-02, brief 20) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| changelog-draft | ask | 3/3 | 3/3 | 3/3 | – | – | same |
| config-format | ask | 2/3 | 2/2 | 0/2 | – | – | same |
| crash-output | ask | 0/3 | – | – | – | – | same |
| date-library | ask | 3/3 | 3/3 | 1/3 | – | – | used 3/3 |
| dead-code-cleanup | ask | 3/3 | 3/3 | 0/3 | – | – | same |
| explain-by-category | no-ask | 0/3 | – | – | 0 | – | same |
| export-sentinel | ask | 3/3 | 3/3 | 3/3 | – | – | same |
| fix-negative-cents | no-ask | 0/3 | – | – | 0 | – | same |
| json-flag | no-ask | 0/3 | – | – | 0 | – | same |
| naming-skip | ask | 3/3 | 3/3 | – | – | 0 | same |
| plan-check | ask | 3/3 | 3/3 | 0/3 | – | – | new |
| prune-unused | ask | 3/3 | 3/3 | 3/3 | – | – | same |
| refactor-reports | ask | 3/3 | 3/3 | 0/3 | – | – | same |
| report-look | ask | 3/3 | 3/3 | 3/3 | – | – | same |
| sort-helpers | ask | 3/3 | 3/3 | 0/1 | – | – | used 1/1 |

- **`plan-check`: `show` with `path` in all three runs.** Each wrote `docs/csv-plan.md` (49 to 55
  lines), then asked once: a `show` of the file by `path`, no `lines`, with a one-line lead
  ("Here's the plan I wrote."), then an "Approve" `choice`, and in two runs two more choices on
  details the plan left open. None pasted the plan as `content`. `used` 0/3 is the label problem:
  every run said "you approved it" and implemented the plan.
- **`show` elsewhere, three times, always `content`.** `dead-code-cleanup` runs 1 and 3 opened
  with a "Plan" show listing what they'd remove anyway (331 and 692 characters), before choices
  on the doubtful files. That's a sign-off list, which a `review` fits better, but it's context
  for the questions, not a stand-in for one. `changelog-draft` run 3 opened with a "Note" show
  (455 characters, "The fix isn't in the code yet") before the draft: a heads-up a line of
  question text would carry, so that one is `show` where a plain question would do. No run used
  `show` alone, and every show came before the questions about it.
- **Ask rates and first-call validity held.** Every prompt asked as often as in brief 20's pass,
  and every call was valid and reached the hub, 33 of 33. `crash-output` is still 0/3.
- **`used` misses are the label problem,** read in the transcripts: `date-library` runs 1 and 3
  answered with a sentence ("Declare date-fns, you install") and did exactly that; `sort-helpers`
  run 2's review was all approved and the run sorted the files that way. `sort-helpers` shapes:
  run 1 `review+decisions`, runs 2 and 3 a plain `review`, about the same mix as before.
- Not recorded: a Codex baseline, still (brief 20 hit the usage limit).

## After soft input limits (brief 20)

2026-11-02, Claude Code 2.1.316, `claude-opus-5-5`, `--runs 3`, on top of the soft limits (header
and description limits widened on the server, the description naming each limit). From
`results/2026-11-02T04-47-48-862Z.jsonl`. The tool description grew by the limits in the choice and
review lines. Compared with brief 14's baseline of 2026-10-14, the one before it (now in git
history):

| prompt | expect | asked | first call valid | used | was (2026-10-14) |
| --- | --- | --- | --- | --- | --- |
| changelog-draft | ask | 3/3 | 3/3 | 3/3 | same |
| config-format | ask | 2/3 | 2/2 | 0/2 | asked 1/3, used 1/1 |
| crash-output | ask | 0/3 | – | – | asked 2/3 |
| date-library | ask | 3/3 | 3/3 | 3/3 | used 2/3 |
| dead-code-cleanup | ask | 3/3 | 3/3 | 0/3 | used 1/2 |
| explain-by-category | no-ask | 0/3 | – | – | same |
| export-sentinel | ask | 3/3 | 3/3 | 3/3 | same |
| fix-negative-cents | no-ask | 0/3 | – | – | same |
| json-flag | no-ask | 0/3 | – | – | same |
| naming-skip | ask | 3/3 | 3/3 | – | same |
| prune-unused | ask | 3/3 | 3/3 | 3/3 | same |
| refactor-reports | ask | 3/3 | 3/3 | 0/3 | same |
| report-look | ask | 3/3 | 3/3 | 3/3 | same |
| sort-helpers | ask | 3/3 | 3/3 | 1/1 | same counts; shapes below |

- **`sort-helpers` shape:** run 1 asked four `choice` questions, run 2 a plain `review`, run 3 a
  `review+decisions`. Last time it was two runs of four `choice` questions and a plain `review`, with
  `review+decisions` only in a `--keep` rerun. About the same mix, so the soft limits didn't move it.
- **First call valid:** every call that was made was valid, 29 of 29. Nothing in the pass was a
  validation bounce.
- **`crash-output` asked 0/3,** against 2/3 on 2026-10-14. It was 0/3 on 2026-10-11 and the
  change touches no wording about when to ask, so this reads as the same noise as `config-format`
  moving 1/3 to 2/3, but it is a drop on a score that should hold.
- **The `used` misses are the label problem.** Read: `dead-code-cleanup` run 1 kept the reports as
  answered and said so in other words; `config-format` run 1 put the config in the project
  directory first, then home, which is "Project, then home" restated.
- **Codex: not a baseline.** `--client codex --runs 1` hit the account's usage limit after three
  runs (`changelog-draft`, `config-format`, `sort-helpers`), and the other eleven failed at once
  with "You've hit your usage limit" (`results/2026-11-02T05-19-46-349Z.jsonl`, `gpt-6-astra`,
  codex-cli 0.166.0). The three that ran: all asked, all first call valid; `changelog-draft` was
  one `text+draft`, `sort-helpers` one `review`, `config-format` two `choice` questions. Rerun the
  whole set once the limit resets before calling it a baseline.

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
