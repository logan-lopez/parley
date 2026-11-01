---
description: "The server reads `path`, inside its cwd only (after `realpath`), refusing secret-looking names"
decided: 2026-10-14
by: "Logan"
covers: []
---
# Files in shows

## Choice

The server reads `path`, inside its cwd only (after `realpath`), refusing secret-looking names; no path when the cwd is `/` or home. The read text goes into the form, so history keeps a snapshot. The inline card gets it in the `ask` result's `_meta['parley/files']`.

## Why

Relative paths resolve the way the agent means them, the app's fs scope stays its own data dir, and the card compiles from tool input, so the server has to send it (Logan, 2026-10-14, brief 16).
