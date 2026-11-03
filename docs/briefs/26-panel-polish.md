---
size: M
size-note: "three small changes, but the panel's title bar and focus events are a live run against tauri-nspanel nobody has pinned"
status: awaiting-review
---
# Brief 26: Panel polish

Read `AGENTS.md`, [`README.md`](README.md), [the card](../architecture/card-ui.md),
[the desktop shell](../architecture/desktop-shell.md) and [themes](../architecture/themes.md) (for
`settings.json`) first, and the guide pages [answering](../guide/answering.md),
[question types](../guide/question-types.md), [the app](../guide/the-app.md) and
[themes](../guide/themes.md). No prerequisites: everything it builds on is on `main`.

## Goal

Three changes from Logan's daily use of the window, one brief because each is S:

1. **One-line boxes grow.** Every one-line free-text box in the card becomes a textarea that
   starts one row high and grows to four rows as lines are added, then scrolls. Logan found himself
   wanting to write more than a line, or format it. That's the `text` question without `multiline`,
   choice's Other row, and review comments.
2. **`hideOnBlur`.** A `settings.json` key, on by default, that hides the window when you click
   outside it (another app's window, the desktop). It's the behavior Logan wanted from a floating
   panel, but configurable.
3. **No title bar.** The panel loses its title bar and traffic lights. It floats; the close button
   only hid it anyway, and Esc, the hotkey and the tray already do that.

## Decisions already made

Decided with Logan, 2026-11-03. Don't revisit silently.

- **Enter is a new line in every text box; Cmd+Enter sends.** The growing boxes behave like
  today's multi-line box. Plain Enter no longer sends from a text question, the Other row or a
  review comment. Shift+Enter is not a send key either. (Logan picked this over Enter-sends,
  Shift+Enter-newline.)
- **All three one-line boxes grow:** the `text` question (no `multiline`), choice's Other row, and
  review comments. Not the number box, not capture's one-line input (if it has one beside the
  paste box, leave it), not the note.
- **`multiline: true` stays** as it is today (the 4-row box, resizable): it's the agent saying a
  long answer is expected. Drafts keep their 4–12 line sizing.
- **The key is `hideOnBlur`,** a boolean in `~/.config/parley/settings.json`, **default `true`**.
  `false` keeps today's behavior. A non-boolean is a banner problem and falls back to the default,
  like `autoplay`.
- **Title bar:** the approach is this brief's (see Shape); Logan asked only that the traffic
  lights and the title bar go.

## Already checked

2026-11-03, against the repo at `57b4eb1`.

- `TextRenderer.vue` renders `<input type="text">` unless `schema['x-multiline']`; the compiler
  sets `x-multiline` for `multiline` or a draft containing `\n` (`packages/protocol/src/ask.ts:379`).
- The card's Enter handling is `AskCard.vue` `onKey` (around line 224): plain Enter in a
  `textarea` already returns early (new line); in an `input` it sends. Cmd+Enter sends from
  anywhere (line 214). `isTyping` already matches `textarea`.
- `AskCard.vue` `pick()` treats a `[data-pick]` that is an `HTMLInputElement` as "focus it" (the
  Other row) and clicks anything else. The Enter branch matches `[data-pick]:not(input)`. Both
  must learn about `textarea`, or number keys and Enter will *click* the Other box.
  `keyboard.ts`'s header comment describes the same contract ("focused if it's a text input").
- Choice's Other row is `<input type="text" class="other-input">` in `ChoiceRenderer.vue`
  (around line 154), with `data-pick`, `aria-checked`, and `moveAmongPicks` on ↑/↓.
- Review comments are `<input type="text" class="review-comment" maxlength="500">` in
  `ReviewRenderer.vue` (around line 284). `onCommentKey` sends ↑/↓ to the neighbouring row
  unconditionally and Esc back to the row; its comment says Enter falls through to Send.
- `field-sizing: content` is already used for drafts, capture and editable shows in
  `styles.css` (WKWebView and the inline card's Chromium both honor it; brief 10 kept a `rows`
  fallback for where it doesn't).
- The answer text: `describe()` in `ask.ts` (around line 662) prints an Other answer as
  `"<value>" (their own answer, not one of the options)` on one line, and multi-line text values
  as an indented block. Review comments go through `JSON.stringify`, so a newline shows as `\n`.
- `settings.json` is parsed by `parseSettingsFile` in `apps/desktop/src/theme/settings.ts`
  (keys `theme`, `sound`, `autoplay`, unknown keys reported). `refreshTheme` in
  `apps/desktop/src/theme/index.ts` rereads it on every window focus and pushes `autoplay` out with
  `setAutoplay`; `hideOnBlur` follows the same path.
- The window is declared in `apps/desktop/src-tauri/tauri.conf.json` (440×600, hidden, always on
  top, resizable, default decorations). `window.rs` `init_panel` converts it with
  `tauri-nspanel` at rev `ef6e309` and adds `nonactivating_panel` with `add_style_mask`, keeping
  Tauri's title bar.
- tauri-nspanel at that rev (`~/.cargo/git/checkouts/tauri-nspanel-*/ef6e309/src/lib.rs`):
  `Panel::set_event_handler` *replaces* the window delegate ("Pass `None` to restore the original
  Tauri window delegate"). Don't use it for the blur: Tauri's own window events, which the
  window-state plugin's move/resize tracking rides on, come from that delegate (inferred from the
  doc comment, not tested). It also has `set_style_mask`, `set_corner_radius`, `set_transparent`,
  `set_has_shadow` and `content_view()`, and `StyleMask::full_size_content_view()`.
- Tauri 2.12.2 (`Cargo.lock`). Its window config has `titleBarStyle` (`Visible`, `Transparent`,
  `Overlay`) and `hiddenTitle`; Overlay shows the title bar as a transparent overlay over content
  but keeps the traffic lights, and needs a custom drag region; "you can't drag the window when
  it's not in focus" (tauri#4316). `decorations: false` removes the frame entirely. There is no
  config key to hide the traffic lights. (Context7, `/tauri-apps/tauri-docs`, 2026-11-03.)
- `data-tauri-drag-region` needs `core:window:allow-start-dragging`, which isn't in
  `capabilities/default.json` today (it's in the generated `desktop-schema.json`).

## Open questions

- **Multi-line Other answers in the result text.** An Other value with a line break would print
  as a quoted string spanning lines. Default: in `describe()`, when a custom value contains `\n`,
  print `- <header>: (their own answer, not one of the options)` followed by the indented block,
  as text answers do; single-line values are unchanged. Review comments keep `JSON.stringify`.
  This is model-facing text, but only for a case no trial prompt produces, so default: don't rerun
  the trials, and say so in the report.
- **Links and opened media with `hideOnBlur`.** Opening a link or an image hands focus to the
  browser or Preview, so the window hides. Default: let it. You went somewhere else; the hotkey
  brings the card back with its draft.
- **Screenshots for `capture` with `hideOnBlur`.** Cmd+Shift+4's overlay likely takes focus and
  hides the window. Default: no special case; the guide says the hotkey brings it back and the
  paste still works. If Logan's hand check finds it annoying, that's a follow-up.
- **The title bar's approach** if both paths below fail visually (lost corners, no shadow).
  Default: stop and show Logan before going further.

## Shape

### 1. Growing text boxes (webview, protocol)

- **`TextRenderer.vue`:** the non-multiline branch becomes a `<textarea rows="1">` with a new
  class (say `.text-input.grow`). Drop the `<input>` branch. Keep `data-primary`, the draft logic,
  and the `HTMLTextAreaElement` casts.
- **`ChoiceRenderer.vue`:** `.other-input` becomes a one-row textarea with the same attributes
  (`data-pick`, `aria-checked`, `tabindex`, `data-primary`). ↑/↓ via `moveAmongPicks` should move
  between options only when the caret is on the box's first line (↑) or last line (↓); otherwise
  they move the caret. Put that caret test in one small helper in `keyboard.ts` (e.g.
  `caretOnEdgeLine(el, dir)`) so the review comment uses it too.
- **`ReviewRenderer.vue`:** `.review-comment` becomes a one-row textarea, `maxlength="500"`
  kept. `onCommentKey`: ↑/↓ leave for the neighbouring row only on the edge line, as above; Esc
  unchanged. Fix the comment that says Enter falls through to Send.
- **`AskCard.vue`:** `pick()` focuses a `[data-pick]` that is an input *or a textarea*; the Enter
  branch's selector excludes textareas too (it already returns early for a focused textarea, but
  the option-pick test shouldn't match one). Update `keyboard.ts`'s header comment.
- **`styles.css`:** one rule for the growing boxes: `field-sizing: content`, `min-height` one line
  (`calc(1lh + <padding+border>)`), `max-height` four lines, then scrolling; `resize: none`;
  the same padding, border and line-height as `.text-input` so a one-row box looks like today's
  input. Keep `.other-input` and `.review-comment` looking as they do now at one row. Where
  `field-sizing` isn't supported, one row that scrolls is fine; no JS autosize.
- **`packages/protocol/src/ask.ts`:** the multi-line Other line in `describe()`, per the open
  question, with a test in `ask.test.ts`.
- The read-only history view renders through the same renderers; check a multi-line answer reads
  right there.

### 2. `hideOnBlur` (webview, one guard)

- **`theme/settings.ts`:** add `hideOnBlur` to `SETTINGS_KEYS`, `Settings`, the defaults
  (`DEFAULT_HIDE_ON_BLUR = true`) and `parseSettingsFile`, with `parseHideOnBlurSetting` shaped
  like `parseAutoplaySetting`. Tests beside the existing ones (`setting.test.ts` or a new
  `settings.test.ts`, whichever holds `parseSettingsFile`'s tests).
- **`theme/index.ts`:** `refreshTheme` pushes the value out like `setAutoplay`.
- **The hide**, in the window only (not the inline card, not the gallery): a small module, say
  `apps/desktop/src/blur.ts`, started from `main.ts`, that listens with
  `getCurrentWindow().onFocusChanged` and calls `getCurrentWindow().hide()` when focus is lost,
  `hideOnBlur` is on, and no native dialog is open. Build order step 1 decides whether that event
  fires on the panel; if it doesn't, the DOM `window` `blur` event is the fallback, and if neither
  does, Rust's `WindowEvent::Focused(false)` in `lib.rs`'s `on_window_event` with the setting
  pushed down by a command (new command → `build.rs` manifest and a capability). Keep Rust out of
  it unless step 1 forces it.
- **The file picker guard:** `platform.ts`'s `pickPaths` marks a native dialog open around its
  `open()` call (a counter, decremented in `finally`), and the blur module checks it. Without it,
  the picker taking focus hides the window mid-pick.
- **The tray race:** if clicking the tray icon makes the panel lose focus, a blur-hide on mouse
  down followed by the tray's toggle on mouse up would show the window again. Step 1 checks this.
  If it happens, the fix is Rust-side: `window::toggle` skips showing if the panel was hidden in the
  last ~300 ms, which needs the webview's blur-hide to go through a Rust command that records the
  time (`hide_on_blur`, with its manifest entry and permission). Only build it if step 1 sees it.
- Drafts already survive a hide (the store keeps them); nothing to add.

### 3. No title bar (Rust, config, one drag region)

Try in this order; take the first that keeps the native rounded corners, shadow and edge resize:

1. **Overlay, buttons hidden.** `tauri.conf.json`: `"titleBarStyle": "Overlay"`,
   `"hiddenTitle": true`. In `window.rs` `init_panel`, after `to_panel`, hide the three standard
   buttons (`standardWindowButton:` for close, miniaturize, zoom → `setHidden: true`) through the
   `objc2_app_kit` that tauri-nspanel re-exports. The content now runs under the old title bar
   strip: check the card's meta row isn't under anything and has no stray top inset.
2. **Borderless.** Replace the style mask (`set_style_mask`) with resizable +
   full-size-content + non-activating, without titled/closable/miniaturizable, then
   `set_corner_radius` (macOS's ~10 px) and `set_has_shadow(true)`. Mind that the panel's
   `can_become_key_window: true` override is what keeps a borderless panel typable.

Either way:

- **Dragging:** `data-tauri-drag-region` on the card's meta row in the window, and on the empty
  state's background. Add it from `App.vue` or as a prop/slot so `AskCard.vue` doesn't emit Tauri
  attributes in the inline card (an inert attribute there is harmless, but keep the intent in
  `App.vue`). The attribute drags only from the element itself, not its children: make sure the
  source/age text drags and the zoom control, History button and position still click. Add
  `core:window:allow-start-dragging` to `capabilities/default.json`.
- The history view needs a drag spot too (its header).
- Update `window.rs`'s comment ("add_, not set_: keep Tauri's title bar …") to match.
- Not on other platforms: `cfg(target_os = "macos")` only, like the panel.

### Docs, in the same commit

- `docs/architecture/card-ui.md`: the text renderer, Other row and review comment as growing
  textareas, the Enter rule, the caret-edge rule for ↑/↓.
- `docs/architecture/desktop-shell.md`: the title bar (which approach, the drag region and its
  permission), `hideOnBlur` and the picker guard (and the tray guard if built). The "Hiding"
  bullet lists every hide.
- `docs/architecture/themes.md`: the new key, wherever the settings keys are listed.
- Guide, once, before the report: `answering.md`'s key table (Enter is a new line in any text box;
  Cmd+Enter sends), `question-types.md` (text, Other and comments grow to four lines),
  `the-app.md` (the window has no title bar, drag it by the top row; it hides when you click
  outside it, `hideOnBlur: false` to keep it up; the close button is gone), `themes.md` (the
  settings keys sentence). The root README's feature list if it mentions either.
- `pnpm --filter @parley/desktop screenshots` after the box change, and check the guide's images
  still match.

## Out of scope

- A settings page or toggle UI for `hideOnBlur`: the file is the interface.
- Any change to the inline card in Claude Desktop beyond the shared renderers (it has no title bar
  or focus to lose).
- The number box, capture's paste box, the note, editable shows.
- Changing the hotkey, Esc, or the "notify, don't grab focus" rule.
- Hiding on Cmd+Tab-style app switches beyond what losing key focus already does.

## Build order

1. **Probe the panel (desktop; ask Logan once before running `pnpm app`, which opens the dev
   app and shows its window a few times, a few minutes).** Temporarily log
   `onFocusChanged` and the DOM `blur` event, show the window, then: click another app's window,
   click the desktop, click the tray icon, open the file picker from a `path` fixture
   (`pnpm --filter @parley/server fake-ask <fixture>`), switch AeroSpace workspace. Record which
   events fire for each in the report. That picks the event and says whether the tray guard is
   needed.
2. Growing boxes, keyboard changes and the shaper line, with tests. Headless checks pass.
3. `hideOnBlur`: settings parsing and tests, the blur module, the picker guard (and the tray
   guard if step 1 needs it).
4. Title bar: approach 1, then 2 if 1 fails. Drag regions and the permission.
5. Docs and screenshots. One commit, or one per part if that reads better.

## Acceptance

Headless:

- `pnpm typecheck` and `pnpm build` pass.
- `pnpm --filter @parley/protocol test`: a new test shows a multi-line Other answer printed as an
  indented block, and the single-line Other text unchanged.
- `pnpm --filter @parley/desktop test`: new tests for `hideOnBlur` (missing → true, `false`,
  a non-boolean → a problem and true, not an unknown key); the fixtures still compile under AJV;
  `no-color-literals` passes.
- `pnpm --filter @parley/server fake-host` passes (shared renderers, inline card).
- `docket check` and `docket links --paths` clean.
- In the gallery (`pnpm --filter @parley/desktop dev`, then
  `http://localhost:1420/?gallery`): a text question's box is one row, grows to four with
  newlines, then scrolls; Enter adds a line and Cmd+Enter sends; the same for the Other row and a
  review comment; number keys still focus (not click) the Other row; ↑ on the Other box's first
  line moves to the option above, and inside a multi-line box moves the caret.

Logan, by hand (ask once before launching; the dev app is enough for all of these, `pnpm app`):

- The window has no title bar or traffic lights, keeps rounded corners and a shadow, resizes from
  its edges, and drags by the top row; the zoom control and History button still click.
- With no `hideOnBlur` in `settings.json`: clicking another window or the desktop hides the
  window; the hotkey brings it back on the same card with the draft intact. Clicking the tray icon
  while it's up hides it (and doesn't flash it back). The file picker doesn't hide it.
- With `"hideOnBlur": false`: today's behavior, the window stays up.
- Typing a multi-line answer feels right at 1 → 4 rows in the 440 px window.
- Optionally, once installed: `pnpm install:desktop`, quit and reopen from the tray; the same
  checks hold in the release build (the title bar setup runs in `setup`, so it should match).

Then stop. Write the report, and ask Logan before merging anything.

## Report

Built 2026-11-03. Everything headless passes; the window checks Logan ran by hand in the dev app
passed too (listed under Acceptance).

### Built

- **Growing boxes** (`apps/desktop/src/forms/`, `styles.css`). `TextRenderer.vue` is one textarea:
  `multiline` keeps the 4-row resizable box (and a draft its 4–12 line sizing), otherwise
  `rows="1"` with `.grow`. `ChoiceRenderer.vue`'s Other row and `ReviewRenderer.vue`'s comment are
  `textarea.grow` too. One CSS rule (`textarea.grow`: `field-sizing: content`, one line to four
  plus the box's own padding in `--grow-pad`, `resize: none`). `caretOnEdgeLine(el, dir)` in
  `keyboard.ts`, used by `moveAmongPicks` and the review's `onCommentKey`, so ↑/↓ leave a box only
  from its first or last line. `AskCard.vue`'s `pick()` focuses a textarea `[data-pick]` and the
  Enter option-pick selector excludes textareas. Enter is a new line everywhere and Cmd+Enter
  sends: the card already returned early for a textarea, so no key code changed beyond that.
- **Shaper** (`packages/protocol/src/ask.ts`, `ask.test.ts`). An Other answer with a line break
  prints `- <header>: (their own answer, not one of the options)` and an indented block. A
  multi-select's multi-line own answer gets its own `  - (their own answer…):` block after the
  line of the others. Single-line values are unchanged.
- **`hideOnBlur`** (`theme/settings.ts`, `theme/index.ts`, new `blur.ts`, `platform.ts`, `main.ts`).
  `parseHideOnBlurSetting` shaped like autoplay's, default `true`, a non-boolean is a banner problem
  and `true`. `refreshTheme` pushes it with `setHideOnBlur`. `blur.ts` listens with
  `getCurrentWindow().onFocusChanged` and hides on focus loss when the setting is on and no dialog
  is open; `pickPaths` runs its `open()` inside `duringDialog` (a counter).
- **No title bar** (`tauri.conf.json`, `window.rs`, `capabilities/default.json`, `App.vue`,
  `AskCard.vue`, `history/*`). Approach 1: `titleBarStyle: "Overlay"`, `hiddenTitle`, and
  `init_panel` hides the close, miniaturize and zoom buttons through `standardWindowButton:`.
  `data-tauri-drag-region="deep"` on the card's meta row, the history header, the history detail's
  strip and the empty state, passed down as a `dragRegion` prop from `App.vue`, with
  `core:window:allow-start-dragging`. The fallback (borderless) wasn't needed.

### Probe (build order step 1)

Run on a dev app with its own socket (`PARLEY_SOCKET`), because the installed app held `hub.sock`
and a Vite server already held 1420 (`tauri dev --config '{"build":{"beforeDevCommand":""}}'`
reused it). Temporary Rust logging of `WindowEvent::Focused` and a throwaway command for the
webview's events; both reverted. My blur-hide was already live in the page (Vite HMR), which
explains the hides in the logs.

- **Which event:** `rust Focused`, `onFocusChanged` and the DOM `blur` all fired on a click on
  another app's window, a click on the desktop, Mission Control (by accident) and a workspace
  switch, with the window still visible (`visible=true` at the blur). So `onFocusChanged`, as the
  brief preferred; Rust stays out of it. Tauri's window events still reach `on_window_event` on
  the panel.
- **File picker:** a blur with the window visible when it opened, `Focused(true)` when it closed.
  The guard held: no hide in between.
- **Esc hide:** its `Focused(false)` arrives with `visible=false`, so it doesn't re-enter.
- **Tray race: not seen.** A tray click while the window was up hid it with no blur first, and it
  stayed hidden; showing from the tray didn't blur it. Logan confirmed it never flashed back. The
  Rust-side guard in the brief (`hide_on_blur`, toggle skipping a recent hide) was not built.
- The first log had no timestamps or visibility state and my marker line was clobbered by the
  app's own writes to the file, so it was rerun with both.

### Deviations

- **`caretOnEdgeLine` counts drawn lines, not newlines:** a wrapped line in a 440 px box is one
  logical line, and ↑ there should move the caret. It measures on a hidden copy of the box. The
  brief said "first line … last line" without saying which.
- **`overflow-x: hidden; scrollbar-width: none` on `.grow`,** added after Logan's hand check: in the
  app the one-line Other box showed a scrollbar over its text until it had a few lines. Headless
  WebKit has overlay scrollbars and never reproduced it (`scrollHeight == clientHeight` at 1x and
  2x); the cause is probably a sub-pixel overflow drawn as a legacy scrollbar, not confirmed.
  Past four lines the box scrolls with keys and the wheel, without a scrollbar. Fixed per Logan.
- **A one-line draft** (an `x-draft` with no line break, so no `x-multiline`) is now a growing box
  where it was an `<input>`. A draft with a line break keeps its 4–12 lines.
- **Screenshots not committed.** `pnpm --filter @parley/desktop screenshots` changed 26 PNGs,
  including ones with no text box (`number`, `capture`, `long-markdown`), by about a pixel: drift
  in the screenshot environment, not this change. `text-light` before and after look the same
  apart from the Name box being half a CSS pixel taller. I reverted them, so the guide's images
  are the committed ones. The script also left two untracked `show-file-*` PNGs; removed.
- **Brief 26's own paperwork was uncommitted when I started** (the brief, its three decision files,
  the README's entry and the generated rule and index lines). I committed them with the build
  rather than leave a commit pointing at files that don't exist.
- **`lib.rs`'s close handler stays** (its comment updated) as a backstop for a close request.

### Defaults taken

- **Multi-line Other answers:** the default (an indented block). Trials not rerun, as the brief
  said: no trial prompt produces a multi-line Other.
- **Links and opened media with `hideOnBlur`:** left to hide the window; the guide says so.
- **Screenshots for `capture`:** no special case. Not tried; Cmd+Shift+4's overlay may hide the
  window.
- **The title bar's approach:** didn't fail visually, so no stop.

### Acceptance

- `pnpm typecheck`: pass. `pnpm build`: pass (and `pnpm --filter @parley/server build`).
- `pnpm --filter @parley/protocol test`: 147 pass, including the new multi-line Other test (single
  and multi-select, with the single-line text unchanged).
- `pnpm --filter @parley/desktop test`: 221 pass, with the `hideOnBlur` cases (missing → true,
  `false`, a non-boolean → a problem and true, not an unknown key); fixtures under AJV and
  `no-color-literals` included. `pnpm --filter @parley/server test`: 74 pass.
- `pnpm --filter @parley/server fake-host`: all 12 scenarios pass.
- `docket check`, `docket links --paths`: both still exit 1, on findings that are in `HEAD`
  already and none in files this brief touched: `no-description` on the architecture pages,
  `no-size` on briefs 13–18, and three links (`card-ui.md:120` `docs/plan.md`, which is example
  text; `ask-tool.md:190` `#the-trial-harness`; `widget-hints.md:13` `#decisions`). `docket decisions --write`:
  unchanged. Not clean as the brief asked; see Follow-ups.
- **Gallery**, headless WebKit against `http://localhost:1420/?gallery` (16 checks, a script in
  the session scratchpad, not committed): the text box is one row (36 px in the 110% window) and
  grows to four, then scrolls; Enter adds a line and Cmd+Enter sends; the same in the Other row
  and a review comment; a number key focuses the Other box, doesn't click it; ↑ on its first line
  moves to the option above, inside a multi-line box and on a wrapped line it moves the caret; ↓
  on the last row stays put. 16/16 pass, before and after the scrollbar CSS.
- **By hand, dev app (Logan):** no title bar or traffic lights ✓; rounded corners, shadow and
  edge resize kept ✓; drags by the top row, zoom control and History still click ✓; a click on
  another window hides it ✓; the file picker doesn't (from the probe log) ✓; the tray click hides
  it and it doesn't flash back ✓; the Other row's scrollbar gone after the fix ✓. **Not checked:**
  `"hideOnBlur": false` in `settings.json`; that the hotkey brings back the same card with the
  draft intact after a blur-hide; the release build.

### Size

sized M, this session M (37 active min, 93 wall, 0 compactions), from `docket sessions`. About 70
of the wall minutes were waiting on Logan's answers and clicks.

### Spot checks for Logan

The dev app is stopped (it shares the hotkey and the tray with the installed one). To check live:
quit the installed Parley from the tray, then `pnpm app`.

- With no `hideOnBlur` in `~/.config/parley/settings.json`: click away, then Cmd+Ctrl+P brings
  back the same card with what you'd typed.
- With `"hideOnBlur": false`: the window stays up when you click away (it rereads the file on each
  focus, so edit it, then click the window).
- Click a link in a card, or an image: the window hides while the browser or Preview is in front.
- A `capture` card: Cmd+Shift+4 likely hides the window; paste still works after the hotkey.
- Type a multi-line Other answer and send it; the agent's text should show an indented block.
- Optionally `pnpm install:desktop`, quit and reopen from the tray: the same title bar.

### Docs updated

`docs/architecture/card-ui.md` (growing boxes, the Enter rule, the caret-edge rule, the platform
adapter's dialog guard), `desktop-shell.md` (no title bar, `hideOnBlur`, the picker guard, the
Hiding bullet, permissions, the new source `apps/desktop/src/blur.ts`), `themes.md` (the key). Guide:
`answering.md`, `question-types.md`, `the-app.md`, `themes.md`. Root `README.md`'s feature list.
`AGENTS.md`'s Areas table through `docket areas` (`blur.ts` joined the shell row). No new area.
The three decision files from the brief session are committed with this; the title bar's approach
is on the shell page, not in `no-title-bar.md`, which left it to the build.

### Follow-ups

- `docket check` and `docket links`'s existing findings (above) are for `wrap`.
- `docs/briefs/README.md`'s "Where things stand" has the brief 26 bullet inserted in the middle of
  an older one: the `crash-output` / `sort-helpers` lines now read as part of brief 26's. For `wrap`.
- The screenshot script's output differs from the committed guide images by about a pixel across
  the board, and `show-file` has never had images committed. A refresh pass can wait for a visible
  card change.
- `AGENTS.md` could note that `pnpm app` fails when something else holds port 1420, with the
  `--config '{"build":{"beforeDevCommand":""}}'` way round it. Left as it is.
- Machine fact, written to the dotfiles clone and left uncommitted:
  `~/Dev/dotfiles/.config/agents/AGENTS.md` (reached as `.claude/CLAUDE.md`), under `## This
  machine`: `pnpm` isn't on `PATH` in an agent's shell; prepend fnm's Node 24 bin dir.
