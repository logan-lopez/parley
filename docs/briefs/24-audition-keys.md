---
size: S
size-note: "keys in two renderers and one setting"
status: not-started
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
