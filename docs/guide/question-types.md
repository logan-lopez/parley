# Question types

The six kinds of question an agent can put on a card, as you see them. The agent picks the type;
each question has a short header chip and the question itself, which can include formatting,
links and code.

**Covers:** [The form spec](../architecture/form-spec.md), [The card](../architecture/card-ui.md)

## Choice

Two to six options as cards, each with a label and maybe a line of detail. The agent's
recommendation usually comes first, marked "(Recommended)". Press a number to pick, or move with
↑/↓ and press Space or Enter.

- **One or several.** A single choice acts like radio buttons; a multi-select like checkboxes,
  where each number toggles.
- **Your own answer.** Unless the agent turned it off, the last row is a text box: type in it and
  that's your answer instead of an option (in a multi-select, alongside your picks). The agent is told it's your own wording.
- **Previews.** When options come with a preview (a code sketch, a diff), it shows below the list
  for the focused option, or the picked one.

## Text

A one-line box, or a larger one for longer answers, sometimes with a hint inside. In the larger
box Enter is a new line; send with Cmd+Enter.

Sometimes the box starts with a draft the agent wrote, such as a commit message or a PR
description, with the cursor at the end. Edit it in place, or press Cmd+Enter to send it as it is.
Once you've changed it, "Reset to draft" under the box puts the agent's version back. The agent is
told whether you accepted the draft or edited it, and gets your final text.

## Number

A number box, with the allowed range beside it ("Whole number, 1 to 10") when there is one. Out of
range or not a whole number when it should be, it says so and Send waits.

## Yes or no

Two buttons, with nothing picked at first. `y` and `n` pick, as do `1` and `2`.

## Path

A button that opens the macOS file picker, for a file or a folder, sometimes limited to certain
file types, sometimes several at once. Picked paths are listed with a remove button each. Only the
paths go back to the agent, never the files' contents. A path question can only be answered in the
Parley window, not in Claude Desktop's inline card.

## Review

A list of items to approve or reject one by one, such as files to delete or changes to apply, up
to 30 of them. Each row has its own decision and an optional comment. Every item usually starts
approved, or rejected if the agent chose that. Some reviews start with nothing decided, so a
hurried Enter can't approve everything, and Send waits until each item has a decision.

| Key | What it does |
| --- | --- |
| ↑/↓ or `j`/`k` | Move between items (Home and End jump to the ends). |
| `a`, `r` | Approve or reject the focused item. |
| Space | Flip it. |
| `c` | Comment on it. Esc leaves the comment; ↑/↓ move to the item above or below. |
| Shift+`a`, Shift+`r` | Approve or reject them all. |

If items come with previews, the focused item's shows below the list. The agent gets the
approved items, every decision, and your comments.

### The agent's own decisions

Some reviews aren't approve or reject. The agent can name two to four decisions of its own, like
Port, TODO and Skip for configs to move, or Pass, Fail and Didn't try for a checklist. Each row
then has a button per decision instead of ✓ and ✕. The first one is the one the agent leans
toward, in the accent color; the rest are plain. With long labels the buttons drop under the
item. The line above the list counts each decision, plus any items still undecided.

| Key | What it does |
| --- | --- |
| `1`–`4` | Give the focused item that decision. The hint under the list says which is which. |
| Shift+`1`–`4` | Give every item that decision. |
| Space | Move the focused item to the next decision. |
| ↑/↓, `j`/`k`, Home, End, `c` | As above. |

`a` and `r` do nothing here, and there are no "all" links: Shift with a number does that. The
agent gets each item's decision and your comments, grouped by decision.
