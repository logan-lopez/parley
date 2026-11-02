# Briefs

Each brief is a self-contained handoff for a fresh session. New ones go here, numbered in order,
and move to `archive/` when they're done. Ideas that aren't scheduled yet are in
[`FUTURE.md`](FUTURE.md).

## Where things stand

*Updated 2026-11-01.*

- Built: the hub, `ask`, the trial harness, history and `review` (briefs 1–5), inline cards in
  Claude Desktop (6–7), the window as a non-activating panel, menu-bar only (8–9), and three
  inputs drawn from real asks (10–12): drafts you edit in place, review with the agent's own
  decisions, and `capture` for pasted output and screenshots, with copy buttons on code. Seven
  question types.
- In flight: briefs 13 (colors in card markdown), 14 (HTML and SVG previews drawn as pictures,
  plus the trial pass for 13–14) and 15 (themes from a config file, inn's format) are done and
  awaiting review. 14 was checked headless only; its installed-build check is a spot check.
- Next: briefs 19–21, written 2026-11-01 from an ideate on three weeks of real use (956 asks):
  a usage report (19), soft input limits for the 6.6% of calls that bounced (20), and "Don't ask
  again here" for questions asked session after session (21). Then briefs 16–18, written
  2026-10-14 from an ideate on a "show" card: a `show` block
  from text or a project file (16), editing a shown file with the diff back and the file saved
  (17), and a card that follows the file while it's open (18, spike first). After those, the
  [`FUTURE.md`](FUTURE.md) candidates are still "Hands-on runs" and the trial tune-ups.
  `crash-output` asked 2/3 in brief 14's pass (0/3 before); `sort-helpers` dropped `decisions`
  in 2/3 and wants a rerun.
- Loose ends waiting on Logan: the hand checks from briefs 10–12 (a draft and a copy button in
  Desktop's inline card, a screenshot pasted into the installed build, the draft box's height, four long decision labels in the 440 px
  window). Real use answered the `capture` one: agents reached for it 20 times by 2026-11-01, 11
  with screenshots. Brief 9's waived checks (two monitors, the Dock flash at launch) were never written
  down either. Say so if any of them bothers you.

## Open

13. [`13-color-chips.md`](13-color-chips.md) (done, awaiting review): a color in a code span shows a swatch,
    and a ```` ```palette ```` block shows large labelled swatches, in every markdown surface.
14. [`14-fenced-previews.md`](14-fenced-previews.md) (done, awaiting review): blocks marked `html preview` and
    `svg preview`, drawn as SVG images (static by construction, no CSP change),
    starting with a foreignObject spike; then the trial pass for 13–14.
15. [`15-themes.md`](15-themes.md) (done, awaiting review): every window color from a base16/base24 theme, picked in
    `~/.config/parley/settings.json` as one id or a light/dark pair that follows the system live;
    inn's themes load in place.

19. [`19-usage-report.md`](19-usage-report.md) (done, awaiting review): `pnpm --filter @parley/server usage`, a report on
    real asks from `history.jsonl` (and Claude Code's transcripts with `--transcripts`), with a
    dated real-use baseline in the trials README.
20. [`20-input-limits.md`](20-input-limits.md) (done, awaiting review): soft input limits, so near-miss headers and
    descriptions stop bouncing (6.6% of real calls); then the full trial pass and the Codex baseline.
21. [`21-dont-ask-again.md`](21-dont-ask-again.md): a per-question "Don't ask again here" toggle;
    the agent drafts a standing line for `AGENTS.md` for Logan to approve; then a trial pass.

16. [`16-show-blocks.md`](16-show-blocks.md) (done, awaiting review): a `show` question type with nothing to answer, from
    `content` or a project file's `path` read by the server, rendered in its own scrolling pane;
    then a trial pass.
17. [`17-editable-show.md`](17-editable-show.md): an `editable` show of a whole file, edited in a
    textarea; the server saves it when the disk still matches and returns a diff; then a trial pass.
18. [`18-live-show.md`](18-live-show.md): the window's card follows a shown file
    while the ask is open, by re-sending the ask with the same id; go or no-go before the build.

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

Don't relitigate these. They're in [docs/decisions/](../decisions/README.md),
one file each, and `docket decisions` lists them. If one turns out to be wrong in practice, stop
and say so.

## Not built

`ask_async`/`collect`, `notify`, raw-schema `ask_form`, rank/slider/A-B/annotate widgets, native
elicitation, MCP Apps outside Claude Desktop (they need a remote server), the panel following the
active screen, remote/headless channels, and for captures: dragging image files in, thumbnails in
history, screen capture started from Parley, and images as MCP image content. A settings page or picker for themes and the notification sound, and the inline card
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
