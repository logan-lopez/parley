# MVP briefs

The MVP is a working equivalent of Claude's built-in question tool (`AskUserQuestion`), served over
MCP, with answers given in a floating Parley window instead of inside the client. It should be good
enough to use every day in Claude Code and one non-Claude client.

Run these in order. Each one is a self-contained handoff for a fresh session:

1. [`01-hub-and-lifecycle.md`](01-hub-and-lifecycle.md): the pipe. Unix socket hub in Rust, server
   ↔ app connection, wire protocol v1, the ask lifecycle (timeout, cancel, disconnect), and notify-only
   window behavior. It ends with a crude form making a full round trip.
2. [`02-ask-tool-and-ui.md`](02-ask-tool-and-ui.md): the product. The questions-array `ask` tool,
   its compiler to JSON Schema, the question-card UI, answer shaping, and the server instructions.

Brief 2 depends on brief 1's wire protocol and app client, so run it after brief 1 is merged.

## Decisions already made

Don't relitigate these. If one turns out to be wrong in practice, stop and say so.

| Decision | Choice | Why |
| --- | --- | --- |
| Model-facing input | A questions array, shaped like `AskUserQuestion` and extended with a few input types | Models already write that shape reliably. Raw JSON Schema forms come later as a separate tool. |
| Wire format for forms | JSON Schema + `x-widget`, compiled from the questions on the server | The app only renders JSON Schema, so a future `ask_form` passes schema straight through and nothing in the app changes. |
| Transport | Unix socket with newline-delimited JSON | File permissions (0600) are the auth: no port, no token, and browsers can't reach it. Node's built-in `net` handles it. Windows would need named pipes later. |
| New ask arrives | Notify only: system notification and tray count. The window doesn't open on its own. | No focus stealing. You open it with `Cmd+Ctrl+P` or the tray. |
| Platform | macOS only for the MVP | Other platforms fail clearly. Don't silently half-work there. |

## Out of scope for the MVP

`ask_async`/`collect`, `notify`, persisted history, raw-schema `ask_form`, rank/slider/A-B/annotate
widgets, native elicitation or MCP Apps rendering, `tauri-nspanel`, remote/headless channels,
and anything that collects secrets.

## Future direction the MVP must not block

Each item below is cheap now and expensive to retrofit later.

- **Async and inbox.** The app treats an ask as a record with an id, session metadata and a status,
  not as a modal. It never assumes the server is blocking. Answered and cancelled asks stay in the
  in-memory store with their final status, not deleted, so a history view later is just a filter.
  The server's blocking `ask` is one consumer of an id-based lifecycle, and `ask_async` will be
  another.
- **Form language.** The app renders JSON Schema + `x-widget` and knows nothing about the
  questions-array shape. The questions-to-schema compiler is a pure function in `packages/protocol`.
- **Elicitation downgrade.** Encode choice options in the titled-enum shape MCP elicitation uses
  (`oneOf`/`anyOf` of `{ const, title }`), so a flat form can be handed to native elicitation later
  without a rewrite.
- **MCP Apps.** Form renderers don't import Tauri APIs directly. The file picker and link opening
  go through a small adapter, so the same Vue renderers can run in an iframe later.
- **Remote.** The server talks to the app only through the `AppClient` interface
  (`apps/server/src/app-client.ts`). A second transport later shouldn't touch tool code.
- **Answer shaping.** One pure function in `packages/protocol` produces both the structured answer
  and the plain-language summary.
