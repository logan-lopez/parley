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

## Code in a question

A code block in a question (a command to run, a snippet for the console) has a **Copy** button at
its top right. Click it and it says "Copied" for a moment. Where the clipboard is off limits, it
selects the code instead and says "Press ⌘C". It's for the mouse; there's no key for it.

## Colors and pictures

A color the agent writes as code, like `#38bdf8` or `oklch(70% 0.15 230)`, has a small swatch in
front of it, so you see the color as well as its value. A see-through color shows a checkerboard
under it. Colors in plain text don't get one, and neither do color names like `red`. One catch: an
issue number written as code, like `#123`, is also a valid color and gets a swatch.

An agent can also show a whole palette: a row of large swatches, each with its name and value
under it. Hover a value that's cut off to see all of it. In a palette question, each option
usually shows its colors as swatches on its own line, and its full palette as the preview.

For anything bigger than a color, an agent can show a picture: a layout, a screen mockup, a card
design, an icon. It sits in a thin frame with a caption under it. **Source**, at the caption's
right, swaps the picture for the HTML or SVG it was drawn from (with its own Copy button), and
**Preview** swaps it back. It's for the mouse; there's no key for it. In a layout question, each
option's preview is usually a picture, so ↑/↓ flips between the layouts in one spot.

A picture is only a picture: nothing in it is clickable, its buttons and fields don't work, and
you can't select its text. An HTML picture is drawn on a plain white page with black text, the
way a browser shows a page the agent didn't color, even in a dark theme: agents design for that
page, and on a dark one their text disappeared. An SVG picture, an icon say, sits on the card
and takes the theme's text color, so it follows light and dark. Either is drawn again when the
theme changes. A wide one is shrunk to fit the card. If the agent's HTML or SVG can't be drawn, the caption says
"Couldn't draw this preview" in red and the source shows instead.

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
