# Brief 7: Inline cards in Claude Desktop

Read `CLAUDE.md`, [`README.md`](README.md) and the findings of brief 6
([`archive/06-mcp-apps-spike.md`](archive/06-mcp-apps-spike.md#findings)) first. Briefs 1–6 are
done. The spike's code is on the `spike/mcp-apps` branch (`fc40ffb`), unmerged. Port from it, but
build this on a fresh branch from main (`feat/inline-cards`), and don't merge the spike branch.

## Goal

When the client renders MCP Apps (Claude Desktop today), an ask shows up as a card inline in the
chat as well as in the Parley window. The user answers in either place, and the first answer wins.
Claude Code, Codex and any client without MCP Apps see exactly what they see on main today.

The spike proved every piece. This brief builds it properly: the two-step tool surface, the wire
change that tells the app an ask was answered in the chat, history for those answers, a quiet
window for inline asks, the card as a shipped single-file build, and styles that work in both
places.

## Decisions already made

Don't revisit these silently.

- **Show, then wait** (spike, confirmed with Logan 2026-10-10). Desktop mounts a tool's view only
  after the call returns, so in MCP Apps clients `ask` shows the form and returns an `askId` at
  once, and `ask_wait` blocks until the answer. *Was:* a blocking `ask` whose own call renders the
  card.
- **Desktop only.** claude.ai and ChatGPT need a remote (HTTP) server, which is out of scope. Logan
  is fine with Desktop being the only MCP Apps host (2026-10-10).
- **Capability-gated, per client** (brief 6). The card resource, `ask_wait` and the app-only tools
  exist only for clients that advertise `io.modelcontextprotocol/ui` with
  `text/html;profile=mcp-app`. Other clients get main's `ask`, byte for byte, without the
  `_meta.ui` key the spike added.
- **One brief, not two** (Logan, 2026-10-10).
- **History: the server sends the answer** (Logan, 2026-10-10). When the card wins, the server
  tells the app over the socket, with the data and note. The app records it as answered (or
  skipped) "in the chat", and the window's card says so. It isn't recorded as cancelled.
- **The window races, quietly** (Logan, 2026-10-10). An inline ask still queues in the window, but
  with no system notification, since it's already in front of the user. The tray count still
  includes it.
- **Path questions go to the window** (Logan, 2026-10-10). Pickers can't work in Desktop's
  sandboxed iframe. An ask with any `path` question renders read-only in the card with "This one
  has a file picker. Answer it in Parley (⌘⌃P).", and the window notifies as usual.
- **Wait slices: 200 s** (spike). Desktop cuts a local tool call at exactly 240 s and sends no
  `progressToken`, so nothing extends it. `ask_wait` returns "still waiting, call again" at 200 s,
  and the ask stays open.

## Already checked

From the spike (2026-10-10, Claude Desktop 2.31226.1, Claude Code 2.1.296, SDK 2.3.1, ext-apps
2.0.3), unless dated otherwise:

- `registerResource` after `connect()` throws "Cannot register capabilities after connecting to
  transport". The spike reads the first stdin line before `connect()`, decides, registers, and
  replays the line into `StdioServerTransport` through a `PassThrough`
  (`apps/server/src/mcp-app.ts` → `peekInitialize` on the spike branch).
- Desktop opens with `initialize` and puts the capability in `params.capabilities.extensions`.
  Claude Code opens with `server/discover` (protocol 2026-07-28) and carries capabilities in
  `params._meta["io.modelcontextprotocol/clientCapabilities"]`, client info in
  `…/clientInfo`. Claude Code advertises no MCP Apps extension.
- Desktop starts two Parley servers: `claude-ai 0.1.0` (chat) and `local-agent-mode-parley 1.0.0`
  (agent mode). Both advertise MCP Apps. Only chat was tested.
- `hostContext.toolInfo.id` is a content-block id (`cblk_…`), not the `tools/call` id. Key
  everything by our own `askId`, carried in the `ask` result's `structuredContent` and `_meta`.
- A view whose call has ended can still call server tools: the spike's card polled and submitted
  after `ask` returned.
- Desktop's iframe allows `'unsafe-eval'` (AJV works, no CSP violations). `window.prompt` is
  dropped silently (no `allow-modals`). Host capabilities: `openLinks`, `downloadFile`,
  `serverTools`, `serverResources`, `logging`, `sandbox`, `updateModelContext`, `message`.
- Host context: `theme` follows Desktop, 76 style variables, a font CSS block,
  `containerDimensions { width: 928, maxHeight: 5000 }`, `displayMode: "inline"`. `autoResize`
  works once the page's height follows its content.
- Desktop reads `ui://…` once per server process and caches it.
- Desktop shows the model the **text** content of a result, not `structuredContent`. Claude Code
  is the reverse (`CLAUDE.md`). Results must carry the same message in both, as `ask` already does.
- `postMessage` uses structured clone, which throws on Vue proxies: "#<Object> could not be
  cloned". JSON-copy anything from JSON Forms before `callServerTool`.
- `hub/client.ts` rejects any `cancel` reason it doesn't know, and any unknown message type, as
  `invalid_message` (checked 2026-10-10 on main, `apps/desktop/src/hub/client.ts:87`). An app
  older than the server would leave the window's card pending.
- The server's instructions are 1,260 characters (cap 2,048), and they're fixed when `McpServer`
  is constructed (checked 2026-10-10).
- tsdown 0.23 has a `copy` option (`{ from, to }` entries) and warns that `noExternal` is deprecated
  in favour of `deps.alwaysBundle` (checked 2026-10-10, installed types).
- Bundle: the single-file card was 707.6 kB (218 kB gzipped) in the spike, with Zod, the ext-apps
  `App` and the SDK client in it. Don't optimize it in this brief.

## Open questions

- **How the card learns the window answered.** Default: an app-only `parley_status` that
  long-polls, holding up to 25 s before answering `open`, so the card makes about 2 calls a minute
  instead of the spike's 40. If Desktop shows app-tool calls anywhere visible, tell Logan.
- **The card's width.** Default: `max-width: 640px`, left-aligned, in the inline mode only.
- **Pruning ended asks on the server.** Default: keep an ended ask in memory for 1 hour after it
  ends (a late `ask_wait` or a re-mounted card still gets its answer), then drop it.
- **App older than the server.** Default: if the app answers a `resolved` with `invalid_message`,
  the server falls back to `cancel` with `client_cancelled`, so the window's card at least
  withdraws. `pnpm install:desktop` stays the real fix.

## Shape

### Wire (`packages/protocol/src/wire.ts`): **pinned**

Both changes are additive, so it stays protocol v1.

```ts
export type ServerToApp =
  | { type: 'hello'; protocol: number; session: SessionInfo }
  // `inline`: the client also shows this ask in the chat. The app queues it but doesn't notify.
  | { type: 'ask'; id: string; form: FormSpec; createdAt: number; expiresAt?: number; inline?: boolean }
  | { type: 'cancel'; id: string; reason: CancelReason }
  // The user answered or skipped in the chat. The app ends the record with this outcome.
  | { type: 'resolved'; id: string; outcome: InlineOutcome }

export type InlineOutcome =
  | { status: 'answered'; data: unknown; note?: string }
  | { status: 'dismissed'; note?: string }
```

### Server (`apps/server`)

- **`src/client-capabilities.ts`** (new): `peekFirstMessage(stdin)` from the spike's
  `peekInitialize`, reading both `initialize` and the 2026-07-28 envelope, plus
  `supportsMcpApps(capabilities)`. Comment that this is stdio-only and first-message-only, and
  that an HTTP transport would need per-request detection.
- **`src/index.ts`**: peek first, then construct `McpServer` with the right instructions, then
  register, then `connect(new StdioServerTransport(peeked.stdin))`. Log one stderr line with the
  client and whether inline is on.
- **Instructions**: keep main's text for other clients. For MCP Apps clients, replace the line
  "The call waits until they answer, skip, or the timeout passes, which can take minutes." with one
  that says `ask` shows the form inline and in the Parley window and returns an `askId`, that
  `ask_wait` must come right away in the same turn, and that "still waiting" means call it again.
  Stay under 2,048 characters.
- **`src/tools/ask.ts`**: `registerAsk(server)` stays main's blocking `ask` for other clients,
  unchanged. Don't add `_meta.ui` to it.
- **`src/tools/inline.ts`** (new): for MCP Apps clients.
  - `ask`: the same input schema and description, plus a paragraph on the two steps.
    `_meta: { 'anthropic/alwaysLoad': true, ui: { resourceUri: CARD_URI } }`. Its output schema is
    `{ askId, message }`, and it returns at once.
  - `ask_wait { askId }`: blocks up to `WAIT_SLICE_MS` (200 000; `PARLEY_WAIT_SLICE_MS` overrides
    it, for tests). The result is `shapeAnswer`'s, or "still waiting, call `ask_wait` again with
    the same `askId`", or an error for an unknown `askId`. It has no output schema, because the
    still-waiting result isn't an `AskResult`. Cancelling `ask_wait` (the user stops the chat)
    cancels the ask.
  - App-only (`visibility: ["app"]`): `parley_submit { askId, kind: 'answer' | 'skip', data?, note? }`
    and `parley_status { askId }` (long-poll, see Open questions). They return
    `open | ended (+ outcome, via) | unknown`.
  - The resource `ui://parley/card.html` (`registerAppResource`), read from disk on each request.
- **`src/ask-lifecycle.ts`**: `runAsk` stays as on main. Add `showAsk`, `waitAsk`, `askStatus` and
  the race from the spike branch, keyed by `askId`, with the pruning above. Drop the spike's
  timeline log and its `/tmp` file.
- **`src/app-client.ts`**: `AskOptions` gains `inline?: boolean`, sent as `inline` on the `ask`
  message. When the card wins, the app has to get `resolved`, not `cancel`. Suggested: abort the
  ask's signal with an `InlineOutcome` as `signal.reason`, and have `onAbort` send `resolved` when
  the reason is one. Any equivalent is fine, as long as tool code still only sees `AppClient`.
  An ask with a `path` question is never sent with `inline: true` (the window has to notify).
- **Build**: `tsdown.config.ts` copies the card HTML to `dist/card.html` (`copy`), and the server
  resolves it next to `import.meta.url`, falling back to `apps/desktop/dist-mcp-app/mcp-app.html`
  under tsx. The server's `build` script runs `pnpm --filter @parley/desktop build:mcp-app` first.
  A missing card file is a clear error in `resources/read`, never a crash at startup.
- **`scripts/fake-host.ts`** (new), `pnpm --filter @parley/server fake-host`: a stdio client that
  advertises MCP Apps and spawns the server (like `fake-session.ts` drives the hub). Pair it with
  `fake-hub`, and give it scenarios: `card-wins`, `window-wins`, `skip`, `slice` (with
  `PARLEY_WAIT_SLICE_MS=1000`), `unknown-id`, and `plain` (no extension: only `ask`, and
  `resources/list` → method not found). Print pass/fail per scenario. The spike's smoke script
  is the starting point (its shape is in brief 6's findings).

### App (`apps/desktop`)

- **`src/hub/client.ts`**: accept `resolved` (validate `outcome`) and the `inline` flag.
- **`src/asks/store.ts`**: `AskRecord` gains `inline?: boolean` and `answeredIn?: 'chat'`. A
  `resolved` handler ends a pending (or orphaned) record as `answered` or `dismissed` with the
  data and note, and sets `answeredIn: 'chat'`. `ask` skips `notifyNewAsk` when `inline`. Both
  fields persist through `persist.ts` snapshots unchanged.
- **`src/App.vue`**: a shown card that ends with `answeredIn: 'chat'` gets the withdrawn-style
  banner "Answered in the chat." (or "Skipped in the chat.").
- **History** (`src/history/`): those records list as Answered or Skipped, with "in the chat"
  in the detail view. The status filter groups them with the window's own answers.
- **`src/platform.ts`**: add a way for the host to override `openExternal` (for example
  `setPlatform({ openExternal })`). The card entry sets it to `app.openLink`. Renderers keep
  importing `platform.ts` only. `pickPaths` isn't called inline, because path asks are read-only
  there.

### Card (`apps/desktop`, MCP Apps entry)

- **`mcp-app.html`, `src/mcp-app/main.ts`, `src/mcp-app/McpApp.vue`, `vite.mcp-app.config.ts`**,
  and a `build:mcp-app` script, ported from the spike without the diagnostics line or the probes.
- The card compiles the `ask` arguments (`ontoolinput`) with `compileQuestions`. It takes `askId`
  from `ontoolresult` (`structuredContent.askId`), then long-polls `parley_status` until the ask
  ends, and submits with `parley_submit` (JSON-copied data).
- States: open, then sent or ended. Ended shows the card read-only with its answers (from the
  status outcome) and one line: "Answered here.", "Answered in Parley.", "Skipped …", "Cancelled.",
  "Timed out.", or "This ask is no longer open." for an unknown `askId` (a restart, or an old chat).
- A form with any `x-widget: "path"` property renders read-only with the window notice above.
- The source line reads like the window's (`Claude · in the chat` or similar). No queue position,
  and no `esc hide` hint.
- Theme: `applyDocumentTheme`, `applyHostStyleVariables` and `applyHostFonts` on connect and on
  `onhostcontextchanged`.

### Styles (`src/styles.css`)

- One set of tokens. Light on `:root`. Dark under `@media (prefers-color-scheme: dark)` scoped to
  `:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`. The window
  behaves as before (no `data-theme`, so it follows the system). The card follows the host.
- An inline mode (a class or attribute on `<html>` that the card entry sets): content height
  instead of `height: 100%`, no inner scroll on `.body`, the `max-width`, and host variables mapped
  onto our tokens with our values as fallbacks (`--bg: var(--color-background-primary, …)`,
  `font-family: var(--font-sans, …)`, and so on).
- The window must look identical to main. Compare the gallery before and after.

### Docs

- `CLAUDE.md`: the card entry and its build, `fake-host`, the two tool surfaces, the `resolved`
  message and `inline` flag, the Desktop facts above (240 s cap, text not structured, mount after
  result). Keep it to what a future session needs.
- The project doc in Obsidian (per `CLAUDE.md`): mark MCP Apps in Desktop as built, and edit the
  Rough architecture tools line for `ask`/`ask_wait`.

## Out of scope

claude.ai and ChatGPT (remote transport), an HTTP entry point, native elicitation, a picker
inside the iframe, the eval-free validator (Desktop allows eval), bundle size, `ui/message` or
`updateModelContext`, Desktop's agent mode beyond one manual check, `fullscreen` display mode, and
Codex. Don't touch the trial harness's scoring, and don't change the window's look.

## Build order

1. Wire types and the app side (`hub/client.ts`, store, banner, history), with tests. Run
   `pnpm --filter @parley/desktop test`.
2. Server: detection, both tool surfaces, lifecycle, `AppClient` changes, `fake-host`. Run every
   `fake-host` scenario against `fake-hub`.
3. Styles restructure, then the card entry and its build. Check the gallery for the window, and
   the card under `fake-host`, before touching Desktop.
4. Build step and docs.
5. Ask Logan once before relaunching Claude Desktop (it's a GUI app, and its config lives under
   `~/Library`: don't edit it). Then hand him the manual checks.

## Acceptance

Commands:

1. `pnpm typecheck` passes. `pnpm --filter @parley/protocol test` and
   `pnpm --filter @parley/desktop test` pass, with new tests for: `resolved` ending a record as
   answered or skipped with `answeredIn: 'chat'`; an unknown `resolved` id answered with
   `unknown_ask`; `inline` asks not notifying; and the snapshot fold keeping the new fields.
2. `pnpm --filter @parley/server build` produces `dist/index.mjs` and `dist/card.html`.
3. Every `fake-host` scenario passes. In `card-wins`, `fake-hub`'s log shows `resolved` with the
   data, not `cancel`. In `window-wins`, `parley_submit` returns "already ended". In `plain`, the
   tool list is `ask` alone, with main's `_meta` (`anthropic/alwaysLoad` only).
4. Claude Code is unchanged: `pnpm --filter @parley/server trial --prompt date-library --runs 1`
   passes with `toolLoaded: true`. The init event's tools have `mcp__parley__ask` and no
   `ask_wait`, `parley_submit`, `parley_status` or `ListMcpResourcesTool`. Note in the report that
   the result matches main.

Logan checks by hand, in Claude Desktop chat, after a relaunch (ask first) and
`pnpm install:desktop` for the app (tell him to quit and reopen Parley from the tray):

5. A choice ask answered in the card: the card is up within a few seconds, the model calls
   `ask_wait` unprompted, and the window's card says "Answered in the chat." History shows it as
   answered in the chat, with the answers.
6. The same, answered in the window: the card switches to "Answered in Parley." No system
   notification arrived for either ask.
7. A review ask in the card, in light and in dark Desktop themes. The card follows the theme.
8. A path ask: read-only card with the notice, a notification from Parley, and the answer through
   the window.
9. A wait past 4 minutes: "still waiting", the model calls again, and the answer in the card
   lands.
10. A markdown link in a question opens in the browser from the card.
11. One ask in Desktop's agent mode: does the card render? Record it either way.
12. The window and the gallery look the same as on main.

Append a `## Report` with what was built, how each acceptance item went, and anything that moved
from this brief. Then stop. Ask Logan before merging anything, and leave `spike/mcp-apps` alone.
