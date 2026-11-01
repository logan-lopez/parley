---
description: "`capture` saves them as PNGs under `$APPDATA/captures/<day>/` and returns the paths"
decided: 2026-10-10
covers: []
---
# Pasted screenshots

## Choice

`capture` saves them as PNGs under `$APPDATA/captures/<day>/` and returns the paths. Window-only, like `path`; text-only captures work inline. Day folders go after 30 days; Clear deletes them all except those still in a waiting ask's draft.

## Why

Claude Code shows only `structuredContent` for tools with an `outputSchema`, so image content would likely be dropped, and a path is something the model can read (2026-10-10, brief 12).
