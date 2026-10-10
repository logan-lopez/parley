# Future briefs

These aren't scheduled. Each has enough here to turn into a brief when it's picked up. The
decisions themselves live in the project doc in Obsidian.

## MCP Apps: the card inline in the chat (spike first)

**Scheduled (2026-10-10):** the spike is brief 6, [`06-mcp-apps-spike.md`](06-mcp-apps-spike.md).
This section stays as the background it builds on.

**The question:** when the host supports MCP Apps, can an ask render inline in the conversation,
with the floating window as the fallback?

**Why it matters:** this changes what Parley is. It becomes a form language that renders wherever
the user is, not one more widget in the window. The MVP already paid for most of it: `platform.ts`
keeps renderers free of Tauri, the compiler is pure, and the app renders only JSON Schema.

**What the spec allows** (ext-apps spec 2026-01-26, checked 2026-10-10):

- When a tool with a `ui://` resource is called, the host renders the view. After the view
  initializes, the host sends `ui/notifications/tool-input` with the tool's arguments. It sends
  `ui/notifications/tool-result` when the tool finishes, "if the View is displayed during tool
  execution". So showing the view *while* the call runs is allowed, but it isn't required.
- The view can call server tools. A tool registered with `_meta.ui.visibility: ["app"]` is visible
  to the view and hidden from the model.

**Likely shape:**

- `ask` gets `_meta.ui.resourceUri`. The resource is the card, built as one self-contained HTML
  file.
- An app-only `parley_submit` tool settles the pending ask inside the server process. It races the
  socket path, and whichever answers first wins. The loser is cancelled: the window card is
  withdrawn, or the inline view shows that the ask was answered elsewhere.
- This sits beside `AppClient`, not inside it. `runAsk` waits on either path.

**What the spike has to answer** (about a day):

1. Does Claude Desktop (or claude.ai) show the view during the tool call, or only after the result?
   If it's only after, a blocking inline ask can't work, and this turns into the async design
   instead.
2. Does the host's iframe CSP allow `'unsafe-eval'`? AJV compiles validators with `new Function`.
   Without it, no card renders, and the fix is precompiled validators or a validator that doesn't
   use AJV.
3. Can the card's styles live in a host iframe? Theme comes from the host context. Zoom probably
   doesn't apply there.

**Kill criteria:** if the answer to (1) is "only after the result" in the hosts Logan uses, park
this until async exists. Claude Code, the main client, doesn't render MCP Apps at all, so this
mostly serves Claude Desktop and claude.ai.

## Parked

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
- **`tauri-nspanel`:** still deferred, as it was in the MVP.
