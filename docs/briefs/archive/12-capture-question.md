# Brief 12: Capture, and copy buttons on code

Read `CLAUDE.md`, [`README.md`](../README.md), [the form spec](../../architecture/form-spec.md),
[the card](../../architecture/card-ui.md), [inline cards](../../architecture/inline-cards.md),
[the desktop shell](../../architecture/desktop-shell.md), [asks and history](../../architecture/asks-and-history.md)
and [testing](../../architecture/testing.md) first. Briefs 10 and 11 must be merged: this brief runs
the full trial pass for all three, and it edits the same files they do (`ask.ts`, the tool
description, `fake-hub`, `trial-score.ts`).

## Goal

Two things, for the asks where the agent needs something only the user can get: command output, a
console dump, a screenshot.

1. **Copy buttons** on every fenced code block in card markdown, so a command or snippet the agent
   asks you to run is one click away.
2. **A `capture` question**: a box you paste into. Pasted text comes back verbatim. A pasted
   screenshot is saved as a PNG, and the agent gets its path to read.

Then the full trial pass for briefs 10–12, against the baseline.

Why now: the inn "composer gap" debugging went through five `text` cards in a row. Each had a
20-line JS snippet in the question markdown that Logan selected and copied by hand, ran in Safari,
and then pasted a multi-line DOM dump back into a one-line text box. Screenshots came in through the
`path` picker (save the file, then pick it), which also doesn't work in Desktop's inline card. This
is the one place Parley is used for debugging rather than deciding, and it's the clumsiest. (From
`ideate`, 2026-10-10, mining the session transcripts and `history.jsonl`.)

## Decisions already made

- **Scope:** copy buttons, pasted text and pasted images, in one brief. (Logan, 2026-10-10.)
- **Images go back as file paths, not as MCP image content.** Claude Code shows the model only
  `structuredContent` when a tool has an `outputSchema` ([the ask tool](../../architecture/ask-tool.md#claude-code-and-long-asks)),
  so image content blocks would probably be dropped, and a path is something the model can open
  with its own file-reading tool. (2026-10-10, from the ideate write-up.)
- **Images are window-only,** like `path`: a form with an image-accepting capture isn't sent
  inline, and Desktop's card points at the window. A text-only capture works inline.
- **The trial pass runs here, once, for briefs 10–12.** Briefs 10 and 11 ran only their own
  prompts. (Logan, 2026-10-10.)

Don't revisit these silently.

## Already checked

- **CSP:** the window's CSP allows `img-src 'self' data:` (`tauri.conf.json`, and the dev header
  in `vite.config.ts`), so thumbnails can be `data:` URLs, or `blob:` if you add it to both. Keep
  the two CSPs in step (2026-10-10).
- **fs scope today:** read, write and rename on `$APPDATA/history.jsonl` and its `.tmp` only
  (`src-tauri/capabilities/default.json`). Captures need a write permission for binary files, a
  directory create and a remove, scoped to `$APPDATA/captures/**`. The permission identifiers in
  `tauri-plugin-fs` 2.x are `fs:allow-write-file`, `fs:allow-mkdir` and `fs:allow-remove`; confirm
  them against the generated schema (`src-tauri/gen/schemas/desktop-schema.json`) before relying on
  them.
- **The clipboard plugin:** `tauri-plugin-clipboard-manager` has `writeText` and `readImage` in its
  JS bindings, with permissions `clipboard-manager:allow-write-text` and
  `clipboard-manager:allow-read-image` (Context7, `/tauri-apps/plugins-workspace`, 2026-10-10). It
  isn't installed. Add it only if step 0 says the web APIs don't work in the panel.
- **The card in Desktop:** the MCP Apps spec lets a UI resource request
  `_meta.ui.permissions.clipboardWrite` on its `resources/read` contents. The host *may* honor it
  with an iframe `allow="clipboard-write"`, and views should feature-detect (ext-apps spec
  2026-01-26, Context7 `/modelcontextprotocol/ext-apps`, 2026-10-10). Whether Claude Desktop
  honors it is unverified.
- **Window-only routing** is `hasPathQuestion(form)` in `packages/protocol/src/form.ts`, used by
  `apps/server/src/tools/inline.ts` (the `inline` flag) and `apps/desktop/src/mcp-app/McpApp.vue`
  (`windowOnly`).
- **Links in markdown** are handled by a delegated click in `apps/desktop/src/forms/Markdown.vue`.
  The copy button can use the same handler. `markdown.ts` already overrides `highlight` for
  ```` ```diff ```` blocks.

## Open questions

- **Image limits.** Default: up to 5 images per capture, 10 MB each. A larger paste is refused
  with a line under the box.
- **Text limit.** Default: 50,000 characters (`maxlength`), which is well past any DOM dump seen so
  far.

## Build order

0. **Check the web APIs in the panel first.** In the dev app (`pnpm app`), with a scratch fixture:
   - Does `navigator.clipboard.writeText` work from a click?
   - Does a `paste` event on a focused element carry an `image/png` file in
     `clipboardData.files` after Cmd+Ctrl+Shift+4 (a screenshot to the clipboard), and after
     copying an image in Preview?

   If either fails, use `tauri-plugin-clipboard-manager` for that half. `readImage` gives RGBA;
   draw it to a canvas and encode a PNG with `toBlob`. A new plugin needs its permission in
   `capabilities/default.json`, and the desktop shell page lists plugins. Write down what you find
   in the report.

   This opens the dev app: ask Logan once before starting.
1. Copy buttons (no model-facing change). Stop here if step 0 went badly, and report.
2. The `capture` type: protocol, renderer, saving images, window-only routing.
3. The tool description, `fake-hub`, the trial prompt, then the full trial pass.

## Shape

### 1. Copy buttons

- **Markdown.** In `apps/desktop/src/forms/markdown.ts`, wrap each fenced block (`md.renderer.rules.fence`)
  in a container with a small copy button, `<button type="button" class="code-copy" data-copy
  tabindex="-1">`. The button carries no payload; the click handler copies the `<code>` element's
  `textContent`. Inline code doesn't get one. Diff blocks do; copying a diff copies its text.
- **Platform.** A new `copyText(text: string): Promise<boolean>` in `apps/desktop/src/platform.ts`.
  It uses `navigator.clipboard.writeText`, or the plugin if step 0 says so, and is overridable
  through `setPlatform` like `openExternal`. It returns false when copying failed.
- **Click.** In `Markdown.vue`, extend the delegated click handler: on `[data-copy]`, call
  `copyText`. On success, the button says "Copied" for about 1.5 s. On failure, select the block's
  text and the button says "Press ⌘C", so the inline card still works when the host withholds
  clipboard access.
- **The card in Desktop.** Add `permissions: { clipboardWrite: {} }` to the card resource's
  `_meta.ui` where the server builds the `resources/read` result (`apps/server/src/tools/inline.ts`
  / `card.ts`). Whether it's honored is for Logan's hand check.
- **Keyboard.** None. The button is for the mouse, and the select-on-failure covers the keyboard.
  Don't add a key chord.

### 2. Tool input (pinned)

`'capture'` joins `QUESTION_TYPES` and `WIDGETS`. A capture question takes:

```ts
accept: z.enum(['text', 'image', 'any']).optional(),   // default 'any'
placeholder: z.string().optional(),                      // shared with text
```

Checks in `superRefine`: `options`, `items`, `draft` or `decisions` on a capture each get the
message the other types already give, and `accept` on anything but a capture is rejected.

### 3. Compiled schema (pinned)

```ts
{
  'x-widget': 'capture', title: header, description: question,
  type: 'object',
  properties: {
    text: { type: 'string' },
    images: { type: 'array', items: { type: 'string' }, maxItems: 5 },   // absolute PNG paths
  },
  additionalProperties: false,
  'x-accept': 'text' | 'image' | 'any',
  'x-placeholder'?: string,
  // when required, at least one of them filled:
  anyOf: [
    { required: ['text'], properties: { text: { minLength: 1 } } },
    { required: ['images'], properties: { images: { minItems: 1 } } },
  ],
}
```

Under `accept: 'text'`, leave out `images` (and the `anyOf` collapses to `required: ['text']`), and
the reverse for `'image'`. Check that the result compiles under strict AJV with no warnings;
`schemas.test.ts` does that for every fixture. Document the widget in `form.ts`'s vocabulary
comment, and say there's no elicitation downgrade for images. A text-only capture downgrades to a
string field.

Replace `hasPathQuestion` with `isWindowOnly(form)`: true for a `path` question, or a `capture`
whose `x-accept` isn't `'text'`. Update both callers, and the card's read-only message in
`McpApp.vue`, which talks about file pickers: it should say "This question needs the Parley window"
or similar, without naming one widget.

### 4. Renderer

`CaptureRenderer.vue`, registered with `widgetTester('capture')`:

- **Text.** A monospace textarea (it's for output, not prose), about 6 rows, growing to about 14.
  The text is kept verbatim: no trimming inside, only a check that it isn't all whitespace.
- **Images.** Under `'image'` or `'any'`, a paste anywhere in the question (focus in the textarea,
  or on the drop-zone line under it) that carries an image file saves it through
  `platform.saveImage` and adds a thumbnail row: the image (via a `data:` or `blob:` URL), its size,
  and a remove button. Pasting text into the textarea stays a normal paste.
- **An image-only capture** shows a focusable line, "Paste a screenshot (⌘V)", as its
  `data-primary`, in place of the textarea.
- **Hint line:** "Paste output or a screenshot · ⌘⌃⇧4 copies a screenshot". Check
  `~/.config/keymap/keymap.md` that Cmd+Ctrl+Shift+4 isn't rebound before printing it, and leave
  the shortcut out if it is.
- **Read-only (history).** The text in a monospace block, and image file names, with no
  thumbnails. Reading the files back would need a read scope, which this brief doesn't add.

### 5. Saving images

`saveImage(blob: Blob): Promise<string>` in `platform.ts`:

- **Where.** `$APPDATA/captures/<YYYY-MM-DD>/<random>.png` through `@tauri-apps/plugin-fs`
  (`writeFile` with `BaseDirectory.AppData`, `mkdir` with `recursive`). It returns the absolute
  path, resolved with `appDataDir()` from `@tauri-apps/api/path`.
- **Outside Tauri** (the gallery in a browser), it returns a fake path such as
  `/tmp/parley-capture-1.png` and keeps the thumbnail working from a `blob:` URL.
- **Capabilities.** `capabilities/default.json` gains the write-file, mkdir and remove permissions
  and `$APPDATA/captures/**` in the fs scope. Update the desktop shell page's capability list in the
  same commit.
- **Cleanup.** When the history compacts at startup (`apps/desktop/src/asks/persist.ts`), delete
  the date folders under `captures/` older than 30 days. **Clear…** in History deletes all of
  `captures/` too. A capture from an ask that was skipped or withdrawn stays until its folder ages
  out. Say so in the guide.
- **The fs scope is still the app's own data dir.** No other paths.

### 6. Answer (pinned)

The answer gains `images: z.array(z.string()).optional()`. `value` is the pasted text, or `null`
when there's none. The answer union doesn't change.

The text from `shapeAnswer` fences the pasted text verbatim (pick a fence longer than any run of
backticks in it) and lists the images as paths the agent can read:

```text
The user answered:
- Console: pasted 24 lines:
  ```
  [818, 818, 57, 57]
  ...
  ```
  and 1 screenshot (PNG files you can read):
  /Users/logan/Library/Application Support/com.loganlopez.parley/captures/2026-10-11/k3x9.png
```

A short single line of text needs no fence: `- Version: pasted "v2.1.296"`.

### 7. Tool description

A line for `capture` in `apps/server/src/tools/ask.ts`, along the lines of: "capture: a box the
user pastes into, for something only they can get, such as command output, a console dump or a
screenshot. `accept` is 'text', 'image' or 'any' (default). Text comes back verbatim; screenshots
come back as PNG file paths you can read. Put commands for the user to run in fenced code blocks
in `question`: they get a copy button." Leave the server instructions alone.

### 8. fake-hub and the trial scorer

- `fill` for `capture`: `{ text: <the other: text, or 'as you see fit'> }`. No images.
- `questionsOf` needs nothing new; the type is `capture`.

### 9. Trial prompt and the full pass

`apps/server/trials/prompts/crash-output.md`, adapted to the trial project's real commands
(`tally` parses CSVs in `src/parse.ts`):

```markdown
---
expect: ask
reply: other:TypeError: Cannot read properties of undefined (reading 'zephyr') at parseRow (parse.ts:41)
match: zephyr
---
Parsing my bank's March export crashes on my laptop, and I can't share the file. Find out why.
```

Add its row to the prompts table in `apps/server/trials/README.md`: "output only the user can get:
should be one `capture`". Judge it by eye from `questions`.

Then run the full pass: `pnpm --filter @parley/server trial --runs 3`. That's the 10 baseline
prompts plus `changelog-draft` (brief 10), `sort-helpers` (brief 11) and `crash-output`, about 40
minutes. Report the table next to the 2026-10-10 baseline in `trials/README.md`, and replace the
baseline section with the new one, dated, with a line on what changed. Things to call out:

- uptake on the old prompts within run-to-run noise;
- `prune-unused` still a plain `review`, and `config-format` still not a review;
- each new prompt's question type per run.

### Docs

- **Guide.** `docs/guide/question-types.md` gets a Capture section, and the intro's count of types
  changes from six. It covers pasting, screenshots, where images are kept and for how long, and
  that images need the window. Copy buttons go in `docs/guide/answering.md`. The root README's
  feature list ("Six question types") and the "A form language" bullet change to match.
- **Architecture.** The form spec page (`capture`, `isWindowOnly`), the card page (the copy
  button, `saveImage`), the desktop shell page (capabilities, and the plugin if added), inline
  cards (window-only now covers image captures, and the `clipboardWrite` request).

## Out of scope

- Dragging image files in. Tauri's window drag-drop intercepts drops by default; it's a separate
  change.
- Thumbnails in the history view.
- Returning images as MCP image content.
- Screen capture triggered from Parley itself.
- Anything that reads files the user didn't paste.

## Acceptance

1. `pnpm --filter @parley/protocol test` passes, with new tests for:
   - compiling each `accept`;
   - the validation messages;
   - `isWindowOnly`;
   - `shapeAnswer` for text only, a one-liner, images only, both, text containing triple
     backticks, and an optional capture left blank.
2. `pnpm --filter @parley/desktop test` passes. A `capture.json` fixture (accept `any`) and a
   `capture-text.json` fixture compile under strict AJV.
3. `pnpm typecheck` and `pnpm --filter @parley/server build` pass.
4. `pnpm --filter @parley/server fake-host` passes, including a scenario where an image capture
   isn't sent inline and a text-only one is.
5. The gallery shows both capture fixtures in light and dark. Copy buttons appear on fenced blocks
   in `long-markdown` and copy their text.
6. In the real app (`pnpm app`, or the installed build after `pnpm install:desktop`, ask Logan
   first): `fake-ask capture` with pasted text and a pasted screenshot prints the fenced text and a
   path, and the PNG at that path opens.
7. The full trial pass from section 9, reported as described there.

By hand, for Logan:

- A copy button in Desktop's inline card. Does it copy, or fall back to "Press ⌘C"? Either is
  fine; record which.
- A screenshot pasted straight from Cmd+Ctrl+Shift+4 into a real ask in the window.
- A real debugging session where the agent asks for console output: does it reach for `capture`?

Then stop. Ask Logan before committing.

## Report

Built 2026-10-11 on `main`, uncommitted, on top of 8b8525b.

### Built

- **Protocol** (`packages/protocol/src/ask.ts`, `form.ts`). `capture` joins `QUESTION_TYPES` and
  `WIDGETS`, with `accept` (`text` / `image` / `any`, default `any`) and `placeholder`. `accept` on
  another type gets its own message; options, items, a draft or decisions on a capture get the
  messages the other types already give. The compiled schema is the pinned one. `isWindowOnly`
  replaces `hasPathQuestion` (path, or a capture whose `x-accept` isn't `text`), in
  `tools/inline.ts` and `McpApp.vue`, whose read-only line now says "This question needs the
  Parley window." The answer gains `images`; `value` is the verbatim text or null. `shapeAnswer`
  fences the text with a fence longer than any backtick run in it, quotes one line of 120
  characters or fewer, and lists screenshots as paths. `form.ts` exports the limits
  (`CAPTURE_MAX_IMAGES` 5, `CAPTURE_MAX_IMAGE_BYTES` 10 MB, `CAPTURE_MAX_TEXT` 50,000) and
  `CaptureValue`. Fixtures: `capture.json` (accept `any`, with a fenced JS snippet to copy) and
  `capture-text.json` (two text-only captures, one optional).
- **Copy buttons** (`forms/markdown.ts`, `forms/Markdown.vue`). The fence rule wraps each block
  in `.code-block` with a payload-free `[data-copy]` button; the delegated click copies the
  `<code>` text minus its trailing newline through `platform.copyText`, says "Copied" for 1.5 s,
  or selects the code and says "Press ⌘C" for 3 s when copying fails. `tabindex="-1"`, no key.
- **Platform** (`platform.ts`). `copyText` (`navigator.clipboard.writeText`) and `saveImage`
  (`$APPDATA/captures/<YYYY-MM-DD>/<8 hex>.png` via plugin-fs, returning the absolute path; a fake
  `/tmp/parley-capture-n.png` outside Tauri), both overridable through `setPlatform`.
- **Renderer** (`forms/renderers/CaptureRenderer.vue`, registered in `renderers.ts`; styles in
  `styles.css`). Monospace textarea, 6 lines growing to 14. Image pastes anywhere in the question
  are taken over, converted to PNG through a canvas when they aren't already, size- and
  count-checked, saved, and shown with a small `data:` thumbnail, size and remove button.
  Image-only captures get a "Paste a screenshot (⌘V)" input that refuses typing. Read-only shows
  the text in a monospace block and file names only.
- **Card** (`card/AskCard.vue`). A required error inside a question's object now counts against
  that question, so the footer says "Still needs an answer: Console", not "text".
- **Cleanup** (`asks/persist.ts`, `asks/store.ts`). After `load`'s rewrite, day folders whose day
  ended over 30 days ago are removed (`staleCaptureDays`, tested). **Clear…** runs
  `clearCaptures`, which deletes every screenshot except those in a waiting ask's draft.
- **Capabilities** (`capabilities/default.json`). `fs:allow-write-file`, `fs:allow-mkdir`,
  `fs:allow-read-dir`, `fs:allow-remove` (all four confirmed in the generated schema), and
  `$APPDATA/captures` plus `$APPDATA/captures/**` in the fs scope.
- **Server** (`tools/inline.ts`, `tools/ask.ts`). The card's `resources/read` contents carry
  `_meta.ui.permissions.clipboardWrite`. The tool description has the `capture` line from §7,
  verbatim apart from the markdown escaping. Server instructions untouched.
- **Test tools.** `fake-hub` fills a capture with the `other:` text or 'as you see fit'.
  `fake-host` has a `capture` scenario (an image capture goes to the window without `inline`, a
  text-only one goes inline and the card answers it), and `card-wins` checks the
  `clipboardWrite` request. Trial prompt `trials/prompts/crash-output.md`, with its row in the
  trials README.

### Deviations

- **Build order.** Step 0 ran after the build, together with acceptance 6, in one hands-on
  session (Logan's call, 2026-10-11). Both web APIs worked in the panel, so
  `tauri-plugin-clipboard-manager` wasn't added.
- **`fs:allow-read-dir` added.** Removing day folders older than 30 days, and clearing all but a
  waiting draft's screenshots, means listing `captures/`. It lists names only; nothing reads a
  file's contents.
- **Clear keeps screenshots in waiting drafts.** The brief said Clear deletes all of `captures/`.
  That would leave a waiting ask's draft pointing at deleted files, so the agent would get dead
  paths. Those few are kept; everything else goes.
- **No shortcut in the hint line.** ⌘⌃⇧4 is AeroSpace's (send the window to workspace 4,
  `keymap.md`), so the brief's own rule applied: the line reads "Paste output or a screenshot."
  The guide says to copy a screenshot with ⌘⇧4 and ⌃ held while dragging.
- **The `anyOf` branches repeat `type`** (`{ type: 'string', minLength: 1 }`,
  `{ type: 'array', minItems: 1 }`), which strict AJV needs. Otherwise the schema is the pinned
  one.
- **The image-only paste target is an input, not a focusable line.** WebKit may not deliver a
  paste to a non-editable element; an input that refuses typing (`beforeinput`) does get it. In
  `any` mode the textarea takes image pastes too, so the line under it is a hint, not a focus
  target.
- **Thumbnails are `data:` URLs drawn small on a canvas,** so the CSP didn't change (no `blob:`).
- **The trial reply.** `tally` has no `parseRow` or `parse.ts:41`; the reply names `parseLine`
  at `src/parse.ts:17`, keeping `zephyr` as the match. Moot, as it turned out: no run asked.
- **A paste carrying an image adds the image,** even if it carries text too (copying cells from
  Numbers, say). Simple and predictable; noted in the guide.

### Defaults taken

- Image limits: 5 per capture, 10 MB each, refused with a line under the box.
- Text limit: 50,000 characters (`maxlength`); reaching it shows a line under the box.

### Acceptance

1. `pnpm --filter @parley/protocol test`: **pass**, 84 tests, with new ones for each `accept`,
   the validation messages, `isWindowOnly`, and `shapeAnswer` for text, a one-liner, a long single
   line, images only, both, text with triple and quadruple backticks, and an optional capture
   left blank or whitespace-only.
2. `pnpm --filter @parley/desktop test`: **pass**, 39 tests. Both capture fixtures compile under
   strict AJV with no warnings; new tests check what a required `any` capture and a text capture
   accept, and `staleCaptureDays`.
3. `pnpm typecheck` and `pnpm --filter @parley/server build`: **pass**.
4. `fake-host`: **pass**, all 9 scenarios, from source and with `--server dist`, including the
   new `capture` scenario and the `clipboardWrite` check.
5. Gallery: **pass**, checked headless in Playwright's WebKit (no window on screen). Both capture
   fixtures render in light and dark. `long-markdown`'s one fenced block has a copy button,
   inline code has none; a click copied
   `# what I'd run\ngit rm src/export/csv-v1.ts src/export/xml.ts scripts/seed-old.sh`, said
   "Copied", and reset after 1.5 s; with the clipboard refused it said "Press ⌘C" and selected the
   block. A synthetic image paste gave a thumbnail row, and Send gave the fenced text plus the
   fake path. An empty or whitespace-only capture keeps Send disabled with "Still needs an answer:
   Console". An image-only scratch fixture (deleted after) refused typing and stopped at five
   screenshots with "At most 5 screenshots."
6. Real app with step 0: **pass.** The dev app ran on a test socket beside the installed one (Logan's call),
   and `fake-ask capture --timeout 3600` sent the card. Step 0's answers: in the panel,
   `navigator.clipboard.writeText` works from a click (Copy said "Copied", and the paste
   brought back the snippet), and a ⌘⇧4-with-⌃ screenshot pastes as an image file in
   `clipboardData.files`. So no clipboard plugin. `fake-ask` printed the four pasted lines fenced
   (no trailing newline, so the button's trim works) and
   `.../captures/2026-10-11/2a9c60ea.png`, a valid 255×39 RGBA PNG that opens. The optional Preview
   paste wasn't reported on separately: one image arrived, so the TIFF redraw path is checked only by
   reading the code.
7. Full trial pass: **done**, `results/2026-10-11T04-22-35-638Z.jsonl`, table and notes in
   `apps/server/trials/README.md` (now the baseline). Old prompts within noise: `config-format`
   2/3 (always `choice`, never `review`), `prune-unused` a plain `review` 3/3. `changelog-draft`
   used `text`+`draft` 3/3, `sort-helpers` `review`+`decisions` 3/3 (one first call rejected for a
   13-character header). **`crash-output` asked 0/3.** Each run reproduced a real crash path from
   the code (`src/format.ts:5`), then ended its turn with an `awk` command for the user to run and
   report back in chat: the moment `capture` is for, handled as the end of the turn.

### Spot checks for Logan

- **A copy button in Desktop's inline card.** Rebuild the server, quit and reopen Desktop, ask
  something with a code block. Does it copy, or fall back to "Press ⌘C" with the code selected?
  Either is fine; say which, and it goes on the inline cards page.
- **A screenshot pasted straight into a real ask in the installed window** (after
  `pnpm install:desktop` and a restart of Parley): ⌘⇧4 with ⌃ held, then ⌘V into a capture.
- **A real debugging session where the agent needs console output.** Does it reach for
  `capture`? The trial says it may hand you a command in chat instead.
- **History detail of a capture**: the text in a monospace block and the screenshot file names.

### Docs updated

- Architecture: the form spec (`capture`, `isWindowOnly`, the answer and its text), the card (copy
  buttons, the capture renderer, `copyText` and `saveImage`, the footer), the desktop shell (fs
  permissions and scope), inline cards (window-only now covers image captures; the
  `clipboardWrite` request, unverified), asks and history (screenshot cleanup, Clear, the fs
  rule), testing (fake-hub's capture policy, the `capture` scenario, the new unit tests).
- `AGENTS.md`: the fs scope rule includes `captures/`.
- Guide: `question-types.md` (a Capture section, seven types, Covers adds asks and history),
  `answering.md` (Code in a question), `claude-desktop.md` (questions that need the window, the
  copy fallback), `history.md` (Clear and the captures folder), `README.md` (the index lines).
- Root README: "Seven question types" with capture, a copy-buttons line, and the form-language
  bullet.
- `apps/server/trials/README.md`: the `crash-output` row and the new baseline.

### Follow-ups

- **`crash-output` and real uptake.** If Logan's hands-on check agrees that agents hand over
  commands in chat instead of asking with `capture`, the lever is the server instructions ("you
  need something only the user can get, like command output"), which this brief left alone on
  purpose. That's a model-facing change with its own trial pass.
- **fake-hub answers plain `text` with 'as you see fit' under `other:`,** so a prompt where the
  model reasonably uses `text` can't score `used`. Changing it would move the baseline for
  `export-sentinel` and the others; worth a deliberate decision.
- **Removing a screenshot from the box doesn't delete its file;** it goes with its day folder.
  Deleting at once would need one more platform call.
- **The fs scope is one global scope,** so `remove` and `write-file` also apply to
  `history.jsonl`. Per-permission scopes would tighten it; it's all the app's own data dir either
  way.
- A Codex baseline still isn't recorded.
