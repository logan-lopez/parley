# Brief 8: NSPanel spike (AeroSpace workspace jump)

Read `CLAUDE.md` and [`README.md`](README.md) first. Briefs 1–7 are merged.

This is a spike. It ends in go or no-go, not a merge. Work on a `spike/nspanel` branch. The code
is there to get the answers and may be thrown away. Budget half a day, and stop early if a kill
criterion trips.

## Goal

Under AeroSpace, showing Parley yanks Logan off his workspace. He's on workspace 2, Parley's
hidden window last lived on workspace 1, and Cmd+Ctrl+P switches him to 1 to show it there. He
wants it to appear where he is, with no flash of another workspace.

Find out whether turning the main window into a non-activating `NSPanel` (`tauri-nspanel`) fixes
this, and what it breaks. End with go (a follow-up brief makes it real) or no-go (the fallback
below gets briefed instead).

The bet: a non-activating panel becomes key without activating Parley, so AeroSpace sees no app
activation and doesn't follow focus anywhere. If AeroSpace ignores the panel completely, as
launcher-style apps seem to get ignored, it shows on whatever workspace is on screen. That's
unverified. Nothing found online says how AeroSpace treats panels (searched 2026-10-10).

## Decisions already made

- **Spike the panel before building anything** (Logan, 2026-10-10). He picked this over the two
  options below, which stay as the fallback.
- **Window-manager-specific commands live in Logan's dotfiles, not in Parley** (2026-10-10).
  Parley may expose a generic seam, like hooks, but never shells out to `aerospace` itself.
- **Fallback if no-go: hooks + park mode** (recommended 2026-10-10, not yet chosen by Logan).
  Opt-in `on_show` / `on_hide` commands. In hook mode Parley never orders the window out. Logan's
  `on_hide` parks it on a keyless workspace and his `on_show` moves it to the focused one. That's
  the pattern `~/.config/aerospace/obsidian-daily.sh` already uses for the Obsidian daily-note
  popup (parked on workspace D). The other option was "show unfocused, run a hook, then focus". It
  keeps real hiding, but it bets on how fast AeroSpace picks up a reappearing window, and nobody
  has measured that.

## Already checked (2026-10-10)

- **How the jump happens** (recorded with `aerospace subscribe window-detected focus-changed
  focused-workspace-changed`, AeroSpace 0.21.3-Beta): Parley's window comes back with the **same
  window id** (75399) on its **old workspace**. AeroSpace fires `focus-changed` (75399, ws 1),
  then `focused-workspace-changed` (prev 2 → 1). There's **no `window-detected` event**, so an
  `on-window-detected` rule never sees the re-show.
- **While the window is hidden, AeroSpace can't reach it.** `aerospace list-windows --monitor all`
  lists the Parley app but no window, and `aerospace move-node-to-workspace --window-id 75399 2`
  fails with `Invalid <window-id> 75399 passed to --window-id`. Moving the window ahead of time
  from the dotfiles side is out.
- **Visible windows can be moved.** Logan's dotfiles have
  `~/.config/aerospace/parley-follow.sh`, run from `exec-on-workspace-change`. It moves a
  *visible* Parley window along to each workspace (Logan confirmed this). It does nothing for the
  hidden case.
- **Hiding the app (Cmd+H) won't work:** Logan's AeroSpace config sets
  `automatically-unhide-macos-hidden-apps = true`.
- **Every way Parley shows or hides its window:**
  - Shows only from the hotkey and the tray: `window::show` / `window::toggle` in
    `apps/desktop/src-tauri/src/window.rs`, called from `shortcut.rs` and `tray.rs`. Asks never
    open the window (notify-only, see the README decisions).
  - `window::show` is `unminimize` + `show` + `set_focus`.
  - Hides happen in four places: the toggle in `window.rs`, the close button (`lib.rs`,
    `on_window_event`), and `getCurrentWindow().hide()` in `apps/desktop/src/App.vue` (Esc on the
    queue, and when the queue empties).
- **The window** (`tauri.conf.json`): label `main`, 440×600, `alwaysOnTop`, starts hidden.
  `tauri-plugin-window-state` remembers its position and size. Tauri is 2.12.2 (Cargo.lock).
- **tauri-nspanel** (Context7, `/ahkohd/tauri-nspanel`, v2.1 docs):
  - Install from git, branch `v2.1`:
    `tauri-nspanel = { git = "https://github.com/ahkohd/tauri-nspanel", branch = "v2.1" }`.
    Register it with `.plugin(tauri_nspanel::init())`.
  - Define a panel class with `tauri_panel! { panel!(Name { config: { can_become_key_window:
    true, can_become_main_window: false, is_floating_panel: true } }) }`.
  - Convert the existing window with `WebviewWindowExt::to_panel::<Name>()`, then add the style
    with `panel.add_style_mask(StyleMask::empty().nonactivating_panel().into())`. Use `add_`, not
    `set_`, so Tauri's own styles stay.
  - Show with `panel.show_and_make_key()`; `hide()` and `is_visible()` also exist. Look a panel
    up with `ManagerExt::get_webview_panel(label)`.
  - The docs list Tauri's `macos-private-api` feature only for transparency, which Parley doesn't
    use. Don't add it unless the build needs it.

## Open questions

- **Does Logan want the window to stay key-focused while he types elsewhere?** That's out of
  scope here. Default: the panel takes keys when shown, exactly as the window does now.

## Shape

The smallest change that answers the questions. All of it is in `apps/desktop/src-tauri/`.

- `Cargo.toml`: add `tauri-nspanel` under the macOS target only
  (`[target.'cfg(target_os = "macos")'.dependencies]`).
- `lib.rs`: register the plugin. In `setup`, convert `main` to a panel class (`ParleyPanel`) and
  add the non-activating style mask.
- `window.rs`: `show` becomes `show_and_make_key()` on the panel, and it doesn't call
  `set_focus`, which activates the app. `toggle` uses the panel's `is_visible` / `hide`. Keep the
  old path behind `cfg(not(target_os = "macos"))` or just leave it; it's a spike.
- Leave the JS hides in `App.vue` and the close handler as they are, and record whether they
  still work on a panel. If they don't, route them through one Rust command and note it.

## Out of scope

- Hooks / park mode (the fallback). Don't build it here.
- Notification click-to-open, a new hotkey, any change to the ask lifecycle or the hub.
- Logan's dotfiles. Don't edit `~/.config` or `~/.aerospace.toml` (see `~/CLAUDE.md`). If a
  dotfiles change would help, write it up in the report.

## Build order

1. Baseline: on `main`, reproduce the jump with the `aerospace subscribe` command above writing
   to a file, so there's a before log.
2. Make the panel change, run `pnpm app`, and run the checks below with the subscribe log on.
3. Write the report and stop.

## Acceptance

Automatic:

- `pnpm typecheck` and `cargo check` (in `apps/desktop/src-tauri`) pass.
- `pnpm --filter @parley/desktop test` passes. Nothing should change there.

**Before the first run:** `pnpm app` launches a GUI app, and the checks switch workspaces and take
focus. The installed Parley has to be quit first (single instance, one socket). Ask Logan once
before starting, and tell him it takes about 15 minutes of him pressing keys. Use
`pnpm --filter @parley/server fake-ask <fixture>` to put asks in the queue. Don't use the Parley
`ask` tool, because opening a form would disturb the test.

Logan checks these by hand. Log the AeroSpace events for each, and record pass/fail with the log
lines:

1. **The jump.** Parley hidden, last shown on workspace 1, Logan on workspace 2: Cmd+Ctrl+P.
   Pass means the panel shows on 2, with no `focused-workspace-changed` in the log.
2. **AeroSpace's view.** With the panel visible and with it hidden, does `aerospace list-windows
   --monitor all` list it? On which workspace? Does the `layout floating` rule still apply? Is it
   ever placed off-screen, the way AeroSpace hides windows on inactive workspaces?
3. **Keyboard.** In a text question, typing works, and so do Cmd+C / Cmd+V / Cmd+A / Cmd+Z.
   These are the likeliest to break: menu key equivalents may not fire when the app isn't
   active. Also check 1–9 picks, Tab, Cmd+Enter or Enter submit, Cmd+. skip, Cmd+N note, Cmd+Y
   history, Cmd+= / Cmd+- zoom, and Esc hide.
4. **Focus return.** After Esc, focus is back in the app Logan was in (kitty), without a
   Cmd+Tab.
5. **The other hides.** Answering the last ask hides the panel, and so does the close button.
6. **Window state.** Moving and resizing the panel survives a hide/show and an app restart.
7. **The `path` question.** The native file picker opens from the panel and returns a path.
   Dialogs from a non-active app can misbehave.
8. **Links.** A link in a question opens in the browser.
9. **The tray.** Show from the tray menu and by clicking the tray icon behaves like the hotkey.

**Kill criteria (no-go):**

- AeroSpace still switches workspaces on show, or adopts the panel into a workspace where it can
  sit off-screen while holding the keyboard.
- Typing or clipboard keys don't work in the panel and can't be fixed without activating the app,
  which brings the jump back.

**Report:** append `## Report` with go or no-go, the result of each check with its log lines,
what broke and how hard it would be to fix, and the follow-up:

- **Go:** what the real-build brief needs. That covers routing all hides through the panel,
  whether `parley-follow.sh` is still needed, and updates to `CLAUDE.md`'s Open / deferred
  section.
- **No-go:** a note that the hooks + park mode fallback is next, plus anything the spike learned
  that changes its design.

Then stop. Don't merge the branch. Ask Logan before deleting it.
