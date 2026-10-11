# Testing

How Parley is checked without a person at the keyboard or a real client: unit tests for the pure
parts, stand-ins for each side of the socket and for an MCP Apps host, and a harness that runs real
models against a fake app.

**Sources:** `apps/server/scripts/`, `apps/server/trials/`, `apps/server/fixtures/`, `packages/protocol/src/ask.test.ts`, `apps/desktop/src/asks/persist.test.ts`, `apps/desktop/src/asks/store.test.ts`, `apps/desktop/src/forms/schemas.test.ts`

**History:** [brief 1](../briefs/archive/01-hub-and-lifecycle.md) (`fake-ask`), [brief 3](../briefs/archive/03-trial-harness.md) (`fake-hub`, trials), [brief 7](../briefs/archive/07-inline-cards.md) (`fake-host`)

The commands are in [`AGENTS.md`](../../AGENTS.md#commands). This page is what each one covers
and when to reach for it.

## How it works

- **Unit tests** (vitest):
  - `packages/protocol`: input validation, the compiler and the answer shaper, and that the
    fixtures cover every question type (`ask.test.ts`).
  - `apps/desktop`: the history file's startup fold (`persist.test.ts`), the store's hub handlers
    (`resolved`, `inline`) through the real hub client with Tauri mocked (`store.test.ts`), and
    every fixture's compiled schema under JSON Forms' AJV settings and under strict mode with the
    `x-*` keywords declared (`schemas.test.ts`).
- **`fake-ask`** (`scripts/fake-session.ts`) acts as one server session without an MCP client:
  it connects to the hub, sends a form and prints the outcome. It takes `ask` tool input (a bare
  name like `choice` resolves to `packages/protocol/fixtures/choice.json`), which goes through the
  tool's validation, compiler and shaper, or a raw `FormSpec` (sample:
  `apps/server/fixtures/sample.json`). Ctrl-C kills it without a cancel, which exercises the
  app's disconnect path.
- **`fake-hub`** stands in for the app on a socket, logs every ask (`--log`), and answers on a
  script: `first`, `second`, `last`, `other:<text>`, `skip`, `none`, `delay:<s>:<policy>` (for a review, `first` and `last` approve every item,
  `second` rejects the first, and `other:<text>` rejects it with the text as its comment). Each
  ask takes the next `--reply`; the last repeats. `--old-app` rejects `resolved` as an app from
  before inline cards does. Point a server at it with `PARLEY_SOCKET` and `PARLEY_NO_LAUNCH=1`.
- **`fake-host`** stands in for an MCP Apps host (Claude Desktop). It advertises the extension,
  spawns the server (from source, or `--server dist`) and a `fake-hub` per scenario, plays both the
  model and the card, and prints pass or fail per scenario: `card-wins`, `window-wins`, `skip`,
  `slice`, `unknown-id`, `path`, `old-app`, `plain`.
- **The gallery** renders every fixture through the real card without the hub
  ([the card](card-ui.md#how-it-works)).

## The trial harness

`pnpm --filter @parley/server trial` runs the prompts in `apps/server/trials/prompts/` through
real clients (Claude Code in print mode, Codex) against `fake-hub`, and scores each run: whether
the model asked when it should and not when it shouldn't, whether its first call was valid,
whether it used the answer, and whether it re-asked after a skip. `apps/server/trials/README.md`
has the run options (including `--score` and `--summary` to re-score a saved run), what a run
does, the prompts, the scoring and the baseline.

- Runs use the built bundle, in a throwaway copy of `trials/project/`, with the server on a socket
  in its own short directory under `$TMPDIR`.
- Claude Code runs with `--setting-sources project,local --strict-mcp-config
  --no-session-persistence`, so user settings and the global `CLAUDE.md` don't load. The project's
  `.claude/settings.local.json` denies `AskUserQuestion`. `--bare` and a scratch `HOME` both break
  OAuth.

## Rules worth keeping

- **Run `fake-host`** after touching the tool surfaces, the ask lifecycle or `AppClient`.
- **Run the trials** after changing anything model-facing: the tool schema or description, the
  server instructions, or the result text. Compare against the baseline. Skip them otherwise: they
  run real clients and cost time and tokens.
- **Socket paths:** macOS caps them at 104 bytes, so put a `fake-hub` socket under `$TMPDIR`.
- **A new question shape gets a fixture** in `packages/protocol/fixtures/`: the gallery,
  `fake-ask` and `schemas.test.ts` pick it up from there.
- **Native behavior is checked by hand.** Nothing automated drives the real window, the panel,
  notifications or the hotkey; briefs list those as hands-on checks for Logan.
