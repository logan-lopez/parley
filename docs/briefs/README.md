# Briefs

Each brief is a self-contained handoff for a fresh session. New ones go here, numbered in order,
and move to `archive/` when they're done. Ideas that aren't scheduled yet are in
[`FUTURE.md`](FUTURE.md).

## Where things stand

*Updated 2026-10-12.*

- Built: the hub, `ask`, the trial harness, history and `review` (briefs 1–5), inline cards in
  Claude Desktop (6–7), the window as a non-activating panel, menu-bar only (8–9), and three
  inputs drawn from real asks (10–12): drafts you edit in place, review with the agent's own
  decisions, and `capture` for pasted output and screenshots, with copy buttons on code. Seven
  question types.
- In flight: brief 13 (colors in card markdown) is done and awaiting review; 14 (HTML and SVG
  previews drawn as pictures, plus the trial pass for both) is written, not started. 15 (themes
  from a config file, inn's format) is written and goes after 14, since both edit `styles.css`.
- Next: brief 14, then 15. After those, the [`FUTURE.md`](FUTURE.md) candidates are still "Hands-on runs" and
  the trial tune-ups, led by `crash-output` never asking (0/3).
- Loose ends waiting on Logan: the hand checks from briefs 10–12 (a draft and a copy button in
  Desktop's inline card, a screenshot pasted into the installed build, whether a real debugging
  session reaches for `capture`, the draft box's height, four long decision labels in the 440 px
  window). Brief 9's waived checks (two monitors, the Dock flash at launch) were never written
  down either. Say so if any of them bothers you.

## Open

13. [`13-color-chips.md`](13-color-chips.md) (done, awaiting review): a color in a code span shows a swatch,
    and a ```` ```palette ```` block shows large labelled swatches, in every markdown surface.
14. [`14-fenced-previews.md`](14-fenced-previews.md): blocks marked `html preview` and
    `svg preview`, drawn as SVG images (static by construction, no CSP change),
    starting with a foreignObject spike; then the trial pass for 13–14.
15. [`15-themes.md`](15-themes.md): every window color from a base16/base24 theme, picked in
    `~/.config/parley/settings.json` as one id or a light/dark pair that follows the system live;
    inn's themes load in place.

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

Briefs 8–9 (done 2026-10-10) fixed the AeroSpace workspace jump. Showing the hidden window used to
pull Logan to the workspace it last lived on. On macOS the window is now a non-activating
`NSPanel`, which AeroSpace doesn't manage, so it shows where he is and focus never leaves the app
he's in. Parley left the Dock and Cmd+Tab, and the dotfiles' `parley-follow.sh` workaround went
with it.

Briefs 10–12 (done 2026-10-11) added three inputs mined from the real asks in the session
transcripts and `history.jsonl`: a draft to edit in place instead of a "commit as written?"
round trip, a review with the agent's own decisions instead of multi-select plus Other, and a
capture box with copy buttons for debugging, where Logan used to copy snippets by hand and paste
dumps into a one-line box. The full trial pass kept uptake on the old prompts within noise.

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
8. [`08-nspanel-spike.md`](archive/08-nspanel-spike.md): spike, go. AeroSpace ignores a
   non-activating `NSPanel` completely; all nine hands-on checks passed on the dev build.
9. [`09-panel-window.md`](archive/09-panel-window.md): the panel for real. `tauri-nspanel` pinned
   to a rev and registered on macOS only, one Rust `hide`, and menu-bar only (Accessory at runtime,
   `LSUIElement` in the bundle). Hands-on checks waived by Logan after daily use.

10. [`10-text-drafts.md`](archive/10-text-drafts.md): `text` takes a `draft` the user edits in
    place (commit messages, PR bodies); the answer is the final text and whether it changed.
11. [`11-review-decisions.md`](archive/11-review-decisions.md): `review` takes 2–4 `decisions` of
    its own (Port / TODO / Skip, Pass / Fail), as a labelled segmented control per row with digit
    keys.
12. [`12-capture-question.md`](archive/12-capture-question.md): copy buttons on every fenced
    code block, a `capture` question for pasted text and screenshots (saved as PNGs, returned as
    paths, window-only), and the full trial pass for 10–12, now the baseline.

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
| Panel on more than one monitor | Shows at its remembered position. No following the cursor or the focused screen. | Smallest change. Brief 9's two-monitor check was waived; revisit if it bothers Logan in use (Logan, 2026-10-10). |
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
| Drafts to edit | `draft` on `text` only. The answer is the final text plus `edited`; no diff in the message. | The "Commit as written / Not yet" cards took two round trips for a one-word change (Logan, 2026-10-10, brief 10). |
| Review decisions | `review` takes 2–4 `decisions` of its own; without them it's approve/reject, unchanged. `value` is the labels given the first decision, so the answer union stays the same. Gaps under `none` fall back to the last decision, the most cautious one. | Per-item assignments were being crammed into multi-select plus Other (Logan, 2026-10-10, brief 11). |
| Pasted screenshots | `capture` saves them as PNGs under `$APPDATA/captures/<day>/` and returns the paths. Window-only, like `path`; text-only captures work inline. Day folders go after 30 days; Clear deletes them all except those still in a waiting ask's draft. | Claude Code shows only `structuredContent` for tools with an `outputSchema`, so image content would likely be dropped, and a path is something the model can read (2026-10-10, brief 12). |
| Colors in markdown | A color in a code span (hex or a CSS color function, no named colors) gets a swatch; a ```` ```palette ```` block draws labelled swatches. Set through the CSSOM, never a `style` attribute. | Prose `#123` is as often an issue number. The release CSP drops `style` attributes while dev allows them (Logan, 2026-10-11, brief 13). |
| HTML and SVG previews | Opt-in ```` ```html preview ```` / ```` ```svg preview ```` fences, drawn as an SVG image from a `data:` URL at a size the agent gives. A sandboxed iframe is the fallback only if the spike fails. | Plain ```` ```html ```` is how agents show source. An image is static by construction and needs no CSP change in the window or the card; inline sanitized HTML would rest on the sanitizer alone in the card (Logan, 2026-10-11, brief 14). |
| Themes | inn's format (base16/base24 YAML with `overrides`, inn's token names), set as `theme` in `~/.config/parley/settings.json`: one id, or `{ light, dark }` following the macOS appearance live. Reads `~/.config/inn/themes/` in place and `~/.config/parley/themes/`. No settings page. Parley Light and Dark reproduce the old colors and are the default pair. | One theme file serves inn, Quire and Parley, and the pair's contract is written to be copied back into inn and Quire (Logan, 2026-10-12, brief 15). |
| Themes and the inline card | The card keeps following Claude's surfaces and text over Parley Light or Dark; the server never reads `~/.config` | It sits in Claude's chat (Logan, 2026-10-12, brief 15). |
| `ask_async` / `collect` | Not built; parked in [`FUTURE.md`](FUTURE.md#parked) | Claude Code backgrounds a call still running after 2 min and delivers the answer when it lands; `collect()` would depend on the model remembering to poll (2026-10-10). |

## Not built

`ask_async`/`collect`, `notify`, raw-schema `ask_form`, rank/slider/A-B/annotate widgets, native
elicitation, MCP Apps outside Claude Desktop (they need a remote server), the panel following the
active screen, remote/headless channels, and for captures: dragging image files in, thumbnails in
history, screen capture started from Parley, and images as MCP image content. For themes: a settings page or picker, and the inline card
following the theme. `FUTURE.md` says where most of these stand. Anything that collects secrets stays out for
good.

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
