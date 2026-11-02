---
paths:
  - "apps/desktop/src/asks/**"
  - "apps/desktop/src/history/**"
  - "apps/desktop/src/main.ts"
---

Before changing these files, read [Asks and history](../../docs/architecture/asks-and-history.md).

Decisions that bind these files, newest first:

- [History when the window and the card both answer](../../docs/decisions/history-when-the-window-and-the-card-both-answer.md): The server's first-in answer wins, and `resolved` overwrites the window's answered or skipped record
- [Inline answers and the window](../../docs/decisions/inline-answers-and-the-window.md): The window races the card quietly (no notification)
- [Pasted screenshots](../../docs/decisions/pasted-screenshots.md): `capture` saves them as PNGs under `$APPDATA/captures/<day>/` and returns the paths
- [New ask arrives](../../docs/decisions/new-ask-arrives.md): Notify only: system notification, with the `sound` from `settings.json` (macOS's by default), and tray count
- [Several sessions at once](../../docs/decisions/several-sessions-at-once.md): One queue in one app, one card at a time, each labelled `client · project dir`
