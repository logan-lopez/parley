---
description: "`editable` on a whole-file `path` show"
decided: 2026-10-14
by: "Logan"
covers: ["docs/architecture/form-spec.md", "docs/architecture/ask-tool.md"]
---
# Editing a shown file

## Choice

`editable` on a whole-file `path` show; a plain monospace textarea. The server writes the file when the disk still hashes to the version the edit started from (`base`) and returns a diff; otherwise it writes nothing and returns the diff as a conflict.

## Why

Echoing a long file back wastes context, and an answer after Claude Code backgrounds the call arrives HTML-escaped, so the agent shouldn't have to re-apply it (Logan, 2026-10-14, brief 17). `draft` keeps its full-text answer.
