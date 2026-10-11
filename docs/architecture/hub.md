# The hub and the wire protocol

How a server process reaches the app: a unix socket the app owns, newline-delimited JSON on it, and
the `AppClient` that hides both from tool code. Every ask goes through here.

**Sources:** `packages/protocol/src/wire.ts`, `apps/desktop/src-tauri/src/hub.rs`, `apps/desktop/src/hub/`, `apps/server/src/app-client.ts`

**History:** [brief 1](../briefs/archive/01-hub-and-lifecycle.md), [brief 7](../briefs/archive/07-inline-cards.md) (`resolved`, `inline`)

`wire.ts` holds the message types and constants. `hub.rs` is the Rust listener, which forwards
lines without reading them. `src/hub/client.ts` is the webview end, which owns the protocol.
`app-client.ts` is the server end.

## How it works

- **The socket** is `~/Library/Application Support/com.loganlopez.parley/hub.sock`, Tauri's
  `app_data_dir` joined with `hub.sock`. The server computes the same path on its own
  (`socketPath()`). `PARLEY_SOCKET` overrides it on both sides. The app creates the directory 0700
  and the socket 0600: file permissions are the auth.
- **Framing:** one JSON object per line, UTF-8, protocol v1. Either side closes the connection on
  a line over 1 MiB. One connection is one server process is one session.
- **Messages** (`wire.ts`). Server to app: `hello` (first, with the protocol version and a
  `SessionInfo`: a random id, the MCP client's name and version, `cwd`, `pid`), `ask`, `cancel`
  (`client_cancelled` or `timed_out`), `resolved` (the user answered in the chat's card). App to
  server: `welcome`, `answer`, `dismissed`, `error` (`version_mismatch`, `invalid_message`,
  `unknown_ask`). `answer` and `dismissed` carry an optional `note`, and `ask` an optional
  `inline` flag; both were added without a version bump.
- **The Rust hub** (`hub.rs`) binds the socket at startup. If the socket exists and something
  answers on it, another Parley owns it, and this one exits: that's how the app stays single
  instance. A socket nobody answers on is left over from a crash, and is removed. Each connection
  gets an id. Every line is parsed as JSON (invalid JSON closes the connection) and emitted to the
  webview as `hub:message` with the id; a closed connection emits `hub:disconnected`. The webview
  writes back with the `hub_send` and `hub_close` commands. Rust never looks at a message's
  `type`.
- **`hub_ready`.** Rust buffers events until the webview calls `hub_ready`, so nothing arrives
  before the store has loaded history. A second `hub_ready` means the webview reloaded and lost its
  state: Rust closes every connection, and the servers reconnect and re-send.
- **The webview end** (`client.ts`) checks `hello` (a version mismatch gets an error and a close),
  keeps the session per connection, validates `ask`, `cancel` and `resolved`, and hands them to
  the store's handlers ([asks and history](asks-and-history.md)). An unknown id gets
  `unknown_ask`.
- **The server end** (`app-client.ts`). `getAppClient()` is a lazy singleton: nothing connects
  until the first ask. `ask(form, opts)` sends an `ask` with a fresh id and `expiresAt`, and
  resolves with an `AskOutcome` (`answered`, `dismissed`, `cancelled`, `timed_out`). Its own timer
  sends `cancel` with `timed_out`. Aborting the signal sends `cancel` with `client_cancelled`,
  unless the abort reason is an `InlineOutcome`: then it sends `resolved` instead and resolves with
  that outcome.
- **Launch.** If the socket is missing or refuses (`ENOENT`, `ECONNREFUSED`), the server runs
  `open -b com.loganlopez.parley` and polls for 10 s; if `open` itself fails (no bundle installed), it fails at once. `PARLEY_NO_LAUNCH=1` skips that and fails at
  once with "Parley isn't running".
- **Reconnect.** A connection lost with asks pending retries for 30 s with backoff, then sends
  `hello` and re-sends every pending ask. `ask` is idempotent by id, so the app updates the record
  rather than adding one. If the window's answer or skip went into a connection that had just died,
  the app sends it again when the ask is re-sent. A `version_mismatch` fails every pending ask
  with no reconnect.
- **Idle connections** are `unref`'d, so a server with nothing pending doesn't stay alive for the
  socket.

## Rules worth keeping

- **Keep Rust protocol-agnostic.** A new message type is a change to `wire.ts`, `client.ts` and
  `app-client.ts`, never to `hub.rs`.
- **Tool code sees only `AppClient`.** A second transport (remote, HTTP) is a second
  implementation of that interface, and shouldn't touch the tools.
- **Additive changes stay v1.** A new optional field or a new message an old peer can reject
  cleanly is fine. When the server sends `resolved` to an app too old to know it, the app answers
  `invalid_message`, and the server falls back to `cancel` (it listens for that for 30 s).
- **macOS caps socket paths at 104 bytes** including the NUL. The app refuses a longer path. Put
  test sockets under `$TMPDIR`, not a deep scratch directory.
- **The server is macOS only.** `socketPath()` throws on any other platform, so it fails clearly
  instead of half-working.
- **The app's `fs` capability is scoped to the history files**, which live in the same directory as
  `hub.sock`. Don't widen it to the directory.

## Decisions

- **Why a unix socket, not a localhost WebSocket:** the socket's 0600 permissions are the auth, so
  there's no port and no token, and a browser page can't reach it. Node's built-in `net` handles
  it. The cost: Windows would need named pipes, and a remote channel needs its own listener.
- **Known gap:** `resolved` and `cancel` sent while the app is restarting go into a dead socket and
  aren't queued. The agent still gets its answer, but the app's record is orphaned. The fix is in
  [`FUTURE.md`](../briefs/FUTURE.md#queue-resolved-and-cancel-across-a-reconnect).
