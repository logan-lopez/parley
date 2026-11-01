---
description: "On macOS the main window is a non-activating `NSPanel` (`tauri-nspanel`)"
decided: 2026-10-10
covers: []
---
# AeroSpace workspace jump

## Choice

On macOS the main window is a non-activating `NSPanel` (`tauri-nspanel`). Brief 8's spike said go; no hooks or park mode. Window-manager commands live in Logan's dotfiles; Parley never calls `aerospace`.

## Why

AeroSpace ignores the panel completely, so it shows on the current workspace and focus never moves (brief 8, 2026-10-10). *Was:* spike first, with hooks + park mode as the fallback.
