---
description: "One-line text boxes (text, choice's Other, review comments) are textareas that grow from one row to four; Enter is a new line and Cmd+Enter sends"
decided: 2026-11-03
by: "Logan"
covers: ["docs/architecture/card-ui.md"]
---
# Growing text boxes

## Choice

The `text` question without `multiline`, choice's Other row and review comments are textareas
that start one row high and grow to four as lines are added, then scroll. In every text box,
Enter is a new line and Cmd+Enter sends; plain Enter no longer sends from these boxes.
`multiline: true` keeps its 4-row box, and drafts their 4–12 line sizing.

## Why

Logan found himself wanting to write more than one line, or format an answer, in boxes that
couldn't take a line break. He picked Enter-as-newline over Enter-sends with Shift+Enter for a
new line, so every text box behaves the same way as today's multi-line box. From
[brief 26](../briefs/26-panel-polish.md).
