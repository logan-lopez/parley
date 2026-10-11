# AGENTS.md: instructions for agents in `parley`

## The project

Parley is an MCP server for questions from the model to the user, answered in a floating desktop
app or, in Claude Desktop, in a card inline in the chat. pnpm workspace, Node 24: `apps/server`
(the MCP server, stdio), `apps/desktop` (Tauri 2 shell and Vue 3 webview, plus the inline card as
a second entry) and `packages/protocol` (the form spec, the wire messages, and the `ask` tool's
schema, compiler and answer shaper). Start with [`README.md`](README.md), then the architecture
page for the code you're touching ([Areas](#areas)). The pages say how the code works now; the
briefs' reports are its history.

`docs/guide/` is how Parley works as Logan uses it, one page per feature: what he sees and does,
not how it's built. When a brief changes that (a control, a key, a behavior, a client's setup),
update the guide pages it changes once, before the brief's report, and keep the root README's
feature list and "What it's built around" in step. Guide pages name what they draw on in a
`**Covers:**` line, which `wrap`'s drift check watches.

Handoff briefs are in `docs/briefs/`. Start with `README.md`; unscheduled ones are in `FUTURE.md`,
and finished ones move to `archive/`. The decisions not to relitigate are the table in
`docs/briefs/README.md`. When a decision is made or changed, edit its row there; the evidence goes
on the architecture page it's about.

Logan's notes on Parley are in his Obsidian vault,
`~/Writing/Books/TheBond/Development/Projects/Parley/`. They're his ideas (`Ideas.md`): read them as
files, and leave them to him. `Guide/` there is a symlink to `docs/guide/`, so write the guide in
the repo, and add nothing under `Guide/`.

### Commands

From the root:

| | |
| --- | --- |
| `pnpm app` | `tauri dev` for the desktop app. The dev app and the installed one can't run at once (single instance, one socket). |
| `pnpm install:desktop` | Release-builds `Parley.app` and installs it in `~/Applications` (`PARLEY_APP_DIR` overrides), registered with LaunchServices so the server's `open -b` finds it. It never quits or opens Parley: a running copy keeps the old build until you quit it from the tray and reopen. |
| `pnpm server` | The MCP server from source (tsx). |
| `pnpm typecheck` / `pnpm build` | Every package. |
| `pnpm --filter @parley/server build` | Builds the inline card (`pnpm --filter @parley/desktop build:mcp-app`), then bundles the server to `apps/server/dist/index.mjs` with the card beside it as `dist/card.html`. The bundle is what an MCP client config points at (`node .../dist/index.mjs`). Needs Node 24: tsdown loads its `.ts` config through native type stripping, and Node 22.17 fails with "Failed to import module unrun". |
| `pnpm --filter @parley/protocol test` | vitest for the input validation, the compiler and the answer shaper. |
| `pnpm --filter @parley/desktop test` | vitest for the history fold, the store's hub handlers, and every fixture's compiled schema under AJV. |
| `pnpm --filter @parley/server fake-ask <file.json \| fixture> [--timeout <s>]` | One session without an MCP client: sends a form to the app and prints the outcome. |
| `pnpm --filter @parley/server fake-hub <socket> [--log f.jsonl] [--reply <policy>]... [--old-app]` | Stands in for the app and answers on a script. Pair with `PARLEY_SOCKET`. |
| `pnpm --filter @parley/server fake-host [scenario...] [--server dist]` | Stands in for Claude Desktop and prints pass/fail per scenario. Run it after touching the tool surfaces, the lifecycle or `AppClient`. |
| `pnpm --filter @parley/server trial [--client claude\|codex\|all] [--runs N] [--prompt <name>]...` | The model-uptake harness. Rerun it after changing anything model-facing (tool schema or description, server instructions, result text), and only then: it runs real clients and costs time and tokens. The baseline is in `apps/server/trials/README.md`. |
| `pnpm --filter @parley/desktop dev`, then `http://localhost:1420/?gallery` | The gallery (dev only): every fixture through the real card, without the hub. `&fixture=<name>` picks one. |

What each test tool covers is on [the testing page](docs/architecture/testing.md). `.mcp.json` at
the root (gitignored) registers the built server for Claude Code in this repo.

### Rules that aren't obvious from the code

- The server's stdout is the MCP channel. Never `console.log` there; log to stderr.
- Keep the Rust side small: tray, global hotkey, window management, the socket hub. Rust forwards
  hub lines as JSON without reading their type; the protocol lives in the webview and the server.
- `@parley/protocol` is source-only: import the `.ts` directly. `@parley/protocol/ask` (the Zod
  schema, compiler and shaper) is a separate entry so the window's bundle doesn't pull in Zod; only
  the gallery and the inline card import it on the desktop side.
- Renderers import `src/platform.ts`, never `@tauri-apps/*`, so they run in the inline card too.
- The JSON Forms packages (`@jsonforms/core`, `@jsonforms/vue`, `@jsonforms/vue-vanilla`) must be
  the same exact version. MCP SDK v2 (`@modelcontextprotocol/server`), not `@modelcontextprotocol/sdk`.
  TypeScript ~6.0, not 7.
- `tauri.conf.json`'s CSP and the dev header in `vite.config.ts` must match, except for what Vite
  needs in dev (inline styles, the HMR socket). `script-src` keeps
  `'unsafe-eval'` for AJV.
- `src/styles.css` has two identical dark token blocks (system media query and `data-theme`). Keep
  them in step.
- A new Tauri command needs its name in the app manifest in `src-tauri/build.rs` and its
  permission in `src-tauri/capabilities/default.json`. The fs scope
  is the two history files and `captures/` only; `hub.sock` is in the same directory.
- Before adding or changing a key chord (the global hotkey, card keys), check
  `~/.config/keymap/keymap.md`. `Cmd+0` belongs to AeroSpace.
- The model-facing text (server instructions, tool descriptions, result text) is measured by the
  trial harness. Change it deliberately, and rerun the trials.
- An `ask` answer that arrives after Claude Code backgrounded the call (2 min) has `<` and `>` as
  `&lt;` and `&gt;`. That's Claude Code, not Parley ([the ask tool](docs/architecture/ask-tool.md)).
  When you commit or write out a draft the user accepted (`edited: false`), use your own text.
- `PARLEY_SOCKET` overrides the socket on both sides; `PARLEY_NO_LAUNCH=1` stops the server
  launching the app. macOS caps socket paths at 104 bytes: test sockets go under `$TMPDIR`.
- Use the project's Tauri CLI (`pnpm tauri ...`), not a global `cargo tauri`.

### Areas

`docs/architecture/` has one page per area, describing the code as it is now (start with [the
overview](docs/architecture/README.md)). Before changing code in an area, read its page. When a
change makes a sentence on a page untrue, fix the page in the same commit. A new area gets a page, a
row here and a pointer in `.claude/rules/` (Claude Code loads the matching one by itself; this table
is the same map for every agent).

| Code | Read first |
| --- | --- |
| `apps/server/src/index.ts`, `apps/server/src/client-capabilities.ts`, `apps/server/src/tools/ask.ts`, `apps/server/src/ask-lifecycle.ts` | [The ask tool](docs/architecture/ask-tool.md) |
| `apps/desktop/src/asks/**`, `apps/desktop/src/history/**`, `apps/desktop/src/main.ts` | [Asks and history](docs/architecture/asks-and-history.md) |
| `apps/desktop/src/card/**`, `apps/desktop/src/forms/**`, `apps/desktop/src/platform.ts`, `apps/desktop/src/styles.css`, `apps/desktop/src/zoom.ts`, `apps/desktop/src/ZoomControl.vue`, `apps/desktop/src/App.vue`, `apps/desktop/src/main.ts`, `apps/desktop/src/gallery/**` | [The card](docs/architecture/card-ui.md) |
| `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src-tauri/src/window.rs`, `apps/desktop/src-tauri/src/tray.rs`, `apps/desktop/src-tauri/src/shortcut.rs`, `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/capabilities/**`, `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/Info.plist`, `apps/desktop/src-tauri/build.rs`, `apps/desktop/vite.config.ts`, `apps/desktop/scripts/install.sh` | [The desktop shell](docs/architecture/desktop-shell.md) |
| `packages/protocol/src/ask.ts`, `packages/protocol/src/form.ts`, `packages/protocol/fixtures/**` | [The form spec](docs/architecture/form-spec.md) |
| `packages/protocol/src/wire.ts`, `apps/desktop/src-tauri/src/hub.rs`, `apps/desktop/src/hub/**`, `apps/server/src/app-client.ts` | [The hub and the wire protocol](docs/architecture/hub.md) |
| `apps/server/src/tools/inline.ts`, `apps/server/src/ask-lifecycle.ts`, `apps/server/src/card.ts`, `apps/server/tsdown.config.ts`, `apps/desktop/src/mcp-app/**`, `apps/desktop/mcp-app.html`, `apps/desktop/vite.mcp-app.config.ts` | [Inline cards (show, then wait)](docs/architecture/inline-cards.md) |
| `apps/server/scripts/**`, `apps/server/trials/**`, `apps/server/fixtures/**`, `packages/protocol/src/ask.test.ts`, `apps/desktop/src/asks/persist.test.ts`, `apps/desktop/src/asks/store.test.ts`, `apps/desktop/src/forms/schemas.test.ts`, `apps/desktop/src/forms/markdown.test.ts` | [Testing](docs/architecture/testing.md) |
