---
description: "`structuredContent` (with an `outputSchema`) plus a text block, and `message` in the structured result repeats the text"
decided: 2026-10-09
covers: ["docs/architecture/ask-tool.md", "docs/architecture/form-spec.md"]
---
# Result shape

## Choice

`structuredContent` (with an `outputSchema`) plus a text block, and `message` in the structured result repeats the text

## Why

Claude Code shows the model only `structuredContent` when there's an `outputSchema`; Claude Desktop shows only the text (2026-10-09, [the ask tool](../architecture/ask-tool.md)).
