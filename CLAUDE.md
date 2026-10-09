# Parley

An MCP server for model → user questions, rendered as forms in a floating desktop app. Design doc
lives in Obsidian: `Development/Projects/Parley/Project Doc.md`.

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
  client config points at (`node .../dist/index.mjs`)

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
- Form spec = JSON Schema + `x-widget` hints. The model doesn't write JSON Forms UI schemas. Custom
  widgets are JSON Forms renderers in `apps/desktop/src/forms/renderers/`, with testers that match on
  `x-widget`, registered in `src/forms/renderers.ts`.
- Keep the Rust side small: tray, global hotkey, window management, socket hub. Everything else
  belongs in the webview.
- Global hotkey is `Cmd+Ctrl+P` (`src-tauri/src/shortcut.rs`). Check `~/.config/keymap/keymap.md`
  before changing it.

## Open / deferred

- Server ↔ app transport (localhost WebSocket vs unix socket): undecided. Stubs are in
  `apps/server/src/app-client.ts` and `src-tauri/src/hub.rs`.
- `tauri-nspanel` (non-activating macOS panel): deferred past the MVP.
- AeroSpace tiles new windows. The app needs a float rule for `com.loganlopez.parley`, set in
  dotfiles.
