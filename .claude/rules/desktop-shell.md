---
paths:
  - "apps/desktop/src-tauri/src/lib.rs"
  - "apps/desktop/src-tauri/src/media.rs"
  - "apps/desktop/src-tauri/src/window.rs"
  - "apps/desktop/src-tauri/src/tray.rs"
  - "apps/desktop/src-tauri/src/shortcut.rs"
  - "apps/desktop/src-tauri/tauri.conf.json"
  - "apps/desktop/src-tauri/capabilities/**"
  - "apps/desktop/src-tauri/Cargo.toml"
  - "apps/desktop/src-tauri/Info.plist"
  - "apps/desktop/src-tauri/build.rs"
  - "apps/desktop/vite.config.ts"
  - "apps/desktop/scripts/install.sh"
  - "apps/desktop/icons/**"
  - "apps/desktop/scripts/icons.ts"
---

Before changing these files, read [The desktop shell](../../docs/architecture/desktop-shell.md).

Decisions that bind these files, newest first:

- [Media by reference](../../docs/decisions/media-by-reference.md): Images and sounds in a form are references (path, sha256, size) the window reads from disk, never copies or base64
- [AeroSpace workspace jump](../../docs/decisions/aerospace-workspace-jump.md): On macOS the main window is a non-activating `NSPanel` (`tauri-nspanel`)
- [Dock and Cmd+Tab](../../docs/decisions/dock-and-cmd-tab.md): Menu-bar only (`ActivationPolicy::Accessory`)
- [Panel on more than one monitor](../../docs/decisions/panel-on-more-than-one-monitor.md): Shows at its remembered position
- [New ask arrives](../../docs/decisions/new-ask-arrives.md): Notify only: system notification, with the `sound` from `settings.json` (macOS's by default), and tray count
- [Shell](../../docs/decisions/shell.md): Tauri 2, with capabilities-based permissions (not the Tauri 1 allowlist)
- [`'unsafe-eval'` in the CSP](../../docs/decisions/unsafe-eval-in-the-csp.md): Allowed
