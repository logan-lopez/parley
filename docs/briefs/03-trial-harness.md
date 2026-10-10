# Brief 3: Trial harness for model uptake

Read `CLAUDE.md` and [`README.md`](README.md) first. Briefs 1 and 2 are merged. You build on
`fake-hub`, the built server in `apps/server/dist/`, and the print-mode trial setup described under
"Claude Code and long asks" in `CLAUDE.md`.

## Goal

Make "do models use `ask`, and use it well?" a number you can rerun after any change to the tool
description or the server instructions.

Brief 2 measured this once, by hand, on three prompts. With `alwaysLoad`, the model asked on 2 of 3.
Every later brief changes the description or the instructions, and the instructions are capped at
2,048 characters. Without a harness, each change is judged by feel.

This brief measures. It doesn't tune. Leave the instructions and the tool description alone, and
record a baseline that briefs 4 and 5 compare against.

## Ownership

You own a new `apps/server/trials/` directory, a new `apps/server/scripts/trial.ts`, a `trial`
script in `apps/server/package.json`, and small additions to `apps/server/scripts/fake-hub.ts` if
scoring needs them. Don't touch `packages/protocol`, the tool, or the instructions.

## 1. Layout

```text
apps/server/trials/
  README.md          how to run it, and the baseline table (section 5)
  project/           a small scratch project the prompts make sense in, copied fresh per run
  prompts/*.md       one prompt per file, with frontmatter
  results/           gitignored: one JSONL per invocation, plus transcripts
```

`project/` is a template. Each run copies it to a new directory under `$TMPDIR`, so a run can edit
files freely and nothing leaks between runs. Give it enough to make the prompts real: a few
TypeScript modules, a stale file or two, a `package.json`. It needs a
`.claude/settings.local.json` that denies `AskUserQuestion` and allows `mcp__parley__ask`.
`CLAUDE.md` says the deny works.

## 2. Prompts

Each file holds frontmatter plus the prompt text:

```markdown
---
expect: ask          # ask | no-ask
reply: first         # a fake-hub policy: first | second | other:<text> | skip | none
---
Clean up the utils folder.
```

Draft 6–8 prompts, then **stop and have Logan review them before the first scored run.** The
prompts are the spec; a wrong prompt makes every number after it wrong. Cover:

- Brief 2's three: an ambiguous refactor, a choice between libraries, a destructive cleanup.
- Two `no-ask` prompts: a clear, specific bug fix, and a question the code already answers.
  Over-asking is a failure too.
- One with `reply: skip`, to check the model doesn't ask the same thing again.
- One with `reply: other:<sentinel>`, where the sentinel is a distinctive string such as
  `use-the-zephyr-pattern`, so "acted on the answer" can be checked with a search.

## 3. The runner (`scripts/trial.ts`)

```text
pnpm --filter @parley/server trial [--client claude|codex|all] [--runs N] [--prompt <name>]... [--model <id>]
```

For each prompt × client × run:

1. Build the server once per invocation (`pnpm --filter @parley/server build`). Runs test what
   ships: `dist/index.mjs`, not `tsx`.
2. Copy `project/` to a fresh dir. Start `fake-hub` on a socket under `$TMPDIR` with `--log` and the
   prompt's `reply` policy. macOS caps socket paths at 104 bytes, so keep the name short.
3. Run the client in that dir with a per-run timeout (5 min default), and kill it if the timeout
   hits:
   - **Claude Code:** `claude -p <prompt> --output-format stream-json` with
     `--setting-sources project,local --strict-mcp-config --no-session-persistence` and a
     generated `--mcp-config` that points at `dist/index.mjs`, with `PARLEY_SOCKET` and
     `PARLEY_NO_LAUNCH=1` in its `env`. Check whether stream-json needs `--verbose` in `-p` mode.
   - **Codex:** `codex exec --json --ephemeral --skip-git-repo-check -C <dir>`, with the server
     added through `-c mcp_servers.parley.*` overrides (command, args, env). Check how Codex
     approves MCP tool calls in `exec` mode, and make sure the run never waits on an approval.
   - A run may edit files in its scratch copy and nowhere else. Allow edits there. Don't allow
     anything that reaches outside the copy.
4. Score the run from the client's event stream, the fake-hub log, and the scratch dir's diff.

Run sequentially by default. Record the client version (`claude --version`, `codex --version`) and
the model with every result.

## 4. Scoring

Per run:

| Field | How |
| --- | --- |
| `asked` | the event stream has at least one call to the Parley `ask` tool |
| `askCount` | how many calls |
| `firstValid` | the first call's result isn't an error. Validation failures never reach fake-hub, so this has to come from the client's stream, not the hub log. |
| `matchedExpect` | `asked` agrees with `expect` |
| `used` | the reply fake-hub sent (the picked label, or the sentinel) shows up in the final message or in the scratch dir's diff. Null when there was no answer to use. |
| `reAskedAfterSkip` | with `reply: skip`: another `ask` after the dismissal |
| `questions` | the headers and types the model wrote, for reading by eye |

Write one JSON line per run to `results/<timestamp>.jsonl`, and keep the raw transcript beside it
for every run that failed a check. Print a summary table per prompt and client: asked k/n,
first-call valid k/n, used k/n, and over-asked or re-asked counts.

"Used" is approximate on purpose. A search for the reply string misses paraphrases. Say so in the
README, and read the transcripts when the number looks wrong.

## 5. Baseline

Once Logan has approved the prompts, run Claude Code with `--runs 3` and Codex with `--runs 1`. Put
the summary table in `trials/README.md` with the date, client versions and models. Briefs 4 and 5
rerun the harness and compare against it.

Three runs per prompt is noisy. Don't read a one-run difference as a result.

## Acceptance

Run each of these and report the results.

1. `pnpm --filter @parley/server trial --prompt <one> --client claude` completes, scores, and
   leaves no stray processes, sockets or scratch dirs behind.
2. The same with `--client codex`.
3. Scoring a saved transcript whose first `ask` call failed validation gives `firstValid: false`.
   If no real run has produced one, hand-edit a copy of a real transcript. Keep the scorer separate
   from the runner so it can be pointed at a saved file.
4. Logan has reviewed the prompts, and the baseline table is in `trials/README.md`.
5. `pnpm typecheck` passes.

Then stop, and ask Logan before committing.
