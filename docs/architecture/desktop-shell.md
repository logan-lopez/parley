---
sources: ["apps/desktop/src/blur.ts", "apps/desktop/src-tauri/src/lib.rs", "apps/desktop/src-tauri/src/media.rs", "apps/desktop/src-tauri/src/window.rs", "apps/desktop/src-tauri/src/tray.rs", "apps/desktop/src-tauri/src/shortcut.rs", "apps/desktop/src-tauri/tauri.conf.json", "apps/desktop/src-tauri/capabilities/", "apps/desktop/src-tauri/Cargo.toml", "apps/desktop/src-tauri/Info.plist", "apps/desktop/src-tauri/build.rs", "apps/desktop/vite.config.ts", "apps/desktop/scripts/install.sh", "apps/desktop/icons/", "apps/desktop/scripts/icons.ts"]
---
# The desktop shell

The Rust side of the app: the tray, the global hotkey, the window (a non-activating panel on
macOS), the plugins, the permissions and the CSP, and the installer. It stays small on purpose:
the socket hub is the only other thing in Rust ([the hub](hub.md)), and everything else is in the
webview.

**History:** [brief 1](../briefs/archive/01-hub-and-lifecycle.md), [brief 8](../briefs/archive/08-nspanel-spike.md) (the panel), [brief 9](../briefs/archive/09-panel-window.md) (menu-bar only), [brief 26](../briefs/26-panel-polish.md) (no title bar, `hideOnBlur`)

`lib.rs` builds the app: plugins, setup, the close handler and the commands. `window.rs` is the
panel and `show`/`hide`/`toggle`. `tray.rs` is the tray icon, its menu and the pending count.
`shortcut.rs` is the global hotkey. `apps/desktop/src/blur.ts` is the one piece of the shell that
lives in the webview: hide on losing focus. `tauri.conf.json` has the window and the CSP;
`capabilities/default.json` has the permissions. `Info.plist` is merged into the bundle's and sets
`LSUIElement`.

## How it works

- **Plugins:** dialog (the file picker), fs (history and pasted screenshots), notification, opener (links),
  `tauri-nspanel` (registered on macOS only), global shortcut and window state. Window state remembers position and size but
  never visibility (`StateFlags::all() - VISIBLE`).
- **Startup** (`setup`): on macOS, set the activation policy to `Accessory` and turn the main
  window into a panel; bind the socket hub; build the tray; register the hotkey. The window is declared hidden, 440×600, always on top, so the app
  starts with nothing on screen. It has no title bar (below).
- **The panel** (`window.rs`, macOS). `init_panel` converts the `main` window to a `ParleyPanel`
  (can become key, can't become main, floating) and adds the non-activating style mask with
  `add_style_mask`, keeping Tauri's resize and rounded-corner styles, then hides the three standard
  buttons (`hide_window_buttons`). `show` is
  `show_and_make_key()`: the panel takes keys without activating Parley, so the app you were in
  stays active. `hide` is the panel's `hide()` (`orderOut:`), and `toggle` picks between them on
  the panel's own visibility. Other platforms keep a plain window path (show, unminimize, focus,
  hide) under `cfg(not(target_os = "macos"))`.
- **No title bar** (macOS). `tauri.conf.json` sets `titleBarStyle: "Overlay"` and `hiddenTitle`:
  the content runs under the title strip, which draws nothing, and the title is dropped. Tauri has
  no key for the traffic lights, so `init_panel` hides the close, miniaturize and zoom buttons
  on the `NSWindow` (`standardWindowButton:` then `setHidden:`, through the `objc2_app_kit`
  that `tauri-nspanel` re-exports). It keeps the native rounded corners, shadow and edge resize.
  A `decorations: false` or a borderless style mask would lose those, and wasn't needed. The window
  drags by `data-tauri-drag-region="deep"` on the card's meta row, the history list's header, the
  history detail's strip and the empty state: `deep` makes text in the row drag, and Tauri's drag
  script skips buttons, so the zoom control, History and "n waiting" still click. `App.vue` passes a
  `dragRegion` prop down, so `AskCard` emits the attribute only in the window, never in the
  inline card. The drag needs `core:window:allow-start-dragging`. Not on other platforms: the
  attribute does no harm, and the buttons are macOS-only code. No title bar also means no close
  button: Esc, the hotkey, the tray and `hideOnBlur` hide the window.
- **Hide on blur** (`apps/desktop/src/blur.ts`, started from `main.ts`, the window only). The
  webview listens with `getCurrentWindow().onFocusChanged` and calls `hide()` when focus is lost,
  `settings.json`'s `hideOnBlur` is on (the default; `refreshTheme` pushes it with `setHideOnBlur`
  on every focus, [themes](themes.md)), and no native dialog is open. The brief 26 probe on the
  panel showed `onFocusChanged`, the DOM `blur` and Rust's `WindowEvent::Focused(false)` all fire
  on a click on another app's window, on the desktop, on Mission Control and on a workspace switch,
  with the window still visible. So the webview event is enough and Rust stays out of it.
  `tauri-nspanel`'s `set_event_handler` would replace Tauri's window delegate, so nothing uses it.
  **The picker guard:** `pickPaths` in `platform.ts` runs the dialog inside `duringDialog`, a
  counter that `shouldHideOnBlur` checks, because the native picker takes focus from the panel (the
  probe saw a blur with the window visible, and focus coming back when it closed). Opening a link
  or a media file moves focus to another app, so the window hides then too. Clicking the tray icon
  while the window is up hid it with no blur first, and showing it from the tray didn't blur it, so
  the tray needs no guard.
- **Menu-bar only** (macOS). No Dock icon and no Cmd+Tab entry: both activate the app, which the
  panel exists to avoid, and the hotkey and the tray are the ways in. Two places set it. The
  bundle's `Info.plist` has `LSUIElement`, so the installed app is an agent from launch, before any
  Rust runs. `setup` also calls `set_activation_policy(Accessory)`, because the unbundled `tauri
  dev` binary doesn't get the plist.
- **Hiding.** Every Rust hide goes through `window::hide`: the hotkey and a tray click (there's no
  close button, and quitting is only from the tray). The webview's own hides (Esc in the queue, the
  last ask answered, and a blur under `hideOnBlur`) call Tauri's `hide()`. Both end in `orderOut:`,
  so they work on the panel, and routing the webview's through a command would buy nothing. The
  close handler in `lib.rs` still turns any close request into a hide, as a backstop.
- **The tray.** A left click toggles the window; the menu has Show Parley and Quit.
  `set_pending_count` sets the number beside the icon (empty at zero); the store calls it whenever
  the queue changes. The icon is `src-tauri/icons/tray.png`, embedded with `include_image!` and
  marked a template image, so macOS tints it for a light or dark menu bar.
- **The icons.** The sources are SVGs in `apps/desktop/icons/`: `parley.svg` (the app icon, on
  macOS's 824-on-1024 grid) and `tray.svg` (the same flag in black). `pnpm --filter
  @parley/desktop icons` renders them in headless WebKit and runs `tauri icon` over the app icon,
  which rewrites `src-tauri/icons/`; it deletes the iOS and Android sets that also come out. Edit
  the SVGs, never the PNGs.
- **The hotkey** is `Cmd+Ctrl+P`, registered globally, and toggles the window. A failure to
  register is logged, not fatal.
- **Notifications** are sent from the webview ([asks and history](asks-and-history.md)).
  `tauri-plugin-notification` on desktop shows only a title, body, icon and sound; `onAction` is
  mobile-only, so a click can't open the window.
- **Permissions** (`capabilities/default.json`, the `main` window only): core defaults, window
  hide and start-dragging (the title-bar-less drag), dialog, notification, opening URLs in the opener's default scope (http(s), mailto, tel),
  the hub/tray commands (`hub_ready`, `hub_send`, `hub_close`, `set_pending_count`), the media
  commands (`allow_media`, `open_media`), and fs:
  read-text-file, write-text-file and rename for history, and write-file, mkdir, read-dir and
  remove for screenshots. One `fs:scope` covers them all: `$APPDATA/history.jsonl`, its `.tmp`,
  `$APPDATA/captures` and `$APPDATA/captures/**`, with no read of a screenshot's contents. Themes
  add read-only grants scoped to their own commands, so the global scope stays the data dir and
  `~/.config` is never writable: `read-text-file` on `$HOME/.config/parley/settings.json`,
  `$HOME/.config/parley/themes/*` and `$HOME/.config/inn/themes/*`, `read-dir` on those two
  folders, and `exists` on the folders and `settings.json` ([themes](themes.md)), and `read-dir`
  and `exists` on `~/Library/Sounds`, `/Library/Sounds` and `/System/Library/Sounds` to check the
  notification sound's name. Following the
  system appearance needs nothing beyond `core:default`.
- **CSP.** `tauri.conf.json` sets it for bundled assets. `tauri dev` on macOS loads the Vite server
  directly, where that CSP doesn't apply, so `vite.config.ts` serves the same policy as a header,
  plus inline styles and the HMR socket for Vite.
- **Project media** (`media.rs`). Tauri's `protocol-asset` feature is enabled with an empty
  static `assetProtocol.scope`. `allow_media([{ abs, sha256 }])` checks absolute real paths to
  regular files, hashes them off the UI thread and returns `ok`, `changed`, `missing` or
  `refused` in input order; only `ok` files get an exact runtime `allow_file` grant. The
  grants last until exit and are checked again when a card is reopened. The dev-app spike
  loaded a PNG under a dot directory without `requireLiteralLeadingDot: false`; Ogg Vorbis
  also played and sought in WKWebView (brief 22). Both CSPs allow `asset:` in `img-src` and
  `media-src` (`'self'` too for media). `open_media({ abs, sha256 })` rechecks the hash and
  existing asset grant before calling the opener's Rust API. There is no general open-path
  permission: the brief's `$HOME/**` default excludes dot directories and valid projects
  elsewhere, so its granted-path command fallback is used.
- **Installing** (`pnpm install:desktop`, `scripts/install.sh`): a release build of `Parley.app`,
  moved into `~/Applications` (`PARLEY_APP_DIR` overrides) beside the old one and swapped in, then
  registered with LaunchServices so the server's `open -b com.loganlopez.parley` finds it. The
  built copy is removed from `target/` and unregistered, so `open -b` can't launch the wrong
  bundle. It never quits or opens Parley: a running copy keeps the old build until it's quit from
  the tray.

## Rules worth keeping

- **Keep Rust small:** tray, hotkey, window management, the hub, and hash-checked media
  grants/opening. Anything else belongs in the webview.
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
