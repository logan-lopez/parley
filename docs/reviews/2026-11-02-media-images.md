# Brief 22: project images — implementation report

## Report

Implemented 2026-11-02; awaiting Logan's review. Project PNG/JPEG/GIF/WebP images now draw in
markdown across the window, gallery and capped inline payloads. The installed-build and actual
Claude Desktop checks remain manual. No merge or push was performed.

### Built

- Protocol: `packages/protocol/src/media.ts` holds the pinned `MediaFile`, `MediaEntry`, `Media`
  types and caps, a shared markdown parser and `mediaRefs`. `askMediaRefs` scans every rendered
  markdown field and shown markdown files; `compileQuestions(input, files?, media?)` adds root
  `x-media`. The Zod input shape is unchanged.
- Server: `show-media.ts` reuses `show-files.ts`'s project and secret checks, opens regular files
  without following a replacement symlink, bounds reads, sniffs image headers and hashes bytes.
  Both tool surfaces and `fake-ask` resolve media. Only inline result metadata carries image
  data URLs; the window, history, model text and structured result contain no image bytes.
- Shell: empty static asset scope, exact-file runtime grants through `allow_media`, SHA-256
  checks off the UI thread, matching development/production CSPs, and a grant/hash-checked
  `open_media` command. Commands are registered in the manifest and capabilities.
- Window: escaped image placeholders, captions/paths, loading and failure states, natural-size
  drawing bounded by the column, and clicking a drawn image to open it. A mounted card shares
  one media-resolution promise across questions and later-mounted previews. Per-path statuses
  distinguish equal hashes belonging to different files.
- Inline/gallery: `_meta['parley/media']` has capped data URLs and
  `_meta['parley/media-refs']` has compiler references. The card waits for metadata before
  rendering local media. The gallery resolves only fixture assets. Added `media.json`, a small
  deterministic PNG, two guide screenshots, a trial project PNG and `screenshot-look` prompt.

### Spike

**Go.** Tauri 2.12.2 in `pnpm app`, empty static asset scope, `protocol-asset` and exact
`allow_file` grants. A PNG under a `.dot/` directory loaded at 968×1322. No
`requireLiteralLeadingDot: false` was needed. **Ogg Vorbis also worked:** WKWebView loaded its
4.089 s duration, and logged playback and repeated seeks using the controls. This is brief 23's
starting evidence. The temporary probe, its command/permission and source were removed.

### Deviations

- The project and secret-name checks were already exported through `projectRoot`/`locate`, so
  `show-files.ts` needed no edits. Media uses those functions directly.
- Took the brief's opener fallback: `$HOME/**` misses dot directories under Tauri's default
  matching rules and projects outside home. `open_media` opens only an existing asset grant
  whose bytes still hash correctly, without a general open-path capability.
- Cache lifetime is a mounted form, rather than the whole application session. Reopening an
  ask must recheck its file hashes to show changed/missing notices in history.
- The inline card also needs the reference map to compile `x-media`; it travels separately in
  `parley/media-refs`, leaving `parley/media` as the requested destination-keyed URL map.
- The brief, its README entries, the media decisions and several rules were uncommitted when
  this run began. Their original changes stay outside the implementation commit. Only this
  session's new rule path entries are staged. The source brief's report/status remain with
  those drafts; a report snapshot is committed in `docs/reviews/2026-11-02-media-images.md`.

### Defaults taken

25 MB per image; 200 distinct media references per ask; inline source-byte caps of 2 MB per
image and 8 MB per ask; SVG destinations direct the model to a path-backed show. No new key
chords, audio UI, globs, compare fence or copied media store.

### Acceptance

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Pass, with Node 24.20.0. |
| `pnpm build` | Pass: desktop, inline card and server bundle. |
| Protocol tests | Pass: 135 tests, including all markdown fields, spaces, code/fences/schemes and `x-media`. |
| Server tests | Pass: 45 tests, including outside/symlink/secret/regular-file/type/SVG/size/count refusals and inline caps/hash changes. |
| Desktop tests | Pass: 173 tests, including AJV's fixture sweep and resolved root media, no model-supplied `src`, escaped placeholders, mounted media states/opening and cache lifetime. |
| `cargo test --offline` | Pass: 2 tests, including hash, changed, missing, non-file and symlink refusal. |
| Gallery | Pass in headless WebKit: all three placements loaded at natural width 320 in both light and dark; no page errors. |
| `screenshots media` | Pass: `media-light.png` and `media-dark.png` added and visually inspected. |
| `fake-host` | Pass: all 12 scenarios, including metadata-only image bytes, window references, normal answers and refusal before showing. |
| Trials | Required runs completed on both clients. All 10 asked; 9/10 first calls valid. Raw `used` misses retained, detailed below and in the trials README. |
| Docs | Guide, README, six architecture pages, Areas and rule path mappings updated. |
| `docket links` | Pass: no broken links. |
| `docket check` | Not green: six pre-existing `no-size` findings in briefs 13–18, plus nine existing architecture `no-description` notes. No unrelated migration attempted. |
| Formatting | `git diff --check` and `rustfmt --check` for `media.rs` pass. Repository-wide `cargo fmt --check` also reports pre-existing formatting in hub/tray/window files; those were left alone. |

Targeted trials (Claude Code 2.1.316 / `claude-opus-5-5`; Codex CLI 0.162.1 / `gpt-6-astra`):

| Prompt | Client | Asked | First valid | Used, raw scorer |
| --- | --- | --- | --- | --- |
| screenshot-look | Claude | 3/3 | 2/3 | 2/3 |
| screenshot-look | Codex | 3/3 | 3/3 | 3/3 |
| report-look | Claude | 1/1 | 1/1 | 0/1 |
| report-look | Codex | 1/1 | 1/1 | 1/1 |
| plan-check | Claude | 1/1 | 1/1 | 0/1 |
| plan-check | Codex | 1/1 | 1/1 | 0/1 |

Claude's invalid first call used a PNG as a show's text `path`; it corrected that to markdown
image content after the binary refusal. A different screenshot run acknowledged the sidebar
choice but omitted a parenthetical in the exact choice label, missing the `used` proxy. The
regression runs also have raw text-matching misses. Both plan-check runs showed their plan by
path. The trial README preserves the raw results and notes the shared PNG's effect on report-look;
neither prompts nor scorer were tuned after the measurements. These runs are not a full-suite
baseline. Local raw results are gitignored.

### Size

Sized M; this session **not measured** (Codex). `docket sessions --brief 22` reports zero sessions;
no active/wall time or compaction count is inferred.

### Spot checks for Logan

- The dev server is left running at `http://localhost:1420/?gallery&fixture=media`. Check the show,
  question and focused option preview. Add `&theme=parley-dark` for dark, or
  `&theme=parley-light` for light. The third image is below the fold; scroll the card.
- Installed app, **not run here**: with Node 24, run `pnpm install:desktop`, then quit/reopen
  Parley. From a project, show a PNG with markdown image syntax; click it to open Preview.
  End the ask, overwrite the image, then reopen its history detail: it should say changed.
  Reopen after deleting the file to check the missing notice. The gallery doesn't exercise
  native grants or opening.
- Actual Claude Desktop, **not run here**: restart the client to reload the built server/card,
  ask with a small project image and check that it appears inline. With an image over 2 MB,
  check the caption and “Open in the Parley window” fallback and that answering still works.

### Docs updated

Form spec, ask tool, card UI, inline cards, desktop shell and testing; `AGENTS.md` Areas and
matching rule path entries; new `docs/guide/pictures.md`; guide index, question types, answering,
history and screenshot gallery; root README and the trial README. Existing media decision files
remain the binding calls; no new product decision was needed.

### Follow-ups

- Complete the installed-build and actual Desktop checks above before wrapping the brief.
- A future measured wording change could make a PNG-as-show-path refusal point directly at
  markdown image syntax; this pass records the observed retry without changing that text.
- Audio controls/globs, audition keys and compare remain the deliberate scope of briefs 23–25.
