---
size: S
size-note: "rides brief 22's plumbing: globs, sniffing and a player"
status: not-started
---
# Brief 23: Sounds from the project, as play chips

Read `AGENTS.md`, [`README.md`](README.md), [brief 22](22-media-images.md) (and its report: the
spike's Ogg result), [the form spec](../architecture/form-spec.md), [the ask
tool](../architecture/ask-tool.md) and [the card](../architecture/card-ui.md) first.

**Prerequisites:** brief 22 has landed, with `x-media`, `mediaRefs`, `readShowMedia`,
`allow_media` and `mediaUrls`. Brief 24 builds on the player here; the parts it uses are marked
**pinned**.

## Goal

The same markdown syntax as brief 22, for audio: `![Take 1](audition/jump/1_*.wav)`
renders as a ▶ chip with its caption and duration. A glob or a single file both work, and a
glob's matches are the take's variants, played one after another with a short gap.

From real use (Logan's history, 2026-11-02): two audition asks, review questions with 19 and 16
sounds, three takes each, referenced over 160 files and globs. Each item's preview held shell
commands to copy into a terminal, one per take, looping over the variants. That copy-and-paste is
what this replaces.

## Decisions already made

- Everything in [brief 22](22-media-images.md)'s list: reference and hash, the server as the gate,
  no base64 on the wire, markdown syntax rather than a question type (2026-11-02).
- **Sounds are window-only in the inline card** (Logan, 2026-11-02): the card shows the chip
  disabled, saying it plays in the Parley window. Desktop's media CSP is unchecked. Decision file:
  [`media-in-the-inline-card`](../decisions/media-in-the-inline-card.md).
- **No playback through `afplay`** from the server or Rust (ideate, 2026-11-02): no stop and no
  way to show what's playing, and it spawns a process from model input. The webview plays.

## Already checked

- Brief 22's list: the asset protocol answers range requests; `media-src 'self' asset:` is
  already in both CSPs after brief 22.
- Ogg Vorbis: brief 22's spike result is in its report. If it didn't play, Ogg is refused at the
  server with a message ("convert to WAV first: `ffmpeg -i x.ogg x.wav`"), and that's the whole
  fallback. No transcoding in Parley.

## Open questions

- **Variant cap.** Default: a glob matches 1–12 files (sorted by name); more is an error that
  says how many matched. Brief 22's 200-file cap per ask counts each variant.
- **The gap between variants.** Default 150 ms, which is what the shell loops used.
- **Formats.** Default: WAV, AIFF, MP3, M4A/AAC, FLAC, and Ogg if brief 22 said it plays, sniffed
  from the first bytes (`RIFF`…`WAVE`, `FORM`…`AIFF`/`AIFC`, `ID3` or an MPEG frame sync, `ftyp`,
  `fLaC`, `OggS` with a Vorbis or Opus header).

## Shape

- **Server (`show-media.ts`).** A ref whose sniffed type is audio becomes
  `{ kind: 'audio', files }` in `x-media`. A `*` or `?` in the last path segment is a glob,
  expanded in that directory only (no `**`, no globs in directory names), sorted by name, each
  match through the same project, secret and sniff checks. A glob that matches nothing is an
  error naming the pattern. An image ref with a glob is an error ("one image per `![]()`").
- **Tool description.** Extend brief 22's sentence: "An audio file, or a glob of variants
  (`takes/1_*.wav`), is a play button." Model-facing: see Acceptance.
- **The player (`forms/player.ts`), pinned.** One shared `HTMLAudioElement` for the window.
  `play(id, urls, gapMs)` plays the urls in order and stops whatever was playing; `stop()`;
  `state` (reactive: which chip id, which variant, playing or not); `onEnd`. A chip's id is stable
  within the form (question id plus the ref's index in that markdown). Brief 24 drives this.
- **The chip (`forms/markdown.ts` and `Markdown.vue`).** An audio ref renders as
  `button.md-sound[data-media]` with ▶, the caption, the variant count when more than one ("4
  variants"), and the duration from `loadedmetadata` once known (the first variant's). Clicking
  plays it; clicking the playing chip stops it. Playing shows ■ and which variant ("2/4"). The
  chip has `tabindex="-1"`: brief 24 gives the keyboard its way in. A mousedown on it is
  prevented, as the copy buttons and preview Source buttons are, so focus stays on the option or
  row whose preview it's in.
- **States** as brief 22's images: `changed`, `missing` or unresolved make a disabled chip with
  the reason, and the path in a `title`. In the inline card: disabled, "Plays in the Parley
  window".
- Tokens only for styling.

## Out of scope

- Keys (brief 24), autoplay, waveforms, scrubbing, volume, loops that repeat.
- The notification sound picker in [`FUTURE.md`](FUTURE.md): it can reuse the player later.
- Transcoding, and audio in the inline card.

## Acceptance

- `pnpm typecheck`, `pnpm build`, and the three packages' tests pass, with new server tests for
  globs (sorted, the cap, no match, a match that's a secret or not audio, a glob in a directory
  name refused) and audio sniffing.
- `packages/protocol/fixtures/media.json` (from brief 22) gains a review question shaped like an
  audition: two items, each preview with three takes, one take a glob of three short WAVs under
  `fixtures/files/`. In the gallery (`http://localhost:1420/?gallery&fixture=media`), the chips
  show their durations and play, one at a time; starting another stops the first.
- `pnpm --filter @parley/server fake-host` passes.
- A trial prompt, `apps/server/trials/prompts/sound-audition.md`, with three short WAV takes
  committed in the trial project: pick a take. `expect: ask`, and the score checks the ask uses
  `![…](…)` refs rather than shell commands. `pnpm --filter @parley/server trial --prompt
  sound-audition --runs 3`, then `screenshot-look` once. Results in the trials README.
- Docs: the guide page brief 22 wrote for pictures gains sounds; the root README's feature list;
  the form spec, the ask tool and the card pages.

By hand, for Logan (ask before launching anything): in the installed build, an audition ask from
a game project with a dozen sounds; the chips play the takes, variants in order, and only one
sound plays at a time.

Then stop. Ask Logan before merging anything.
