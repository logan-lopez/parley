# The ask tool

What the model sees: the server instructions, the `ask` tool, and its result. Clients that render
MCP Apps get a two-step version ([inline cards](inline-cards.md)); this page is the blocking `ask`
every other client gets, how the server picks between them, and how long asks survive in Claude
Code.

**Sources:** `apps/server/src/index.ts`, `apps/server/src/client-capabilities.ts`, `apps/server/src/tools/ask.ts`, `apps/server/src/ask-lifecycle.ts`

**History:** [brief 1](../briefs/archive/01-hub-and-lifecycle.md), [brief 2](../briefs/archive/02-ask-tool-and-ui.md), [brief 3](../briefs/archive/03-trial-harness.md) (`alwaysLoad`), [brief 7](../briefs/archive/07-inline-cards.md) (two surfaces)

`index.ts` holds the server instructions and picks the surface. `client-capabilities.ts` reads the
client's first message. `tools/ask.ts` is the blocking `ask` and the tool description both
surfaces share. `ask-lifecycle.ts` holds `runAsk` and the show-then-wait helpers.

## How it works

- **Picking a surface.** The SDK fixes instructions at construction and won't add a capability
  after connect, so `peekFirstMessage` reads the first line on stdin before either, then replays it
  into the transport. A client that advertises `io.modelcontextprotocol/ui` with
  `text/html;profile=mcp-app` gets `registerInline` and no blocking `ask`; everyone else gets
  `registerAsk` and no resources. The first message is `initialize` from 2025-era clients (Claude
  Desktop), with capabilities in `params`, or `server/discover` from the 2026-07-28 era (Claude
  Code), with them in the `_meta` envelope; both are read. The server logs the client and whether
  inline cards are on to stderr.
- **Instructions** (`index.ts`) say when to ask and how: ask before starting when the request has
  more than one reading, when choosing between approaches, before large or irreversible changes, or
  for a detail that can't be inferred; 1–4 questions, choice questions preferred, the
  recommendation first with " (Recommended)"; no
  "Other" option; never secrets; don't re-ask a skipped question; read the note. Inline clients get
  one sentence swapped for the two-step flow. Claude Code caps server instructions at 2,048
  characters.
- **The tool.** `ask` declares the input schema and an `outputSchema` (the result schema from
  [the form spec](form-spec.md)), `readOnlyHint`, and `_meta["anthropic/alwaysLoad"]: true`. The
  description carries the input shape and one example. The handler compiles the questions, calls
  `runAsk` with the timeout (default 1800 s, at most 3600), and returns `shapeAnswer`'s text as
  content and its structured result as `structuredContent`. An unreachable app is an `isError`
  result with the reason ("Parley isn't running…").
- **`runAsk`** sends the form through `AppClient` with the call's abort signal and the client's
  identity, and blocks until the outcome. When the request carries a `progressToken`, it sends a
  progress notification every 15 s while it waits.
- **Who's asking.** The client's name and version come from `getClientVersion()` (the
  `initialize` handshake), or the `_meta` envelope's client info. They go in the `hello`, and the
  app shows the name on the card with the project directory.

## Claude Code and long asks

Checked against Claude Code 2.1.296 (2026-10-09), in the docs and by logging the server:

- `MCP_TOOL_TIMEOUT` applies to MCP tool calls, in ms. The default is 100000000 (about 28 h), so in
  practice there's no wall-clock cap. A per-server `"timeout"` in `.mcp.json` overrides it.
  Progress doesn't extend this one.
- The limit that matters is the idle timeout, `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`: 30 min for
  stdio. Progress notifications reset it. Claude Code sends `_meta.progressToken` on `tools/call`,
  so the 15 s keep-alives cover asks up to the 3600 s maximum.
- Interactive calls still running after 2 min are moved to a background task
  (`CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`, 0 disables). The ask keeps waiting, and the model gets a
  task id instead of blocking. Confirmed live: the call shows as an "MCP Task", the card keeps
  waiting, and the model resumes with the answer when it arrives. Print mode (`claude -p`) doesn't
  background; the call blocks until it ends.
- A backgrounded call's result reaches the model HTML-escaped: `<` and `>` in an answer arrive as
  `&lt;` and `&gt;`. A result returned inline, inside the 2 min, arrives raw. Parley escapes
  nothing (checked 2026-10-11 through `history.jsonl`, `fake-ask` with `fake-hub`, and an inline
  probe), so the model can read them back as `<` and `>`. It matters for drafts with angle
  brackets, like a `Co-Authored-By` line.
- Esc during a call sends `notifications/cancelled`. `ctx.mcpReq.signal` aborts, and the card is
  withdrawn as `cancelled`.
- When a tool declares an `outputSchema`, Claude Code shows the model only `structuredContent`
  (as JSON) and drops the text content. Codex shows both.
- MCP tools are deferred behind ToolSearch by default. `_meta["anthropic/alwaysLoad"]` (2.1.285+)
  loads `ask` up front. Server instructions always load.
- The model reaches for the built-in `AskUserQuestion` before Parley.
  `"permissions": { "deny": ["AskUserQuestion"] }` in settings hides it in interactive sessions
  (confirmed live). `claude -p` doesn't offer `AskUserQuestion` at all.

## Rules worth keeping

- **stdout is the MCP channel.** Never `console.log` in the server; log to stderr.
- **`message` repeats the text in `structuredContent`.** Claude Code shows the model only the
  structured result when there's an `outputSchema`, and Claude Desktop only the text. Guidance like
  "don't ask it again" has to reach both.
- **Model-facing text is measured.** A change to the instructions, the tool description, the schema
  or the result text gets a [trial run](testing.md#the-trial-harness) against the baseline.
- **Surface detection is stdio-only and first-message-only.** One process serves one client. An
  HTTP transport would see many clients and need per-request detection.

## Decisions

- **`alwaysLoad`:** in trials it took the model from asking on 1 of 3 prompts to 2 of 3.
- **The timeout default went from 600 s to 1800 s:** asks during real project work kept timing out.
- **No `ask_async`/`collect`:** Claude Code already backgrounds a long call and delivers the answer
  when it lands, and `collect()` would depend on the model remembering to poll. Parked in
  [`FUTURE.md`](../briefs/FUTURE.md#parked).
