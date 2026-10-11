# Inline cards (show, then wait)

In Claude Desktop the ask card renders inline in the chat, as an MCP Apps view, and races the
Parley window: the first answer wins. Because Desktop mounts a view only after its tool call
returns, `ask` can't block there. It shows the form and returns an `askId`, and `ask_wait` blocks
for the answer.

**Sources:** `apps/server/src/tools/inline.ts`, `apps/server/src/ask-lifecycle.ts`, `apps/server/src/card.ts`, `apps/server/tsdown.config.ts`, `apps/desktop/src/mcp-app/`, `apps/desktop/mcp-app.html`, `apps/desktop/vite.mcp-app.config.ts`

**History:** [brief 6](../briefs/archive/06-mcp-apps-spike.md) (the spike), [brief 7](../briefs/archive/07-inline-cards.md), [brief 12](../briefs/12-capture-question.md) (image captures, `clipboardWrite`)

`tools/inline.ts` registers the surface. `ask-lifecycle.ts` holds `showAsk`, `waitAsk`,
`awaitStatus` and `answerInline`. `card.ts` serves the card's HTML. `src/mcp-app/` in the desktop
app is the card: `McpApp.vue` around the same `AskCard` the window uses, and `theme.ts`.

## How it works

- **The surface** (only for clients that advertise MCP Apps; see
  [the ask tool](ask-tool.md#how-it-works)):
  - `ask`: same input and description as the blocking one, plus a paragraph on the two steps.
    `_meta.ui.resourceUri` points at the card. It calls `showAsk` and returns at once with
    `{ askId, message }` (and `_meta["parley/askId"]`). The message tells the model to call
    `ask_wait` now.
  - `ask_wait({ askId })`: blocks until the ask ends, at most one slice (200 s,
    `PARLEY_WAIT_SLICE_MS` for tests). Then it returns the shaped answer, or "the user hasn't
    answered yet, call again", or an error for an unknown id (from before a restart, or made up).
    No `outputSchema`, since "still waiting" isn't an `AskResult`. Aborting a wait cancels the ask.
  - `parley_submit({ askId, kind, data?, note? })` and `parley_status({ askId })`: app-only
    (`visibility: ['app']`), called by the card, never the model. `parley_status` is a long-poll
    that holds up to 25 s while the ask is open.
  - `ui://parley/card.html`: the card, one self-contained HTML file. Its `resources/read`
    contents carry `_meta.ui.permissions.clipboardWrite`, for the copy buttons on code. The host
    may withhold it; the button then selects the code for ⌘C.
- **The race** (`showAsk`). Every inline ask also goes to the window through `AppClient`, flagged
  `inline: true`, so the app queues it without a notification. The ask is keyed by `askId` and
  ends once:
  - The window answers first: `ask_wait` returns that answer, and the card's `parley_status` poll
    reports it ended `via: 'window'`.
  - The card answers first (`parley_submit`): the server aborts the window's ask with the
    `InlineOutcome` as the abort reason, `AppClient` sends `resolved` instead of `cancel`, and the
    app records the ask as answered or skipped with `answeredIn: 'chat'`
    ([asks and history](asks-and-history.md)).
  - Ended asks are kept for an hour, so a late `ask_wait` or a remounted card still gets the result.
- **Some forms are window-only.** An ask with a `path` question, or a `capture` that takes
  screenshots, isn't sent as `inline` (`isWindowOnly`, [the form spec](form-spec.md)), so the
  window notifies for it, and the card shows it read-only and points at the window: the host's
  iframe has no file picker and nowhere to save an image. A text-only capture works inline.
- **No window.** If the app can't be reached, an inline ask goes on with the card alone and keeps
  its own timeout. A window-only ask fails, and `ask_wait` returns the error.
- **The card** (`McpApp.vue`). The host sends the tool input (the questions), then the result (the
  `askId`). The card compiles the questions itself, renders `AskCard` with `embedded` (no focus
  grab, no Esc hint), long-polls `parley_status` until the ask ends, and answers through
  `parley_submit`. It points `openExternal` at the host's `openLink` through `setPlatform`, and
  maps the host's theme, fonts and colors onto Parley's tokens (`theme.ts`). `html.inline` makes
  it content height with no inner scroll, at most 640 px wide.
- **The build.** `pnpm --filter @parley/desktop build:mcp-app` (Vite with `vite-plugin-singlefile`)
  writes `apps/desktop/dist-mcp-app/mcp-app.html`. `pnpm --filter @parley/server build` runs that
  first, then bundles the server with the card copied beside it as `dist/card.html`. Under tsx
  the server reads the card from `dist-mcp-app/` instead. Either way it's read on every
  `resources/read`, and a missing card is an error there, not at startup.

## Claude Desktop

Checked against Claude Desktop 2.31226.1 (2026-10-10, brief 6):

- It opens with `initialize` and advertises MCP Apps in `params.capabilities.extensions`. It starts
  two Parley servers, `claude-ai` (chat) and `local-agent-mode-parley` (agent mode).
- It mounts a tool's view only after the call returns. That's why `ask` returns at once.
- It cuts a local tool call at exactly 240 s and sends no `progressToken`, so nothing extends it.
  That's why `ask_wait` waits in 200 s slices.
- It shows the model a result's text content, not `structuredContent` (the reverse of Claude
  Code). Results carry the same message in both.
- `hostContext.toolInfo.id` is a content-block id, not the `tools/call` id. Key by `askId`.
- It reads `ui://…` once per server process and caches it: restart Desktop to pick up a new card.
- The iframe allows `'unsafe-eval'` (AJV works), drops `window.prompt` (no `allow-modals`), and
  has no file picker. Whether it honors the `clipboardWrite` request is unverified.
- Native elicitation is out: Desktop's client supports URL mode only, no forms.

## Rules worth keeping

- **Renderers never import `@tauri-apps/*`.** They go through `src/platform.ts`, which is what lets
  them run in the card ([the card](card-ui.md)). One that imports Tauri breaks the card.
- **JSON-copy before `callServerTool`.** `postMessage` can't clone a Vue proxy, and JSON Forms hands
  back one.
- **Key everything by `askId`,** never a host id.
- **Claude Code and other clients see none of this.** The extra tools and the resource are
  registered only for clients that advertise the extension. Run `fake-host` after touching the
  surface, the lifecycle or `AppClient` ([testing](testing.md)).

## Decisions

- **Why show-then-wait, not a blocking inline `ask`:** the spike found Desktop mounts the view only
  after the call returns, so a card inside a blocking call never renders.
- **Desktop only:** claude.ai and ChatGPT reach only remote (HTTP) servers. What a remote transport
  would take is in [`FUTURE.md`](../briefs/FUTURE.md#mcp-apps-in-claudeai-and-chatgpt-remote-transport).
- **Known gap:** if the model ends its turn without calling `ask_wait`, a card answer never
  reaches the chat. It happened once in seven spike runs, under a prompt that said "call the tool
  once". Parked in [`FUTURE.md`](../briefs/FUTURE.md#parked).
