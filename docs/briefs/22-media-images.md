---
size: M
size-note: "server, Rust grant, renderer and a trial prompt; the asset protocol hasn't been run here yet"
status: awaiting-review
---
# Brief 22: Images from the project, in any markdown

Read `AGENTS.md`, [`README.md`](README.md), [brief 16](16-show-blocks.md), [the form
spec](../architecture/form-spec.md), [the ask tool](../architecture/ask-tool.md) (Show files),
[the card](../architecture/card-ui.md) (Markdown, Previews, the platform adapter), [inline
cards](../architecture/inline-cards.md), [the desktop shell](../architecture/desktop-shell.md)
and [testing](../architecture/testing.md) first.

**Prerequisites:** none beyond `main`. Briefs 23 (sounds), 24 (audition keys) and 25 (compare)
build on this one; the parts they use are marked **pinned**.

## Goal

Let an agent put an image file from the project in front of Logan by writing
`![caption](path/to/shot.png)` in any markdown Parley renders: question text, an option's
`preview`, a review item's `preview`, a show's `content`. Today the renderer drops images on
purpose (`forms/markdown.ts` disables markdown-it's `image` rule, since they'd load remote URLs),
and a show `path` to a PNG is refused as binary. So agents tell Logan to run a terminal command to
see a headless screenshot, and he leaves the form to look.

From real use (Logan's history, 2026-11-02): five asks pointed him at fifteen screenshots this
way, two to six per ask, every one inside the asking session's project, and two of the asks were
before/after pairs (brief 25 is for those).

The brief starts with a **go/no-go spike**: one PNG and one Ogg Vorbis file loaded through Tauri's
asset protocol in the dev app. A no-go on the PNG stops the brief; the Ogg result is recorded for
brief 23 and doesn't stop anything here.

## Decisions already made

- **Reference and hash, no copies** (Logan, 2026-11-02). The form carries each file's path,
  sha256 and size; the window reads the file from disk when it draws it. History doesn't keep a
  snapshot of media: a file that changed or is gone says so instead of showing the new one.
  Copying into `$APPDATA/media/` was rejected: an audition round is 100+ files, each round again.
  Decision file: [`media-by-reference`](../decisions/media-by-reference.md).
- **The server is the gate, as for show files** ([files in shows](../decisions/files-in-shows.md)):
  inside the cwd after `realpath`, the secret-name list, no path when the cwd is `/` or home.
  Nothing outside the project, and the asset scope never grows to `~` (ideate, 2026-11-02).
- **No base64 media in the form or on the wire to the window** (ideate, 2026-11-02): one audition
  references 122 files, and every hub line, history line and reconnect re-send would carry them.
- **Inline card: images inline up to a cap, sounds window-only** (Logan, 2026-11-02). Images go to
  Claude Desktop's card as `data:` URLs in the `ask` result's `_meta`, like show files. Decision
  file: [`media-in-the-inline-card`](../decisions/media-in-the-inline-card.md).
- **The Ogg check lives here, as step 1** (Logan, 2026-11-02), since this brief sets up the asset
  protocol and CSP anyway.
- **Markdown syntax, not a question type** (ideate, 2026-11-02): a type would count against the
  1–4 and couldn't sit in an option's preview, where takes and alternatives go.

## Already checked

- **Tauri 2.12.2** is the locked version (`apps/desktop/src-tauri/Cargo.lock`, 2026-11-02).
  `Manager::asset_protocol_scope()` needs the `protocol-asset` Cargo feature on `tauri`, and
  `Scope::allow_file(path)` grants one file at runtime (`tauri-2.12.2/src/scope/fs.rs:370`).
  Runtime grants don't persist across restarts (that needs `tauri-plugin-persisted-scope`, which
  we don't want: the app re-grants when it renders a form).
- **The asset protocol answers range requests** (`tauri-2.12.2/src/protocol/asset.rs:98`, 206
  with `Content-Range`), which WebKit's `<audio>` needs (brief 23).
- **URL shape on macOS:** `asset://localhost/<percent-encoded absolute path>`
  (`protocol/mod.rs:32`, `origin`); `convertFileSrc(path)` from `@tauri-apps/api/core` builds it.
  The CSP source is `asset:`, plus `http://asset.localhost` for Windows, which Parley doesn't
  target (Tauri docs, security/csp, via Context7, 2026-11-02).
- **`app.security.assetProtocol`** in `tauri.conf.json` takes `enable: true` and a `scope`; the
  static scope can be empty (`[]`) with every grant made at runtime (Tauri docs,
  security/asset-protocol, via Context7, 2026-11-02). Unverified: whether `.godot/`-style
  dot-prefixed path segments need `requireLiteralLeadingDot: false` for a runtime `allow_file`.
  The spike checks it with a file under a dot directory.
- **Ogg Vorbis in WebKit:** reported as supported from Safari 18.4 (macOS 15.4). This machine is
  macOS 27.0. Not run here (web search, 2026-11-02; MDN's compatibility data was a pending
  change). Brief 23 relies on step 1's answer.
- **The CSP today** (`tauri.conf.json:25`, `vite.config.ts:12`): `img-src 'self' data:`, no
  `media-src` (so it falls back to `default-src 'self'`), `connect-src ipc: http://ipc.localhost`.
- **The trial harness** runs prompts from `apps/server/trials/prompts/*.md` (frontmatter
  `expect`, `reply`, `match`) against a copy of `apps/server/trials/project/`.

## Open questions

- **Opening an image in Preview.** Default: a click on a drawn image opens the file with the
  opener plugin's `openPath`, permission `opener:allow-open-path` scoped to `$HOME/**`, called
  only for paths in the form's `x-media`. If the plugin's scope can't be that narrow in practice,
  fall back to a Rust command that opens only granted paths.
- **Size caps.** Default: each image up to 25 MB, and up to 200 media files per ask (brief 23's
  variants count one each). The inline card's `data:` URLs: 2 MB per image and 8 MB per ask, past
  which the card shows the caption and "Open in the Parley window".
- **SVG files in `![]()`.** Default: refused with a message pointing at a `show` with `path`,
  which already draws SVG themed. They'd draw safely as `<img>`, but untouched by the theme.

## Shape

### The protocol (`packages/protocol/src/`)

- **`x-media`, pinned.** The compiled schema gets one root key, `x-media`, a map from the src as
  the agent wrote it to an entry:

  ```ts
  type MediaFile = { path: string; abs: string; sha256: string; bytes: number; mime: string }
  type MediaEntry = { kind: 'image' | 'audio'; files: MediaFile[] }   // an image has exactly one file
  type Media = Record<string, MediaEntry>
  ```

  `path` is project-relative (as in `x-source`), `abs` the absolute real path the window loads.
  Brief 23 adds `kind: 'audio'` entries with several `files`; brief 25 reads image entries. Put
  the types in `form.ts` next to `ShowFiles` (or a new `media.ts`), and the caps beside the show
  caps.
- **`compileQuestions(input, files?, media?)`** takes the resolved media the same way it takes
  show files and writes `x-media`. Without it (the gallery, `fake-ask` before resolving), refs
  render unresolved (below).
- **Finding refs.** One function, `mediaRefs(text): string[]`, shared by the server and the
  renderer, that finds markdown image srcs (`![alt](src)` and `![alt](<src with spaces>)`), skipping
  code spans and fenced blocks except the fences that later briefs claim (brief 25's `compare`).
  It runs over every markdown field the schema has: `question`, option `description` and
  `preview`, review item `detail` and `preview`, show `content`, and a show file's text when it's
  markdown. Srcs with a scheme (`http:`, `data:`, `file:`) aren't refs: they stay unrendered.
- The `ask` input schema (Zod) doesn't change.

### The server (`apps/server/src/`)

- **`show-media.ts`:** `readShowMedia(input, files, projectDir = process.cwd())` returns `Media`
  or throws a `ShowFileError` with a model-facing message, like `readShowFiles`. Reuse that file's
  project rule and secret-name check: export them from `show-files.ts`, don't copy them. Per ref:
  inside the project, not a secret, a regular file, under the cap, and its first bytes sniffed as
  PNG, JPEG, GIF or WebP (not by extension). Hash the bytes (sha256), keep `bytes` and the sniffed
  `mime`. Messages say what to do: "`shots/a.png` isn't in the project…", "`notes.txt` isn't an
  image (PNG, JPEG, GIF or WebP)…", "SVG: use a `show` with `path`".
- Call it next to `readShowFiles` in `tools/ask.ts` and `tools/inline.ts`, pass the result to
  `compileQuestions`, and for the inline card put the images under the caps in
  `_meta['parley/media']` as `data:` URLs keyed like `x-media`. Never in `structuredContent` or
  the text.
- **The tool description** (`tools/ask.ts:27`, the markdown paragraph): one sentence, such as
  "An image file in the project, written as `![caption](path)`, is shown as the picture: use it
  for screenshots instead of asking the user to open them." This is model-facing text: the trial
  rerun below is part of the brief.

### The shell (`apps/desktop/src-tauri/`)

- `Cargo.toml`: `tauri` gains the `protocol-asset` feature.
- `tauri.conf.json`: `app.security.assetProtocol: { enable: true, scope: [] }`, and the CSP's
  `img-src` gains `asset:`; `media-src 'self' asset:` is added now so brief 23 doesn't touch the
  CSP again. Same change in `vite.config.ts`'s dev header (AGENTS.md: they must match).
- **`allow_media`, pinned.** A Rust command in a new `media.rs`: takes `[{ abs, sha256 }]`, and
  for each returns `ok`, `changed` (the bytes hash differently), `missing` or `refused` (not an
  absolute path to a regular file). Only `ok` paths get `asset_protocol_scope().allow_file`. Hash
  with the `sha2` crate. It doesn't parse hub messages or know the form: the webview hands it
  paths. The hash match is the check that the file is the one the server vetted. Register it in
  `lib.rs`, the app manifest in `build.rs` and `capabilities/default.json` (`allow-allow-media`).
  Keep it small.

### The window (`apps/desktop/src/`)

- **`platform.ts`:** `mediaUrls(entries) → Promise<Map<sha256, { url, status }>>`: in Tauri,
  calls `allow_media` once per form and maps `ok` files through `convertFileSrc`; in the inline
  card, overridden through `setPlatform` to look the images up in `_meta['parley/media']`; in the
  gallery, files under `packages/protocol/fixtures/files/` load through Vite's dev server. Cache
  the result per form for the session. Renderers never import `@tauri-apps/*`.
- **`forms/markdown.ts`:** re-enable `image`, with a render rule that never emits a `src` from
  model text. It emits a `figure.md-media` with `data-media="<src as written>"`, the caption from
  the alt text, and the path in a muted line. `Markdown.vue`'s `paint()` fills the `img` from
  `mediaUrls`, as previews are filled after render. The CSP would block a stray remote `src`
  anyway; the rule keeps it from being tried.
- **States:** loading; drawn (at natural size, the column's width at most: `max-width: 100%;
  height: auto` is fine here, since bitmaps aren't foreignObject previews); `changed` ("`path`
  changed since this was asked"); `missing` ("`path` is gone"); unresolved (no `x-media` entry:
  "`path` isn't loaded here"). Each failed state keeps the caption and path so the answer still
  makes sense. A click on a drawn image opens it in Preview (Open questions).
- Styling from tokens only (`no-color-literals.test.ts`).

## Out of scope

- Sounds and globs (brief 23), playback keys (brief 24), the compare fence (brief 25).
- Copying media into Parley's data directory, thumbnails in history's list view, images back to
  the model as MCP image content (a [decision](../decisions/pasted-screenshots.md) already says
  paths), and remote URLs.
- Paths outside the project, and loading anything the server didn't resolve.
- Capture's thumbnails: they stay `data:` thumbnails of the app's own PNGs.

## Build order

1. **Spike (go/no-go).** In `pnpm app` (ask Logan first: it launches the dev app, and the
   installed Parley has to be quit since they share one socket), with the feature, the CSP change
   and a throwaway call to `allow_file`: load a PNG from a project's dot directory (say
   `.godot/screenshots/x.png`, or any `.dot/x.png`) in an `img`, and an Ogg Vorbis file in an
   `<audio controls>`. **Go** if the PNG draws. Record in the report whether the Ogg plays and
   seeks, and whether the dot directory needed `requireLiteralLeadingDot: false`. **No-go**
   (the PNG won't draw through the asset protocol): stop, report what failed, and don't build the
   rest. The fallback is a Rust command returning bytes for a `blob:` URL, which needs Logan's
   call before it's built.
2. `x-media`, `mediaRefs`, and `compileQuestions`, with protocol tests.
3. `show-media.ts` and its tests (inside/outside, symlink out, secret names, sniffing, caps, the
   SVG refusal).
4. `allow_media`, the platform function, the markdown rule and states.
5. The inline card's `_meta` images.
6. Fixture, docs, the tool description, then the trial run.

## Acceptance

- `pnpm typecheck` and `pnpm build` pass.
- `pnpm --filter @parley/protocol test`: `mediaRefs` finds refs in every markdown field, skips
  code spans, fences and URLs with a scheme; `compileQuestions` writes `x-media`.
- `pnpm --filter @parley/server test`: `readShowMedia`'s refusals each have a test, including a
  symlink that leads out, a `.png` that's really text, an oversize file, and a secret name.
- `pnpm --filter @parley/desktop test`: the new fixture compiles under AJV; the markdown rule
  emits no `src`.
- A fixture `packages/protocol/fixtures/media.json` with an image in a question, an option preview
  and a show's content, and a small PNG under `fixtures/files/`. In the gallery
  (`http://localhost:1420/?gallery&fixture=media`), it draws in all three places, in light and
  dark. `pnpm --filter @parley/desktop screenshots media` adds it to `docs/guide/images/cards/`.
- `pnpm --filter @parley/server fake-host` passes (the tool surfaces changed).
- A trial prompt, `apps/server/trials/prompts/screenshot-look.md`, with a PNG committed in the
  trial project: the agent has a screenshot of a layout change and asks which way to go. `expect:
  ask`. Run it with `pnpm --filter @parley/server trial --prompt screenshot-look --runs 3`, then
  `report-look` and `plan-check` once each, since the description changed. Record the results in
  the trials README.
- Docs: the guide's [question types](../guide/question-types.md) (or a short new guide page on
  pictures in questions), the root README's feature list, and the architecture pages this
  touches (form spec, the ask tool, the card, inline cards, the desktop shell for the asset
  protocol and `allow_media`).

By hand, for Logan (ask before launching anything):

- In the installed build (`pnpm install:desktop`, then quit and reopen Parley), an agent in a
  game project shows a headless screenshot with `![…](…)`: it draws, a click opens it in Preview,
  and after the file is overwritten, the ask in history says it changed.
- In Claude Desktop, an ask with an image shows it in the inline card.

Then stop. Report the spike's Ogg result plainly, since brief 23 starts from it. Ask Logan before
merging anything.

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
