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
