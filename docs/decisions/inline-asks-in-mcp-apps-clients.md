---
description: "\"Show, then wait\": `ask` returns an `askId` at once, and `ask_wait` blocks in 200 s slices"
covers: []
---
# Inline asks in MCP Apps clients

## Choice

"Show, then wait": `ask` returns an `askId` at once, and `ask_wait` blocks in 200 s slices. Registered only for clients that advertise MCP Apps.

## Why

Desktop mounts a view only after its call returns, and cuts local calls at 240 s (brief 6). Claude Code's tool list stays as it is.
