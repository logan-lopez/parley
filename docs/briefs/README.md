# Briefs

Each brief is a self-contained handoff for a fresh session. New ones go here, numbered in order,
and move to `archive/` when they're done. Ideas that aren't scheduled yet are in
[`FUTURE.md`](FUTURE.md).

## Where things stand

*Updated 2026-10-10.*

- Built: the hub, `ask` with six question types, the trial harness, history and the `review` type
  (briefs 1–5), and inline cards in Claude Desktop (briefs 6–7, merged to main as `aaef062`).
- In flight: brief 8 is done, awaiting review: the spike says go. AeroSpace ignores a
  non-activating panel, so it shows where you are. Its code is merged to main (`9b8eb93`).
- Next: brief 9 makes the panel real (pinned crate, menu-bar only, checks on the installed
  build), then the dotfiles cleanup it drafts. After that,
  [`FUTURE.md`](FUTURE.md)'s three sections: the reconnect fix is the smallest,
  and trial prompts for show-then-wait tell us whether the Desktop flow holds up with real models.
- Loose ends: brief 7's check 11 (does the card render in Desktop's agent mode?) and whether
  `parley_status` polls show in the chat UI weren't written down. Record them if either surprised
  Logan.

## Open

8. [`08-nspanel-spike.md`](08-nspanel-spike.md) (done, awaiting review): spike, **go**. A
   non-activating `NSPanel` stops AeroSpace switching workspaces when Parley shows.
9. [`09-panel-window.md`](09-panel-window.md): the panel for real. Pins `tauri-nspanel`, makes
   Parley menu-bar only, and re-runs the checks on the installed build.

## Done

Archived in [`archive/`](archive/). They record what was asked for and why, not how the code works
now. For that, read `AGENTS.md`, the [architecture pages](../architecture/README.md) and the
code.

The MVP (briefs 1–2, done 2026-10-09) is a working equivalent of Claude's built-in question tool
(`AskUserQuestion`), served over MCP, with answers given in a floating Parley window instead of
inside the client. Briefs 3–5 (done 2026-10-10) set up for new features.

Briefs 6–7 (done 2026-10-10) put the ask card inline in Claude Desktop's chat. The spike found
that Desktop mounts a view only after the call returns, so MCP Apps clients get "show, then wait":
`ask` returns an `askId` and `ask_wait` blocks. The card races the window, and history records
answers given in the chat. Claude Code and every other client see the blocking `ask`, unchanged.

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
7. [`07-inline-cards.md`](archive/07-inline-cards.md): the card inline in Desktop chat as a
   single-file MCP Apps view, `ask_wait` in 200 s slices, the `resolved` wire message, quiet
   inline asks in the window, chat answers in history, and `fake-host`.

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
| MCP Apps hosts | Claude Desktop only. claude.ai and ChatGPT need a remote (HTTP) server. | Desktop is the host that runs local stdio servers, and Logan is fine with it being the only one (brief 7, 2026-10-10). |
| AeroSpace workspace jump | On macOS the main window is a non-activating `NSPanel` (`tauri-nspanel`). Brief 8's spike said go; no hooks or park mode. Window-manager commands live in Logan's dotfiles; Parley never calls `aerospace`. | AeroSpace ignores the panel completely, so it shows on the current workspace and focus never moves (brief 8, 2026-10-10). *Was:* spike first, with hooks + park mode as the fallback. |
| Dock and Cmd+Tab | Menu-bar only (`ActivationPolicy::Accessory`). The hotkey and tray are the ways in. | Both activate the app, which the panel exists to avoid, and nothing used them (Logan, 2026-10-10). |
| Panel on more than one monitor | Shows at its remembered position. No following the cursor or the focused screen. | Smallest change. Revisit if the two-monitor check in brief 9 says it's a problem (Logan, 2026-10-10). |
| Inline answers and the window | The window races the card quietly (no notification). The server sends an inline answer to the app (`resolved`), and history records it as answered in the chat. | The user already sees the card. History stays complete (2026-10-10). |
| History when the window and the card both answer | The server's first-in answer wins, and `resolved` overwrites the window's answered or skipped record | History matches what the agent got (brief 7, 2026-10-10). |
| Shell | Tauri 2, with capabilities-based permissions (not the Tauri 1 allowlist). The Rust side stays small: tray, hotkey, window, socket hub. | Official plugins cover the tray, hotkey, notifications and file dialog, and the UI is web tech, so the same card ships as an MCP Apps view ([desktop shell](../architecture/desktop-shell.md)). |
| UI stack | Vue 3 (Composition API, `<script setup>`), JSON Forms 3.x Vue bindings, the three `@jsonforms/*` at the same exact version | JSON Forms renders arbitrary JSON Schema with custom renderers picked by testers, which is what a raw-schema `ask_form` will need ([the card](../architecture/card-ui.md)). |
| Widget hints | `x-widget` (and other `x-*` keys) inside the JSON Schema. The model never writes a JSON Forms UI schema. | UI schemas are verbose. The testers match on `x-widget`, and JSON Forms lays out the rest ([form spec](../architecture/form-spec.md#decisions)). |
| MCP SDK and TypeScript | MCP TypeScript SDK v2 (`@modelcontextprotocol/server`, Zod 4), not `@modelcontextprotocol/sdk` 1.x. TypeScript ~6.0. | The TS SDK is the most complete one. vue-tsc was scaffolded against TS 6; TS 7 is `latest` on npm. |
| Result shape | `structuredContent` (with an `outputSchema`) plus a text block, and `message` in the structured result repeats the text | Claude Code shows the model only `structuredContent` when there's an `outputSchema`; Claude Desktop shows only the text (2026-10-09, [the ask tool](../architecture/ask-tool.md)). |
| Tool loading in Claude Code | `ask` sets `_meta["anthropic/alwaysLoad"]: true` | Claude Code defers MCP tools behind ToolSearch, and the model skipped `ask`. In trials it went from asking on 1 of 3 prompts to 2 of 3 (brief 3). |
| Timeouts | Default 1800 s, at most 3600, with a progress notification every 15 s | 600 s kept timing out during real work. The keep-alives reset Claude Code's 30 min idle timeout ([the ask tool](../architecture/ask-tool.md#claude-code-and-long-asks)). |
| Note for the agent | Every card has an optional note, sent with an answer or a skip, returned as `note` and quoted in the text. Additive, so the wire stays v1. | Covers "answer plus context", "skipped because…", and feedback on Parley itself (2026-10-09). |
| Several sessions at once | One queue in one app, one card at a time, each labelled `client · project dir` | Two sessions ask at once on day one (MVP). |
| `review` question | 1–30 items, each approved or rejected with an optional comment; `defaultDecision` approve, reject or none. The answer's `value` is the approved labels, with every item's decision in `review`. | The richer input coding agents would use daily (brief 5, 2026-10-10). A tuple array on the wire, so a raw-schema form could send the same. |
| `'unsafe-eval'` in the CSP | Allowed | AJV (JSON Forms validation) compiles validators with `new Function`. Markdown renders without raw HTML, so model text can't inject script. |
| `ask_async` / `collect` | Not built; parked in [`FUTURE.md`](FUTURE.md#parked) | Claude Code backgrounds a call still running after 2 min and delivers the answer when it lands; `collect()` would depend on the model remembering to poll (2026-10-10). |

## Not built

`ask_async`/`collect`, `notify`, raw-schema `ask_form`, rank/slider/A-B/annotate widgets, native
elicitation, MCP Apps outside Claude Desktop (they need a remote server), `tauri-nspanel`, and
remote/headless channels. `FUTURE.md` says where most of these stand. Anything that collects
secrets stays out for good.

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
  go through `src/platform.ts`, which is what lets the same renderers run in the inline card
  (brief 7). A renderer that imports `@tauri-apps/*` breaks the card.
- **Remote.** The server talks to the app only through the `AppClient` interface
  (`apps/server/src/app-client.ts`). A second transport later shouldn't touch tool code.
- **Answer shaping.** One pure function in `packages/protocol` produces both the structured answer
  and the plain-language summary.
