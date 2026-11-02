---
status: awaiting-review
---
# Brief 17: Edit a shown file, get a diff back

Read `CLAUDE.md`, [`README.md`](README.md), [brief 16](16-show-blocks.md), [the form
spec](../architecture/form-spec.md), [the ask tool](../architecture/ask-tool.md), [inline
cards](../architecture/inline-cards.md) and [the card](../architecture/card-ui.md) first.

**Prerequisites:** brief 16 merged (`show`, `path`, `ShowFiles`, `readShowFiles`, and files kept
on the shown ask). Brief 18 builds on this one.

## Goal

Let Logan fix the thing the agent showed him instead of describing the fix. An `editable` show
puts the file's text in a box. He edits it and sends. The server then writes the file and hands
the agent a diff, not the whole text.

- **Why a diff.** A text question's `draft` returns the full final text, which is fine at its
  4,000-character cap. A 300-line file echoed back fills the agent's context with lines that didn't
  change.
- **Why the server writes.** It writes the file itself, and only if the file hasn't changed since
  it was read. The agent then never has to re-apply anything. That matters because an answer
  arriving after Claude Code has backgrounded the call (2 min) has `<` and `>` escaped as `&lt;`
  and `&gt;` ([the ask tool](../architecture/ask-tool.md#claude-code-and-long-asks)). HTML is
  exactly what gets mangled, and here the diff is only context for the agent.

Why now: brief 16 puts files in front of Logan, and the next thing he'll want is to change one.
(Ideate, 2026-10-14.)

## Decisions already made

- **The server writes the file** when the user changed it and the file on disk still hashes to
  the version their edit started from (`base`, which is `ShowFile.sha256` until brief 18). On a
  mismatch it writes nothing and returns the diff, and the agent is told the file changed
  underneath. (Logan, 2026-10-14.)
- **A plain monospace textarea,** like capture's box. No CodeMirror and no highlighting.
  CodeMirror can come later if Logan misses it. (Logan, 2026-10-14.)
- **Only path-backed, whole-file shows are editable.** Writing back is the point. For text the
  agent wrote itself, `text` with a `draft` already exists. A `lines` range is refused with
  `editable`, because splicing a slice back is a later problem. (Ideate, 2026-10-14.)
- **`draft` keeps its full-text answer and no diff.** Brief 10's decision row stands. This is a
  separate row for file-backed edits: the size and the write-back don't apply to commit messages.
- **The write stays inside the project,** under the same rules as reading (brief 16). It's the
  first time Parley writes outside its own data directory. Logan is the author of the change, so
  consent isn't the question. Concurrency is, and the hash check covers it.

Don't revisit these silently.

## Already checked

- **jsdiff** (`diff` on npm): 9.0.0 is current (npm, 2026-10-14) and ships its own types.
  `createTwoFilesPatch(oldName, newName, oldStr, newStr, oldHeader?, newHeader?, { context,
  headerOptions })` returns a unified diff string. `headerOptions: FILE_HEADERS_ONLY` drops the
  `Index:` and `===` lines and keeps `---`/`+++`. Context defaults to 4. `stripTrailingCr` exists.
  (Context7 `/kpdecker/jsdiff`, 2026-10-14.) It's a server dependency only. The card and the window
  never diff.
- **What reaches the server.** The window's answer comes over the hub as `answer.data`, and the
  card's through `parley_submit`. Both are keyed by question id. The answer is shaped in
  `tools/ask.ts` (blocking) or in `ask_wait` (`tools/inline.ts`, from `shownInput`). Brief 16 keeps
  `files` on the shown ask, so both places have the original text and hash.
- **Textarea line endings.** A `<textarea>` value normalizes line breaks to `\n` (HTML spec,
  textarea API value). A CRLF file therefore comes back as LF and has to be converted back before
  writing.

## Open questions

- **Diff context lines.** Default: 3.
- **A big diff.** Default: when the diff is over 20,000 characters, the text says how many lines
  changed and that the file was written, and leaves the diff out. The agent can run `git diff`.
- **The box's height.** Default: 12 lines, growing to 30 with `field-sizing`, then scrolling.

## Shape

### 1. Tool input (`ask.ts`) (**pinned**: model-facing)

`editable: z.boolean().optional()`. Validation messages:

- `editable` on a type other than `show`.
- `editable` without `path`: "only a file can be edited in place; for text you wrote, use a text
  question with a `draft`".
- `editable` with `lines`: "an editable show is the whole file; drop `lines`".

### 2. Compiling

An editable show compiles to an object property instead of `type: 'null'` (**pinned**: brief 18
relies on `base`):

```ts
{ 'x-widget': 'show', title, description,
  type: 'object',
  properties: { text: { type: 'string' }, base: { type: 'string' } },
  additionalProperties: false,
  'x-editable': true,
  'x-content': <fileMarkdown, for the rendered view>, 'x-original': file.text,
  'x-source': { path, totalLines, sha256: file.sha256 } }
```

It's still not required. `x-original` is the raw text that the editor starts from. `base` is the
`sha256` of the version the user's text started from. The renderer writes it with the text, so the
server can tell which version an edit was made against, even once brief 18 lets the shown version
change while the card is open. Declare `x-original` and `x-editable` in the strict-AJV keyword
list.

### 3. The renderer (`ShowRenderer.vue`)

- **Edit and View.** An editable show opens on **Edit**: a monospace textarea bound to
  `data.text`. On mount it writes `{ text: x-original, base: x-source.sha256 }`, the way
  `TextRenderer` writes a draft: not over data that's already there. A small segmented toggle switches to **View**, which renders the current
  text through `fileMarkdown` (from `@parley/protocol`, brief 16's Zod-free `show.ts`). Edited
  HTML repaints as a brief 14 picture, and markdown renders.
- **Reset to original**, under the box once the text differs, as `TextRenderer` does for drafts.
- **Keys:** Enter is a new line and Cmd+Enter sends, like a multiline text. The textarea is the
  `[data-primary]`. An editable show isn't `[data-passive]`, so first focus can land on it.
- **Read-only and history:** View, showing the text as sent, with an "edited" mark when it differs
  from `x-original`.

### 4. Applying the edit (`apps/server/src/show-edits.ts`, **new**)

```ts
export interface ShowEdit {
  path: string
  edited: boolean
  written: boolean
  conflict?: true          // the file changed on disk since it was shown
  diff?: string            // unified, against the text the user was shown
  changedLines?: number    // added + removed, when the diff is left out for size
  error?: string           // the write failed (permissions, disk)
}
export async function applyShowEdits(input: AskInput, files: ShowFiles, data: unknown, projectDir = process.cwd()): Promise<Record<string, ShowEdit>>
```

For each editable show:

1. The new text is `data[id].text` if it's a string, otherwise the original (nothing sent). The
   base is `data[id].base`, falling back to `file.sha256`.
2. **Line endings.** If the original's first line break is `\r\n`, convert `\n` to `\r\n` in the new
   text. Compare with the original after normalizing both. If equal, the result is `edited: false`
   and nothing is written.
3. **Conflict check.** Re-read the file. If its sha256 isn't the base, or the file is gone,
   return `written: false, conflict: true` with the diff. The diff is against the text of the
   version the user started from. Until brief 18 that's always `file.text`.
4. **Write** with `fs.writeFile` in place (it keeps the file's mode and inode), then `written: true`.
   A failed write sets `error` and `written: false`.
5. **Diff:** `createTwoFilesPatch(path, path, original, next, undefined, undefined, { context: 3,
   headerOptions: FILE_HEADERS_ONLY })`, unless it's over the cap in Open questions.

Re-resolve the path with brief 16's rules before writing, so a file swapped for a symlink since the
read is refused.

Call it in both places an answer is shaped: `tools/ask.ts` after `runAsk`, and `ask_wait` in
`tools/inline.ts`. Only an `answered` outcome writes. A skip writes nothing.

### 5. Shaping (`shapeAnswer`) (**pinned**: the result shape)

`shapeAnswer(input, outcome, extra?: { edits?: Record<string, ShowEdit> })`. An editable show gets
an `answers` entry: `{ header, value: <path>, edited, written?, conflict?, diff? }`. Add the
optional fields to `askResultSchema`. The text line:

- `- Plan: left docs/plan.md unchanged`
- `- Plan: edited docs/plan.md, and Parley saved it:` with the diff fenced (as ` ```diff `) and
  indented, the way `describeCapture` fences a paste.
- `- Plan: edited docs/plan.md, but the file changed on disk after it was shown, so Parley didn't
  save it. Their edit, against the version they saw:` with the diff.
- A write error says so, gives the error, and includes the diff.
- Over the size cap: "edited docs/plan.md (N lines changed), and Parley saved it; run `git diff` to
  see it".

Without `edits` (the gallery), the line says the file was edited and that the diff is computed by
the server. A non-editable show still gets no entry.

### 6. Tool description (**pinned** wording, adjust lightly)

Extend brief 16's show bullet with one sentence:

> With `editable: true` (a whole file given by `path`), the user can edit it in place. Parley saves
> their change to the file and returns a diff, so don't apply it yourself unless the answer says it
> wasn't saved.

### 7. `fake-hub`

For an editable show, `first` sends the text unchanged, and `other:<text>` appends the text as the
last line (the draft policies, mirrored).

### 8. Fixture and trial

- `packages/protocol/fixtures/show-edit.json`: an editable show of a small file that only the
  fixture uses, `packages/protocol/fixtures/files/settings.example.json`, then a boolean ("Use
  these settings?").
- Trial prompt `apps/server/trials/prompts/config-tweak.md`, `expect: ask`, `reply:
  other:"currency": "EUR"`. Have the agent write a config file for tally and let the user adjust it
  before it wires the config up. `used` should find `EUR` in the final file. Note in the trials
  README that a `written: true` answer means the change is on disk without the agent touching it,
  so the diff check sees it either way. Judge by eye whether the agent tried to re-apply a diff
  Parley had already saved.
- A full pass, `--runs 3`, against brief 16's baseline, reported the same way.

### Docs

- **Guide.** `question-types.md`, Show: the editable box, Edit and View, Reset, and what happens
  on send (the file is saved, or not when it changed meanwhile, and the agent is told either way).
  `answering.md` if the keys section needs the editable box.
- **Architecture.** `form-spec.md`: `editable`, `x-editable`, `x-original`, the answer fields.
  `ask-tool.md`: `applyShowEdits`, the write rules, and that this is Parley's only write outside
  its data directory. Add `show-edits.ts` to Sources, then run `areas.py`. `card-ui.md`: Edit and
  View.

## Out of scope

- Editing a `lines` slice, or a show given as `content`.
- Syntax highlighting or vim keys in the box.
- Creating new files, or renaming.
- Undo after the write. Git is the undo.
- Line comments on a shown file (annotate). It's parked in `FUTURE.md` under More widgets.

## Acceptance

1. `pnpm --filter @parley/protocol test`: the validation messages, the editable compile, and every
   text line from §5, including conflict, error, over-cap and the gallery's no-edits case.
2. `pnpm --filter @parley/server test`: `show-edits.test.ts` in a temp project covering unchanged,
   edited and written, CRLF kept, a conflict (the file rewritten between read and answer), the file
   deleted, the file swapped for a symlink out, and a read-only file (the write error).
3. `pnpm --filter @parley/desktop test`, `pnpm typecheck` and `pnpm --filter @parley/server build`
   pass. Check that the window's bundle didn't gain Zod.
4. `pnpm --filter @parley/server fake-host` passes, with a scenario where the card answers an
   editable show and `ask_wait`'s text has the diff and the file on disk changed.
5. Gallery, light and dark: `show-edit` edits, Reset appears, and View renders the edited text.
   Run `screenshots show-edit`.
6. **Installed build** (ask Logan once, about five minutes; it replaces his running app):
   `pnpm --filter @parley/server fake-ask show-edit` from the repo root. Edit a value and send. The
   printed answer has the diff, and `git diff` shows the same change in
   `packages/protocol/fixtures/files/settings.example.json`. Then restore that file with `git
   checkout`.
7. The trial pass from §8.

By hand, for Logan:

- A real edit from a Claude Code session: the file changes, and the agent doesn't redo it.
  Desktop's chat has no project directory, so `path` is off there (brief 16). Check it in Desktop
  only if brief 16 found that agent mode has a project directory.
- Whether the plain textarea is enough, or he wants CodeMirror.

Then stop. Ask Logan before committing.

## Report

Built 2026-11-02, every section of Shape, with every acceptance item run. The session was
interrupted once, right after `pnpm add diff` (it had landed, nothing half-done), and picked up
from there.

### Built

- **Protocol** (`packages/protocol`). `editable` on `question` with the three messages from §1
  (`ask.ts`). An editable show compiles as §2 pins it (`compileEditable`): `type: object`,
  `{ text, base }`, `x-editable`, `x-original`, `x-content`, and `x-source` with `sha256`. Without
  its file it compiles with `x-source: { path }` alone. `shapeAnswer(input, outcome, { edits?,
  files? })` gives an editable show an `answers` entry and the §5 lines; `askResultSchema` gains
  `written`, `conflict`, `diff`, `changedLines`, `error`. A shared `fence()` replaces
  `describeCapture`'s inline one. In `show.ts` (no Zod): `ShowEdit` and `SHOW_DIFF_MAX`. In
  `form.ts`: `ShowSource.sha256`, `ShowEditValue`, and the vocabulary comment. Fixture
  `show-edit.json` and `fixtures/files/settings.example.json`.
- **Server** (`apps/server`). New `src/show-edits.ts`: `applyShowEdits`, the five steps of §4,
  with jsdiff 9.0.0 (`diff`, a server dependency). `show-files.ts` exports its path checks as
  `locate` and `projectRoot`, plus `ShowFileMissing`, so the write re-runs brief 16's rules.
  Wired into the blocking `ask` (`tools/ask.ts`), `ask_wait` (`tools/inline.ts`, once per ask
  through `shownEdits` and `Shown.edits` in `ask-lifecycle.ts`) and `fake-ask`. The tool
  description's sentence from §6, verbatim. `fake-hub`'s editable policy (§7). A `show-edit`
  `fake-host` scenario. `trial-score` labels an editable show `show+editable`.
- **Desktop** (`apps/desktop`). `ShowRenderer.vue`: Edit (a monospace textarea, the
  `[data-primary]`, with the caret put at the top on first focus) and View (the text through
  `fileMarkdown`), writing `{ text, base }` on mount, not over existing data; "Reset to original";
  read-only View with "· edited". Styles in `styles.css` (tokens only). The gallery loads files
  under `packages/protocol/fixtures/files/`, so `show-edit` is editable there.
- **Trial.** Prompt `config-tweak.md`, its row and reading notes, and the pass below.

### Deviations

- **`changedLines` and `error` in the result schema.** §5 lists `written?`, `conflict?` and `diff?`
  for the answer. `ShowEdit` carries the other two as well, and an over-cap or failed save has
  nothing else to say it with, so both are optional fields in `askResultSchema`.
- **The size cap drops the diff only from a saved edit.** For a conflict or a write error the
  diff is the only copy of the user's edit, so it stays in whatever its size.
- **`ask_wait` applies the edits once per ask.** The brief didn't say. A late or repeated
  `ask_wait` would otherwise find the file Parley had just written, report a conflict and
  contradict the first answer. `fake-host` checks that a second wait gets the same text.
- **A file swapped for a symlink out is `error`, not `conflict`.** The error is the refusal's own
  message (`… is outside the project (…)`). A deleted file is a conflict, as §4 says.
- **`shapeAnswer` also takes `extra.files`.** The renderer writes the text on mount, so without
  the original the gallery called every send "edited". With the files it tells an edit from the
  file as it was. The server passes `edits`, so it doesn't use this.
- **`editable: false` is accepted anywhere.** Only `true` on another type is refused, like
  brief 16's `required: false` on a show: it changes nothing, and a bounce costs a round trip.
- **The diff is of `\n` text.** Both sides are diffed with `\n` line endings, so a CRLF file's
  diff reads cleanly. The file itself is written back with `\r\n`.
- **Acceptance 6's `git diff` and `git checkout`.** The fixture's file is new, so until this
  commit git doesn't track it. I compared it with `diff -u` against the original and restored it
  by hand.
- **"Optional" stays on an editable show.** It isn't `[data-passive]` (§3), and `QuestionFrame`
  hides the label only for passive questions. Editing is optional, so I left it; say if it
  should go.
- **Edit and View are mouse only** (`tabindex="-1"`), since Tab belongs to the card and a new
  chord needs the keymap check.
- **`areas.py`** is `docket areas` now (brief 16's follow-up).
- **A `git stash` during the trial.** I stashed for a second to check whether a link finding was
  older than this work, while the trial ran. The server runs from the `dist` it built first and
  the runs go one at a time, so only a `config-format` run could have started its `fake-hub` in
  that window, and the old `fake-hub` answers a non-editable form the same way.

### Defaults taken

- Diff context: 3 lines.
- A big diff: over 20,000 characters, a saved edit's answer gives the count of changed lines and
  points at `git diff`.
- The box: 12 lines, growing to 30 with `field-sizing`, then scrolling.

### Acceptance

1. `pnpm --filter @parley/protocol test`: **pass**, 124 (12 new: the three messages,
   `editable: false`, both compiles, every §5 line including conflict, error, over-cap, the
   gallery's no-edits case with and without files, and a diff with backticks).
2. `pnpm --filter @parley/server test`: **pass**, 22 (8 new in `show-edits.test.ts`: unchanged,
   sent or not; written in place with the same inode and mode; CRLF kept; a conflict; the file
   deleted; a symlink out; a read-only file; and over the cap).
3. `pnpm --filter @parley/desktop test` **pass** (155; `show-edit` compiles under strict AJV);
   `pnpm typecheck` and `pnpm --filter @parley/server build` **pass**. The window's production
   bundle has no Zod and no jsdiff.
4. `fake-host`: **all 11 scenarios pass**, from source and with `--server dist`. The new
   `show-edit` scenario has 7 checks, among them the diff in `ask_wait`'s text, `EUR` on disk,
   and a second `ask_wait` with the same text.
5. Gallery, headless WebKit, light and dark: **pass**, 10 checks per theme. The card opens on
   Edit with the file, and first focus lands in the box at the top. Enter adds a line without
   sending. Reset appears after an edit and restores the file. View renders the edited text as a
   `json` block. Cmd+Enter sends, and the line says edited and that the server saves it.
   Untouched, it says unchanged. No console errors. `screenshots show-edit` rerun, and the guide's
   screenshots page shows the pair.
6. Installed build: **pass**. With Logan's go-ahead, `pnpm install:desktop`, a restart, then
   `fake-ask show-edit`. Logan changed `showRefunds` and `decimals` and sent. The printed answer
   had the diff, `diff -u` on the file showed the same hunk, and the file is restored.
7. Trial pass (`--runs 3 --keep`): **done**. It's the new baseline in
   `apps/server/trials/README.md`, compared with brief 16's. `config-tweak` used an editable
   `path` show in 3/3 runs, and `plan-check` once more. No run wrote a saved edit a second time.
   Every run did rewrite the file, but to repair it: `fake-hub` put the line after the closing
   `}`, which made the JSON invalid (Follow-ups). Two first calls were invalid, both model slips
   retried at once and unrelated to `editable`. `refactor-reports` asked 2/3 and `config-format`
   1/3; everything else held.

### Size

Unsized; this session not measured (Copilot CLI, not Claude Code: `docket sessions` says
`CLAUDE_CODE_SESSION_ID is not set`).

### Spot checks for Logan

- **The gallery** is running: <http://localhost:1420/?gallery&fixture=show-edit>. Edit a value,
  try View and Reset, send.
- **Edit the box's height.** In headless WebKit the empty part of the box looked nearer 8 lines
  than 12 for the 7-line file. Look at it in the installed window.
- **"Optional"** next to an editable show's chip: keep it or drop it?
- From the brief: a real edit from a Claude Code session (the file changes, and the agent
  doesn't redo it), and whether the plain textarea is enough. Desktop's chat has no project
  directory, so `path` is off there; agent mode is still unchecked (brief 16).

### Docs updated

- Architecture: `form-spec.md` (`editable`, the compile, the answer fields and lines),
  `ask-tool.md` (an Editable shows section, `show-edits.ts` in sources), `inline-cards.md`
  (`ask_wait` saves once, `Shown.edits`), `card-ui.md` (Edit and View, the gallery's files),
  `testing.md` (the tests, `fake-hub`, `fake-ask`, `show-edit`, the gallery).
- `docket areas`: `.claude/rules/ask-tool.md`, `.claude/rules/testing.md`, the Areas table.
  `AGENTS.md` Commands: the server's `test`.
- Guide: `question-types.md` (Editing a shown file), `screenshots.md` (the pair); the root
  README's feature list and "What it's built around". `answering.md` already says Enter is a new
  line in a multi-line box.
- `apps/server/trials/README.md`: `config-tweak`'s row and reading notes, `show+editable`, the
  new baseline.
- Decisions: unchanged. `editing-a-shown-file` and `drafts-to-edit` still read true.

### Follow-ups

- **`fake-hub`'s editable policy can't test re-applying.** `other:<text>` appends a line, which
  for JSON lands after the `}`, so the agent has to fix the file anyway. A
  `replace:<old>:<new>` policy would give `config-tweak` a valid edit and a clean re-apply check.
- `docket links --paths` flags `card-ui.md:92`'s `docs/plan.md`, an example caption from brief 16
  rather than a path. It needs a `.checklinks-ignore` entry or rewording.
- Edit and View have no key.
- Second look, finding 4: the hash check and the write in `applyShowEdits` aren't atomic. A
  per-file lock would cover parallel asks in one server, not two sessions; writing a temp file
  and renaming it after re-checking the hash narrows the gap for both, at the cost of the
  in-place write that keeps the inode.
- Second look, finding 2's remainder: the caps count UTF-16 units, not bytes, so a file of
  control characters (JSON escapes each to 6 bytes) can still pass the hub's line. Measuring the
  serialized form in the server before sending would close it for every shape.
- Second look, finding 1: a file that isn't valid UTF-8 is corrupted when an edit is saved. No
  pick from Logan yet.

### Second look

2026-11-02, Codex (`gpt-6.1-sol`, read-only sandbox) on the commit `feat: editable show blocks,
saved by the server with a diff back (brief 17)`, about 6 minutes. Four findings, each checked
against the code; none wrong. A second Codex run (same model, read-only) from another session
found 2–4 again and not 1; Logan answered that run's round, so 2–4 carry his picks and 1 is still
open.

1. A file that isn't valid UTF-8 is corrupted when an edit is saved (`apps/server/src/show-edits.ts:63`):
   confirmed, reproduced. `readShowFiles` decodes with replacement characters, and the save writes
   them back: a Latin-1 `café A` edited to `B` turned byte `e9` into `efbfbd`, and the diff doesn't
   show it. Proposed fix: refuse `editable` on a file whose bytes don't round-trip through UTF-8.
   Logan: no answer yet.
2. Editable shows can push a form past the hub's 1 MiB line (`packages/protocol/src/ask.ts:458`):
   confirmed. `x-content` and `x-original` both carry the text, and the caps count characters, not
   bytes: two 90,000-character files of 3-byte characters compile to about 1.08 MB, and the hub
   drops the connection. The same gap exists from brief 16 for control characters, which JSON
   escapes to 6 bytes each. It also loops: the server re-sends its pending asks on every
   reconnect (`app-client.ts:220`). Logan: fix. `readShowFiles` counts an editable file's text
   twice against the 200,000-character total, and says so in the message; a new test in
   `show-files.test.ts`. The control-character gap from brief 16 stays (a follow-up below).
3. An editor paste over 1 MiB loses the answer silently
   (`apps/desktop/src/forms/renderers/ShowRenderer.vue:98`): partly right. The mechanism holds:
   `answer()` in `asks/store.ts` ends the ask and drops its draft before `send()`, which only logs
   `hub_send`'s rejection, so the server waits until the timeout. It takes a paste about ten times
   the file cap. The edited text isn't lost: the ended record keeps it in history. Logan: fix.
   `SHOW_EDIT_MAX` (200,000, twice the file cap so an edit can grow the file) in `show.ts`, as
   `maxLength` on the compiled `text` and `maxlength` on the textarea.
4. The hash check and the write aren't atomic (`apps/server/src/show-edits.ts:56`): partly right.
   There's an `await` between the read and the write, but two Parley answers can't land in it (one
   user answers seconds apart, and each session is its own process, so a lock wouldn't help); only
   an outside writer in that gap could, or two parallel asks from one session. Logan:
   follow-up (in Follow-ups).

Fixed in the commit `fix: second-look fixes for brief 17`. Finding 1 still needs Logan's pick.
