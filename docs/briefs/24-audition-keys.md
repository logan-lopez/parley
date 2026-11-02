---
size: S
size-note: "keys in two renderers and one setting"
status: awaiting-review
---
# Brief 24: Audition keys

Read `AGENTS.md`, [`README.md`](README.md), [brief 23](23-media-sounds.md), [the
card](../architecture/card-ui.md) (Keys, the choice and review renderers) and
[themes](../architecture/themes.md) (`settings.json`) first.

**Prerequisites:** brief 23 has landed, with `forms/player.ts` and the sound chips.

## Goal

Make an audition a keyboard pass. With sound chips in a review item's or a choice option's
preview, `p` plays the focused row's takes in turn. Logan moves with `j`/`k`, listens with `p`,
decides with the keys he already uses, and never reaches for the mouse. Brief 23 puts the sounds
in the card; with 19 sounds of three takes, clicking 57 chips is still the slow part.

## Decisions already made

- **`p` cycles the takes** (Logan, 2026-11-02): `p` plays the focused row's next chip (the first,
  then the second, wrapping round); Shift+`p` replays the last one played; Esc while something is
  playing stops it. Digits keep deciding the row: in a review with labelled decisions, `1`–`4`
  already decide the focused row ([the card](../architecture/card-ui.md), Review), and the
  audition forms used exactly that (Take 1, Take 2, Take 3, None).
- **Autoplay is off by default** (ideate, 2026-11-02): a window that starts making noise when a
  notification brings it up is a bad surprise.

## Open questions

- **Autoplay as a setting.** Default: `"autoplay": true` in `~/.config/parley/settings.json` plays
  a row's first chip when focus moves onto it, and never on the card's first focus after a new
  ask arrives. Parsed with the other keys (`parseSettings`), a bad value falling back to `false`
  with the settings banner's usual message.
- **Where the cycle restarts.** Default: each row remembers its next chip for the session, so
  coming back to a row and pressing `p` plays the take after the one heard last.

## Shape

- **Review renderer.** On the focused row, `p` and Shift+`p` as above, handled on the row like
  `a`/`r`/`c` (never in a comment box). A row with no chips ignores them.
- **Choice renderer.** On a focused option, the same, acting on the chips in that option's
  `x-preview`. Not in the Other text input, where `p` types.
- **Esc.** When `player.state` says something is playing, Esc stops it and stops propagation, so
  the window doesn't hide (the rule for renderers that need Esc, [the card](../architecture/card-ui.md)).
  When nothing plays, Esc does what it does now.
- **Chips** show which one is next for the focused row (a subtle marker), so `p` isn't a guess.
- **The key hint** in the card's footer or help, wherever the review keys are listed now, gains
  `p`.
- Before settling the keys, check `~/.config/keymap/keymap.md` (AGENTS.md). Plain letters inside
  the focused card aren't global chords, but check anyway, and note the check in the report.

## Out of scope

- Playing from digits, A/B looping, volume, and the notification sound picker.
- Any model-facing change: this brief adds no tool text, so no trial run.

## Acceptance

- `pnpm typecheck` and `pnpm --filter @parley/desktop test` pass, with tests for the key handling
  if the renderers' tests reach that far; otherwise a test of the cycle logic on its own.
- In the gallery (`http://localhost:1420/?gallery&fixture=media`, brief 23's audition question):
  `j` to a row, `p` `p` `p` plays takes 1, 2, 3, `p` again plays 1; Shift+`p` replays; Esc stops,
  and the gallery stays put; `2` still decides the row. The same in a choice whose options have
  chips.
- `settings.json`'s `autoplay` documented in the guide's [themes page](../guide/themes.md) (or
  wherever the settings file's keys are listed) and in the themes architecture page.
- Guide: the keys in [answering](../guide/answering.md) or the page brief 22 wrote.

By hand, for Logan (ask before launching anything): one audition in the installed build, answered
with the keyboard only.

Then stop. Ask Logan before merging anything.

## Report

Implemented 2026-11-02; awaiting Logan's review. On a review row or a choice option with sound
chips, `p` plays the next take (first, second, round again), Shift+`p` plays the last one again,
and Esc stops what's playing without hiding the window. Digits still decide the row. `autoplay`
in `settings.json` plays a row's first chip when focus moves onto it. Nothing was merged or pushed.
The installed-build audition is Logan's to run.

### Built

- **`forms/audition.ts`** (new): `useAudition(rootsOf, canAutoplay)`, which the review and choice
  renderers call. `createCycle()` is the pure part (one remembered chip id per row, for the life
  of the renderer). `escStops(event)` stops the player and the event only while something plays.
  `chipUrls` (moved here from `Markdown.vue`) is the registry of playable chips; `track` and
  `settled` let a row wait for a just-rendered preview's media paint. `audition` is the reactive
  `{ autoplay, next }`. `forms/player.ts` is untouched.
- **Review** (`ReviewRenderer.vue`): `p`, Shift+`p` and Esc on the focused row (`@keydown.self`,
  so never in a comment box); the row's chips are the row's own and the preview pane's while it's
  the viewed row. The hint lists `p`, Shift+`p` and Esc when the form has an audio ref.
- **Choice** (`ChoiceRenderer.vue`): `p` and Shift+`p` on the option, Esc on the whole options
  list (so it stops a sound from the Other input too). `p` types in Other.
- **Marker** (`Markdown.vue`, `styles.css`): `paintSounds` puts `.next` on the chip
  `audition.next` names: an accent outline and a small `p`. Shown only when a row has two or
  more chips; cleared when focus leaves the question.
- **Setting** (`theme/settings.ts`, `theme/index.ts`): `autoplay` is a key of `settings.json`,
  `parseAutoplaySetting`, off when missing, and a non-boolean falls back to off with
  `settings.json: "autoplay" must be true or false, got …` in the banner. Each refresh calls
  `setAutoplay`. The gallery takes `&autoplay=1` instead.
- **Fixture** (`packages/protocol/fixtures/media.json`): a fourth question, an optional choice
  (`Voice`) whose options preview three, two and no takes, for the choice half of the acceptance.
- **Tests** (`forms/audition.test.ts`, `theme/setting.test.ts`): see Acceptance.

### Deviations

- **Shift+`p` replays the last chip played in this row**, not the last one played anywhere, and
  plays the row's first when it hasn't played any. Replaying a take from another row, whose
  preview isn't showing, seemed wrong. Say if the brief meant the global last.
- **"Never on the card's first focus" is a rule about where focus came from:** autoplay follows a
  focus that moved from another element (`j`/`k`, arrows, a click, Tab from another question) and
  not one the card put there itself (a new ask, the window coming back, which `focusout` has
  already left). It isn't a count of focuses.
- **The `p` hint only shows when the form has a sound**, so a review without chips doesn't
  advertise a key that does nothing.
- **Tests mount real chips under `useAudition` in a small harness**, not the JSON Forms renderers,
  which have no test scaffolding; the renderers' own wiring was driven in the gallery (below).
- **The `Voice` question is optional** so the `media` guide screenshot's footer doesn't change.

### Defaults taken

- Autoplay setting: `"autoplay": true` in `settings.json`, plays the row's first chip, bad value
  falls back to off with the banner's usual message.
- Where the cycle restarts: each row remembers its place for the session (the renderer's life).

### Acceptance

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Pass. |
| `pnpm build` | Pass. |
| Desktop tests | Pass: 212 (was 193), including `audition.test.ts` (cycle and wrap, Shift+`p`, Esc stopping the event only while playing, a row without chips, modifiers left alone, the marker, a mouse-played chip moving the cycle, and autoplay: off by default, first focus, history, a row left before the render finished, one play per row) and the `autoplay` parse cases. |
| Protocol 136, server 73, `fake-host` (all 12) | Pass. |
| Gallery, review (`?gallery&fixture=media`, headless WebKit) | Pass: `p` ×4 played takes 1, 2, 3, 1 with the marker following; Shift+`p` replayed 1; Esc stopped it; `2` decided the row as Take 2; `j` to row 1 and `p` played its take 1; `k` back and `p` continued after the take heard last. |
| Gallery, choice | Pass: the same on the Voice options (`p` ×4 wraps; ArrowDown to a two-take option; Esc stops; the no-chip option ignores `p`). No page errors. |
| Gallery, `&autoplay=1` | Pass: `j` plays the new row's first take and `p` then plays the second; `&autoplay=0` stays silent. |
| `settings.json`'s `autoplay` documented | Pass: guide ([pictures](../guide/pictures.md#autoplay), pointed to from [themes](../guide/themes.md)) and [themes architecture](../architecture/themes.md). |
| Guide keys | Pass: pictures (a keys section), [answering](../guide/answering.md) (the Esc row and the sound line), [question types](../guide/question-types.md) (review keys). |
| `docket links --paths` | One finding, `docs/plan.md` in `card-ui.md`, an example path in the page's Show section that was there before this brief. `docket check`: the six `no-size` and nine `no-description` findings briefs 22 and 23 recorded. |
| Keymap check | `~/.config/keymap/keymap.md` has no claim on a bare `p`, Shift+`p` or Esc outside the terminal stack (Neovim, Zellij pane mode, snacks). Parley's window is its own, so no conflict. |
| `screenshots media` | Rerun; the guide's two media shots are byte-identical. |

Not verified, because it needs the real webview: that WKWebView lets `play()` start after the
renderer's `await`s (autoplay and `p` both run from a key event, `p` synchronously and autoplay
after a render and the media grants), and that the window's Esc doesn't also fire in Tauri.
Both follow from the code and the gallery, not from the installed app.

### Size

Sized S, this session S (8 active min, 8 wall, 0 compactions), from `docket sessions`.

### Spot checks for Logan

- **Gallery, live now** (the dev server I started is still running on 1420):
  `http://localhost:1420/?gallery&fixture=media`. Scroll to Audition, `j` to a row, `p` `p` `p`
  `p`, then Shift+`p`, Esc, `2`. Then the Voice question below it: Tab to it, arrows between
  options, `p`. Add `&autoplay=1` to hear it play on `j`. This is a browser, not WKWebView.
- **Installed build, not run** (`pnpm install:desktop` with Node 24, then quit Parley from the
  tray and reopen): one audition answered with the keyboard only. Check that the first `p` after
  `j` makes sound (the WKWebView policy above), that Esc stops the sound and the *next* Esc hides
  the window, and, with `"autoplay": true`, that a new ask arriving stays silent.

### Docs updated

Guide: `pictures.md`, `answering.md`, `question-types.md`, `themes.md`; root `README.md`'s
feature line. Architecture: `card-ui.md` (Audition keys, the review and choice bullets, the Keys
rule, the pinned player's driver), `themes.md` (`autoplay`), `testing.md`; `AGENTS.md`'s Testing
row and `.claude/rules/testing.md` through `docket areas`.

### Follow-ups

- The `docs/plan.md` link finding in `card-ui.md` would go in `.checklinks-ignore`, or the example
  could be reworded; it predates this brief.
- If the installed app's first `p` is silent, the fix is to start playback synchronously on the
  keydown, which means preloading chip URLs on focus. Not needed unless the check fails.
