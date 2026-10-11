# Parley: architecture

How Parley works now, one page per area. The Areas table in [`AGENTS.md`](../../AGENTS.md#areas)
says which page goes with which code. History is in the briefs' reports
([`docs/briefs/`](../briefs/README.md)), and the decisions not to relitigate are in the briefs
README's table.

Parley is an MCP server for questions from the model to the user. A model calls `ask` with a
questions array, and the user answers in a floating desktop window or, in Claude Desktop, in a
card inline in the chat. macOS only.

## Layout

pnpm workspace, Node 24.

| Path | What it is |
| --- | --- |
| `apps/server` (`@parley/server`) | The MCP server, stdio. Thin: validates the questions, compiles them to a form, relays it to the app and shapes the answer. One process per agent session. |
| `apps/desktop` (`@parley/desktop`) | The app: a Tauri 2 shell (`src-tauri/`) and a Vue 3 webview (`src/`). Runs once; every server connects to it. `src/mcp-app/` is a second entry, the ask card as an MCP Apps view, built to one self-contained HTML file. |
| `packages/protocol` (`@parley/protocol`) | The form spec and the server ↔ app wire messages. Source-only: consumers import the `.ts` directly, with no build step. `@parley/protocol/ask` is a separate entry (the `ask` tool's Zod schema, `compileQuestions`, `shapeAnswer`), so the app's bundle doesn't pull in Zod. Shared question fixtures are in `fixtures/`. |
| `docs/briefs/` | Handoff briefs and the status page. |
| `docs/guide/` | How Parley works as you use it. |
| `docs/architecture/` | These pages. |

## The shape

```
model ──MCP (stdio)──▶ server ──unix socket, NDJSON──▶ Rust hub ──events──▶ webview (store, card)
                         ▲                                                      │
                         └──────────────── answer / dismissed ◀─────────────────┘
```

- **One app, many servers.** Each agent session starts its own server process. Every server
  connects to the one running app over a unix socket ([the hub](hub.md)). The server launches the
  app if it isn't up.
- **The server is thin.** It turns the model's questions into JSON Schema with `x-widget` hints
  ([the form spec](form-spec.md)), sends that to the app, and waits. The app renders JSON Schema
  only and knows nothing of the questions array.
- **Two tool surfaces.** Clients that render MCP Apps (Claude Desktop) get "show, then wait" and
  an inline card ([inline cards](inline-cards.md)). Every other client gets the blocking `ask`
  ([the ask tool](ask-tool.md)).
- **The Rust side is small:** tray, global hotkey, the window (a non-activating panel on macOS),
  and the socket hub ([the desktop shell](desktop-shell.md)). Everything else is in the webview:
  the protocol, the store and history ([asks and history](asks-and-history.md)), and the card and
  its renderers ([the card](card-ui.md)).
- **Testing** without a person or a real client: `fake-ask`, `fake-hub`, `fake-host` and the trial
  harness ([testing](testing.md)).

## Stack

The versions that are pinned, and why. The decisions table in the briefs README holds the rows.

- **Tauri 2** with capabilities-based permissions (`src-tauri/capabilities/`), not the Tauri 1
  allowlist. Use the project's `@tauri-apps/cli` (`pnpm tauri ...`), not a global `cargo tauri`.
  Official plugins cover the global shortcut, notifications, the file dialog, fs, the opener and
  window state; the tray is Tauri's own `tray-icon` feature.
- **Vue 3**, Composition API, `<script setup lang="ts">`, on Vite.
- **JSON Forms 3.x** Vue bindings: `@jsonforms/core`, `@jsonforms/vue`, `@jsonforms/vue-vanilla`.
  The three versions must match exactly (they're pinned to `3.8.0`).
- **MCP TypeScript SDK v2**: `@modelcontextprotocol/server`, not the legacy
  `@modelcontextprotocol/sdk` 1.x. `registerTool` takes a `z.object(...)` as `inputSchema`. Zod 4.
  `@modelcontextprotocol/ext-apps` for the MCP Apps side.
- **TypeScript ~6.0.** TS 7 (the Go port) is `latest` on npm, but vue-tsc was scaffolded against 6.
- **Web tech for the UI** so the same card ships as an MCP Apps view, with no second
  implementation.
