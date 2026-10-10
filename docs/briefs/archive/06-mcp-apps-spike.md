# Brief 6: MCP Apps spike

Read `CLAUDE.md`, [`README.md`](../README.md) and the MCP Apps section of [`FUTURE.md`](../FUTURE.md)
first. Briefs 1–5 are merged.

This is a spike. What it produces is answers and a recommendation, not a feature. Work on a
`spike/mcp-apps` branch. The code is there to get the answers, and it may be thrown away. Budget
about a day, and stop early if the kill criteria trip.

## Goal

Answer FUTURE.md's three questions with evidence from a real host:

1. Does Claude Desktop show the view while the `ask` call is still running, or only after the
   result? If it's only after, a blocking inline ask can't work.
2. Does the host's iframe allow `'unsafe-eval'`? AJV compiles validators with `new Function`, and
   without it no card renders.
3. Can the card's styles live in a host iframe: theme, width, fonts?

Then recommend go or no-go. A go becomes brief 7, the real build. A no-go parks MCP Apps until
async exists, as FUTURE.md's kill criteria say.

## Already checked (2026-10-10)

These come from the ext-apps docs (spec 2026-01-26, via Context7) and this machine. Don't re-derive
them, but do verify anything the spike leans on.

- **Server helpers:** `@modelcontextprotocol/ext-apps/server` provides `registerAppTool`,
  `registerAppResource`, `RESOURCE_MIME_TYPE` (`text/html;profile=mcp-app`) and `getUiCapability`.
  Its examples import `McpServer` from `@modelcontextprotocol/server`, the SDK v2 package pinned
  here (2.3.1 installed). Check its peer range before installing.
- **Tool metadata:** `_meta.ui = { resourceUri, visibility? }`. `visibility` defaults to
  `["model", "app"]`, and `["app"]` hides a tool from the model. The flat `_meta["ui/resourceUri"]`
  is deprecated.
- **CSP:** the resource's `_meta.ui.csp` declares only domains (`connectDomains`,
  `resourceDomains`, `frameDomains`, `baseUriDomains`). There's no field for `'unsafe-eval'`, so
  question 2 depends on each host's default policy. The spike can't negotiate it.
- **Capability:** hosts advertise support in `initialize`, under
  `capabilities.extensions["io.modelcontextprotocol/ui"].mimeTypes`. `getUiCapability` reads it.
- **View:** `App` from `@modelcontextprotocol/ext-apps`, connected over `PostMessageTransport`.
  `ontoolinput` (the call's arguments, sent once after init), `ontoolresult`,
  `onhostcontextchanged`, `getHostContext()` and `callServerTool`. The host context carries `theme`,
  style variables, fonts, `containerDimensions`, and `toolInfo.id`, the JSON-RPC id of the
  `tools/call` that created the view. It's bundled into one HTML file with
  `vite-plugin-singlefile`.
- **Local test host:** `basic-host` in the ext-apps repo is a reference host, but it reaches
  servers by HTTP URL, and Parley is stdio only. Use Claude Desktop instead, unless a throwaway
  HTTP entry turns out to be cheap.
- **Claude Desktop** 2.31226.1 is installed, and its config already runs
  `apps/server/dist/index.mjs` under Node 24.20. Rebuilding the server is all the wiring it needs.
  It's a GUI app, so ask Logan before quitting or relaunching it. Leave its config alone: it
  lives under `~/Library`.
- **claude.ai and ChatGPT** reach MCP servers only as remote (HTTP) connectors. They're out of reach
  of a stdio server, so they're out of scope here. Say what a go would need for them.

## The constraint: hosts that don't do MCP Apps

Claude Code and Codex don't render MCP Apps. A host that doesn't implement the extension won't honor
`visibility` either, so an app-only tool registered unconditionally would show up in the model's
tool list there. So would a `resources` capability the server never had before. Either one is a
model-facing change in the main client.

So:

- `ask` keeps its static registration and `anthropic/alwaysLoad`, and gains
  `_meta.ui.resourceUri`. That key is inert metadata for hosts that don't know it. Check that
  Claude Code still loads the tool.
- The resource and the app-only tool are registered only when the client advertises the
  capability. Do that in `server.server.oninitialized` with `getUiCapability`. Registering after
  connect may emit `tools/list_changed`; note whether Claude Desktop handles that cleanly.

## Shape of the spike

### Server (`apps/server`)

- `ui://parley/card.html`, which serves the single-file view. For the spike it's fine to read it
  from the desktop build's output path.
- `parley_submit`, app-only (`visibility: ["app"]`), takes the call's request id, the data and the
  note, and settles that pending ask inside this server process.
- `runAsk` waits on whichever answers first: the socket (`AppClient`) or `parley_submit`. When
  `parley_submit` wins, abort the socket side through the `AbortSignal` that `AppClient.ask`
  already takes. The window card is then withdrawn as `client_cancelled`. That reason is wrong
  ("answered inline" would be right), but a new `CancelReason` is a wire change, so leave it for
  brief 7 and note it.
- Key pending asks by the `tools/call` JSON-RPC id (`ctx.mcpReq.id`). The view gets the same id
  from `hostContext.toolInfo.id`. Whether Claude Desktop fills in `toolInfo.id` is itself a finding.
  If it doesn't, fall back to "the session's only pending inline ask", and say so.
- Log a timeline to stderr, in ms since the `tools/call`: the call arriving, `resources/read` of the
  card, `parley_submit` arriving, and the call ending. This is the evidence for question 1.

### View (`apps/desktop`)

- A second Vite entry (`mcp-app.html`, `src/mcp-app/main.ts`) built with `vite-plugin-singlefile`.
  The Tauri build stays as it is.
- Mount `AskCard` the way the gallery does (`src/gallery/Gallery.vue`): compile the arguments with
  `compileQuestions`, and on submit call `parley_submit` instead of the hub. The view compiles the
  form itself, because it only has the arguments while the call runs. That pulls Zod into this
  bundle. Record the bundle size, and don't optimize it.
- On `ontoolresult`, if the answer came from the window, show it read-only, with a line saying it
  was answered in Parley.
- At startup, try `new Function('return 1')` and show "eval: allowed" or "eval: blocked" in the
  view. Send the same in the `parley_submit` payload, so the server log records it. That answers
  question 2 even if JSON Forms then fails to render.
- Apply `hostContext.theme` and `onhostcontextchanged`. Zoom doesn't apply here. Leave
  `src/zoom.ts` out of this entry.
- `platform.ts` falls back to `window.prompt` outside Tauri. A sandboxed iframe may block that.
  Record what happens with a `path` question, and don't fix it.

## Measuring

Use fixtures from `packages/protocol/fixtures/` (`choice`, `review-diff`, and a `path` one). Have
Claude Desktop call `ask` with each, and record:

- **Q1:** when the view appears relative to the call. Whether it's interactive while the call
  blocks. What Desktop shows while waiting. What happens to a call that blocks for 5+ minutes (a
  timeout? backgrounding?).
- **Q2:** "eval" allowed or blocked, and whether the card renders. If it's blocked, name the escape
  route (AJV standalone precompiled validators, or a validator that doesn't use AJV) and estimate
  it. Don't build it.
- **Q3:** screenshots in light and dark, the container width the host gives, whether host fonts and
  variables apply, and anything in `styles.css` that breaks in an iframe.
- **The race:** answer in the window while the view is up, then the other way round. Each loser
  should end up in a sensible state.

## Out of scope

Polish, the path picker inside an iframe, claude.ai and ChatGPT (remote transport), elicitation,
and the history question. That last one matters for brief 7: an answer given inline never reaches
the desktop app, so it never lands in `history.jsonl`. Note it as a design question, and don't
solve it.

## Deliverables

- A `## Findings` section at the end of this brief: the answer to each question with its evidence
  (timeline excerpts, screenshots in `docs/briefs/assets/06/`), the bundle size, surprises, and
  the recommendation.
- If it's a go: the outline of brief 7, meaning what the spike code proved and what has to be built
  properly (the cancel reason, history, capability-gated registration, the build step that ships
  the HTML with the server).
- FUTURE.md and the project doc updated with the decision, as CLAUDE.md describes.

## Acceptance

Run each of these and report the results.

1. A round trip in Claude Desktop for each fixture, or a documented failure with the timeline that
   shows where it stopped.
2. Questions 2 and 3 answered with evidence.
3. Claude Code is unaffected. `trial --prompt date-library --runs 1` still has `toolLoaded: true`.
   The init event's tool list shows `mcp__parley__ask` and no `parley_submit`, and no Parley
   resources appear. `ask`'s metadata changed, so this run is warranted.
4. `pnpm typecheck` passes on the branch.
5. Findings written and a recommendation made.

Then stop. Ask Logan before merging anything. By default the branch stays unmerged, and brief 7
starts clean.

## Findings

Run 2026-10-10 on `spike/mcp-apps`, against Claude Desktop 2.31226.1 (chat), with Parley's
release build running. Timeline lines are from the server's spike log, in ms since the `ask` call
arrived.

**Recommendation: go, for Claude Desktop, with "show, then wait" instead of a blocking inline
ask.** The blocking version tripped the kill criterion (Q1), but a two-call shape works end to end:
answered in the card, answered in the window, skipped, a review, and a wait past Desktop's 4-minute
cap. Logan is fine with Desktop being the only MCP Apps host for now.

### Q1: does Desktop show the view while the call runs? No.

Desktop holds the `tools/call` with a spinner and reads the card only after the result is in:

```
+0 ms        tools/call ask arrived
+48 974 ms   ask ended: answered via window
+49 413 ms   resources/read ui://parley/card.html     ← 437 ms after the result
+51 128 ms   card up (first probe from the iframe)
```

So a blocking inline ask can't work there. The card did mount afterwards and showed "Answered in
Parley" read-only, as designed.

**The workaround, tested: show, then wait.** In clients that advertise MCP Apps, `ask` starts the
ask (window and card, raced) and returns at once with an `askId`. The model then calls `ask_wait`,
which blocks until the first answer. The card from the `ask` result answers through
`parley_submit`, keyed by `askId`, and polls `parley_submit { kind: 'status' }` to learn when the
window answered first.

```
+0 ms        tools/call ask arrived
+310 ms      resources/read card
+1 769 ms    ask_wait arrived          (model, unprompted)
+3 013 ms    card up
+6 222 ms    parley_submit answer → ask ended: answered via inline
```

Over 7 Desktop runs (choice ×3, review-diff, path, a natural "help me pick a date library",
and a long wait), the card was up 0.3–3 s after `ask`, and the model called `ask_wait` on its own
every time but once. That once, the prompt said "call the ask tool **once**", and the model took
it literally. It called `ask_wait` when told to. An ask stays open between the calls (13 min in
that run), and a late `ask_wait` still gets the answer.

**Desktop's 4-minute cap.** Desktop cancelled a blocking `ask_wait` at exactly 240 000 ms
(`notifications/cancelled`; the model saw "No result received from client-side tool execution").
Desktop sends no `progressToken`, so keep-alives can't extend it, and the error string isn't in
Desktop's local bundle, so the cap is on the claude.ai side. The fix, tested: `ask_wait` waits at
most 200 s, then returns "still waiting, call `ask_wait` again", and the ask stays open. The model
re-called it within 1.2 s, and the answer arrived on the next wait. Each slice shows in the chat as
another tool call. That's the UX cost.

**Race.** Card first: the window's card is withdrawn as `client_cancelled` (wrong reason, as
expected; see brief 7). Window first: the card shows "Answered in Parley" within one poll
(1.5 s). Desktop cancelling the wait: both cards end as cancelled. All three end in a sensible
state.

### Q2: does Desktop's iframe allow `'unsafe-eval'`? Yes.

`new Function` ran ("eval: allowed" in every probe), no `securitypolicyviolation` fired, and AJV
rendered every fixture, including the 4-item review with diff previews. Nothing to build for
Desktop.

For hosts that block it, the local harness shows what happens: the whole card is gone, and only the
spike's diagnostics line renders ([`harness-choice-no-eval.png`](../assets/06/harness-choice-no-eval.png)).
Escape routes, not built:

- **AJV standalone (precompiled) validators don't fit.** Our schemas are compiled from the
  questions at call time, so there's nothing to precompile at build time, and running code the
  server generates per ask brings eval back in another form.
- **A validator without codegen, behind an AJV-shaped shim.** Pass JSON Forms an object whose
  `compile()` returns an interpreting validator (`@cfworker/json-schema` or similar; the MCP SDK
  already ships a cfWorker provider for the same reason). It has to produce AJV's error shape
  (`keyword`, `instancePath`, `params.missingProperty`), because `AskCard`'s problems line reads
  those. About 1–2 days with tests over every fixture.

### Q3: can the card's styles live in a host iframe? Yes, with layout changes.

Desktop's host context: `theme: "dark"` (it follows the app), 76 style variables, a font CSS
block, `containerDimensions { width: 928, maxHeight: 5000 }`, `displayMode: "inline"` (fullscreen
also offered), `platform: "desktop"`. Host capabilities: `openLinks`, `downloadFile`,
`serverTools`, `serverResources`, `logging`, `sandbox`, `updateModelContext`, `message`.
Auto-resize worked (928×150 grew to 928×565 on render).

What `styles.css` needed (`src/mcp-app/mcp-app.css`):

- **Height.** `html, body, #app, .card { height: 100% }` and the scrolling `.body` assume a
  window the card fills. In an iframe the host sizes to the content, so those go to `auto`,
  otherwise the auto-resize measurement fights the layout.
- **Theme.** The light/dark tokens sit under `@media (prefers-color-scheme)`, which follows the
  system, not the host. The spike repeats them under `:root[data-theme]`, which `applyDocumentTheme`
  sets. Brief 7 should restructure the tokens once rather than duplicate them.
- **Host variables and fonts.** Mapped onto our tokens with our values as fallbacks
  (`--bg: var(--color-background-primary, …)`, `font-family: var(--font-sans, …)`).
- **The hints row** says "esc hide", which means nothing inline.
- **The width** is 928 px, about twice the window's 440. The card stretches fine, but option
  rows get long. Worth a `max-width` in brief 7.

Screenshots: Logan skipped Desktop screenshots. The local harness (an `AppBridge` host page in
headless Chromium, in the session scratchpad) rendered
[light](../assets/06/harness-choice-light.png) and [dark](../assets/06/harness-review-dark.png) from
`hostContext.theme`.

### Other findings

- **`toolInfo.id` is not the JSON-RPC id.** Desktop sends a content-block id (`cblk_01Lp…`), while
  the `tools/call` id was `3`. Keying by request id would never match. Show-then-wait keys by our
  own `askId`, carried in the `ask` result's `_meta` and `structuredContent`, so it doesn't matter.
- **The SDK can't add a capability after connect.** `registerResource` after `connect()` throws
  "Cannot register capabilities after connecting to transport" (SDK 2.3.1), so the brief's
  "register in `oninitialized`" plan fails. The spike reads the first stdin line before
  `connect()` (`peekInitialize`), decides, registers, and replays the line into the transport. No
  `tools/list_changed` is ever sent, so that question is moot.
- **Claude Code opens with `server/discover`, not `initialize`** (the 2026-07-28 era), with
  capabilities in each request's `_meta` envelope
  (`io.modelcontextprotocol/clientCapabilities`). The peek reads both. Claude Code 2.1.296
  advertises no MCP Apps extension. Desktop uses `initialize` and advertises it in both of its
  servers: `claude-ai 0.1.0` (chat) and `local-agent-mode-parley 1.0.0` (agent mode, untested).
- **No native form elicitation in Desktop.** Its client declares `elicitation: { url: {} }`,
  URL mode only.
- **Desktop shows the model the text content, not `structuredContent`**, the reverse of Claude
  Code. The Desktop model noticed the answers looked keyed by header and asked whether ids were
  dropped. The text is all it gets.
- **Desktop caches the card per server process.** One `resources/read` served every later ask,
  which is why the card came up in ~300 ms after the first.
- **`postMessage` can't clone a Vue proxy.** The first inline Send failed with "#<Object> could not
  be cloned": JSON Forms hands back reactive data, and structured clone refuses proxies. Tauri's IPC
  JSON-serializes, so the app never hit it. Fixed with a JSON copy before `callServerTool`.
- **Path questions don't work inline.** The picker falls back to `window.prompt`, which Desktop's
  sandbox (no `allow-modals`) drops silently: nothing happens, and no error or violation fires.
  `<input type=file>` wouldn't help (no real paths in a sandboxed iframe), and Desktop offers no
  picker capability. Not fixed, per the brief.
- **Bundle size.** `mcp-app.html` is 707.6 kB, 218 kB gzipped, as one file. The Tauri app's
  chunks are ~500 kB (~170 kB gzipped). Zod, the ext-apps `App` and the SDK client add ~200 kB.
  Not optimized.
- **Claude Code is unaffected** (acceptance 3). `trial --prompt date-library --runs 1` on the
  final build: pass (asked, valid first call, used), `toolLoaded: true`. The init event's tools are
  Claude Code's built-ins plus `mcp__parley__ask` only: no `parley_submit`, no `ask_wait`, and no
  `ListMcpResourcesTool`/`ReadMcpResourceTool`, so no Parley resources. A direct `claude -p` against the built
  server logged `server/discover from claude-code 2.1.296; extensions null; inline off`, so no
  resources capability, no `parley_submit`, no `ask_wait`. `ask` carries `_meta.ui.resourceUri`
  (and the flat `ui/resourceUri` that ext-apps' `registerAppTool` still writes) as inert metadata.

### Not tested

Desktop's agent mode; asks from two Desktop chats at once (the card's no-id fallback is "the only
open ask"); a webview reload of the card mid-ask (polling should recover it); the server
instructions, which still say "the call waits", in Desktop.

### Brief 7 outline: inline cards in Claude Desktop

What the spike proved: capability-gated registration with zero change for Claude Code; the card
renders and themes in Desktop with eval allowed; show-then-wait with sliced waits beats Desktop's
mount-after-result behavior and its 240 s cap; the window and the card race cleanly.

What has to be built properly:

1. **Tool surface for MCP Apps clients.** `ask` (returns `askId`) + `ask_wait` (sliced,
   ≤ 200 s). Descriptions, result text and a server-instructions variant written for the two-step
   flow; the instructions are fixed at construction, so build the `McpServer` after the peek. Add
   trial prompts that score whether the model calls `ask_wait`, re-calls after "still waiting", and
   doesn't continue in between, ideally through a Desktop-like fake client.
2. **Capability detection that isn't a stdin hack.** Either keep the peek (stdio only, first
   message) or fold it into the SDK's initialize/discover handling. Decide how it extends to the
   2026-07-28 era, where capabilities are per request, and to HTTP.
3. **A cancel reason for "answered elsewhere".** A new `CancelReason` (wire change, still
   additive) so the window says "Answered in the chat", not "cancelled by the agent".
4. **History.** An inline answer never reaches the app, so it never lands in `history.jsonl`, and
   today the window's record says cancelled. Options: the server sends the inline answer over the
   socket as a new message type, or the app records "answered elsewhere" with the data. Design
   question.
5. **The card's state channel.** Replace 1.5 s polling with a long-poll `status` capped under the
   host's limits, or accept polling and measure what it costs Desktop.
6. **Styles.** Restructure the tokens so `[data-theme]` and the media query share one set, add a
   content-height mode and a `max-width`, drop the window-only hints.
7. **Path questions inline.** Route asks with a `path` question to the window only, or offer a
   typed path field inline.
8. **Build and ship.** A `build:mcp-app` step that the server build depends on, and the HTML
   shipped beside `dist/index.mjs` instead of read from `apps/desktop/dist-mcp-app/`.
9. **Remove the spike scaffolding.** The diagnostics line, `probe`, the timeline log,
   `PARLEY_WAIT_SLICE_MS`.

For claude.ai and ChatGPT, a go would also need: a Streamable HTTP entry point, hosting
reachable from their servers (a tunnel or a deployed server) with auth, and an answer for the
window race, since a remote server can't reach the local socket. Out of scope until there's a
reason.
