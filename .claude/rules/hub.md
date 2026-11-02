---
paths:
  - "packages/protocol/src/wire.ts"
  - "apps/desktop/src-tauri/src/hub.rs"
  - "apps/desktop/src/hub/**"
  - "apps/server/src/app-client.ts"
---

Before changing these files, read [The hub and the wire protocol](../../docs/architecture/hub.md).

Decisions that bind these files, newest first:

- [Transport](../../docs/decisions/transport.md): Unix socket with newline-delimited JSON
