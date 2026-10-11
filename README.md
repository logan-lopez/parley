# Parley

An MCP server for the other end of the conversation: the model asking **you**. When an agent needs
a decision, it calls `ask` with a few questions, and you answer in a small floating window, or in
a card inline in Claude Desktop's chat, in a few keystrokes. Your answers go back to the model as
structured data with a plain-language summary.

It's built for daily use with coding agents: Claude Code, Claude Desktop, Codex, any MCP client.
macOS only, for now.

## What it's built around

- **The model decides to ask.** Parley is a tool the model calls, not a server prompting the user.
  The server instructions tell it when asking is worth it, and a trial harness measures whether
  it does.
- **A form language models already write.** Questions are an array shaped like Claude's built-in
  `AskUserQuestion`, with more types: text, number, yes/no, file and folder paths, and a review
  that approves or rejects each item of a list. The server compiles them to JSON Schema, which is
  all the app renders.
- **An inbox, not a modal.** One app, many agents. Asks from every session queue up, labelled with
  who's asking; nothing steals your focus, and every ask is kept in history with what you sent.
- **Answers the model reads cleanly.** Structured JSON plus a summary, with your own wording marked
  as such, a note for the agent if you add one, and a sentence on what to do if you skip.
- **One card, two places.** The same card runs in the window and, in Claude Desktop, inline in the
  chat, where the first answer wins.
- **Local by design.** The server talks to the app over a unix socket only you can open. No port,
  no token, nothing on the network.

## Next to what exists

Asking the user isn't new. What's new is everything past a single blocking prompt.

- **MCP elicitation** (in the spec) lets a *server* ask the user for input mid-call. Its forms are
  flat (primitives and enums), and the client draws them, so the look and support vary; Claude
  Code draws a terminal dialog, and Claude Desktop supports only URL mode. Parley is the *model*
  choosing to ask, with richer inputs. Its choice questions use elicitation's enum shape, so a flat
  form could still be handed to native elicitation later.
- **MCP Apps** (`io.modelcontextprotocol/ui`) lets a tool render HTML inline in the host's chat.
  Parley uses it for the inline card in Claude Desktop. It doesn't exist in terminal clients, which
  is where the window comes in.
- **Pop-up ask-user servers** ([interactive-mcp](https://github.com/ttommyth/interactive-mcp),
  [mcp-interactive](https://mcpservers.org/en/servers/ivan-mezentsev/mcp-interactive), Human-in-the-Loop,
  user-feedback-mcp) show a question with options and free text in a dialog, one at a time,
  blocking. Parley adds the queue across sessions, history, review and path questions, notes, and
  answer shaping.

References: the [elicitation spec](https://modelcontextprotocol.io/specification/draft/client/elicitation),
[MCP Apps](https://github.com/modelcontextprotocol/ext-apps).

## What it does

How each part works, as you use it, is in [the guide](docs/guide/README.md).

- [A menu bar app](docs/guide/the-app.md), with no Dock icon or Cmd+Tab entry: a notification per
  ask, a count in the menu bar, and a window on Cmd+Ctrl+P that takes your typing without pulling
  you out of the app you're in.
- [Cards built for the keyboard](docs/guide/answering.md): number keys to pick, Cmd+Enter to send,
  a note for the agent, drafts that survive a restart.
- [Six question types](docs/guide/question-types.md): choice (with your own answer), text (or a
  draft to edit in place), number, yes/no, path, and review.
- [Claude Code](docs/guide/claude-code.md) asks block until you answer, for up to an hour.
- [Claude Desktop](docs/guide/claude-desktop.md) shows the card inline in the chat as well.
- [History](docs/guide/history.md) of every ask for 30 days, searchable.

## Requirements

- macOS (Apple silicon is what it's built and tested on).
- Node 24 and pnpm 10.
- Rust (stable) and Xcode's command-line tools, to build the app. The Tauri CLI comes with
  `pnpm install`.

## Installing

```sh
pnpm install
pnpm install:desktop                   # builds Parley.app into ~/Applications
pnpm --filter @parley/server build     # builds the MCP server: apps/server/dist/index.mjs
```

Then register the server in your client: it runs `node <repo>/apps/server/dist/index.mjs`.
[Installing and setting up](docs/guide/installing.md) has the config for Claude Code, Claude
Desktop and Codex. The first ask launches the app if it isn't running.

## Where the rest is

- [The guide](docs/guide/README.md): how Parley works as you use it.
- [The briefs](docs/briefs/README.md): where things stand, the open work and the decisions made.
- [The architecture pages](docs/architecture/README.md): how each part is built.
- [`AGENTS.md`](AGENTS.md): commands, the rules that aren't obvious from the code, and which page
  goes with which code.
