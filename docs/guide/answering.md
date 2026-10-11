# Answering a card

Each ask is a card: one to four questions from an agent, answered from the keyboard in a few
keys. Waiting asks queue up, and you answer them one at a time.

**Covers:** [The card](../architecture/card-ui.md), [Asks and history](../architecture/asks-and-history.md)

## The card

The top row says who's asking (`claude-code · parley`: the client and the project folder), how long
ago, and when the ask expires; the countdown turns orange in its last minute. On the right are zoom,
**History ⌘Y**, and the card's place in the queue ("2 of 3"). Below that is the form's title, the
questions, and a button to add a note for the agent.

Questions not marked Optional have to be answered before Send works. If something's missing, the
footer says what ("Still needs an answer: Approach"), and pressing Enter nudges it.

## Keys

| Key | What it does |
| --- | --- |
| `1`–`9` | Pick that option in the current question. For a single choice or yes/no, focus moves on to the next question. |
| Tab, Shift+Tab | Next and previous question. |
| Enter | Pick the focused option if it isn't picked yet; otherwise send. In a multi-line text box it's a new line. |
| Cmd+Enter | Send, from anywhere. |
| Cmd+. | Skip the ask. |
| Cmd+N | Open the note for the agent. |
| Cmd+[, Cmd+] | Previous and next ask in the queue. |
| Esc | Hide the window. The ask stays waiting. |
| Cmd+Y | History, and back. |

Some question types add their own keys; see [Question types](question-types.md).

## Sending, skipping and the note

**Send** returns your answers to the agent and moves to the next waiting ask; after the last one,
the window hides. **Skip** tells the agent you didn't answer, and the agent is told not to ask
again and to say what it assumed instead.

The note for the agent is free text that goes with either: context for an answer, why you're
skipping, or a correction. The agent gets it quoted after your answers. It's collapsed until you
press Cmd+N or click it.

What you've typed is kept as a draft as you go. If you hide the window, switch to another ask, or
Parley restarts, the card comes back as you left it.

## When an ask ends under you

An ask can end while it's on screen: the agent cancels it (you pressed Esc in Claude Code, say), it
times out, the agent's session goes away, or you answered it in Claude Desktop's chat instead. The
card stays up, read-only, with a banner saying which ("Withdrawn: this question timed out", "The
agent disconnected. If it reconnects, this question comes back.", "Answered in the chat"), and
nothing is sent from it. Press Enter or **Continue** to move on. If the window was hidden when it
happened, Parley moves on by itself.

An agent that disconnects and comes back within about 30 seconds (Parley restarted, or its server
reconnected) puts the question back in the queue, with your draft.
