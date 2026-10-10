# Parley

An MCP server for model → user questions, rendered as forms in a floating desktop app. Design doc
lives in Obsidian: `Development/Projects/Parley/Project Doc.md`.

The project doc is the source of truth for decisions and scope. When a decision is made or changed
(architecture, tool surface, scope moving between MVP and v2), update the doc in the same session
with the Obsidian MCP tools. Edit the relevant section. Don't append a changelog, and don't rewrite
sections that are unaffected. When a decision replaces an earlier lean, keep a one-line *Was:* note
beside it so the reasoning trail survives. Implementation details belong here or in code, not in
the doc.

Handoff briefs are in `docs/briefs/`. Start with `README.md`; unscheduled ones are in `FUTURE.md`,
and finished ones move to `archive/`.

## Layout

pnpm workspace, Node 24.

- `apps/server`: the MCP server (stdio). Thin: validates the form spec, relays it to the app.
- `apps/desktop`: Tauri 2 shell (`src-tauri/`) + Vue 3 webview (`src/`). `src/mcp-app/` is a second
  entry: the ask card as an MCP Apps view, inline in Claude Desktop's chat (`mcp-app.html`,
  `vite.mcp-app.config.ts`, one self-contained HTML file in `dist-mcp-app/`).
- `packages/protocol`: the form spec and server ↔ app wire messages. Source-only, so consumers import
  the `.ts` directly, with no build step. `@parley/protocol/ask` is a separate entry (the `ask`
  tool's Zod schema, `compileQuestions`, `shapeAnswer`), so the app bundle doesn't pull in Zod.
  Shared question fixtures live in `packages/protocol/fixtures/`.

## Commands

From the root:

- `pnpm app`: `tauri dev` for the desktop app
- `pnpm install:desktop`: release-builds `Parley.app` and installs it in `~/Applications`
  (`PARLEY_APP_DIR` overrides), registered with LaunchServices so the server's `open -b` finds it.
  It never quits or opens Parley: a running copy keeps the old build until you quit it from the
  tray and reopen. The dev app and the installed one can't run at once (single instance, one
  socket).
- `pnpm server`: run the MCP server from source (tsx)
- `pnpm typecheck` / `pnpm build`: all packages
- `pnpm --filter @parley/server build`: builds the card (`pnpm --filter @parley/desktop
  build:mcp-app`), then bundles to `apps/server/dist/index.mjs` with the card copied beside it as
  `dist/card.html`. The bundle is what an MCP client config points at (`node .../dist/index.mjs`).
  `.mcp.json` at the root registers it for Claude Code in this repo. Under tsx the server reads the
  card from `apps/desktop/dist-mcp-app/` instead. Either way it's read on every request, and a
  missing card is an error on `resources/read`, not at startup. Needs Node 24: tsdown loads its
  `.ts` config through native type stripping, and Node 22.17 fails with "Failed to import module
  unrun".
- `pnpm --filter @parley/protocol test`: vitest for the compiler and answer shaper.
- `pnpm --filter @parley/desktop test`: vitest for the history file's startup fold, the store's
  hub handlers (`resolved`, `inline`) through the real hub client with Tauri mocked, and every
  fixture's compiled schema under JSON Forms' AJV settings and strict mode.
- `pnpm --filter @parley/server fake-ask <file.json | fixture> [--timeout <s>]`: acts as one session
  without an MCP client. It connects to the hub, sends the form, and prints the outcome. Takes `ask`
  tool input (a bare name like `choice` resolves to `packages/protocol/fixtures/choice.json`), which
  goes through the tool's validation, compiler and shaper, or a raw `FormSpec` (sample:
  `apps/server/fixtures/sample.json`). Ctrl-C kills it without a cancel, which exercises the
  disconnect path.
- `pnpm --filter @parley/server fake-hub <socket> [--log f.jsonl] [--reply <policy>]...`: stands in
  for the app on a socket and answers on a script (`first`, `second`, `other:<text>`, `skip`,
  `none`). Pair with `PARLEY_SOCKET` to test how models use the tool with nobody at the keyboard.
  macOS caps socket paths at 104 bytes, so put the socket under `$TMPDIR`, not a deep scratch dir.
- `pnpm --filter @parley/server fake-host [scenario...] [--server dist]`: stands in for an MCP Apps
  host (Claude Desktop) without one. It advertises the extension, spawns the server and a
  `fake-hub` per scenario, plays the model and the card, and prints pass/fail per scenario
  (`card-wins`, `window-wins`, `skip`, `slice`, `unknown-id`, `path`, `old-app`, `plain`). Run it
  after touching the tool surfaces, the lifecycle or `AppClient`. `fake-hub --old-app` rejects
  `resolved`, as an app from before inline cards does.
- `pnpm --filter @parley/server trial [--client claude|codex|all] [--runs N] [--prompt <name>]...`:
  the model-uptake harness. Runs `apps/server/trials/prompts/` through real clients against
  `fake-hub` and scores whether they asked, validly, and used the answer. Rerun it after changing
  the tool description or the server instructions; the baseline is in `apps/server/trials/README.md`.
  Skip it when nothing model-facing changed (tool schema or description, server instructions,
  result text): it runs real clients and costs time and tokens.
- Gallery: `pnpm --filter @parley/desktop dev`, then `http://localhost:1420/?gallery` (dev only).
  Renders every fixture through `compileQuestions` and the real card without the hub; submitting
  shows the `shapeAnswer` output. `&fixture=<name>` picks one.

## Pinned choices

- **Tauri 2** with capabilities-based permissions (`src-tauri/capabilities/`). Not the Tauri 1
  allowlist. Use the project's `@tauri-apps/cli` (`pnpm tauri ...`), not a global `cargo tauri`.
- **Vue 3**, Composition API, `<script setup lang="ts">`.
- **JSON Forms 3.x** Vue bindings: `@jsonforms/core`, `@jsonforms/vue`, `@jsonforms/vue-vanilla`.
  The three versions must match exactly.
- **MCP TypeScript SDK v2**: `@modelcontextprotocol/server`, not the legacy
  `@modelcontextprotocol/sdk` 1.x. `registerTool` takes a `z.object(...)` as `inputSchema`. Zod 4.
- **TypeScript ~6.0**. TS 7 (the Go port) is `latest` on npm, but vue-tsc was scaffolded against 6.

## Conventions

- The server's stdout is the MCP channel. Never `console.log` there; log to stderr.
- Transport: unix socket, NDJSON, wire protocol v1 in `packages/protocol/src/wire.ts`. The socket is
  `~/Library/Application Support/com.loganlopez.parley/hub.sock` (Tauri's `app_data_dir`, which the
  server computes on its own), mode 0600. Set `PARLEY_SOCKET` to override it on both sides.
  `PARLEY_NO_LAUNCH=1` stops the server running `open -b com.loganlopez.parley` when the app isn't
  up.
- The Rust hub (`src-tauri/src/hub.rs`) doesn't parse message types. It forwards lines tagged with a
  connection id as `hub:message` / `hub:disconnected`, and the webview owns the protocol
  (`src/hub/client.ts`, `src/asks/store.ts`). A second `hub_ready` (webview reload) drops every
  connection; servers reconnect and re-send their pending asks.
- Window state (position, size) is remembered by `tauri-plugin-window-state`, which never restores
  visibility. The window starts hidden.
- History: every record (with its unsent `draft`) is appended as a snapshot line to
  `$APPDATA/history.jsonl` by `src/asks/persist.ts`, on create, status change, and draft change
  (debounced). At startup the file is folded to the last line per id, records that ended over 30
  days ago are dropped, the result is rewritten through a temp file, and the store is hydrated
  *before* `hub_ready`. The fs capability is scoped to those two files: `hub.sock` lives in the same
  dir. `Cmd+Y` toggles the history view; Esc there goes back (detail → list → queue), never hides.
- Form spec = JSON Schema + `x-widget` hints. The model doesn't write JSON Forms UI schemas. Custom
  widgets are JSON Forms renderers in `apps/desktop/src/forms/renderers/`, with testers that match on
  `x-widget`, registered in `src/forms/renderers.ts`.
- Keep the Rust side small: tray, global hotkey, window management, socket hub. Everything else
  belongs in the webview.
- Global hotkey is `Cmd+Ctrl+P` (`src-tauri/src/shortcut.rs`). Check `~/.config/keymap/keymap.md`
  before changing it. In-window keys live in `src/card/AskCard.vue`. Renderers talk to the card only
  through the DOM contract in `src/forms/keyboard.ts`. Cmd+. skips (macOS's cancel; Cmd+Backspace is an
  editing key in text fields). Cmd+N opens the note for the agent (plain `n` is No on a focused
  Yes/No). Page zoom (`src/zoom.ts`): Cmd+= / Cmd+- or the control in the meta
  row, default 110%, kept in localStorage. Cmd+0 belongs to AeroSpace, so reset is a click on the
  percentage.
- Two tool surfaces, picked per process from the client's first message
  (`src/client-capabilities.ts`, stdio-only). Clients that advertise MCP Apps
  (`io.modelcontextprotocol/ui` with `text/html;profile=mcp-app`) get `src/tools/inline.ts`: `ask`
  shows the form and returns an `askId`, `ask_wait` blocks in 200 s slices
  (`PARLEY_WAIT_SLICE_MS` for tests), the app-only `parley_submit` and `parley_status` (a 25 s
  long-poll) serve the card, and `ui://parley/card.html` is the card. The instructions swap one
  sentence for the two-step flow. Everyone else gets `src/tools/ask.ts`, the blocking `ask`, and
  no resources capability. The two `ask`s share the input schema and description.
- Inline asks race the window (`showAsk` in `ask-lifecycle.ts`), keyed by `askId`, and an ended
  ask is kept for an hour. The `ask` message carries `inline: true`, and the app queues it without
  a notification. An ask with a `path` question is never inline: the card shows it read-only and
  points at the window. When the card wins, the server aborts the window's ask with the
  `InlineOutcome` as the signal's reason, and `AppClient` sends `resolved` instead of `cancel`.
  The app records it as answered (or skipped) with `answeredIn: 'chat'`. An app too old for
  `resolved` answers `invalid_message`, and the server falls back to `cancel`.
- Every card has an optional note for the agent. It travels as `note` on the `answer` and
  `dismissed` wire messages (additive, still protocol v1) and comes back as `note` in the result,
  quoted in the text.
- Renderers import `src/platform.ts` (`pickPaths`, `openExternal`), never `@tauri-apps/*`, so they
  run in the MCP Apps card too. The card overrides `openExternal` with the host's `openLink` via
  `setPlatform`. Outside Tauri it falls back to browser APIs.
- Styles: one set of tokens in `src/styles.css`. Light on `:root`, dark under the system media
  query (`:root:not([data-theme='light'])`) and again under `:root[data-theme='dark']`, which the
  card sets from the host. Keep the two dark blocks in step. `html.inline` (set by the card) is
  content height, no inner scroll, `max-width: 640px`. Host colors are mapped onto the tokens in
  `src/mcp-app/theme.ts` where the host sends them. The window has neither, so it looks as it did.
- CSP: `tauri dev` on macOS loads the Vite server directly, so the CSP in `tauri.conf.json` only
  applies to bundled assets. `vite.config.ts` serves the same policy as a header in dev; keep the two
  in sync. `script-src` needs `'unsafe-eval'` because AJV (JSON Forms validation) compiles
  validators with `new Function`; without it no card renders. To test the real CSP, build with
  `pnpm tauri build --debug --no-bundle` and run `src-tauri/target/debug/parley` directly (no
  `.app`, so `open -b` won't find it).

## Open / deferred

- `tauri-nspanel` (non-activating macOS panel): deferred past the MVP.
- AeroSpace float rule: drafted in `~/Dev/dotfiles/.aerospace.toml`, not yet reviewed. An unbundled
  `tauri dev` binary reports `NULL-APP-BUNDLE-ID` with app name `parley`, so the rule matches on both.
- Notification clicks can't open the window: `tauri-plugin-notification` only shows title, body,
  icon and sound on desktop (`onAction` is mobile-only). The hotkey and tray are the way in.

## Claude Desktop and inline cards

Checked against Claude Desktop 2.31226.1 (2026-10-10, brief 6):

- Desktop opens with `initialize` and advertises MCP Apps in `params.capabilities.extensions`.
  It starts two Parley servers, `claude-ai` (chat) and `local-agent-mode-parley` (agent mode).
- It mounts a tool's view only after the call returns, which is why `ask` returns at once.
- It cuts a local tool call at exactly 240 s and sends no `progressToken`, so nothing extends it.
  That's the reason for the 200 s `ask_wait` slices.
- It shows the model a result's text content, not `structuredContent` (the reverse of Claude
  Code). Results carry the same message in both.
- `hostContext.toolInfo.id` is a content-block id, not the `tools/call` id. Key by `askId`.
- It reads `ui://…` once per server process and caches it: restart Desktop to pick up a new card.
- The iframe allows `'unsafe-eval'` (AJV works), drops `window.prompt` (no `allow-modals`), and
  has no file picker. `postMessage` can't clone a Vue proxy: JSON-copy before `callServerTool`.

## Claude Code and long asks

Checked against Claude Code 2.1.296 (2026-10-09), in the docs and by logging the server:

- `MCP_TOOL_TIMEOUT` applies to MCP tool calls, in ms. The default is 100000000 (about 28 h), so in
  practice there's no wall-clock cap. A per-server `"timeout"` in `.mcp.json` overrides it. Progress
  doesn't extend this one.
- The limit that matters is the idle timeout, `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`: 30 min for stdio.
  Progress notifications reset it. Claude Code sends `_meta.progressToken` on `tools/call`, so
  `runAsk`'s 15 s keep-alives cover asks up to the 3600 s maximum.
- Interactive calls still running after 2 min get moved to a background task
  (`CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`, 0 disables). The ask keeps waiting, but the model gets a
  task id instead of blocking.
- Esc during a call sends `notifications/cancelled`. `ctx.mcpReq.signal` aborts, and the card is
  withdrawn as `cancelled`.
- Auto-backgrounding was confirmed live: the call shows as an "MCP Task", the card keeps waiting, and
  the model resumes with the answer when it arrives. Print mode (`claude -p`) doesn't background; the
  call blocks until it ends.
- When a tool declares an `outputSchema`, Claude Code shows the model only `structuredContent` (as
  JSON) and drops the text content. That's why the structured result carries `message`, the same
  text. Codex shows both.
- MCP tools are deferred behind ToolSearch by default. `ask` sets `_meta["anthropic/alwaysLoad"]:
  true` (2.1.285+), and in trials that's what got the model calling it unprompted. Server
  instructions always load, capped at 2,048 characters.
- `"permissions": { "deny": ["AskUserQuestion"] }` in a project's `.claude/settings.local.json`
  hides the built-in in interactive sessions (confirmed live). `claude -p` doesn't offer
  `AskUserQuestion` at all, so print mode can't show that. Model trials ran in print mode against `fake-hub`, with `--setting-sources project,local
  --strict-mcp-config --no-session-persistence`. `--bare` and a scratch `HOME` both break OAuth.
