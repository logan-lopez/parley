# The desktop shell

The Rust side of the app: the tray, the global hotkey, the window (a non-activating panel on
macOS), the plugins, the permissions and the CSP, and the installer. It stays small on purpose:
the socket hub is the only other thing in Rust ([the hub](hub.md)), and everything else is in the
webview.

**Sources:** `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src-tauri/src/window.rs`, `apps/desktop/src-tauri/src/tray.rs`, `apps/desktop/src-tauri/src/shortcut.rs`, `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/capabilities/`, `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/Info.plist`, `apps/desktop/src-tauri/build.rs`, `apps/desktop/vite.config.ts`, `apps/desktop/scripts/install.sh`

**History:** [brief 1](../briefs/archive/01-hub-and-lifecycle.md), [brief 8](../briefs/archive/08-nspanel-spike.md) (the panel), [brief 9](../briefs/archive/09-panel-window.md) (menu-bar only)

`lib.rs` builds the app: plugins, setup, the close handler and the commands. `window.rs` is the
panel and `show`/`hide`/`toggle`. `tray.rs` is the tray icon, its menu and the pending count.
`shortcut.rs` is the global hotkey. `tauri.conf.json` has the window and the CSP;
`capabilities/default.json` has the permissions. `Info.plist` is merged into the bundle's and sets
`LSUIElement`.

## How it works

- **Plugins:** dialog (the file picker), fs (history and pasted screenshots), notification, opener (links),
  `tauri-nspanel` (registered on macOS only), global shortcut and window state. Window state remembers position and size but
  never visibility (`StateFlags::all() - VISIBLE`).
- **Startup** (`setup`): on macOS, set the activation policy to `Accessory` and turn the main
  window into a panel; bind the socket hub; build the tray; register the hotkey. The window is declared hidden, 440×600, always on top, so the app
  starts with nothing on screen.
- **The panel** (`window.rs`, macOS). `init_panel` converts the `main` window to a `ParleyPanel`
  (can become key, can't become main, floating) and adds the non-activating style mask with
  `add_style_mask`, keeping Tauri's title bar, resize and close styles. `show` is
  `show_and_make_key()`: the panel takes keys without activating Parley, so the app you were in
  stays active. `hide` is the panel's `hide()` (`orderOut:`), and `toggle` picks between them on
  the panel's own visibility. Other platforms keep a plain window path (show, unminimize, focus,
  hide) under `cfg(not(target_os = "macos"))`.
- **Menu-bar only** (macOS). No Dock icon and no Cmd+Tab entry: both activate the app, which the
  panel exists to avoid, and the hotkey and the tray are the ways in. Two places set it. The
  bundle's `Info.plist` has `LSUIElement`, so the installed app is an agent from launch, before any
  Rust runs. `setup` also calls `set_activation_policy(Accessory)`, because the unbundled `tauri
  dev` binary doesn't get the plist.
- **Hiding.** Every Rust hide goes through `window::hide`: the close button (quitting is only from
  the tray), the hotkey and a tray click. The webview's own hides (Esc in the queue, the last ask
  answered) call Tauri's `hide()`. Both end in `orderOut:`, so they work on the panel, and routing
  the webview's through a command would buy nothing.
- **The tray.** A left click toggles the window; the menu has Show Parley and Quit.
  `set_pending_count` sets the number beside the icon (empty at zero); the store calls it whenever
  the queue changes.
- **The hotkey** is `Cmd+Ctrl+P`, registered globally, and toggles the window. A failure to
  register is logged, not fatal.
- **Notifications** are sent from the webview ([asks and history](asks-and-history.md)).
  `tauri-plugin-notification` on desktop shows only a title, body, icon and sound; `onAction` is
  mobile-only, so a click can't open the window.
- **Permissions** (`capabilities/default.json`, the `main` window only): core defaults, window
  hide, dialog, notification, opening URLs in the opener's default scope (http(s), mailto, tel),
  the four app commands (`hub_ready`, `hub_send`, `hub_close`, `set_pending_count`), and fs:
  read-text-file, write-text-file and rename for history, and write-file, mkdir, read-dir and
  remove for screenshots. One `fs:scope` covers them all: `$APPDATA/history.jsonl`, its `.tmp`,
  `$APPDATA/captures` and `$APPDATA/captures/**`, with no read of a screenshot's contents. Themes
  add read-only grants scoped to their own commands, so the global scope stays the data dir and
  `~/.config` is never writable: `read-text-file` on `$HOME/.config/parley/settings.json`,
  `$HOME/.config/parley/themes/*` and `$HOME/.config/inn/themes/*`, `read-dir` on those two
  folders, and `exists` on the folders and `settings.json` ([themes](themes.md)). Following the
  system appearance needs nothing beyond `core:default`.
- **CSP.** `tauri.conf.json` sets it for bundled assets. `tauri dev` on macOS loads the Vite server
  directly, where that CSP doesn't apply, so `vite.config.ts` serves the same policy as a header,
  plus inline styles and the HMR socket for Vite.
- **Installing** (`pnpm install:desktop`, `scripts/install.sh`): a release build of `Parley.app`,
  moved into `~/Applications` (`PARLEY_APP_DIR` overrides) beside the old one and swapped in, then
  registered with LaunchServices so the server's `open -b com.loganlopez.parley` finds it. The
  built copy is removed from `target/` and unregistered, so `open -b` can't launch the wrong
  bundle. It never quits or opens Parley: a running copy keeps the old build until it's quit from
  the tray.

## Rules worth keeping

- **Keep Rust small:** tray, hotkey, window management, the hub. Anything else belongs in the
  webview.
- **Tauri 2 capabilities, not the Tauri 1 allowlist.** A new command needs listing in `build.rs`'s
  app manifest and its permission in `capabilities/default.json` (the autogenerated ones are in
  `permissions/autogenerated/`). Use the project's CLI, `pnpm tauri ...`.
- **Keep the two CSPs in sync** (`tauri.conf.json` and `vite.config.ts`). `script-src` needs
  `'unsafe-eval'` because AJV compiles validators with `new Function`; without it no card renders.
  To test the real CSP, build with `pnpm tauri build --debug --no-bundle` and run
  `src-tauri/target/debug/parley` directly (there's no `.app`, so `open -b` won't find it).
- **Check `~/.config/keymap/keymap.md` before changing the hotkey.** It's global, taken from every
  app while Parley runs.
- **Single instance comes from the socket.** The dev app and the installed one can't run at once:
  the second exits when it finds the first answering on `hub.sock`.
- **The panel's risk:** `tauri-nspanel`'s style-mask call also sends the private
  `_setPreventsActivation:`. That's probably what makes the panel non-activating, and it's the part
  a macOS update could break, and the symptom would be the workspace jump coming back: rerun brief
  8's check 1 after a major macOS update. There's no crates.io release of v2.1, so `Cargo.toml`
  pins the git `rev` (`ef6e309`), not the branch. Moving it is a deliberate edit.
- **Window managers.** AeroSpace doesn't manage the panel: it doesn't list it, can't move it, and
  sees no focus change when it shows. While visible, the panel floats over every workspace. An
  unbundled `tauri dev` binary reports `NULL-APP-BUNDLE-ID` with app name `parley`, so a rule that
  must match both builds matches on both. Window-manager config lives in Logan's dotfiles; Parley
  never calls `aerospace`. Those dotfiles keep an AeroSpace float rule for Parley as insurance. It
  never fires today, but it would if AeroSpace started managing the panel.

## Decisions

- **Notify, don't grab focus.** A new ask sends a notification and bumps the tray count; the window
  never opens on its own. The hotkey and the tray are the way in.
- **The panel:** under AeroSpace, showing the plain window pulled you to the workspace it last
  lived on, because AeroSpace restores a hidden window to its old workspace. The brief 8 spike
  showed AeroSpace ignores a non-activating panel completely; all nine of its checks passed
  (typing, clipboard keys, the file picker, links, the tray, window state). The evidence is in
  [brief 8's report](../briefs/archive/08-nspanel-spike.md#report).
