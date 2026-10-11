# Future briefs

These aren't scheduled. Each has enough here to turn into a brief when it's picked up. The
decisions themselves are the table in [`README.md`](README.md#decisions-already-made).

Logan's own idea notes for Parley are in his Obsidian folder,
`~/Writing/Books/TheBond/Development/Projects/Parley/` (`Ideas.md`). A section or bullet drawn from
one names it.

## MCP Apps in claude.ai and ChatGPT (remote transport)

Brief 7 ([`archive/07-inline-cards.md`](archive/07-inline-cards.md)) shipped inline cards for
Claude Desktop, the one MCP Apps host that runs local stdio servers. The spike's background is in
[`archive/06-mcp-apps-spike.md`](archive/06-mcp-apps-spike.md#findings).

**The question:** is the card worth having in claude.ai or ChatGPT, where an MCP server has to be
remote (HTTP)?

**Why it matters:** those are the hosts where the window can't be the fallback, since Parley.app
runs on Logan's Mac and the conversation doesn't. A card there would be card-only.

**Likely shape:** a streamable-HTTP transport for the server, auth for it, and a way for a remote
server to reach the app (or no app at all). It touches the "Remote" item in the README's future
direction: `AppClient` is the seam. The inline tool surface (`src/tools/inline.ts`) and the card
should carry over unchanged.

**Kill criteria:** Logan doesn't use claude.ai or ChatGPT for agent work that needs asks. Desktop
being the only MCP Apps host was fine with him on 2026-10-10.

## Trial prompts for show-then-wait

**The question:** in an MCP Apps client, does the model call `ask_wait` after `ask`, call it again
after "still waiting", and hold off on the work in between?

**Why it matters:** the trial harness (brief 3) only scores the blocking `ask`. The two-step flow
depends on the model following the instructions, and the one miss in the spike (a model ending its
turn without `ask_wait`) is the parked case below.

**Likely shape:** a trial client that advertises MCP Apps, which Claude Code and Codex don't. Either
drive Desktop (hard to automate) or extend `fake-host` into a model-in-the-loop client over the API,
with `fake-hub` answering. New scores: waited, re-waited after a slice, didn't act before the
answer.

**Kill criteria:** real use in Desktop shows the model always waits. Then it's not worth a harness.

## Queue `resolved` and `cancel` across a reconnect

If the card wins while the app is restarting, the server drops the window's ask from its pending
list and writes `resolved` into a dead socket. The app's record stays orphaned in history, though
the agent still gets the answer. `cancel` has the same gap. The fix is small: `AppClient` queues
them and sends them after the next connect, alongside the pending asks it already re-sends. Found
in brief 7. Rare enough to wait for a brief that touches `AppClient` anyway.

## Parked

- **Inline answers when the model never calls `ask_wait`:** with show-then-wait (brief 7), an answer
  given in the card waits on the server until something calls `ask_wait`. If the model ends its
  turn instead, nothing reaches the chat. In the spike that happened once in 7 runs, and only
  because the prompt said "call the tool once". The likely fix: when no wait is pending, the card
  posts the answer as the user's next message through `ui/message` (Desktop advertises `message`,
  but whether it starts a model turn is unverified). Revisit if it happens in real use after
  brief 7.
- **`ask_async` / `collect`:** demoted on 2026-10-10. Claude Code already moves calls still running
  after 2 min into a background task, and the model picks up the answer when it lands (confirmed
  live). `collect()` would depend on the model remembering to poll. Revisit when a client Logan
  uses blocks on long calls. It hasn't been checked whether Codex does. Brief 4's history is the
  groundwork either way.
- **Raw-schema `ask_form`:** no real question so far has needed more than the questions array, and
  raw JSON Schema is the input shape models write worst. The app already renders arbitrary schema,
  so this is mostly a tool definition when it's needed.
- **`notify`:** Claude Code hooks already cover "I'm done" pings. Wait for a concrete moment when an
  agent should tell the user something without waiting for an answer.
- **More widgets:** rank, slider, A/B and annotate. Pick one up when a real ask needs it and the
  harness shows models would use it. `preview` covers most A/B comparisons.
- **A committed card harness:** brief 7 checked the card in headless Chromium with an ext-apps
  `AppBridge` host page, the real server and `fake-hub` (14 checks). It lives only in that
  session's scratchpad. Commit it as a `pnpm` script if the card starts changing often. The cost is
  a `playwright-core` dev dependency.
- **Opening the window from a notification:** `tauri-plugin-notification` shows only a title, body,
  icon and sound on desktop; `onAction` is mobile-only, so a click can't open the window. The
  hotkey and the tray are the way in. Revisit if the plugin gains desktop actions, or if a native
  notification (a small Rust bridge) becomes worth it.
- **The panel on the active screen:** the panel shows at its remembered position, on whichever
  monitor that is (decided 2026-10-10). Following the focused screen or the cursor was left out as
  the bigger change. Brief 9's two-monitor check, which would have said whether that's a problem
  on the laptop plus the ultrawide, was waived. Revisit if Logan finds himself hunting for it.
- **Parley inside inn:** the card could later live as a component in inn, Logan's chat app, which
  is an MCP host. Nothing to do until inn wants model → user questions of its own.
- **One dark token block:** `src/styles.css` keeps two identical dark blocks in step by hand.
  `light-dark()` with `color-scheme` would make it one, if WKWebView's support is confirmed. Worth
  doing the next time the tokens change.
