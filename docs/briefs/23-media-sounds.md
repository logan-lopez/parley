---
size: S
size-note: "rides brief 22's plumbing: globs, sniffing and a player"
status: awaiting-review
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

## Report

Implemented 2026-11-02; awaiting Logan's review. A project sound written as `![caption](path)` is a
▶ chip in any markdown the window renders, and a glob in the file name is one chip of 1–12
variants played in name order with a 150 ms gap. One sound plays at a time. The installed-build
audition is Logan's to run. Nothing was merged or pushed.

### Built

- **Protocol** (`packages/protocol/src/media.ts`): `MEDIA_VARIANTS_MAX` (12), `SOUND_GAP_MS`
  (150), `isMediaGlob` (a `*` or `?` in the last segment) and `looksLikeSound` (a glob or a
  sound extension, for refs not resolved yet). `mediaRefs` already kept `*` and `?` in a
  destination; a test pins it. The fixture `media.json` gains an audition review (Take 1–3 and
  None, `defaultDecision: none`): two items, each preview three takes, `jump`'s third a glob of
  three WAVs. Eight short WAVs (3–7 KB each) are under `fixtures/files/`.
- **Server** (`apps/server/src/show-media.ts`): `readShowMedia` expands globs in their one
  directory (located like a file, so secret and outside directories are refused), matches `*`
  and `?`, skips dotfiles unless the pattern starts with a dot, sorts with numbers in order,
  and reads, checks and sniffs each match like a named file. `audioMime` sniffs WAV, AIFF/AIFC,
  MP3 (ID3 or frame sync), ADTS AAC, M4A (`ftyp` with an audio or general MP4 brand, not HEIF),
  FLAC, and Ogg with a Vorbis or Opus first packet. Refused: no match, more than 12, a glob in a
  directory name, `**`, a glob that matches images, and more than 200 files counting variants.
  `inlineMediaUrls` never sends sounds (it already skipped non-images). The tool description
  gains "An audio file, or a glob of variants (`takes/1_*.wav`), is a play button."
- **Player** (`apps/desktop/src/forms/player.ts`, pinned): `createPlayer()` and the window's
  `player`, one `HTMLAudioElement`, with `play(id, urls, gapMs)`, `stop()`, reactive `state`
  (`id`, `variant`, `count`, `playing`) and `onEnd(id)` after a natural end only. A newer play or
  a stop invalidates stale callbacks; a variant that errors is skipped. Also `soundDuration(url)`
  (metadata on a separate element, cached per URL) and `formatDuration`.
- **Chip** (`forms/markdown.ts`, `Markdown.vue`, `styles.css`): `renderMarkdown(source, inline,
  env)` takes the form's media and a scope. An audio ref (by its resolved kind, else by name)
  renders `button.md-sound[data-media][data-sound]` with no URL from the text. `paintChip`
  enables it only when every variant's grant is `ok`, and otherwise says why, naming the first
  bad file, or “Plays in the Parley window” in the inline card. `paintSounds` repaints ▶/■, “3
  variants · 0.2 s” and “2/3” from the player's state. Mousedown is prevented and the click
  doesn't propagate. Styling is from tokens only.
- **Scopes** (`QuestionFrame`, `ChoiceRenderer`, `ReviewRenderer`, `ShowRenderer`): each
  markdown surface passes `<question id>/<surface>`, so chip ids read like
  `audition/preview-1#2` and survive a preview being swapped out and back.
- **`AskCard`** stops the player on unmount. **Gallery** expands fixture globs and serves the
  WAVs through Vite.
- **Trials:** `apps/server/trials/project/sounds/chime/take_{1,2,3}.wav`, the `sound-audition`
  prompt with a new `media: audio` frontmatter key, and a `soundRefs` score (`noSoundRefs`
  failure, a "sound refs" summary column) in `trial.ts` and `trial-score.ts`.
- **fake-host:** the `media` scenario checks that the fixture's glob reaches the card as three
  ordered variants and that no sound goes inline.

### Deviations

- **Directory globs are refused on every ref**, not only refs with a glob in the last segment.
  Otherwise `set*/a.wav` fell through as a plain path and failed as "doesn't exist", which tells
  the model nothing. A test caught it.
- **"Sorted by name" sorts numbers in order** (`Intl.Collator('en', { numeric: true })`), so
  `take_10` comes after `take_9`. Plain code-point order would have put it after `take_1`.
- **Chip ids include the surface:** `<question id>/<surface>#<n>`. The brief says question id
  plus the ref's index, but a question has several markdown surfaces (text, each option's
  description and preview), and their indexes would collide.
- **Disabled is `aria-disabled`, not `disabled`:** the chip stays inert to clicks in the handler,
  and its `title` tooltip still shows on hover, which WebKit doesn't promise for a disabled
  button.
- **A chip's click stops propagation**, so a chip in an option's description doesn't pick the
  option. Not in the brief; it falls out of "focus stays on the row or option".
- **A variant that fails to load or play is skipped** rather than stopping the chip.
- **The trial scorer needed a new check**, and its first player-command pattern was wrong: it
  matched the prompt's own prose "to play when". Details under Acceptance.

### Defaults taken

- Variant cap: 1–12 files per glob, sorted by name; more is an error that says how many matched.
  Each variant counts against the 200-file cap.
- Gap: 150 ms.
- Formats: WAV, AIFF, MP3, M4A/AAC, FLAC, and Ogg, which brief 22's spike played (Vorbis). Opus
  in Ogg is accepted per the brief's default but wasn't part of the spike.

### Acceptance

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Pass. |
| `pnpm build` | Pass (desktop, inline card, server bundle). Node here is 26.6.0. |
| Protocol tests | Pass: 136, including glob refs kept by `mediaRefs`, `isMediaGlob` and `looksLikeSound`. |
| Server tests | Pass: 73, including globs (sorted with numbers, dotfiles, the root, 13 matched, no match, a non-sound match, a secret match, a secret directory, a directory glob, `**`, image globs, outside the project), the 200 cap counting variants (192 passes, 204 refused), every sound format sniffed and refused look-alikes (Theora, HEIF, a reserved MPEG version, text), and sounds never inlined. |
| Desktop tests | Pass: 193, including `player.test.ts` (order, gap, skip, one at a time, stop in the gap, stale callbacks, durations) and chips mounted in `media.test.ts` (variants and duration, one playing at a time, click to stop, four disabled states, unresolved, mousedown prevented). The AJV sweep covers the new fixture. |
| Gallery | Pass in headless WebKit at `?gallery&fixture=media`: chips show 0.3 s / 0.4 s / “3 variants · 0.2 s”; the glob plays `jump-3_a`, `_b`, `_c` in order with “1/3”…“3/3”; starting Take 2 stops Take 1; a second click stops; focus stays on the row; the second row's ids are `audition/preview-1#1–3`; no page errors. Light and dark checked by eye. |
| `fake-host` | Pass: all 12 scenarios, with the two new sound checks in `media`. |
| Trials | Run on both clients: `sound-audition --runs 3`, then `screenshot-look --runs 1`. All 8 runs asked, first calls valid 8/8, used 8/8. Sound refs: 1/3 per client as first scored, 3/3 per client re-scored. Details below. |
| `screenshots media` | Rerun (the fixture's title changed). The 440×600 frame stops above the audition, so the chips aren't in the guide shot. |
| Docs | Guide, root README, form spec, ask tool, card, inline cards, testing, trials README, Areas and rules. |
| `docket links` | Pass: 126 files, 0 broken. |
| `docket check` | The pre-existing findings brief 22 recorded: 6 `no-size` (briefs 13–18) and 9 `no-description` notes. Nothing new. |

**Trials.** Claude Code 2.1.316 with `claude-opus-5-5`, Codex CLI 0.166.0 with `gpt-6-astra`. The
first score had 4 of 6 `sound-audition` runs failing `noSoundRefs`. All four had audio entries
in `x-media`. The scorer's pattern took the bare word `play` followed by any word as a player
command, which matched the question's own "to play when a report finishes". I narrowed it to
`play` followed by a sound file and re-scored the four kept transcripts with `--score`; each
passed. The prompt and tool text weren't touched after measuring, and the trials README records
both numbers. One kept run (Claude #2) put all three takes behind a single glob chip, which
plays them back to back as variants of one sound instead of letting Logan compare takes. It's
noted in the trials README to watch, not tuned.

**Gap timing in headless WebKit.** In the gallery, a 0.25 s variant took about 0.6 s from start
to `ended`. A bare `new Audio()` outside Parley does the same there (play resolves at ~100 ms,
`ended` ~600 ms later), so it's the headless audio sink, not the player. The real gap needs an
ear in the installed app.

### Size

Sized S, this session S (13 active min, 13 wall, 0 compactions), from `docket sessions`.

### Spot checks for Logan

- **Gallery, live now:** `http://localhost:1420/?gallery&fixture=media`. Scroll to Audition, focus
  the `jump` row (click it, or `j`), and click the chips in the preview. Take 3 should play three
  rising blips in order with “1/3”…“3/3”; starting another chip stops it. Add
  `&theme=parley-dark` for dark. This is a browser, not WKWebView with the asset protocol.
- **Installed build, not run here** (`pnpm install:desktop` with Node 24, then quit Parley from
  the tray and reopen): an audition ask from a game project with a dozen sounds and a glob take.
  Check that variants play in order, the 150 ms gap feels like a gap and not a stall, only one
  sound plays at a time, and answering the ask stops the sound. Then overwrite one take, reopen
  the ask from history, and check that its chip is disabled with "changed since this was asked".
- **Claude Desktop, not run here:** an ask with a sound shows a disabled chip saying “Plays in
  the Parley window”.
- **Opus**, if you have an `.opus` or Opus-in-Ogg file: it's accepted but wasn't in brief 22's
  spike.

### Docs updated

`docs/guide/pictures.md` (now "Pictures and sounds from the project", with a Sounds section),
`docs/guide/README.md`, `docs/guide/answering.md`, the root README's feature list and "What it's
built around"; architecture pages form spec, ask tool (Project images is now Project media),
card (Sound chips, the pinned player), inline cards and testing; `AGENTS.md`'s Testing row and
`.claude/rules/testing.md` (`player.test.ts`, via `docket areas`); `apps/server/trials/README.md`
(the prompt, `media:`, `soundRefs`, this pass).

### Follow-ups

- **A glob read as "all the takes"** in one of the four kept trial transcripts. If the next
  full pass shows it again, the description's sentence may need to say a glob is variants of
  *one* sound. That's a measured wording change for a later brief.
- **Gap tightness.** One element means each variant loads after the last ends. If the installed
  app's gap feels long, preloading the next variant on a second element would fix it, but that
  bends "one shared `HTMLAudioElement`" in the pinned player and needs your call.
- **No screenshot shows a chip.** The `media` fixture's frame ends above the audition. A small
  fixture of its own (say `audition.json`) would put chips in the guide.
- **Opus playback** in WKWebView is unverified (above).
- The pre-existing `docket check` findings (sizes for 13–18, page descriptions), as in brief 22.
