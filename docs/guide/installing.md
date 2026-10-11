# Installing and setting up

Parley is two pieces: the app, installed once, and the MCP server, which each client starts for
itself. Both build from the repo.

**Covers:** [The desktop shell](../architecture/desktop-shell.md), [The ask tool](../architecture/ask-tool.md), [The hub and the wire protocol](../architecture/hub.md)

## The app

From the repo root, with Node 24, pnpm 10, Rust and Xcode's command-line tools installed:

```sh
pnpm install
pnpm install:desktop
```

That builds `Parley.app` and installs it in `~/Applications` (set `PARLEY_APP_DIR` to put it
elsewhere), registered so agents can launch it. It never quits or opens Parley: if an older copy is
running, it keeps running the old build until you quit it from the tray and reopen it. To start it
at login, add it under System Settings → General → Login Items.

## The server

```sh
pnpm --filter @parley/server build
```

That writes `apps/server/dist/index.mjs`, with the inline card beside it. Rebuild it after pulling
server or card changes; clients pick up the new server the next time they start it (Claude
Desktop needs a full quit and reopen).

## Registering it in a client

Every client runs the same command: Node on `apps/server/dist/index.mjs`. Use absolute paths. GUI
apps like Claude Desktop don't see your shell's PATH, so point at a Node 24 binary directly rather
than `node`.

**Claude Code**, for every project:

```sh
claude mcp add --scope user parley -- /path/to/node ~/Code/personal/parley/apps/server/dist/index.mjs
```

Then deny the built-in question tool so the model uses Parley ([From Claude Code](claude-code.md)).

**Claude Desktop**, in `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "parley": {
      "type": "stdio",
      "command": "/path/to/node",
      "args": ["/Users/logan/Code/personal/parley/apps/server/dist/index.mjs"]
    }
  }
}
```

Restart Desktop afterwards. It runs one Parley server for chats and another for agent mode, and
both get inline cards, though they've only been tried in chats ([From Claude Desktop](claude-desktop.md)).

**Codex**, in `~/.codex/config.toml`:

```toml
[mcp_servers.parley]
command = "/path/to/node"
args = ["/Users/logan/Code/personal/parley/apps/server/dist/index.mjs"]
```

Any other MCP client works the same way. Clients without MCP Apps get the plain `ask`, answered in
the window.

## Settings you might change

| Variable | What it does |
| --- | --- |
| `PARLEY_SOCKET` | A different socket path, set on both the app and the server. For tests; normally unset. |
| `PARLEY_NO_LAUNCH=1` | The server won't launch the app; an ask fails at once if it isn't running (in Claude Desktop, the chat's card still works). |
| `PARLEY_APP_DIR` | Where `pnpm install:desktop` puts `Parley.app`. |

The hotkey (Cmd+Ctrl+P), the notification behavior and the timeouts aren't configurable.

## Working on Parley itself

`pnpm app` runs the app in dev mode, and `pnpm server` the server from source. The dev app and the
installed one can't run at the same time: quit one first. The rest of the commands are in the
repo's `AGENTS.md`.
