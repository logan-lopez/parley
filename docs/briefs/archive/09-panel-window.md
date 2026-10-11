# Brief 9: The panel window, for real

Read `CLAUDE.md`, [`README.md`](../README.md) and
[`08-nspanel-spike.md`](08-nspanel-spike.md) first, especially its `## Report`. Brief 8 is merged
to main (`9b8eb93`): its spike code is the starting point, not something to redo.

## Goal

Make the non-activating panel from brief 8 the way Parley's window works on macOS, and finish the
job the spike left half-done. Under AeroSpace, Cmd+Ctrl+P used to pull Logan to the workspace the
window last lived on. The spike showed that AeroSpace ignores a non-activating `NSPanel` completely,
so it shows where he is and focus never leaves the app he's in. This brief tidies the spike into
code that's meant to stay, takes Parley out of the Dock and Cmd+Tab, and re-runs the important
checks on the **installed** release build, which the spike never tested.

## Decisions already made

- **Non-activating `NSPanel` via `tauri-nspanel`** (spike go, brief 8, 2026-10-10). No hooks, no
  park mode. Parley never calls `aerospace`. Window-manager config lives in Logan's dotfiles.
- **Menu-bar only** (Logan, 2026-10-10). `ActivationPolicy::Accessory`: no Dock icon, no Cmd+Tab
  entry. The hotkey and the tray are already the only ways in, and the Dock and Cmd+Tab both
  *activate* the app, which is what the panel avoids.
- **The panel shows at its remembered position** (Logan, 2026-10-10). No following the cursor or
  the focused screen. Check it on two monitors; moving it is a follow-up if it bothers him.
- **Visible, the panel floats over every workspace** (seen in brief 8's check 2b, 2026-10-10).
  Keep it. It's what `parley-follow.sh` was approximating.
- Don't revisit these silently.

## Already checked (2026-10-10)

- **The spike's code** (on main): `apps/desktop/src-tauri/src/window.rs` defines `ParleyPanel`
  (`can_become_key_window: true`, `can_become_main_window: false`, `is_floating_panel: true`),
  `init_panel` (convert `main`, `add_style_mask(nonactivating_panel)`), and macOS `show` / `toggle`
  through the panel. Non-macOS `show` / `toggle` are kept under `cfg(not(target_os = "macos"))`.
  `lib.rs` registers `.plugin(tauri_nspanel::init())` without a `cfg` (macOS-only as written) and
  calls `window::init_panel` first in `setup`.
- **Every hide works on the panel** (brief 8, check 5): Esc and empty-queue in `App.vue`
  (`getCurrentWindow().hide()`), the close handler in `lib.rs` (`window.hide()`), and `toggle`
  (`panel.hide()`). Tauri's `hide()` and the panel's `hide()` both end in `orderOut:`.
- **`tauri-nspanel`** resolves to `ef6e3090a6083c653955ca0b6e7f6c6ae1453d40` on branch `v2.1`
  (`Cargo.lock`, version 2.1.1). There's no crates.io release of v2.1. Its `set_style_mask` calls
  the private `_setPreventsActivation:`, which is what stops the app activating.
- **Activation policy** (Tauri 2.12.2 source, `src/app.rs`): `App::set_activation_policy(&mut self,
  ActivationPolicy)` and `AppHandle::set_activation_policy(&self, …) -> Result`, both macOS-only.
  The default is Regular. Today `lsappinfo` reports Parley as `Foreground`.
- **`Info.plist`** (Tauri docs via Context7, `distribute/macos-application-bundle`): an
  `Info.plist` in `src-tauri/` is merged into the bundle's. `LSUIElement = true` there makes the
  bundled app an agent from launch, before any Rust runs. The unbundled `tauri dev` binary doesn't
  get it.
- **AeroSpace config** (`~/.aerospace.toml`, tracked in `~/Dev/dotfiles`): an `on-window-detected`
  rule floats `com.loganlopez.parley` / app name `parley`. `exec-on-workspace-change` runs
  `~/.config/aerospace/parley-follow.sh` after the SketchyBar trigger. AeroSpace never lists the
  panel, so the script finds nothing to move and the rule never fires.

## Open questions

- **Dock flash at launch.** Setting the policy in `setup` may show a Dock icon for a moment when the
  app starts. Default: set it in `setup` (needed for `pnpm app`) and also add `LSUIElement` to
  `src-tauri/Info.plist` for the bundle. Drop the plist if it causes trouble, and say so.

## Shape

All app changes are in `apps/desktop/src-tauri/`.

- **`Cargo.toml`:** pin `tauri-nspanel` to `rev = "ef6e3090a6083c653955ca0b6e7f6c6ae1453d40"`
  instead of `branch = "v2.1"`. Keep it under the macOS target.
- **`lib.rs`:**
  - Register `tauri_nspanel::init()` only on macOS. A builder chain can't take a `cfg`, so split
    it: `let builder = …;` then `#[cfg(target_os = "macos")] let builder =
    builder.plugin(tauri_nspanel::init());`.
  - In `setup`, on macOS: `app.set_activation_policy(tauri::ActivationPolicy::Accessory)` before
    `init_panel`.
  - The close handler calls `window::hide(window.app_handle())` instead of `window.hide()`, so the
    Rust side has one hide.
- **`window.rs`:**
  - Add `pub fn hide(app: &AppHandle)`, through the panel on macOS and through the window
    elsewhere. `toggle` uses it.
  - Replace the "Spike (brief 8)" comment with what the code is: the main window is a
    non-activating panel, so showing it never activates Parley, and AeroSpace doesn't manage it.
  - Keep the non-macOS branches. They cost nothing, and `lib.rs` already has `cfg(desktop)`
    seams.
- **`Info.plist`** (new, `src-tauri/`): `LSUIElement` `true` (see the open question).
- **`App.vue`:** leave the two `getCurrentWindow().hide()` calls alone. They work on the panel
  (brief 8, check 5), and routing them through a Rust command buys nothing.
- **Docs, same change:**
  - [`docs/architecture/desktop-shell.md`](../../architecture/desktop-shell.md): say that the
    `tauri-nspanel` crate is pinned to a rev, that Parley is menu-bar only (Accessory), and
    whatever else this brief changes about the panel. The page already describes the panel and
    AeroSpace.
  - [`FUTURE.md`](../FUTURE.md): remove the `tauri-nspanel` bullet under Parked, which also carries
    the AeroSpace float-rule note, and record the dotfiles note below wherever it still applies.
  - `docs/briefs/README.md`: take `tauri-nspanel` out of Not built.
  - The decisions table in `docs/briefs/README.md` already records the go and menu-bar only
    (2026-10-10). Touch it only if something here changes a decision.
- **Dotfiles, drafted for Logan:** after the installed build passes acceptance, edit
  `~/Dev/dotfiles` (not `~/.config`; see `~/CLAUDE.md`) and leave it uncommitted for him to
  review. Don't touch the other uncommitted changes in that repo.
  - Remove `parley-follow.sh` and its call in `.aerospace.toml`'s `exec-on-workspace-change`,
    keeping the SketchyBar trigger.
  - Keep the Parley float rule as cheap insurance, with its comment updated to say the panel isn't
    managed today.

## Out of scope

- Moving the panel to the active screen (decided against for now). Note it in the report if the
  two-monitor check says otherwise.
- Hooks, park mode, notification click-to-open, a new hotkey, the hub or the ask lifecycle.
- The MCP Apps card (`src/mcp-app/`): it isn't a window.

## Build order

1. Code changes, `cargo check`, `pnpm typecheck`, desktop tests.
2. `pnpm app` checks (dev build, Accessory set at runtime).
3. `pnpm install:desktop`, then the installed-build checks.
4. Docs, then the dotfiles draft.
5. Report and stop.

## Acceptance

Automatic:

- `cargo check` in `apps/desktop/src-tauri`: passes, no warnings.
- `pnpm typecheck` and `pnpm --filter @parley/desktop test`: pass, unchanged.
- `grep -n tauri-nspanel apps/desktop/src-tauri/Cargo.toml` shows `rev =`, not `branch =`.

**Before the first run:** these checks launch and quit Parley, switch workspaces and take focus.
Ask Logan once, and say it's about 20 minutes. The installed Parley has to be quit before
`pnpm app` (one socket, one hotkey). If another session's Vite holds port 1420, run
`pnpm tauri dev --config '{"build":{"devUrl":"http://localhost:1430","beforeDevCommand":"pnpm dev --port 1430"}}'`
from `apps/desktop`. Queue asks with `pnpm --filter @parley/server fake-ask <fixture>`, never the
Parley `ask` tool. Log AeroSpace with `aerospace subscribe window-detected focus-changed
focused-workspace-changed >> <file>`, which **must be `>>`**: with `>`, marker lines get
overwritten (brief 8). Keep the logs in `docs/briefs/assets/09/` as `.txt` (`*.log` is
gitignored). Another session may be running and send asks; quit and reopen Parley quickly, because
a waiting server only retries the connection for 30 s, and a new ask in that gap runs `open -b` and
starts the installed app.

Logan checks by hand on the **installed** build, unless marked dev:

1. **The jump** (dev and installed). Hidden after being shown on workspace 1, then Cmd+Ctrl+P from
   workspace 2: it shows on 2, with no Parley `focus-changed` or `focused-workspace-changed` in the
   log.
2. **Menu-bar only** (dev and installed). No Dock icon, and Parley isn't in Cmd+Tab.
   `lsappinfo info -only ApplicationType -app com.loganlopez.parley` no longer reports
   `Foreground` (`UIElement` is the expected value, unverified). The tray
   icon and its menu still work.
3. **No Dock flash** (installed). Quit, then relaunch with `open -b com.loganlopez.parley`: no Dock
   icon appears, even briefly.
4. **Keyboard.** Typing, Cmd+A/C/V/Z, number picks, submit, Cmd+. skip, Cmd+N, Cmd+Y, zoom, Esc
   hide. Also Esc in the history view goes back and doesn't hide (not checked in brief 8).
5. **Focus return.** After Esc, typing lands in the app Logan was in, including after clicking
   inside the panel.
6. **Hides.** The last answer, the close button, the hotkey and a tray click each hide it.
7. **Notifications** (installed). A new ask from `fake-ask` still posts a system notification and
   bumps the tray count. Agent apps can lose notification permission. If it's gone, say so and
   stop.
8. **Auto-launch.** With Parley quit, `fake-ask choice` from workspace 2 launches it through
   `open -b`. Logan stays on 2, and the ask is queued.
9. **Two monitors.** Show the panel on the laptop screen, hide it, focus the ultrawide, then
   Cmd+Ctrl+P. Record where it shows. Under the decision, that's the remembered spot; note
   whether it's a problem.
10. **Window state, picker, links.** A move or resize survives a restart. The `path` picker opens
    in front and returns a path. A link opens in the browser.

The stop line: append `## Report`, retag the brief `(done, awaiting review)`, and ask Logan whether
to commit. Don't push. Leave the dotfiles draft uncommitted in `~/Dev/dotfiles` for him.

## Report

*2026-10-10.* The code, the docs and the dotfiles draft are done, on branch `panel-window`
(uncommitted). **The hands-on checks haven't been run.** Logan chose "Not now" when asked before
the desktop run, so build-order steps 2 and 3 (`pnpm app`, then `pnpm install:desktop` and the
installed-build checks) are still to do. The installed `Parley.app` is still the brief 8–era build.

### Built

- **`Cargo.toml`:** `tauri-nspanel` pinned to `rev = "ef6e3090a6083c653955ca0b6e7f6c6ae1453d40"`,
  still under the macOS target, with a comment saying why. `Cargo.lock` changes only the source
  string (`?branch=v2.1` → `?rev=…`); the commit is the same.
- **`lib.rs`:** the builder is split so `tauri_nspanel::init()` is registered only under
  `cfg(target_os = "macos")`, in the same place in the plugin order. In `setup`, on macOS:
  `app.set_activation_policy(ActivationPolicy::Accessory)`, then `init_panel`. The close handler
  calls `window::hide(window.app_handle())` (`Manager` imported for `app_handle`).
- **`window.rs`:** a new `pub fn hide(app)`, through the panel on macOS (`panel.hide()`) and the
  window elsewhere. Both `toggle`s use `hide` and `show`. The "Spike (brief 8)" comment now says
  what the code is. The non-macOS branches stay.
- **`Info.plist`** (new, `src-tauri/`): `LSUIElement` `true`.
- **`App.vue`:** untouched, as the brief says.

### Deviations

- **The hands-on checks weren't run** (Logan's call, above). The dotfiles draft was gated on them
  passing. It's drafted anyway, because Logan picked an option that said I'd draft it, and it sits
  uncommitted in `~/Dev/dotfiles`, a review copy that changes nothing live. **Don't apply it until
  the installed build passes checks 1 and 2.** The current installed build is a plain window and
  still needs `parley-follow.sh`.
- **A debug bundle build, not in the brief.** I ran `pnpm tauri build --debug --bundles app` to
  confirm the plist merges, then deleted the bundle. It was never registered with LaunchServices
  (`lsregister -u` returned `-10814`, not found), so `open -b` couldn't pick it up.

### Defaults taken

- **Dock flash at launch:** the default, both. `setup` sets Accessory (for `pnpm app`), and
  `src-tauri/Info.plist` sets `LSUIElement` for the bundle. Tauri merges it: the debug bundle's
  `Contents/Info.plist` has `LSUIElement = true` beside `CFBundleIdentifier =
  com.loganlopez.parley`. Whether it really stops the flash is check 3, which hasn't been run.

### Acceptance

Automatic:

- `cargo check` in `apps/desktop/src-tauri`: passes, no warnings.
- `pnpm typecheck`: passes. `pnpm --filter @parley/desktop test`: 31/31 pass, unchanged.
- `grep -n tauri-nspanel apps/desktop/src-tauri/Cargo.toml`: line 45, `rev = "ef6e309…"`, no
  `branch =`.
- Extra: the bundled `Info.plist` has `LSUIElement = true` (above).

Hands-on, checks 1–10: **not run.** Logan deferred the desktop run. Before it starts: the
installed Parley is running and has to be quit first, and another session's Vite holds port 1420,
so the dev run needs the port-1430 command from the brief. Both monitors (Built-in Retina,
45WQHD240) were connected on 2026-10-10.

### Spot checks for Logan

All ten hands-on checks, as the brief lists them: 1 and 2 on dev and installed, the rest on the
installed build. The ones this change could break, most likely first:

- **2, menu-bar only:** no Dock icon, not in Cmd+Tab, and
  `lsappinfo info -only ApplicationType -app com.loganlopez.parley` no longer says `Foreground`.
  The tray icon and its menu still work.
- **3, no Dock flash:** quit, `open -b com.loganlopez.parley`, and watch the Dock.
- **7, notifications:** agent apps can lose notification permission. If notifications stop, say
  so; the brief stops there.
- **6, hides:** the close button now goes through the panel's `hide()`. It should behave exactly
  as before.
- **1 and 5:** the jump and focus return. Accessory shouldn't change either, but they're the point
  of the panel.
- **10:** the `path` picker opening in front matters more now. An Accessory app's dialogs
  are the classic place for a sheet to open behind something.

Then review the dotfiles draft (`cd ~/Dev/dotfiles && git diff`) and apply it.

### Docs updated

- [`desktop-shell.md`](../../architecture/desktop-shell.md): `Info.plist` in Sources and the file
  map, brief 9 in History, `hide` in `window.rs`, the plugin registered on macOS only (the
  "only builds on macOS" clause is gone), Accessory in startup, a **Menu-bar only** bullet (plist
  plus runtime policy, and why both), **Hiding** (Rust hides go through `window::hide`; the
  webview's stay on Tauri's `hide()`), the panel's risk (pinned `rev`, rerun check 1 after macOS
  updates), and the dotfiles float rule kept as insurance.
- `AGENTS.md` Areas row and `.claude/rules/desktop-shell.md`: `apps/desktop/src-tauri/Info.plist`
  added.
- [`FUTURE.md`](../FUTURE.md): the `tauri-nspanel` bullet under Parked removed. The dotfiles note now
  lives on the desktop-shell page (Window managers).
- `docs/briefs/README.md`: `tauri-nspanel` out of Not built. The decisions table is unchanged.
- Guide, [`the-app.md`](../../guide/the-app.md): "Parley also has a Dock icon and a Cmd+Tab entry for
  now" is replaced with no Dock icon, not in Cmd+Tab, and the hotkey and the tray as the ways in.
  The root README's feature line says the same.

### Dotfiles draft (`~/Dev/dotfiles`, uncommitted)

- `.config/aerospace/parley-follow.sh`: deleted.
- `.aerospace.toml`: `exec-on-workspace-change` is back to the SketchyBar trigger alone, exactly
  as it was before `bd7a092` added the script. The Parley float rule stays, with its comment
  saying the panel isn't managed today and the rule is insurance.
- The repo had no other uncommitted changes.

### Follow-ups

- **Run the hands-on checks** (steps 2–3), then apply the dotfiles draft. The brief can't be
  archived until then.
- If check 9 shows the panel somewhere awkward on the ultrawide, moving it to the active screen is
  the follow-up the brief already names.
