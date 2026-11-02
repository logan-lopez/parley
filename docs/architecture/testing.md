---
sources: ["apps/server/scripts/", "apps/desktop/scripts/screenshots.ts", "apps/server/trials/", "apps/server/fixtures/", "packages/protocol/src/ask.test.ts", "apps/server/src/show-files.test.ts", "apps/server/src/show-edits.test.ts", "apps/server/src/show-media.test.ts", "packages/protocol/src/media.test.ts", "apps/desktop/src/forms/media.test.ts", "apps/desktop/src/forms/player.test.ts", "apps/desktop/src/forms/audition.test.ts", "apps/desktop/src/asks/persist.test.ts", "apps/desktop/src/asks/store.test.ts", "apps/desktop/src/forms/schemas.test.ts", "apps/desktop/src/forms/markdown.test.ts", "apps/desktop/src/forms/preview.test.ts"]
---
# Testing

How Parley is checked without a person at the keyboard or a real client: unit tests for the pure
parts, stand-ins for each side of the socket and for an MCP Apps host, and a harness that runs real
models against a fake app.

**History:** [brief 1](../briefs/archive/01-hub-and-lifecycle.md) (`fake-ask`), [brief 3](../briefs/archive/03-trial-harness.md) (`fake-hub`, trials), [brief 7](../briefs/archive/07-inline-cards.md) (`fake-host`), [brief 12](../briefs/archive/12-capture-question.md) (the `capture` scenario), [brief 19](../briefs/19-usage-report.md) (`usage`), [brief 16](../briefs/16-show-blocks.md) (the server's vitest, `show-file`), [brief 17](../briefs/17-editable-show.md) (`show-edits.test.ts`, `show-edit`), [brief 21](../briefs/21-dont-ask-again.md) ("Don't ask again here"), [brief 22](../briefs/22-media-images.md) (media), [brief 23](../briefs/23-media-sounds.md) (sounds, `media: audio` trials)

The commands are in [`AGENTS.md`](../../AGENTS.md#commands). This page is what each one covers
and when to reach for it.

## How it works

- **Unit tests** (vitest):
  - `packages/protocol`: input validation, the compiler and the answer shaper, `fileMarkdown`, and
    that the fixtures cover every question type (`ask.test.ts`).
  - `apps/server`: `readShowFiles` against a project in a temp directory under `$TMPDIR`: relative
    and absolute paths, `lines` slicing and clamping, `..` and a symlink out, refused names (and a
    link to one), binary, too big, a directory, the per-ask cap, cwd `/` and home, and that the
    hash is of the whole file (`show-files.test.ts`). `applyShowEdits` in a fresh temp project per
    test: unchanged (sent or not), written in place (same inode and mode) with its diff, CRLF
    kept, a conflict (the file rewritten between read and answer), the file deleted, the file
    swapped for a symlink out, a read-only file (the write error), and a diff over the cap
    (`show-edits.test.ts`).
  - `apps/desktop`: the history file's startup fold and which screenshot folders have aged out
    (`persist.test.ts`), the store's hub handlers
    (`resolved`, `inline`) through the real hub client with Tauri mocked (`store.test.ts`), and
    every fixture's compiled schema under JSON Forms' AJV settings and under strict mode with the
    `x-*` keywords declared, plus what a review and a capture accept (`schemas.test.ts`), and
    what counts as a color, palette parsing and the markdown it renders to, preview fences
    included (`markdown.test.ts`, in Node, so without `CSS.supports`), and the preview builder:
    the info string, clamping, the scale, what's stripped, the base style's place, SVG repairs
    and failures, and the cache, each picture re-parsed as the image's XML would be
    (`preview.test.ts`, in jsdom). Themes: the bundled pair reproduces the old colors, inn's
    files parse, and errors name the file (`theme.test.ts`); folder precedence and fallbacks
    (`load.test.ts`); the setting, `settings.json` and its `sound` (`setting.test.ts`); and no color literal
    outside `src/theme/` (`no-color-literals.test.ts`) ([themes](themes.md)).
  - Project media: `media.test.ts` in the protocol checks markdown discovery across every field,
    code/scheme exclusions, glob refs and `x-media`; `show-media.test.ts` checks project/secret
    refusals, sniffing (images and every sound format, and what isn't one), symlinks, caps, globs
    (sorted, dotfiles, the 12-variant cap, no match, a secret or non-sound match, globs in
    directory names, image globs, every variant counted against 200) and inline encoding.
    Desktop `forms/media.test.ts` mounts the real Markdown component for status, load/error/open
    behavior, shared grants, and sound chips (variants and duration, one playing at a time,
    disabled states, focus kept); `forms/player.test.ts` drives the player on a fake element
    (order, gap, skips, stop, stale callbacks, durations); `forms/audition.test.ts` mounts real chips
    under `useAudition` (the cycle and its wrap, Shift+`p`, Esc stopping the event only while a
    sound plays, a row without chips, the next-chip marker, autoplay's rules). `markdown.test.ts` checks escaped
    placeholders and chips with no model-supplied `src`; the `media` gallery fixture draws a
    question, option preview and show image, an audition review (three takes per item, one a
    glob of three WAVs) and a choice whose options preview takes, covered by the AJV fixture sweep.
  - `apps/desktop/src-tauri` (`cargo test`): a line through the hub keeps its key order, which is
    the question order (`hub.rs`), and media hash/changed/missing/refused checks (`media.rs`).
- **`fake-ask`** (`scripts/fake-session.ts`) acts as one server session without an MCP client:
  it connects to the hub, sends a form and prints the outcome. It takes `ask` tool input (a bare
  name like `choice` resolves to `packages/protocol/fixtures/choice.json`), which goes through the
  tool's validation, `readShowFiles` and `readShowMedia` (against where `pnpm` was run, so run
  `show-file`, `show-edit` and `media` from the repo root), compiler, `applyShowEdits` (so an edited `show-edit` changes
  `packages/protocol/fixtures/files/settings.example.json`; `git checkout` it after) and shaper, or a raw `FormSpec` (sample:
  `apps/server/fixtures/sample.json`). Ctrl-C kills it without a cancel, which exercises the
  app's disconnect path.
- **`fake-hub`** stands in for the app on a socket, logs every ask (`--log`), and answers on a
  script: `first`, `second`, `last`, `other:<text>`, `skip`, `none`, `delay:<s>:<policy>` (for a review, `first` and `last` give every item the first
  decision, `second` gives the first item the second, and `other:<text>` does that with the text
  as its comment, reading the decisions from the items' enum, so approve and reject without
  `decisions`; for a
  text draft, `first` sends it unchanged and `other:<text>` appends the text as its last line; a
  capture gets `other:<text>` as pasted text, or 'as you see fit', and never a screenshot; a show
  gets nothing, except an editable one: `other:<text>` adds the text as the file's last line, and
  every other policy sends it unchanged, with its `base`). Each
  ask takes the next `--reply`; the last repeats. `remember:<policy>` answers as `<policy>` does
  and sends `remember` for every choice and boolean question. `--old-app` rejects `resolved` as an app from
  before inline cards does. Point a server at it with `PARLEY_SOCKET` and `PARLEY_NO_LAUNCH=1`.
- **`fake-host`** stands in for an MCP Apps host (Claude Desktop). It advertises the extension,
  spawns the server (from source, or `--server dist`) and a `fake-hub` per scenario, plays both the
  model and the card, and prints pass or fail per scenario: `card-wins`, `window-wins`, `skip`,
  `slice`, `unknown-id`, `path`, `capture` (an image capture goes to the window, a text-only one
  inline), `show-file` (a server started in the repo root returns `_meta["parley/files"]`, the
  card compiles them with content, the window gets them in the form, the answer has no line for
  the shows, and a second server started from `/` returns the "no project directory" error and
  shows nothing; `Session.connect(cwd)` starts that one on the same hub), `media` (image data
  URLs and references reach only the card metadata, a sound glob expands to its variants in
  order and never goes inline, the window gets references only, answers work, and refused media
  sends no form), `show-edit` (a server
  started in a scratch project under `$TMPDIR`: the card sends an edited file, `ask_wait`'s text
  says it was saved and carries the diff, the file on disk changed, and a second `ask_wait` gets
  the same text rather than a conflict), `old-app`, `plain`.
- **The gallery** renders every fixture through the real card without the hub
  ([the card](card-ui.md#how-it-works)). A show of a file under `packages/protocol/fixtures/files/`
  loads there (`show-edit`'s settings); any other path stays unloaded.
- **`screenshots`** (`apps/desktop/scripts/screenshots.ts`) draws the gallery headless for
  [What it looks like](../guide/screenshots.md) and the README: Vite on its own port (1430 up,
  no HMR), Playwright's WebKit (the window is WKWebView), each fixture in light and dark at 2x,
  clipped to the gallery's 440 x 600 frame, into `docs/guide/images/cards/`. Fixture names narrow
  it. Playwright is pinned exactly, since each release wants its own browser build
  (`pnpm exec playwright install webkit` if it's missing). The window shot
  (`docs/guide/images/app.png`) is taken by hand.
- **`usage`** (`apps/server/scripts/usage.ts`) measures how Parley gets used in real work from
  `$APPDATA/history.jsonl` (or `--history <file>`, synthetic fixture in
  `apps/server/fixtures/usage-history.jsonl`), narrowed with `--since YYYY-MM-DD` (local time, as
  are the dates it prints), as markdown or `--json`. It reports volume, outcomes, time to answer,
  form shape, agreement (recommendations, lead review decisions, unchanged drafts, and asks where
  nothing changed), option sets asked across 3+ sessions, and markdown features. `--transcripts
  [<dir>]` reads Claude Code's session `.jsonl` files under `~/.claude/projects` for inline vs
  backgrounded vs bounced calls, every error in each bounce by Zod path, tool calls made while an
  ask was backgrounded, and asks per session (a subagent's transcript counts with its parent
  session). Read-only. The default output is meant to be pasted into the repo, which is public:
  projects show as `project-1`, `project-2`… by count, and home paths as `~`. `--projects` prints
  the real names and `--examples` adds free-text choice answers and notes; both are for reading
  locally.

## The trial harness

`pnpm --filter @parley/server trial` runs the prompts in `apps/server/trials/prompts/` through
real clients (Claude Code in print mode, Codex) against `fake-hub`, and scores each run: whether
the model asked when it should and not when it shouldn't, whether its first call was valid,
whether it used the answer, and whether it re-asked after a skip. For `standing-commit`, which
replies `remember:first` and then `first`, it also scores whether the model drafted a line for
`AGENTS.md` in a `text` question and saved it only after the draft was answered (the order comes
from the client's event stream; the save itself from the diff). A prompt's `reply:` may repeat,
one line per ask in order. A prompt with `media: audio` (`sound-audition`) also scores whether an
ask carried a sound in `x-media` and no form named a command-line player. `apps/server/trials/README.md`
has the run options (including `--score` and `--summary` to re-score a saved run), what a run
does, the prompts, the scoring and the baseline.

- Runs use the built bundle, in a throwaway copy of `trials/project/`, with the server on a socket
  in its own short directory under `$TMPDIR`.
- Claude Code runs with `--setting-sources project,local --strict-mcp-config
  --no-session-persistence`, so user settings and the global `CLAUDE.md` don't load. The project's
  `.claude/settings.local.json` denies `AskUserQuestion`. `--bare` and a scratch `HOME` both break
  OAuth.

## Rules worth keeping

- **Run `fake-host`** after touching the tool surfaces, the ask lifecycle or `AppClient`.
- **Run the trials** after changing anything model-facing: the tool schema or description, the
  server instructions, or the result text. Compare against the baseline. Skip them otherwise: they
  run real clients and cost time and tokens.
- **Socket paths:** macOS caps them at 104 bytes, so put a `fake-hub` socket under `$TMPDIR`.
- **A new question shape gets a fixture** in `packages/protocol/fixtures/`: the gallery,
  `fake-ask`, `schemas.test.ts` and `screenshots` pick it up from there. Give it a section on
  [What it looks like](../guide/screenshots.md).
- **Rerun `screenshots`** after a visible change to the card or a fixture, and commit the PNGs
  with it.
- **Native behavior is checked by hand.** Nothing automated drives the real window, the panel,
  notifications or the hotkey; briefs list those as hands-on checks for Logan.
