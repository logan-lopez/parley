# Brief 12: Capture, and copy buttons on code

Read `CLAUDE.md`, [`README.md`](README.md), [the form spec](../architecture/form-spec.md),
[the card](../architecture/card-ui.md), [inline cards](../architecture/inline-cards.md),
[the desktop shell](../architecture/desktop-shell.md), [asks and history](../architecture/asks-and-history.md)
and [testing](../architecture/testing.md) first. Briefs 10 and 11 must be merged: this brief runs
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
  `structuredContent` when a tool has an `outputSchema` ([the ask tool](../architecture/ask-tool.md#claude-code-and-long-asks)),
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
