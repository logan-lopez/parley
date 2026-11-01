---
description: "`ask` sets `_meta[\"anthropic/alwaysLoad\"]: true`"
covers: []
---
# Tool loading in Claude Code

## Choice

`ask` sets `_meta["anthropic/alwaysLoad"]: true`

## Why

Claude Code defers MCP tools behind ToolSearch, and the model skipped `ask`. In trials it went from asking on 1 of 3 prompts to 2 of 3 (brief 3).
