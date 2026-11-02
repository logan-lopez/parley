---
paths:
  - "apps/server/src/tools/inline.ts"
  - "apps/server/src/ask-lifecycle.ts"
  - "apps/server/src/card.ts"
  - "apps/server/tsdown.config.ts"
  - "apps/desktop/src/mcp-app/**"
  - "apps/desktop/mcp-app.html"
  - "apps/desktop/vite.mcp-app.config.ts"
---

Before changing these files, read [Inline cards (show, then wait)](../../docs/architecture/inline-cards.md).

Decisions that bind these files, newest first:

- [Media in the inline card](../../docs/decisions/media-in-the-inline-card.md): Claude Desktop's inline card shows images as `data:` URLs from the result's `_meta` up to a cap; sounds play in the window only
- [Files in shows](../../docs/decisions/files-in-shows.md): The server reads `path`, inside its cwd only (after `realpath`), refusing secret-looking names
- [Themes and the inline card](../../docs/decisions/themes-and-the-inline-card.md): The card keeps following Claude's surfaces and text over Parley Light or Dark
- [History when the window and the card both answer](../../docs/decisions/history-when-the-window-and-the-card-both-answer.md): The server's first-in answer wins, and `resolved` overwrites the window's answered or skipped record
- [Inline answers and the window](../../docs/decisions/inline-answers-and-the-window.md): The window races the card quietly (no notification)
- [MCP Apps hosts](../../docs/decisions/mcp-apps-hosts.md): Claude Desktop only
- [Inline asks in MCP Apps clients](../../docs/decisions/inline-asks-in-mcp-apps-clients.md): "Show, then wait": `ask` returns an `askId` at once, and `ask_wait` blocks in 200 s slices
