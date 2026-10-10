# Briefs

Each brief is a self-contained handoff for a fresh session. New ones go here, numbered in order,
and move to `archive/` when they're done. Ideas that aren't scheduled yet are in
[`FUTURE.md`](FUTURE.md).

## Where things stand

*Updated 2026-10-10.*

- The MVP and the groundwork are built: the hub, `ask` with six question types, the trial
  harness, history, and the `review` type (briefs 1–5).
- The MCP Apps spike (brief 6) says go for Claude Desktop, as "show, then wait". Its code is on
  `spike/mcp-apps` (`fc40ffb`) as reference, and that branch stays unmerged.
- Next: brief 7, the real build of inline cards in Desktop.
- Loose end for Logan: `apps/server/dist/` is still the spike build, which Claude Desktop runs.
  Rebuild from main (or finish brief 7) to replace it.

## Open

7. [`07-inline-cards.md`](07-inline-cards.md): the ask card inline in Claude Desktop chat (show,
   then wait), racing the window, with inline answers recorded in history.

## Done

Archived in [`archive/`](archive/). They record what was asked for and why, not how the code works
now. For that, read `CLAUDE.md` and the code.

The MVP (briefs 1–2, done 2026-10-09) is a working equivalent of Claude's built-in question tool
(`AskUserQuestion`), served over MCP, with answers given in a floating Parley window instead of
inside the client. Briefs 3–5 (done 2026-10-10) set up for new features.

1. [`01-hub-and-lifecycle.md`](archive/01-hub-and-lifecycle.md): the unix socket hub, wire protocol
   v1, the ask lifecycle (timeout, cancel, disconnect), and notify-only window behavior.
2. [`02-ask-tool-and-ui.md`](archive/02-ask-tool-and-ui.md): the questions-array `ask` tool, its
   compiler to JSON Schema, the question card, answer shaping, and the server instructions.
3. [`03-trial-harness.md`](archive/03-trial-harness.md): a repeatable score for whether models use
   `ask` and use it well. Results and the baseline are in `apps/server/trials/README.md`.
4. [`04-history-and-inbox.md`](archive/04-history-and-inbox.md): asks persisted to
   `history.jsonl`, a history view, and drafts that survive a reload or a restart.
5. [`05-review-question.md`](archive/05-review-question.md): the `review` question type, where the
   user approves or rejects each item, with a comment per item.
6. [`06-mcp-apps-spike.md`](archive/06-mcp-apps-spike.md): spike, done 2026-10-10. Desktop mounts
   a tool's view only after the call returns, so a blocking inline ask can't work; "show, then
   wait" does. Eval is allowed, and the card themes from the host. Go.

## Decisions already made

Don't relitigate these. If one turns out to be wrong in practice, stop and say so.

| Decision | Choice | Why |
| --- | --- | --- |
| Model-facing input | A questions array, shaped like `AskUserQuestion` and extended with a few input types | Models already write that shape reliably. Raw JSON Schema forms come later as a separate tool. |
| Wire format for forms | JSON Schema + `x-widget`, compiled from the questions on the server | The app only renders JSON Schema, so a future `ask_form` passes schema straight through and nothing in the app changes. |
| Transport | Unix socket with newline-delimited JSON | File permissions (0600) are the auth: no port, no token, and browsers can't reach it. Node's built-in `net` handles it. Windows would need named pipes later. |
| New ask arrives | Notify only: system notification and tray count. The window doesn't open on its own. | No focus stealing. You open it with `Cmd+Ctrl+P` or the tray. |
| Platform | macOS only for the MVP | Other platforms fail clearly. Don't silently half-work there. |
| Inline asks in MCP Apps clients | "Show, then wait": `ask` returns an `askId` at once, and `ask_wait` blocks in 200 s slices. Registered only for clients that advertise MCP Apps. | Desktop mounts a view only after its call returns, and cuts local calls at 240 s (brief 6). Claude Code's tool list stays as it is. |
| Inline answers and the window | The window races the card quietly (no notification). The server sends an inline answer to the app (`resolved`), and history records it as answered in the chat. | The user already sees the card. History stays complete (2026-10-10). |

## Not built

`ask_async`/`collect`, `notify`, raw-schema `ask_form`, rank/slider/A-B/annotate widgets, native
elicitation, MCP Apps outside Claude Desktop (brief 7 is Desktop only), `tauri-nspanel`, and remote/headless channels. `FUTURE.md` says
where most of these stand. Anything that collects secrets stays out for good.

## Future direction new work must not block

Each item below is cheap now and expensive to retrofit later.

- **Async and inbox.** The app treats an ask as a record with an id, session metadata and a status,
  not as a modal. It never assumes the server is blocking. Ended asks stay in the store with their
  final status, and the history view (brief 4) is a filter over it, not a second store. The
  server's blocking `ask` is one consumer of an id-based lifecycle, and `ask_async` will be
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
