---
covers: ["docs/architecture/form-spec.md", "docs/architecture/card-ui.md", "docs/architecture/asks-and-history.md", "docs/architecture/ask-tool.md"]
---
# Question types

The eight kinds of question an agent can put on a card, as you see them, counting the one that
isn't a question: a show, something to look at. The agent picks the type;
each question has a short header chip (a long one is cut short with an ellipsis and shows in full
when you hover it) and the question itself, which can include formatting, links, code, colors and
pictures ([Answering a card](answering.md#colors-and-pictures)). Screenshots and other
[project images](pictures.md) can appear in the question, an option or review preview, or a show.

## Choice

Two to six options as cards, each with a label and maybe a line of detail. The agent's
recommendation usually comes first, marked "(Recommended)". Press a number to pick, or move with
↑/↓ and press Space or Enter.

- **One or several.** A single choice acts like radio buttons; a multi-select like checkboxes,
  where each number toggles.
- **Your own answer.** Unless the agent turned it off, the last row is a text box: type in it and
  that's your answer instead of an option (in a multi-select, alongside your picks). The agent is told it's your own wording.
  The box starts one line high and grows to four lines as you add them, then scrolls. Enter is a
  new line, Cmd+Enter sends, and ↑/↓ leave the box for the options only from its first or last
  line; in between they move the cursor.
- **Previews.** When options come with a preview (a code sketch, a diff, a picture of a layout),
  it shows below the list for the option you last moved to or picked, so ↑/↓ flips between them.
  Clicking elsewhere in the card leaves it showing.

## Text

A box that starts one line high and grows to four as you add lines, then scrolls, or a larger
one for longer answers, sometimes with a hint inside. In either, Enter is a new line (so you can
break a line or format a little); send with Cmd+Enter.

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
| `c` | Comment on it. The box grows to four lines and Enter is a new line. Esc leaves the comment; ↑/↓ move to the item above or below once the cursor is on the box's first or last line. |
| Shift+`a`, Shift+`r` | Approve or reject them all. |
| `p`, Shift+`p` | When the item's preview has [sounds](pictures.md#playing-from-the-keyboard): play the next one, or the last one again. Esc stops it. |

If items come with previews, the one for the item you last moved to shows below the list, and stays
when you click elsewhere. The agent gets the
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
| ↑/↓, `j`/`k`, Home, End, `c`, `p` | As above. |

`a` and `r` do nothing here, and there are no "all" links: Shift with a number does that. The
agent gets each item's decision and your comments, grouped by decision.

## Capture

A box you paste into, for something only you can get: a command's output, a console dump, a stack
trace, a screenshot. The agent usually puts what to run in the question, in a code block with a
**Copy** button ([Answering a card](answering.md#code-in-a-question)).

- **Text** stays exactly as you pasted it, in a monospace box that grows with it, up to 50,000
  characters. Typing works too. Enter is a new line; send with Cmd+Enter.
- **Screenshots.** Paste an image (⌘V) into the box and it shows below as a thumbnail with its
  size and a remove button, up to five of them, 10 MB each. To copy a screenshot instead of saving
  it to a file, press ⌘⇧4 and hold ⌃ while you drag. An image copied in another app works too. A
  paste with an image in it adds the image, even if it carries text as well.
- **Some captures take only one.** A text-only capture has no screenshots. An image-only one is a
  single "Paste a screenshot (⌘V)" box that takes no typing.

The agent gets your text as you pasted it, and each screenshot as the path of a PNG file it can
open. Nothing else on your Mac is read.

Screenshots are kept in `~/Library/Application Support/com.loganlopez.parley/captures/`, one folder
per day, and deleted when the folder is 30 days old or when you clear history. One you removed from
the box, or pasted into an ask you then skipped, stays until its folder ages out.

A capture that takes screenshots can only be answered in the Parley window, not in Claude
Desktop's inline card; a text-only one works in both. History shows the text and the screenshots'
file names, without thumbnails.

## Show

Something to look at, with nothing to answer: a plan, a file, a design. It has a header chip and a
lead line like any question, then the body in a pane of its own with a thin border. The questions
about it come after it on the same card, so you read the plan and answer "Go ahead?" in one go.

- **The pane scrolls inside.** It's at most about half the window tall (480 px in Claude Desktop's
  inline card). Tab reaches it like a question; then ↑/↓, Page Up/Down and Space scroll it.
  Number keys do nothing there.
- **Files.** The agent can name a file in its project instead of pasting it in, so you see the file
  as it is on disk. Markdown files render, HTML and SVG files are drawn as pictures, and anything
  else shows as code (plain monospace, with a Copy button). A caption under the pane names the file
  and, for part of one, the lines: `src/index.ts · lines 10–80 of 212`.
- **Nothing to answer.** A show never holds up Send, and the card's first focus skips it and lands
  on the first question. The agent's answer has no line for it.

Parley reads only files inside the project the agent runs in, and never ones that look like they
hold secrets (`.env`, keys, anything under `.git` or `.ssh`). In Claude Desktop's chat there's no
project, so a show there has the text pasted in. History keeps the file as you saw it then, and
the filter finds a show by its file's path, not its text.

### Editing a shown file

The agent can let you edit a file it shows, so you fix the thing instead of describing the fix:
a config to adjust, a plan to tighten. It's always a whole file from the project, in UTF-8: a
file in another encoding can be shown but not edited, since saving it would quietly change
characters you never touched.

- **Edit and View.** It opens on **Edit**: the file's text in a monospace box, 12 lines tall and
  growing to 30, then scrolling. **View**, beside it, shows your text the way the file would show
  (markdown rendered, HTML drawn as a picture), so you can check it before sending.
- **Keys.** Enter is a new line; Cmd+Enter sends. The card's first focus lands in the box, at the
  top of the file.
- **Reset to original** appears under the box once your text differs from the file.
- **On send, Parley saves the file** for you, and the agent gets a diff of your change rather than
  the whole file, so it doesn't redo it. If the file changed on disk while the card was open,
  Parley saves nothing, and the agent is told so, with your edit as a diff to apply by hand.
  Leaving the text as it was saves nothing and tells the agent the file is unchanged. A skip
  never writes.
- **In history** the card shows the text you sent, in View, with "edited" after the file name
  when it differs from the original.

Git is the undo: Parley keeps no copy of the file from before your edit.
