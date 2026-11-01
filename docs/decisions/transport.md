---
description: "Unix socket with newline-delimited JSON"
covers: ["docs/architecture/hub.md"]
---
# Transport

## Choice

Unix socket with newline-delimited JSON

## Why

File permissions (0600) are the auth: no port, no token, and browsers can't reach it. Node's built-in `net` handles it. Windows would need named pipes later.
