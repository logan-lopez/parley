---
description: "`hideOnBlur` in settings.json, on by default, hides the window when it loses focus; the file picker doesn't count"
decided: 2026-11-03
by: "Logan"
covers: ["docs/architecture/desktop-shell.md", "docs/architecture/themes.md"]
---
# Hide on blur

## Choice

A boolean `hideOnBlur` in `~/.config/parley/settings.json`, default `true`: the window hides when
you click outside it (another app's window, the desktop). `false` keeps it up until Esc, the
hotkey or the tray hides it. Parley's own native dialogs (the file picker) don't count as leaving.

## Why

A floating panel that stays up after you've clicked away wasn't the behavior Logan wanted, but he
wanted it configurable. Drafts survive a hide, so a hide costs one hotkey press. The name
`hideOnBlur` was picked over `hideOnFocusLoss` and `hideOnLossOfFocus`. From
[brief 26](../briefs/26-panel-polish.md).
