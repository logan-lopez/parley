# Brief 8: NSPanel spike (AeroSpace workspace jump)

Read `CLAUDE.md` and [`README.md`](../README.md) first. Briefs 1–7 are merged.

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

## Report

*2026-10-10.* **Go.** AeroSpace ignores a non-activating panel completely. It shows on the
workspace you're on, focus never leaves the app you were in, and nothing the brief listed broke.
Both kill criteria are clear. Logs: [`assets/08/baseline.txt`](../assets/08/baseline.txt) (installed
build) and [`assets/08/panel.txt`](../assets/08/panel.txt) (spike).

### Built (on `spike/nspanel`, uncommitted)

- `Cargo.toml`: `tauri-nspanel` from git, branch `v2.1` (resolved to `ef6e309`), macOS target only.
- `lib.rs`: `.plugin(tauri_nspanel::init())`, and `window::init_panel` first in `setup`. The
  plugin line isn't `cfg`-gated (a builder chain can't be), so it compiles on macOS only. That's
  the MVP platform anyway.
- `window.rs`: a `ParleyPanel` class (`can_become_key_window: true`,
  `can_become_main_window: false`, `is_floating_panel: true`). `init_panel` converts `main` and
  adds the `nonactivating_panel` mask with `add_style_mask`. On macOS, `show` is
  `show_and_make_key()` with no `set_focus`, and `toggle` uses the panel's `is_visible` / `hide`.
  The old path stays under `cfg(not(target_os = "macos"))`.
- Not touched: the JS hides in `App.vue` and the close handler. They still call Tauri's `hide()`,
  and they work on the panel (check 5).

Found in the crate: `set_style_mask` also calls the private `_setPreventsActivation:`, because a
class swap skips `NSPanel`'s init and the style mask alone doesn't tell WindowServer. That private
call is probably what makes this work, and it's the part a macOS update could break.
`show_and_make_key` is `makeKeyWindow` + `orderFrontRegardless`.

### Deviations

- **Baseline on the installed build, not a `main` checkout.** The installed `Parley.app` was a
  2026-10-10 main build, and `window.rs` / `tauri.conf.json` haven't changed since brief 2, so it
  had the same show path without a rebuild.
- **`pnpm app` ran with its own Vite on port 1430**
  (`pnpm tauri dev --config '{"build":{"devUrl":"http://localhost:1430","beforeDevCommand":"pnpm dev --port 1430"}}'`).
  Another session's Vite held 1420.
- **Check 1 has no marker in `panel.txt`.** `aerospace subscribe` was writing with `>`, so my
  marker line was overwritten. The logger was restarted in append mode from check 2 on. The check 1
  section is everything above the first `---` line.

### Defaults taken

- The open question (should the panel stay key while Logan types elsewhere?) went to its default:
  the panel takes keys when shown, as the window did.

### Acceptance

Automatic:

- `cargo check`: passes, no warnings.
- `pnpm typecheck`: passes.
- `pnpm --filter @parley/desktop test`: 31/31 pass.

Baseline (installed build): reproduced. Hidden on 1, Cmd+Ctrl+P from 2:

```
{"_event":"focus-changed","windowId":75399,"workspace":"1"}
{"_event":"focused-workspace-changed","prevWorkspace":"2","workspace":"1"}
```

Logan's hands-on checks (spike build, another session running alongside):

1. **The jump: pass.** Shown and hidden on 1, then Cmd+Ctrl+P from 2: the panel showed on 2 and
   Logan stayed there. The log has no event for Parley's window at all. The only workspace switches
   are the ones Logan made himself (2 → 1 → 2).
2. **AeroSpace's view: pass.** `aerospace list-windows --monitor all` doesn't list the panel, visible
   or hidden. `list-apps` shows `parley` (`NULL-APP-BUNDLE-ID`, dev build). With the panel up and
   holding keys, AeroSpace's focused window is still kitty (67469). So the `layout floating` rule
   never applies, and AeroSpace can't put the panel off-screen, because it doesn't manage it. While
   visible, the panel stays on top as you switch workspaces (1 ↔ 2).
3. **Keyboard: pass.** Typing, Cmd+A/C/V/Z, Tab, Cmd+N note, Cmd+Y history, and Cmd+= / Cmd+- zoom
   all work. Number-key picks and the submit key worked on a choice ask (answered:
   `Layout: Single package`, `Node: 26 current`), and Cmd+. skipped the text ask (`dismissed`).
4. **Focus return: pass.** After Esc, typing lands in kitty with no Cmd+Tab. Same after clicking
   inside the panel first. The log was empty for the whole check: AeroSpace never saw focus leave
   kitty.
5. **The other hides: pass.** Answering the last ask hid the panel (the JS hide), and so did the
   close button. Neither needs routing through Rust.
6. **Window state: pass.** A move and resize survived a hide/show, and a quit from the tray plus a
   relaunch (saved as 1085×921 at 1593,243).
7. **The `path` question: pass.** The native picker opened in front, on the current workspace, and
   returned `/Users/logan/Downloads/tokyokeyboard_tokyo60_layout_60_hhkb_2026-10-02.json`. No
   `window-detected` and no Parley event in the log.
8. **Links: pass.** The runbook link opened in Chrome. AeroSpace followed Chrome to its workspace S
   (`focus-changed 40776 S`): that's the browser activating, as a link from any app does, not a
   Parley jump.
9. **The tray: pass.** A left click toggles the panel, and the menu's Show Parley shows it, in both
   cases at the remembered position.

Not checked: more than one monitor, whether Parley still shows in Cmd+Tab, and Esc from the history
view.

### Follow-up: what the real-build brief needs

- **Pin the dependency.** `tauri-nspanel` has no crates.io release for v2.1, so use
  `rev = "ef6e309"`, not `branch`. The lockfile pins it today, but `cargo update` would move it.
- **Hides.** All four already work on the panel. Only the Rust hides (`toggle`) go through the
  panel API; `App.vue` and the close handler can stay on Tauri's `hide()`. The real build should
  pick one path on purpose, not by accident.
- **Remove the window-focus TODO** in `window.rs` (the nspanel half is done). Decide whether the
  `cfg(not(target_os = "macos"))` branch stays, and gate the plugin registration, since the builder
  chain doesn't compile anywhere else.
- **Dotfiles (Logan's call, not changed here):** `parley-follow.sh` and its call in
  `exec-on-workspace-change` do nothing now. AeroSpace can't see the panel, so the script finds no
  window to move, and the panel floats over every workspace on its own. The Parley
  `on-window-detected` float rule in `.aerospace.toml` is dead for the same reason. Both can go once
  the real build is installed. Keep them until then: the installed build still needs them.
- **`CLAUDE.md`:** in Open / deferred, the `tauri-nspanel` line becomes done, and the AeroSpace
  float-rule line goes. Add a line under Conventions: on macOS the main window is a non-activating
  panel, so it never activates the app, and AeroSpace doesn't manage it.
- **README:** take `tauri-nspanel` out of Not built.
- **Behaviour to decide:** the panel now floats over every workspace while visible. Logan saw this
  and didn't object, and it's what `parley-follow.sh` was approximating, but it's new.
- **Risk to note:** the private `_setPreventsActivation:` inside the crate. If a macOS release drops
  it, the symptom is the jump coming back. Re-run check 1 after major macOS updates.
