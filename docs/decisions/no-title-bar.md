---
description: "On macOS the panel has no title bar or traffic lights; it's dragged by its top row"
decided: 2026-11-03
by: "Logan"
covers: ["docs/architecture/desktop-shell.md"]
---
# No title bar

## Choice

The panel shows no title bar and no traffic lights, and is dragged by the card's top row. Esc,
the hotkey, the tray and `hideOnBlur` hide it; quitting stays in the tray menu.

## Why

It's a floating panel: the close button only ever hid it, and the title bar took height from the
card. Logan asked for both to go; how (Overlay with hidden buttons, or a borderless panel) is left
to the implementation, keeping native corners, shadow and edge resize. From
[brief 26](../briefs/26-panel-polish.md).
