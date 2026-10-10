# Brief 1: Hub, wire protocol, and ask lifecycle

Read `CLAUDE.md` and [`README.md`](../README.md) first. The decisions table there is settled.

## Goal

Build the pipe between the MCP server and the desktop app, and make every way an ask can end
behave correctly. The UI stays crude: the existing `JsonForms` render plus Send and Skip buttons.
Brief 2 replaces it.

Done means: an MCP client calls `ask` with a raw JSON Schema. The user gets a notification, opens
Parley, and answers. The client gets the data back. Every path where the ask doesn't end in an
answer cleans up after itself.

## Ownership

You own `packages/protocol/src/wire.ts`, `apps/server/src/app-client.ts`, a new
`apps/server/src/ask-lifecycle.ts`, everything under `src-tauri/src/`, and the webview's hub client
and ask store. `packages/protocol/src/form.ts` stays as it is; brief 2 owns it.

## 1. Wire protocol v1

Replace `packages/protocol/src/wire.ts` with this. Use these names; brief 2 codes against them.

```ts
import type { FormSpec } from './form.ts'

export const PROTOCOL_VERSION = 1
export const APP_IDENTIFIER = 'com.loganlopez.parley'
export const SOCKET_FILENAME = 'hub.sock'

export interface SessionInfo {
  id: string                                            // random per server process
  client: { name: string; version?: string } | null     // from the MCP client
  cwd: string
  pid: number
}

export type CancelReason = 'client_cancelled' | 'timed_out'

export type ServerToApp =
  | { type: 'hello'; protocol: number; session: SessionInfo }
  | { type: 'ask'; id: string; form: FormSpec; createdAt: number; expiresAt?: number }
  | { type: 'cancel'; id: string; reason: CancelReason }

export type AppToServer =
  | { type: 'welcome'; protocol: number; appVersion: string }
  | { type: 'answer'; id: string; data: unknown }
  | { type: 'dismissed'; id: string }
  | { type: 'error'; id?: string; code: 'version_mismatch' | 'invalid_message' | 'unknown_ask'; message: string }
```

Rules:

- Framing is newline-delimited JSON over the socket: one object per line, UTF-8. Either side
  closes the connection if a line goes over 1 MiB.
- One connection is one server process is one session. The first message must be `hello`. On a
  protocol mismatch, the app sends `error` with code `version_mismatch` and closes.
- An `ask` is idempotent by `id`. Re-sending the same id updates the record and doesn't duplicate
  it. Reconnect depends on this (section 4).
- The summary moves off the wire: `answer` carries only `data`. Brief 2 builds the summary on the
  server.
- `notify` is out of scope, so remove it from the union.

## 2. Rust hub (`src-tauri/src/hub.rs`)

Rust passes messages through and stays protocol-agnostic. It doesn't parse message types. It tags
each line with a connection id and forwards it.

- **Socket path:** `PARLEY_SOCKET` if set, otherwise `app.path().app_data_dir()/hub.sock`. On
  macOS that should resolve to `~/Library/Application Support/com.loganlopez.parley/hub.sock`.
  Verify this, because the server computes the same path on its own. Create the directory. Unix
  socket paths are limited to 104 bytes on macOS, so fail with a clear message if the path is longer.
- **Single instance and stale sockets:** if the socket file exists, try to connect to it. If the
  connect succeeds, another Parley is running, so exit. If it fails, the file is stale from a crash:
  unlink it and bind. After binding, `chmod 0600`.
- **Runtime:** a tokio `UnixListener` on `tauri::async_runtime`. Add `tokio` with the `net`,
  `io-util`, `sync` and `macros` features. Each connection gets a `u64` id and its own task reading
  lines.
- **Events to the webview:** `hub:message` `{ conn, message }` (the parsed JSON value) and
  `hub:disconnected` `{ conn }`.
- **Commands from the webview:**
  - `hub_ready()`. Until the webview calls it, buffer inbound messages. If it's called a second
    time (the webview reloaded), drop every open connection. Servers reconnect and re-send their
    pending asks, so the reload loses nothing and Rust never has to understand the protocol.
  - `hub_send(conn, message)` writes one line.
  - `hub_close(conn)`.
  - `set_pending_count(n)` sets the tray title: the number next to the menu bar icon, empty at 0.
    Give the tray an id in `tray.rs` so this command can find it.
- Add the commands to the capability file. Keep `hub.rs` under about 200 lines. If it grows past
  that, logic is leaking into Rust.

## 3. Window: notify-only

- Start hidden: `"visible": false` in `tauri.conf.json`. A new ask never shows or focuses the
  window on its own.
- The close button hides the window (`prevent_close` in `on_window_event`). Quitting only happens
  from the tray menu.
- `Cmd+Ctrl+P` and a tray click toggle the window, as they already do.
- In the webview, Esc hides the window. It doesn't dismiss the ask.
- Remembering the window position: use `tauri-plugin-window-state` if it's straightforward.
  Otherwise skip it and note that you did.
- Floating under AeroSpace: add an `on-window-detected` float rule for the app's bundle id in
  `~/Dev/dotfiles`, not in `~/.config`. Leave it for Logan to review; don't commit it. Check the
  real bundle id with `aerospace list-windows --all --format '%{app-bundle-id} %{app-name}'`. An
  unbundled `tauri dev` binary may not report `com.loganlopez.parley`. Write down what it does report.

## 4. Server side

### `app-client.ts`

Replace the stub with this interface:

```ts
export type AskOutcome =
  | { status: 'answered'; data: unknown }
  | { status: 'dismissed' }
  | { status: 'cancelled' }   // the MCP client cancelled the call
  | { status: 'timed_out' }

export interface AppClient {
  ask(form: FormSpec, opts: { timeoutMs: number; signal: AbortSignal }): Promise<AskOutcome>
}

export function getAppClient(): AppClient  // lazy singleton; nothing connects until the first ask
```

Behavior:

- **Lazy connect** on the first ask, so starting the MCP server never launches the app. The socket
  path is `PARLEY_SOCKET`, or the macOS default built from `APP_IDENTIFIER` and `SOCKET_FILENAME`.
  On other platforms, throw a clear "macOS only for now" error.
- **App not running** (`ENOENT` or `ECONNREFUSED`): unless `PARLEY_NO_LAUNCH=1` is set, run
  `open -b com.loganlopez.parley` and retry the connect every 250 ms for up to 10 s. If that still
  fails, reject with: "Parley isn't running. Start the app and try again." In dev the bundle usually
  isn't installed, so this path will mostly report the error. That's expected.
- **Handshake:** send `hello` with `{ id: randomUUID(), client, cwd: process.cwd(), pid }`. Get
  `client` from `server.server.getClientVersion()`. The 2026-07-28 protocol carries client info in
  the per-request `_meta` envelope instead (`ctx.mcpReq.envelope`), so fall back to that. Check
  both against the installed `@modelcontextprotocol/server` 2.3.1 types before you rely on either.
- **Timeout and cancel:** on `timeoutMs`, send `cancel` with `reason: 'timed_out'` and resolve
  `timed_out`. On `signal` abort, send `cancel` with `reason: 'client_cancelled'` and resolve
  `cancelled`.
- **Reconnect:** if the socket drops while asks are pending, reconnect with backoff for up to 30 s,
  then re-send `hello` and every pending `ask` with the same ids. If that window passes, reject the
  pending asks with "Parley closed before the user answered." This also covers the app restarting
  in the middle of an ask.
- Log to stderr only. stdout is the MCP channel.

### `ask-lifecycle.ts`

`runAsk(ctx, form, timeoutMs): Promise<AskOutcome>` is the helper tool handlers call. It wires
`ctx.mcpReq.signal` into `AppClient.ask`. When the request carries a progress token, it also sends
a progress notification every 15 s through `ctx.mcpReq.notify`:
`notifications/progress` with the token, `progress` as elapsed seconds, and the message
`Waiting for the user…`. Progress has to increase every time.

Find where the progress token lives in SDK v2. It's probably `ctx.mcpReq._meta?.progressToken`;
read the types to confirm. Whether progress actually resets a client's timeout depends on the
client. Find out what Claude Code does: whether `MCP_TOOL_TIMEOUT` applies, its default, and whether
progress resets it. Write the answer into `CLAUDE.md`.

### Temporary `ask` tool

Keep the scaffold's input schema (raw `schema` plus `timeoutSeconds`) so you can drive the pipe.
Default the timeout to 600 s, with a maximum of 3600. Return the outcome as JSON text. Brief 2
replaces the input and the result shape, but keeps `runAsk`.

## 5. Webview side

- `src/hub/client.ts`: subscribes to the `hub:*` events, calls `hub_ready` after subscribing, and
  sends replies with `hub_send`. It validates the first message (hello and version) and replies
  `welcome`. An `ask` before `hello` gets `error` with code `invalid_message`.
- `src/asks/store.ts`: a plain reactive module. Don't add Pinia.
  - Record: `{ id, conn, session, form, createdAt, expiresAt?, status, endedReason?, data? }`
  - `status` is one of `'pending' | 'answered' | 'dismissed' | 'cancelled' | 'timed_out' | 'orphaned'`.
  - `orphaned` means the connection dropped while the ask was pending. A re-sent ask with the same
    id puts it back to `pending`.
  - Ended records stay in the store; nothing gets deleted. This is the inbox seam.
  - Exports: the `queue` (pending asks, oldest first), `answer(id, data)` and `dismiss(id)`.
- When a new `pending` id arrives (not a re-send), send a system notification through
  `@tauri-apps/plugin-notification`. The title is the source label (`client.name · basename(cwd)`)
  and the body is the form title. Skip it if the window is visible and focused. Request permission
  once at startup.
- Desktop notifications in `tauri dev` may not show, or may show as coming from another app. Check
  this. If they only work from a bundled build, say so and test with `pnpm tauri build --debug`.
  Also check whether clicking a notification can open the window on macOS. If the plugin doesn't
  support that on desktop, leave it; the hotkey and tray are the way in.
- Keep `set_pending_count` in sync with `queue.length`.
- Crude UI in `App.vue`: the head of the queue, its source label, "1 of N", the `JsonForms` render,
  Send and Skip buttons, and an empty state that says nothing is waiting. Brief 2 replaces it, so
  don't polish it.

## 6. Dev harness

Add `apps/server/scripts/fake-session.ts`, run with `pnpm --filter @parley/server fake-ask <file.json>`.
It connects to the socket directly as a session: it sends `hello`, then an `ask` built from a
`FormSpec` JSON file, and prints the outcome. Add `--timeout <s>`. Put a sample form under
`apps/server/fixtures/`. Brief 2 extends this script, and you need it to test without an MCP client.

## 7. Update `CLAUDE.md`

Move the transport out of "Open / deferred". Document the socket path, `PARLEY_SOCKET`,
`PARLEY_NO_LAUNCH`, the `fake-ask` script, and what you learned about Claude Code's tool timeout.

## Acceptance

Run each of these and report the results.

1. `pnpm app` starts with no window visible and the tray icon present. `Cmd+Ctrl+P` toggles the
   window.
2. `fake-ask`: the notification appears and the tray shows 1. Open the window, Send, and the script
   prints the data while the tray clears. Skip prints `dismissed`.
3. Two `fake-ask` processes at once: both queue up, and each gets its own answer.
4. Kill a `fake-ask` mid-ask (Ctrl-C): its card disappears.
5. Quit Parley from the tray with an ask pending, then relaunch it within 30 s: the card comes
   back. If you don't relaunch, the script reports the closed-app error.
6. A second Parley instance exits. A stale socket file left by `kill -9` doesn't block startup.
7. In Claude Code (`claude mcp add parley -- node <repo>/apps/server/dist/index.mjs`, after
   `pnpm --filter @parley/server build`): `ask` round-trips. Interrupting the call removes the card.
   `timeoutSeconds: 20` removes the card and returns `timed_out`.
8. `pnpm typecheck` passes. `cargo clippy` in `src-tauri` is clean.

Then stop, and ask Logan before committing.
