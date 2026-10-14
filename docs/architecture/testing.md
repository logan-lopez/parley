# Testing

How Parley is checked without a person at the keyboard or a real client: unit tests for the pure
parts, stand-ins for each side of the socket and for an MCP Apps host, and a harness that runs real
models against a fake app.

**Sources:** `apps/server/scripts/`, `apps/desktop/scripts/screenshots.ts`, `apps/server/trials/`, `apps/server/fixtures/`, `packages/protocol/src/ask.test.ts`, `apps/desktop/src/asks/persist.test.ts`, `apps/desktop/src/asks/store.test.ts`, `apps/desktop/src/forms/schemas.test.ts`, `apps/desktop/src/forms/markdown.test.ts`, `apps/desktop/src/forms/preview.test.ts`

**History:** [brief 1](../briefs/archive/01-hub-and-lifecycle.md) (`fake-ask`), [brief 3](../briefs/archive/03-trial-harness.md) (`fake-hub`, trials), [brief 7](../briefs/archive/07-inline-cards.md) (`fake-host`), [brief 12](../briefs/archive/12-capture-question.md) (the `capture` scenario)

The commands are in [`AGENTS.md`](../../AGENTS.md#commands). This page is what each one covers
and when to reach for it.

## How it works

- **Unit tests** (vitest):
  - `packages/protocol`: input validation, the compiler and the answer shaper, and that the
    fixtures cover every question type (`ask.test.ts`).
  - `apps/desktop`: the history file's startup fold and which screenshot folders have aged out
    (`persist.test.ts`), the store's hub handlers
    (`resolved`, `inline`) through the real hub client with Tauri mocked (`store.test.ts`), and
    every fixture's compiled schema under JSON Forms' AJV settings and under strict mode with the
    `x-*` keywords declared, plus what a review and a capture accept (`schemas.test.ts`), and
    what counts as a color, palette parsing and the markdown it renders to, preview fences
    included (`markdown.test.ts`, in Node, so without `CSS.supports`), and the preview builder:
    the info string, clamping, the scale, what's stripped, the base style's place, SVG repairs
    and failures, and the cache, each picture re-parsed as the image's XML would be
    (`preview.test.ts`, in jsdom). Themes: the bundled pair reproduces the old colors, inn's
    files parse, and errors name the file (`theme.test.ts`); folder precedence and fallbacks
    (`load.test.ts`); the setting and `settings.json` (`setting.test.ts`); and no color literal
    outside `src/theme/` (`no-color-literals.test.ts`) ([themes](themes.md)).
  - `apps/desktop/src-tauri` (`cargo test`): a line through the hub keeps its key order, which is
    the question order (`hub.rs`).
- **`fake-ask`** (`scripts/fake-session.ts`) acts as one server session without an MCP client:
  it connects to the hub, sends a form and prints the outcome. It takes `ask` tool input (a bare
  name like `choice` resolves to `packages/protocol/fixtures/choice.json`), which goes through the
  tool's validation, compiler and shaper, or a raw `FormSpec` (sample:
  `apps/server/fixtures/sample.json`). Ctrl-C kills it without a cancel, which exercises the
  app's disconnect path.
- **`fake-hub`** stands in for the app on a socket, logs every ask (`--log`), and answers on a
  script: `first`, `second`, `last`, `other:<text>`, `skip`, `none`, `delay:<s>:<policy>` (for a review, `first` and `last` give every item the first
  decision, `second` gives the first item the second, and `other:<text>` does that with the text
  as its comment, reading the decisions from the items' enum, so approve and reject without
  `decisions`; for a
  text draft, `first` sends it unchanged and `other:<text>` appends the text as its last line; a
  capture gets `other:<text>` as pasted text, or 'as you see fit', and never a screenshot). Each
  ask takes the next `--reply`; the last repeats. `--old-app` rejects `resolved` as an app from
  before inline cards does. Point a server at it with `PARLEY_SOCKET` and `PARLEY_NO_LAUNCH=1`.
- **`fake-host`** stands in for an MCP Apps host (Claude Desktop). It advertises the extension,
  spawns the server (from source, or `--server dist`) and a `fake-hub` per scenario, plays both the
  model and the card, and prints pass or fail per scenario: `card-wins`, `window-wins`, `skip`,
  `slice`, `unknown-id`, `path`, `capture` (an image capture goes to the window, a text-only one
  inline), `old-app`, `plain`.
- **The gallery** renders every fixture through the real card without the hub
  ([the card](card-ui.md#how-it-works)).
- **`screenshots`** (`apps/desktop/scripts/screenshots.ts`) draws the gallery headless for
  [What it looks like](../guide/screenshots.md) and the README: Vite on its own port (1430 up,
  no HMR), Playwright's WebKit (the window is WKWebView), each fixture in light and dark at 2x,
  clipped to the gallery's 440 x 600 frame, into `docs/guide/images/cards/`. Fixture names narrow
  it. Playwright is pinned exactly, since each release wants its own browser build
  (`pnpm exec playwright install webkit` if it's missing). The window shot
  (`docs/guide/images/app.png`) is taken by hand.

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
  `fake-ask`, `schemas.test.ts` and `screenshots` pick it up from there. Give it a section on
  [What it looks like](../guide/screenshots.md).
- **Rerun `screenshots`** after a visible change to the card or a fixture, and commit the PNGs
  with it.
- **Native behavior is checked by hand.** Nothing automated drives the real window, the panel,
  notifications or the hotkey; briefs list those as hands-on checks for Logan.
