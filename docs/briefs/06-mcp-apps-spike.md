# Brief 6: MCP Apps spike

Read `CLAUDE.md`, [`README.md`](README.md) and the MCP Apps section of [`FUTURE.md`](FUTURE.md)
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
