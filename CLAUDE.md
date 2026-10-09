# Parley

An MCP server for model → user questions, rendered as forms in a floating desktop app. Design doc
lives in Obsidian: `Development/Projects/Parley/Project Doc.md`.

The project doc is the source of truth for decisions and scope. When a decision is made or changed
(architecture, tool surface, scope moving between MVP and v2), update the doc in the same session
with the Obsidian MCP tools. Edit the relevant section. Don't append a changelog, and don't rewrite
sections that are unaffected. When a decision replaces an earlier lean, keep a one-line *Was:* note
beside it so the reasoning trail survives. Implementation details belong here or in code, not in
the doc.

MVP handoff briefs are in `docs/briefs/`. Start with `README.md`.

## Layout

pnpm workspace, Node 24.

- `apps/server`: the MCP server (stdio). Thin: validates the form spec, relays it to the app.
- `apps/desktop`: Tauri 2 shell (`src-tauri/`) + Vue 3 webview (`src/`).
- `packages/protocol`: the form spec and server ↔ app wire messages. Source-only, so consumers import
  the `.ts` directly, with no build step.

## Commands

From the root:

- `pnpm app`: `tauri dev` for the desktop app
- `pnpm server`: run the MCP server from source (tsx)
- `pnpm typecheck` / `pnpm build`: all packages
- `pnpm --filter @parley/server build`: bundles to `apps/server/dist/index.mjs`, which is what an MCP
  client config points at (`node .../dist/index.mjs`). `.mcp.json` at the root registers it for
  Claude Code in this repo. Needs Node 24: tsdown loads its `.ts` config through native type
  stripping, and Node 22.17 fails with "Failed to import module unrun".
- `pnpm --filter @parley/server fake-ask <form.json> [--timeout <s>]`: acts as one session without
  an MCP client. It connects to the hub, sends a `FormSpec` file (sample:
  `apps/server/fixtures/sample.json`), and prints the outcome. Ctrl-C kills it without a cancel,
  which exercises the disconnect path.

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
- Form spec = JSON Schema + `x-widget` hints. The model doesn't write JSON Forms UI schemas. Custom
  widgets are JSON Forms renderers in `apps/desktop/src/forms/renderers/`, with testers that match on
  `x-widget`, registered in `src/forms/renderers.ts`.
- Keep the Rust side small: tray, global hotkey, window management, socket hub. Everything else
  belongs in the webview.
- Global hotkey is `Cmd+Ctrl+P` (`src-tauri/src/shortcut.rs`). Check `~/.config/keymap/keymap.md`
  before changing it.

## Open / deferred

- `tauri-nspanel` (non-activating macOS panel): deferred past the MVP.
- AeroSpace float rule: drafted in `~/Dev/dotfiles/.aerospace.toml`, not yet reviewed. An unbundled
  `tauri dev` binary reports `NULL-APP-BUNDLE-ID` with app name `parley`, so the rule matches on both.
- Notification clicks can't open the window: `tauri-plugin-notification` only shows title, body,
  icon and sound on desktop (`onAction` is mobile-only). The hotkey and tray are the way in.

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
  task id instead of blocking. Brief 2's instructions and testing need to account for that.
- Esc during a call sends `notifications/cancelled`. `ctx.mcpReq.signal` aborts, and the card is
  withdrawn as `cancelled`.
