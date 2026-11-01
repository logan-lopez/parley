---
description: "Default 1800 s, at most 3600, with a progress notification every 15 s"
covers: []
---
# Timeouts

## Choice

Default 1800 s, at most 3600, with a progress notification every 15 s

## Why

600 s kept timing out during real work. The keep-alives reset Claude Code's 30 min idle timeout ([the ask tool](../architecture/ask-tool.md#claude-code-and-long-asks)).
