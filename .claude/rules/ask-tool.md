---
paths:
  - "apps/server/src/index.ts"
  - "apps/server/src/client-capabilities.ts"
  - "apps/server/src/tools/ask.ts"
  - "apps/server/src/ask-lifecycle.ts"
  - "apps/server/src/show-files.ts"
  - "apps/server/src/show-edits.ts"
  - "apps/server/src/show-media.ts"
---

Before changing these files, read [The ask tool](../../docs/architecture/ask-tool.md).

Decisions that bind these files, newest first:

- [Media by reference](../../docs/decisions/media-by-reference.md): Images and sounds in a form are references (path, sha256, size) the window reads from disk, never copies or base64
- [Don't ask again](../../docs/decisions/dont-ask-again.md): A per-question "Don't ask again here" toggle; the agent drafts a standing line for AGENTS.md and saves it only after Logan accepts the draft; Parley never answers on his behalf
- [Editing a shown file](../../docs/decisions/editing-a-shown-file.md): `editable` on a whole-file `path` show
- [Files in shows](../../docs/decisions/files-in-shows.md): The server reads `path`, inside its cwd only (after `realpath`), refusing secret-looking names
- [`ask_async` / `collect`](../../docs/decisions/ask-async-collect.md): Not built
- [Result shape](../../docs/decisions/result-shape.md): `structuredContent` (with an `outputSchema`) plus a text block, and `message` in the structured result repeats the text
- [Timeouts](../../docs/decisions/timeouts.md): Default 1800 s, at most 3600, with a progress notification every 15 s
- [Tool loading in Claude Code](../../docs/decisions/tool-loading-in-claude-code.md): `ask` sets `_meta["anthropic/alwaysLoad"]: true`
