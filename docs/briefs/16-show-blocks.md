---
status: awaiting-review
---
# Brief 16: Show blocks, from text or a file

Read `CLAUDE.md`, [`README.md`](README.md), [brief 14](14-fenced-previews.md), [the form
spec](../architecture/form-spec.md), [the ask tool](../architecture/ask-tool.md), [inline
cards](../architecture/inline-cards.md), [the card](../architecture/card-ui.md), [asks and
history](../architecture/asks-and-history.md) and [testing](../architecture/testing.md) first.

**Prerequisites:** brief 14 lands first (it's next in Open). This brief only uses its
` ```html preview ` / ` ```svg preview ` fences. If 14 ended in no-go, `.html` and `.svg` files show
as code here, and nothing else changes. Briefs 17 and 18 build on this one, and the parts they use
are marked **pinned**.

## Goal

Give an agent a way to put something in front of Logan that isn't a question: a plan, a file, a
design. Then it can ask about that thing in the same card. Right now that has two homes, and both
are wrong. The question text is meant to be a line or two. An option's `preview` belongs to one
option and is hidden until that option is focused.

1. **A `show` question type.** A block with nothing to answer. It has a header chip, a lead line
   (`question`), and a body, rendered as markdown in its own pane. The questions about it come
   after it in the same `ask`.
2. **`path` instead of `content`.** The agent names a file in the project, optionally a line range,
   and the server reads it. The agent doesn't spend output tokens retyping a 300-line file, and
   Logan sees the file as it actually is, not a copy that may have drifted. Markdown files render as
   markdown, HTML and SVG files are drawn as brief 14 pictures, and anything else shows as a code
   block with its language.

Why now: brief 14 makes HTML visible in a card, but only in small option previews. The ideate on
2026-10-14 found that the card has no place for a large body, and no way to show a file without the
agent pasting it into the call. A data point on demand, from the same session: across 326 asks and
674 questions in Logan's `history.jsonl`, 2 question texts and 1 preview ran past 1,000
characters. Agents aren't fighting the card's size today. That's why this brief puts its weight on
`path` rather than on pasted bodies. Logan chose to give this first session the most effort.
Briefs 17 (editing a shown file) and 18 (a card that follows the file) both build on it.

## Decisions already made

- **`show` is a question type, not a form-level field.** It fits the questions array, it keeps its
  place among the questions, and a form can carry more than one. (Ideate and Logan, 2026-10-14.)
- **It has no answer of its own.** The reaction comes from the questions next to it, such as a
  choice or a review with decisions. A form needs at least one question that isn't `show`. A form
  of only shows would block the agent with nothing to send back. That's `notify`, which is parked.
  (Ideate, 2026-10-14.)
- **The server reads the file, not the app.** The server's cwd is the agent's project, so relative
  paths resolve the way the agent means them. The app's fs scope stays limited to its own data
  directory. The inline card gets the content the same way the window does. (Ideate, 2026-10-14.)
- **Project directory only.** `path` resolves against the server's cwd. After `realpath`, it must
  stay inside it, so a symlink that leads out is refused. Secret-looking files are refused too.
  When the cwd is `/` or the home directory, the client has no project and `path` isn't available.
  (Logan, 2026-10-14.)
- **History keeps what you saw.** The read file goes into the compiled form, so `history.jsonl`
  holds a snapshot, capped by size. The refusal list and the project-only rule are what keep
  secrets out of history. (Ideate default, taken with the project-only choice, 2026-10-14.)
- **`question` stays required on every type.** On a show it's the lead line ("Here's the plan.
  The questions below are about it."). This keeps the input schema's `required` list as it is.

Don't revisit these silently.

## Already checked

- **The inline card compiles the questions itself** from the host's tool input
  (`apps/desktop/src/mcp-app/McpApp.vue`, `ontoolinput` → `compileQuestions`). A file read on the
  server therefore never reaches the card unless the server sends it. The card already reads the
  `ask` result's `_meta` (`parley/askId`), so `_meta` is the channel. Claude Desktop shows the
  model only a result's text content ([inline cards](../architecture/inline-cards.md#claude-desktop)),
  so file text in `_meta` doesn't enter the model's context. (2026-10-14, code and arch page.)
- **Server cwd per client.** `history.jsonl` sessions, checked 2026-10-14: every `claude-code`
  session has its project root as `cwd`, and `claude-ai` (Claude Desktop's chat) has `/`. Desktop's
  agent-mode server (`local-agent-mode-parley`) doesn't appear in history, so its cwd is unknown.
- **`fake-ask` already runs in the invoking directory.** `scripts/fake-session.ts:35` does
  `process.chdir(process.env.INIT_CWD)`, so a fixture's relative `path` resolves against wherever
  `pnpm` was run. Run it from the repo root.
- **Hub line limit:** 1 MiB per line (`wire.ts`, `MAX_LINE_BYTES`). The caps below keep a form well
  under it, even after JSON escaping.
- **Brief 14's fence syntax:** `html preview` / `svg preview`, then optional `width=N height=N`.
  Width is clamped to 200–800 and height to 40–800 (brief 14, Open questions). The picture is
  scaled down to fit the card.
- **Vitest** is in `packages/protocol` and `apps/desktop` (`^5.0.3`), not in `apps/server`.

## Open questions

- **Caps.** Default: inline `content` up to 20,000 characters, as a Zod max with a message. A file's
  text, after `lines` slicing, up to 100,000 characters, and at most 2 MB read from disk. Shown
  content up to 200,000 characters per ask.
- **The pane's height.** Default: in the window, at most 55% of the viewport, scrolling inside. In
  the inline card, at most 480 px, scrolling inside (the card itself has no inner scroll).
- **The picture size for HTML and SVG files.** Default: `width=640 height=480`, scaled to fit.
- **A wider window for big shows.** Default: no. The window stays 440×600 and resizable. Logan's
  hand check decides whether it needs a follow-up.

## Shape

### 1. Tool input (`packages/protocol/src/ask.ts`) (**pinned**: model-facing)

Add `'show'` to `QUESTION_TYPES` and `WIDGETS`. New fields on `question`:

```ts
content: z.string().min(1).max(20_000, 'show content is 20,000 characters or fewer; for a longer file, give its `path` instead').optional(),
path: z.string().min(1).optional(),
lines: z.tuple([z.number().int().min(1), z.number().int().min(1)]).optional(),
```

`superRefine` messages, in the existing style (each one tells the model what to do instead):

- A show with both `content` and `path`, or with neither.
- `lines` without `path`, or with `start > end`.
- `content`, `path` or `lines` on a type other than `show`.
- `required` on a show: "show blocks have nothing to answer; drop `required`".
- Every question is a show: "a show block has nothing to answer; add at least one question about
  it in the same call".
- Fields from other types on a show (`options`, `items`, `draft`, `decisions`, `accept`) are
  already caught by the existing per-field checks. Make sure the messages read right for `show`.

Shows count toward the 1–4 questions.

### 2. Resolved files (**pinned**: 17 and 18 extend it)

In `packages/protocol/src/form.ts`:

```ts
// A show block's file, read by the server. Keyed by question id.
export interface ShowFile {
  path: string                 // as the agent gave it, relative to the project
  text: string                 // the file, or the requested lines
  lines?: [number, number]     // the range actually shown, after clamping to the file
  totalLines: number
  sha256: string               // of the whole file's bytes at read time
}
export type ShowFiles = Record<string, ShowFile>
```

`sha256` is the whole file's hash, even when `lines` is set. Brief 17 compares against it before
writing.

### 3. Compiling (`ask.ts`)

`compileQuestions(input, files?: ShowFiles)`. A show compiles to:

```ts
{
  'x-widget': 'show', title: q.header, description: q.question,
  type: 'null',
  'x-content'?: string,   // markdown: q.content, or fileMarkdown(file.path, file.text)
  'x-source'?: { path, lines?, totalLines },   // when it came from a file
}
```

It's never in `required`. A path-backed show compiled without its file gets `x-source: { path }`
and no `x-content`. The renderer shows that as loading or unavailable (§6). The schema tests
compile fixtures this way.

`fileMarkdown(path: string, text: string): string` is pure. It lives in a new module with no Zod,
`packages/protocol/src/show.ts`, exported from the root entry (`index.ts`). That lets the window's
renderer import it too, which brief 17 needs, without pulling in Zod. It picks by extension, case
insensitive:

- `.md`, `.markdown`, `.mdx`: the text as is.
- `.html`, `.htm`: a ` ```html preview width=640 height=480 ` fence (brief 14).
- `.svg`: a ` ```svg preview width=640 height=480 ` fence.
- Anything else: a fence whose language comes from a small map (`ts`, `tsx`, `js`, `json`, `rs`,
  `vue`, `css`, `sh`, `py`, `toml`, `yaml`/`yml`, `php`, `lua`, …; unknown means no language). The
  fence is longer than any backtick run in the text, the same rule as `describeCapture`.

`'x-content'` and `'x-source'` must be declared in `schemas.test.ts`'s strict-mode keyword list.
Check that `type: 'null'` with no data passes JSON Forms' AJV and strict mode. If it doesn't, use
whatever does (no `type`, say) and record why on the form spec page.

Elicitation downgrade: a show has none. Note it in `form.ts`'s vocabulary comment.

### 4. Shaping (`shapeAnswer`)

A show produces no entry in `answers` and no line in the text. Its id is still taken in
`questionIds`, so the ids of the questions around it don't shift. The signature doesn't change
here. Brief 17 adds an argument.

### 5. Reading the file (`apps/server/src/show-files.ts`, **new**)

```ts
export class ShowFileError extends Error {}   // message is model-facing
export async function readShowFiles(input: AskInput, projectDir = process.cwd()): Promise<ShowFiles>
```

For each show with a `path`, in order:

1. **A project to read from.** If `projectDir` is `/` or `os.homedir()`: "This client didn't start
   Parley in a project directory, so `path` isn't available here. Put the text in `content`
   instead."
2. **Inside the project.** Resolve against `projectDir`, `realpath` both, and refuse anything whose
   relative path starts with `..` or is absolute: "`<path>` is outside the project
   (`<projectDir>`); show files from inside it".
3. **Not a secret.** Refuse by basename: `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`,
   `id_rsa*`, `id_ed25519*`, `id_ecdsa*`, `.netrc`, `.npmrc`, `.pypirc`, and anything under a
   `.git/` or `.ssh/` segment. The message: "Parley doesn't show `<path>`: it looks like it holds
   secrets".
4. **A readable text file.** Missing, a directory, over 2 MB, or a NUL byte in the first 8 KB
   (binary) each get their own message, and each says to fix the path or use `content`.
5. **Lines.** Clamp `end` to the file's last line. A `start` past the end is an error ("the file
   has N lines").
6. **Caps** from Open questions. Over the per-file cap: "`<path>` is N characters; show part of it
   with `lines`". Over the per-ask total, a message to match.

Hash the bytes as read (`node:crypto`). Decode as UTF-8. Keep the text as it is, line endings
included.

Add vitest to `apps/server` (the same `^5.0.3`, a `test` script) and
`apps/server/src/show-files.test.ts`. Cover: a relative path, `lines` slicing and clamping, `..`
out, a symlink out, a refused name, binary, too big, a directory, cwd `/`, and that the hash is of
the whole file. Use a temp directory under `$TMPDIR`.

### 6. The two surfaces

- **Blocking `ask`** (`tools/ask.ts`): `const files = await readShowFiles(input)` before
  `compileQuestions(input, files)`. A `ShowFileError` returns `isError` with its message, the same
  way an unreachable app does.
- **Inline `ask`** (`tools/inline.ts`): the same read and compile. A `ShowFileError` returns
  `isError` and shows nothing. Keep the files with the shown ask: add `files` to `Shown` in
  `ask-lifecycle.ts`, set through `showAsk`, because brief 17 diffs against them. Return them to
  the card in the result's `_meta['parley/files']`, next to `parley/askId`. Never put them in
  `structuredContent` or the text.
- **The card** (`McpApp.vue`): compile with `_meta['parley/files']` when the result has it. If the
  input has a path-backed show, hold the form until the result arrives instead of rendering
  `x-source` without content first.
- **`fake-ask`** (`scripts/fake-session.ts`): read files the same way before compiling, so
  `fake-ask show-file` from the repo root shows the real file.
- **`fake-hub`**: skip `show` properties when building data, so every reply policy still works
  with a show in the form.

### 7. The renderer (`apps/desktop/src/forms/renderers/ShowRenderer.vue`, **new**)

Registered in `renderers.ts` with `widgetTester('show')`.

- **Layout.** The header chip and `question` as in `QuestionFrame`. Below them, a pane with a
  hairline `--border` and the card's radius, holding `Markdown.vue` with `x-content`. It's capped
  at the Open-questions height and scrolls inside. With `x-source`, a small muted caption sits
  under the pane: `docs/plan.md`, or `src/index.ts · lines 10–80 of 212`.
- **No content.** With `x-source` but no `x-content`, the pane reads "`<path>` isn't loaded here".
  That's what the gallery and history show for a fixture compiled without files.
- **Keyboard** (`forms/keyboard.ts`, the contract): the root carries `[data-question]` and a new
  `[data-passive]`. The pane is the `[data-primary]`, with `tabindex="0"`, so Tab reaches it and
  the arrow keys, Page Up/Down and Space scroll it natively. The card's first focus on mount skips
  `[data-passive]` questions and lands on the first one with something to answer. A show has no
  `[data-pick]`, so digits do nothing while it's active. Write the attribute into the keyboard
  contract on the card page.
- **Read-only and history:** the same view. Nothing else changes in `AskCard.vue`. A show is
  never required, so it never shows up in "Still needs an answer".
- **Styles** in `styles.css`, with tokens only (`no-color-literals.test.ts`).

### 8. Tool description (`apps/server/src/tools/ask.ts`) (**pinned** wording, adjust lightly)

Add a bullet after `capture`:

> - show: something to look at, not answer, such as a plan, a file or a design. Give `content`
>   (markdown, up to 20,000 characters) or `path`, a file in the project that Parley reads, so you
>   don't repeat it (`lines: [start, end]` for part of it). Markdown files render, HTML and SVG
>   files are drawn as pictures, and other files show as code. Put the questions about it after it
>   in the same call, which needs at least one question besides show.

Leave the server instructions alone.

### 9. Fixtures

- `packages/protocol/fixtures/show.json`: a `show` with inline markdown `content` (a short plan
  with headings, a list and a code block), then a choice ("Go ahead?") and a review of its steps
  with Pass / Change / Cut decisions. This is the gallery's and the screenshots' show.
- `packages/protocol/fixtures/show-file.json`: a `show` of `docs/guide/question-types.md` and a
  second one of `packages/protocol/src/form.ts` with `lines`, then a boolean. This one is for
  `fake-ask` from the repo root. In the gallery it shows the "isn't loaded here" state.

### 10. Trial prompt and the pass

Add `apps/server/trials/prompts/plan-check.md`:

```markdown
---
expect: ask
reply: first
---
Write a short plan for adding a `--csv` output flag to tally in `docs/csv-plan.md`, then check the plan with me before you implement anything.
```

Add its row to the prompts table in `apps/server/trials/README.md`: "a plan to check: should put
the file in front of the user (`show` with `path`) and ask about it". Judge it by eye from
`questions`, recording for each run whether a `show` appears and whether it used `path` or
`content`.

Then run the full pass, `pnpm --filter @parley/server trial --runs 3`, because the tool
description grew. Report it against the baseline brief 14 left in `trials/README.md`, and replace
that baseline section with this one, dated. Call out whether uptake on the old prompts stayed
within noise, and whether any run used `show` where a plain question would do.

### Docs

- **Guide.** `question-types.md`: a "Show" section (what you see, the pane scrolling, Tab to reach
  it, the file caption, that it has nothing to answer). Update the intro's count of question types.
  `docs/guide/screenshots.md`: the `show` fixture. Update the root README's feature list.
- **Architecture.** `form-spec.md`: the type, its fields, `x-content`/`x-source`, `ShowFiles`, the
  caps, no downgrade. `ask-tool.md`: `readShowFiles`, the project rule and its errors. The Sources
  line gets `apps/server/src/show-files.ts`, and the `AGENTS.md` Areas row and
  `.claude/rules/ask-tool.md` get it too: run `python3 -I ~/.claude/skills/brief/scripts/areas.py .`
  from the repo root, which regenerates both from the Sources lines.
  `inline-cards.md`: `_meta['parley/files']`, and the card holding a path-backed form until the
  result arrives. `card-ui.md`: the renderer and `[data-passive]`. `testing.md`: the server's
  vitest and `show-files.test.ts`.
- **Decisions table** (`docs/briefs/README.md`): the rows this brief adds are already there. Edit
  them if the build changed one.

## Out of scope

- Editing a shown file, and diffs. That's brief 17.
- A card that updates when the file changes. That's brief 18.
- MCP roots as the project directory (for clients whose cwd is `/`). Use the cwd only.
- Images, PDFs and other binary files.
- `path` on option or review-item previews. Shows only.
- Widening the window for a show.
- Searching shown content in the history filter. It searches the path in `x-source`, not the text.

## Build order

1. Tool input, `ShowFiles`, compile, `fileMarkdown`, shaping, and their tests (protocol).
2. `show-files.ts` and its tests (server), wired into both surfaces, `fake-ask` and `fake-hub`.
3. The renderer, the keyboard change and the fixtures. Check them in the gallery.
4. The inline card and a `fake-host` scenario.
5. Docs, the tool description, then the trial pass.

## Acceptance

1. `pnpm --filter @parley/protocol test` passes, with the new validation messages, the compile of
   `show` with and without files, `fileMarkdown` per extension (including a backtick run longer
   than three), and no answer entry for a show.
2. `pnpm --filter @parley/server test` passes (`show-files.test.ts`).
3. `pnpm --filter @parley/desktop test` passes: `show.json` and `show-file.json` compile under
   strict AJV.
4. `pnpm typecheck` and `pnpm --filter @parley/server build` pass.
5. `pnpm --filter @parley/server fake-host` passes, with a new `show-file` scenario: an inline ask
   with a path-backed show returns `_meta['parley/files']`, the card compiles it with content, and
   a server started with cwd `/` returns the "no project directory" error.
6. Gallery, light and dark (headless Playwright WebKit is fine): `show` shows the pane scrolling
   inside, Tab reaching it, first focus on the choice, and Send working without touching the show.
   `show-file` shows the "isn't loaded here" state. Rerun `screenshots show` and commit the PNGs.
7. **Installed build** (it replaces Logan's running app, so ask him once and say it takes about
   five minutes): `pnpm install:desktop`, then Logan quits and reopens Parley. Then, from the repo
   root, `pnpm --filter @parley/server fake-ask show-file` shows the guide page rendered and
   `form.ts`'s lines as highlighted code, and the answer prints with no line for the shows.
8. The trial pass from §10, reported as described there.

By hand, for Logan:

- A show in Claude Desktop's inline card: a `content` one works, and a `path` one gets the "no
  project directory" error in the chat app. If agent mode (`local-agent-mode-parley`) gets used,
  note the `cwd` its asks show in history. Brief 17's Desktop check depends on it.
- Whether the 440-wide window is enough for a real plan, or a show wants a wider window.
- The next real "check this plan with me" moment: did the agent reach for `show` with `path` on its
  own?

Then stop. Ask Logan before committing.

## Report

Built 2026-11-02, every step. Acceptance 7 (the installed build) wasn't run: it waits on Logan.

### Built

- **Protocol** (`packages/protocol`). `show` in `QUESTION_TYPES` and `WIDGETS`; `content` (Zod max
  20,000 with the brief's message), `path` and `lines` on `question`, with the `superRefine`
  messages from §1 (`ask.ts`). `ShowFile`, `ShowFiles` and `ShowSource` in `form.ts`, and the
  vocabulary comment, no downgrade included. `compileQuestions(input, files?)` compiles a show to
  `type: 'null'` with `x-content` and `x-source`, never required. `shapeAnswer` skips shows, ids
  unchanged. New `show.ts` (root entry, no Zod): the four caps and `fileMarkdown`. Fixtures
  `show.json` and `show-file.json`.
- **Server** (`apps/server`). New `src/show-files.ts`: `readShowFiles` and `ShowFileError`, the
  six steps of §5. Wired into the blocking `ask` (`tools/ask.ts`) and the inline one
  (`tools/inline.ts`, `_meta['parley/files']`); `Shown.files` and `shownFiles()` in
  `ask-lifecycle.ts`. `fake-ask` reads files before compiling; `fake-hub` skips shows. vitest added
  (`^5.0.3`, a `test` script) with `src/show-files.test.ts`. The tool description's `show` bullet,
  as pinned.
- **Desktop** (`apps/desktop`). New `forms/renderers/ShowRenderer.vue`, registered for
  `x-widget: show`. `QuestionFrame` takes `passive` (sets `[data-passive]`, no "Optional").
  `keyboard.ts` documents `[data-passive]` and adds `firstToAnswer`, which `AskCard.vue` uses for
  first focus, the window-focus fallback and the no-focus digit target. Styles in `styles.css`
  (tokens only), 480 px under `html.inline`. `McpApp.vue` reads `_meta['parley/files']`, holds a
  path-backed form until it arrives, and shows an error result's message. The history filter
  searches `x-source.path`.
- **Tests and tools.** A `show-file` `fake-host` scenario, with `Session.connect(cwd)` to start a
  second server on the same hub from `/`. Trial prompt `plan-check.md` and its row.

### Deviations

- **No highlighted code (acceptance 7).** The card has no syntax highlighter: code blocks are
  plain monospace, and only ```` ```diff ```` colors its lines. A non-markdown file shows as a
  fenced block with its language on the `<code>` (`language-ts`), which is what the Goal and §3
  say ("a code block with its language"). Adding a highlighter is a bundle and CSP question of its
  own, so it's a follow-up, not part of this brief.
- **`required: false` on a show is accepted.** §1 says to refuse `required` on a show. Only
  `required: true` is refused: `false` is already true of a show, and brief 20's data says a
  bounce costs a round trip for nothing.
- **`ShowFile.path` is normalized,** relative to the project, with `./` and `..` folded and an
  absolute path made relative. §2 says "as the agent gave it, relative to the project"; the two
  differ only when the agent writes `./x` or an absolute path, and the caption reads better
  normalized.
- **A symlinked cwd counts as the project both ways.** The test caught it: macOS's `$TMPDIR` is
  under `/var`, which is `/private/var`, so an absolute path through the cwd was refused as outside
  after `realpath`. The lexical check now accepts a path inside either the cwd or its real path;
  the `realpath` check after it is unchanged.
- **More files than §6 named.** The inline card shows an error result's message ("This client
  didn't start Parley in a project directory…") instead of "Loading the question…" forever, and
  "Cancelled." when the host cancels before the files arrive. The history filter searches
  `x-source.path`, which Out of scope describes as the behavior. `AskCard`'s digit target with no
  focus, and its window-focus fallback, skip `[data-passive]` like first focus does.
- **The trial baseline.** §10 says to replace brief 14's baseline. Brief 20 added its own pass
  after it, so the new section compares with brief 20's pass (the latest) and replaces brief 14's
  `## Baseline`; brief 20's section stays, since its report points at it.
- **`areas.py` is gone.** `docket areas` replaced it and wrote the same Areas rows and rules.

### Defaults taken

- Caps: `content` 20,000 characters; a file's text 100,000 after `lines`, 2 MB on disk; 200,000
  per ask, `content` included (`packages/protocol/src/show.ts`).
- The pane: at most 55vh in the window, 480 px in the inline card, scrolling inside.
- HTML and SVG files as `width=640 height=480` pictures, scaled to fit.
- No wider window.

### Acceptance

1. `pnpm --filter @parley/protocol test`: **pass**, 112 tests (12 new for shows, 5 for
   `fileMarkdown`, including a run of four backticks).
2. `pnpm --filter @parley/server test`: **pass**, 14 tests in `show-files.test.ts`.
3. `pnpm --filter @parley/desktop test`: **pass**, 154; `show` and `show-file` compile under
   strict AJV with no warnings. `type: 'null'` works: JSON Forms' default UI schema makes no control
   for a property without a `type`, so `null` is the one that renders (on the form spec page).
4. `pnpm typecheck` and `pnpm --filter @parley/server build`: **pass**.
5. `fake-host`: **all 10 scenarios pass**, the new `show-file` included (10 checks: the files in
   `_meta` and not in `structuredContent` or the text, the card's compile with content, the window
   getting the form inline, no answer line for the shows, and a second server from `/` refused
   with nothing shown). Also passes with `--server dist`.
6. Gallery, headless WebKit, light and dark: **pass**, 12 checks per theme. The pane scrolls
   inside, first focus lands on the choice, Shift+Tab reaches the pane and ↓/Space scroll it, a
   digit on the pane picks nothing, and Send works without touching the show, with no line for it.
   `show-file` shows "isn't loaded here" for both files, with the captions, and first focus on the
   boolean. `screenshots show` rerun; the PNGs are in.
7. Installed build: **not run.** I asked before replacing the running app and got no answer in 30
   minutes. It's in the spot checks below.
8. Trial pass: **done**, `--runs 3 --keep`, in `apps/server/trials/README.md` as the new baseline.
   `plan-check` used `show` with `path` in 3/3 runs, never `content`. The old prompts stayed
   within noise: every one asked as often as in brief 20's pass, and all 33 calls were valid.
   `show` appeared three more times, all `content`: `dead-code-cleanup` twice, listing what it
   would remove (a `review` fits that better), and `changelog-draft` once, as a heads-up a line of
   question text would carry. That one is `show` where a plain question would do. Every `used`
   miss was read in the transcripts and is the label problem.

### Size

Sized unsized; this build ran in two sessions on 2026-11-02 with no compactions: `fa4b7b5a` (S, 7
active min) and `4fd5c479` (M, 24 active min, 52 wall). The trial pass and the 30-minute ask ran
in the background and aren't in active time. `docket sessions --brief 16` also counts `230b167a`
(2026-10-14, 6 min), probably the session that wrote the brief, and totals XL.

### Spot checks for Logan

- **The gallery** is running: <http://localhost:1420/?gallery&fixture=show> and
  `&fixture=show-file`. Tab to the pane, scroll it, send without touching it.
- **Installed build (acceptance 7).** `pnpm install:desktop` (about five minutes), quit Parley
  from the tray and reopen it, then from the repo root
  `pnpm --filter @parley/server fake-ask show-file`. Expect the guide page rendered as markdown,
  `form.ts` lines 1–50 as a `ts` code block (monospace, not colored), and an answer with one line,
  for "In step".
- From the brief: a show in Claude Desktop's inline card (a `content` one works; a `path` one gets
  the "no project directory" error in the chat app; if agent mode gets used, note the `cwd` its
  asks show in history, which brief 17's Desktop check needs), whether the 440-wide window is
  enough for a real plan, and the next real "check this plan with me": did the agent reach for
  `show` with `path` on its own?
- The screenshots cut off before the questions: the gallery's viewport is 760 tall, so 55vh is
  taller there than in the 600 px window. Worth a look whether the window's pane leaves the first
  question in view.

### Docs updated

- Architecture: `form-spec.md` (the type, its fields, `x-content`/`x-source`, why `type: 'null'`,
  `ShowFiles`, the caps, no downgrade, `show.ts`), `ask-tool.md` (a Show files section:
  `readShowFiles`, the project rule, refusals, errors), `inline-cards.md` (`_meta['parley/files']`,
  `Shown.files`, the card holding the form), `card-ui.md` (the renderer, `[data-passive]`,
  `firstToAnswer`), `testing.md` (the server's vitest, `show-file`, fake-hub and fake-ask),
  `asks-and-history.md` (the filter).
- Sources lines, and from them `docket areas`: the Areas rows in `AGENTS.md` and
  `.claude/rules/{ask-tool,form-spec,testing}.md`. `AGENTS.md` Commands: the server's `test`.
- Guide: `question-types.md` (a Show section, eight kinds, `ask-tool.md` in Covers),
  `claude-desktop.md`, `history.md` (the filter), `screenshots.md`, `README.md`; the root README's
  feature list and "What it's built around".
- `apps/server/trials/README.md`: `plan-check`'s row and the new baseline.
- Decisions: unchanged. `show-blocks` and `files-in-shows` still read true.

### Follow-ups

- Briefs 17 (`:205`) and 18 (`:140`) say to run `areas.py`; it's `docket areas` now.
- No syntax highlighting in card code blocks (see Deviations); decide whether shows of source
  files want it.
- The gallery and `screenshots` size the show pane from a 760 px viewport, not the 440 × 600
  frame, so a show's screenshot never reaches the questions. Container units on the frame
  (`cqh`) would make it match the window.
- Trial tune-up: `dead-code-cleanup` put its sign-off list in a `show` (2/3) where a `review`
  fits, and `changelog-draft` used a `show` for a one-line heads-up (1/3). Watch whether real use
  does the same.
- `pnpm --filter @parley/server add -D vitest` pruned the vitest build `packages/protocol` linked
  to and left its link dangling, so `tsc` there failed until a plain `pnpm install`. Worth knowing
  before the next `pnpm add` in this workspace.
- Plan-check run 1 committed to `main` without being asked. That's the model, not Parley, but it's
  in the transcript if the trial project ever wants a "don't commit" line.
