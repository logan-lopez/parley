# From Claude Code

In Claude Code, an agent that needs a decision calls Parley's `ask` and waits for your answer. You
answer in the Parley window; Claude Code shows the call as running until you do.

**Covers:** [The ask tool](../architecture/ask-tool.md), [The hub and the wire protocol](../architecture/hub.md)

## What you see

The agent calls `ask` and the session waits. You get a notification, open the window with
Cmd+Ctrl+P, and answer ([Answering a card](answering.md)). The agent sees your answers, your own
wording where you typed it, and your note, and carries on.

If Parley isn't running, the agent's server launches it. If it can't (the app isn't installed),
the call fails with "Parley isn't running. Start the app and try again."

## Long asks

An ask waits up to 30 minutes by default; the agent can ask for anything from 10 seconds to an
hour. The card's countdown shows how long is left. When it runs out the card is withdrawn, and the
agent is told to carry on with its best judgment and say what it assumed.

After two minutes, Claude Code moves a still-waiting call into the background: it shows as an "MCP
Task", the agent's turn goes on, and the answer reaches the agent when you send it. Nothing changes
on your side. In print mode (`claude -p`) the call just blocks until it ends.

## Cancelling

Pressing Esc in Claude Code while an ask is waiting cancels it: the card shows "Withdrawn by the
agent." If the session quits, the card shows that the agent disconnected.

## The built-in question tool

Claude Code has its own question tool, `AskUserQuestion`, and the model reaches for it before
Parley. Deny it in your Claude Code settings to make Parley the one:

```json
{
  "permissions": {
    "allow": ["mcp__parley__ask"],
    "deny": ["AskUserQuestion"]
  }
}
```

That's in your user settings (`~/.claude/settings.json`), so it applies everywhere.
