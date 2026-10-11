# History

Every ask that has ended, answered, skipped or withdrawn, kept for 30 days. Use it to check what
you told an agent, or to find something you typed into a card that never got sent.

**Covers:** [Asks and history](../architecture/asks-and-history.md)

## Opening it

Press **Cmd+Y** in the window, or click **History** on a card or on the empty window. Cmd+Y again,
or Esc, goes back to the queue. New asks keep queueing while you're here; the top row shows how many
are waiting, and clicking that goes back too.

## The list

Ended asks, newest first, grouped by day (Today, Yesterday, then dates). Each row has who asked,
the time, the title (or the first question's header), a ✎ if there's a note, and how it ended:
Answered, Skipped, Withdrawn, Timed out or Disconnected.

| Key | What it does |
| --- | --- |
| ↑/↓ or `j`/`k` | Move through the list. |
| `/` | Filter. |
| Enter | Open the selected ask. |
| Esc | Back: out of the filter box, out of an open ask, then to the queue. It never hides the window. |

**Filtering.** The box searches titles, questions, answers, notes and who asked. The chips narrow
it to Answered, Skipped or Withdrawn, or to asks with a note. The filter stays as you left it when
you go back to the queue and return.

## An ask in detail

Opening one shows the card read-only, as you answered it, or as far as you got. A line above it
says what was sent: "Sent.", "Sent with a note.", "Only the note was sent." for a skip with a note,
"Answered in the chat" for one answered in Claude Desktop, or "Nothing was sent. This is what you
had typed." for an ask that ended with a draft in it.

## Clearing it

**Clear…** deletes every ended ask, from the file too, and the screenshots pasted into captures.
It asks you to confirm first. Waiting asks are untouched, and so are the screenshots in their
drafts.

## Where it lives

`~/Library/Application Support/com.loganlopez.parley/history.jsonl`, one line per change to an ask.
Parley compacts it and drops asks older than 30 days each time it starts. If writing it fails, the
top row says "not being saved"; asks still work.

Pasted screenshots are beside it in `captures/`, one folder per day; a folder goes once it's 30
days old ([Question types](question-types.md#capture)).
