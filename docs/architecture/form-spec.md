---
sources: ["packages/protocol/src/ask.ts", "packages/protocol/src/form.ts", "packages/protocol/src/show.ts", "packages/protocol/src/media.ts", "packages/protocol/fixtures/"]
---
# The form spec

Two layers. The model writes a questions array, shaped like Claude's `AskUserQuestion`. The server
compiles it to JSON Schema with `x-widget` hints, which is all the app renders. After the user
answers, the same package shapes the answer back into a structured result and a line of text per
question.

**History:** [brief 2](../briefs/archive/02-ask-tool-and-ui.md), [brief 5](../briefs/archive/05-review-question.md) (`review`), [brief 10](../briefs/archive/10-text-drafts.md) (`draft`), [brief 11](../briefs/archive/11-review-decisions.md) (review `decisions`), [brief 12](../briefs/archive/12-capture-question.md) (`capture`), [brief 16](../briefs/16-show-blocks.md) (`show`), [brief 17](../briefs/17-editable-show.md) (`editable`), [brief 21](../briefs/21-dont-ask-again.md) ("Don't ask again here")

`ask.ts` is the `@parley/protocol/ask` entry: the tool's Zod input schema (`askInputSchema`), the
result schema, `compileQuestions` and `shapeAnswer`. They're pure functions, shared by the server,
`fake-ask`, the gallery, the inline card and the tests. `form.ts` documents the schema vocabulary
the app renders and holds its types. `show.ts` has the show caps, `ShowEdit` and `fileMarkdown`,
with no Zod, so the window can import it from the root entry.

## How it works

- **What the model writes.** `{ title?, questions: 1–4, timeoutSeconds?: 10–3600 }`. Each question
  has a `header` (a chip of 12 characters or fewer), the `question` (markdown), a `type` (default
  `choice`), optional `id` (snake_case) and `required` (default true), and the fields for its
  type:
  - `choice`: 2–6 `options`, each `{ label (≤60), description? (300, soft), preview? (≤10,000) }`, plus `multiSelect`
    and `allowOther` (default on).
  - `text`: `multiline`, `placeholder`, and `draft` (up to 4,000 characters), text the agent
    wrote for the user to edit in place. `number`: `min`, `max`, `integer`. `boolean`: nothing.
  - `path`: `pathKind` (`file` or `directory`), `multiple`, `extensions`.
  - `review`: 1–30 `items`, each `{ label (≤120), detail? (300, soft), preview? (≤10,000) }`, optional `decisions`
    (2–4 labels of 12 characters or fewer, used instead of approve and reject, the most cautious
    last), and `defaultDecision`: `approve`, `reject` or `none`, or with `decisions` one of them
    or `none`, defaulting to the first.
  - `capture`: `accept` (`text`, `image` or `any`, the default) and `placeholder`.
  - `show`: something to look at, with nothing to answer. `content` (markdown, up to 20,000
    characters) or `path` (a file in the project, which the server reads; [the ask
    tool](ask-tool.md#show-files)), with `lines: [start, end]` for part of it. `question` is its
    lead line. No `required`, since there's nothing to answer, and a form needs at least one
    question that isn't a show: a form of only shows would block the agent with nothing to send
    back, which is `notify` ([decision](../decisions/show-blocks.md)). Shows count toward the 1–4.
    `editable: true` on a whole-file `path` show lets the user edit the file in place; the server
    saves it ([the ask tool](ask-tool.md#editable-shows),
    [decision](../decisions/editing-a-shown-file.md)).
- **Soft limits.** The published JSON Schema (what the model reads) says `header` ≤12 and
  `description` and `detail` ≤300; the Zod schema (what's accepted) takes a header up to 24 and a
  description or detail up to 500. `.meta({ maxLength })` sets the first and `.max()` the second
  (checked on zod 4.6.5 and the MCP SDK 2.3.1: the SDK validates with Zod and publishes the
  schema). Of 1,006 real asks, 66 bounced on lengths a few characters over (about 40 on a 301 to
  475 character description, 20 on a 13 or 14 character header), and each bounce was a round trip.
  The tight number keeps cards short; the margin catches the near miss. A header past 12 is
  clipped on the card's chip ([the card](card-ui.md)); its id, the compiled `title` and the
  answer's `header` keep the full text. Labels stay hard limits, because a label is the answer
  value and clipping it would change the answer ([decision](../decisions/soft-input-limits.md)).
  A show's `content` has no soft margin: past 20,000 the message points at `path`.
- **Validation errors are written for the model.** The `superRefine` in `askInputSchema` catches
  the mistakes models make (options on a review, items on a choice, an "Other" option, a draft on
  anything but text, decisions on anything but review, `accept` on anything but capture, duplicate labels, decisions or ids, a
  `defaultDecision` that isn't one of the decisions, `min` above `max`; for shows, both or neither
  of `content` and `path`, `lines` without a path or backwards, `content`, `path` or `lines` on
  another type, `required: true`, and a form of only shows; `editable` on another type, without a
  `path` (it points at a text question's `draft`), or with `lines`) and says what to do instead.
  `required: false` on a show and `editable: false` anywhere are accepted, since they change
  nothing. The SDK rejects invalid input
  before the tool runs, so the model sees the message and retries.
- **Answer keys.** An explicit `id` wins; otherwise a slug of the header, `_2`, `_3` on
  collisions, with explicit ids reserved first (`questionIds`).
- **What goes over the wire** (`compileQuestions`): a root `type: object` with one property per
  question, in order, and a `required` array. Each property has `title` (the header),
  `description` (the question) and `x-widget`:
  - `choice`: the options as titled consts, `{ const, title, description?, 'x-preview'? }`. With
    free text allowed they're in `anyOf`, followed by `{ type: 'string', minLength: 1, title:
    'Other' }`; without, in `oneOf`. Single select is a `string`; multi select is an array with
    `uniqueItems` and the options on `items`.
  - `text`: a `string`, `minLength: 1` when required, `x-multiline`, `x-placeholder`, and
    `x-draft`. A draft with a line break always gets `x-multiline`. The renderer writes the draft
    into the data on mount, so an untouched draft satisfies `required`; in an elicitation
    downgrade it would be the field's `default`.
  - `number`: `number` or `integer`, with `minimum`/`maximum`.
  - `boolean`: a `boolean` with no default, so nothing is picked at first.
  - `path`: a string, or an array of strings for `multiple`, with `x-path-kind` and
    `x-extensions` (dots stripped).
  - `review`: a tuple array, one object schema per item (`title`, `description`, `x-preview`,
    `properties: { decision, comment }`), index-aligned with the data, with `minItems`,
    `maxItems` and `additionalItems: false` pinning the length. `decision.enum` is the decisions:
    `['approve', 'reject']`, or the question's own, the first being the positive one. The renderer
    reads them from there, so there's no `x-` key for them. `x-default-decision` (a decision, or
    `none`) tells the renderer what to write into every entry on mount; under `none` each item has
    `required: ['decision']` instead. Without `decisions` the schema is what it was before they
    existed.
  - `capture`: an object, `properties: { text: string, images: string[] (maxItems 5) }` with
    `additionalProperties: false`, `x-accept`, and `x-placeholder`. Under `accept: 'text'` or
    `'image'` the other property is left out. When required, an `anyOf` asks for a non-empty
    `text` or a non-empty `images`, or a plain `required` when only one is accepted; the
    branches repeat `type`, which strict AJV needs. `images` hold absolute paths of PNGs the app
    saved. A text-only capture would downgrade to a string field; images have no downgrade.
  - `show`: `type: 'null'`, never in `required`, and no data. `x-content` is the markdown body:
    the agent's `content`, or the file as `fileMarkdown(path, text)` makes it: `.md`,
    `.markdown` and `.mdx` as they are, `.html`/`.htm` and `.svg` as preview fences
    (```` ```html preview ```` and ```` ```svg preview ````) at 640×480, scaled to fit, and
    anything else as a fence in its language from a small map by extension (none for an unknown
    one), longer than any backtick run in the text. `x-source: { path, lines?, totalLines }` names the file and the range shown.
    `compileQuestions(input, files?, media?)` takes the files the server read (`ShowFiles` in `form.ts`,
    keyed by question id: `{ path, text, lines?, totalLines, sha256 }`, the hash of the whole file
    even with `lines`). Without them a path-backed show gets `x-source: { path, lines? }` and no
    `x-content`, and the card says the file isn't loaded: that's the gallery, and any compile
    from the tool input alone. Why `type: 'null'`: JSON Forms' default UI schema makes no control
    for a property without a `type`, so no renderer would run; `null` makes one, and with no data
    there's nothing for AJV to check (strict mode included). No elicitation downgrade: there's no
    field to fill.
    An editable show is `type: object` instead, `properties: { text: string (maxLength 200,000), base: string }` with
    `additionalProperties: false`, `x-editable: true`, and still never required. `x-original` is
    the file's text as read (line endings included), which the editor starts from, `x-content`
    its markdown as for any show, and `x-source: { path, totalLines, sha256 }`. The renderer
    writes `{ text, base }` on mount: `base` is the hash of the version the text started from,
    which the server checks the disk against before it writes. Without the file it compiles
    with `x-source: { path }` alone, and isn't editable.
- **Window-only forms** (`isWindowOnly` in `form.ts`): a form with a `path` question, or a
  `capture` whose `x-accept` isn't `text`, can't be answered in an MCP Apps card (no file picker
  in the host's iframe, and nowhere to save an image). The server doesn't send it `inline`, and
  the card shows it read-only ([inline cards](inline-cards.md)).
- **Markdown** in `description`, `x-preview` and `x-content` renders without raw HTML; local
  images are resolved separately (`apps/desktop/src/forms/markdown.ts`): model HTML only ever
  reaches the screen as an image the
  app builds. Colors in code spans get swatches, a palette fence (```` ```palette ````) draws
  swatches, a ```` ```compare ```` fence with two image paths draws a flippable before/after
  frame, and an ```` ```html preview ```` or ```` ```svg preview ```` fence is drawn as a
  picture ([the card](card-ui.md)); the schema carries them as plain markdown, so a client without
  Parley's renderer shows the text. Previews are capped at 10,000 characters, since they're kept
  in `history.jsonl`; question text isn't.
- **Project media** (`media.ts`): root `x-media` is a map keyed by the markdown destination,
  `MediaEntry = { kind: 'image' | 'audio', files: MediaFile[] }`. An image has one file; a sound
  has one, or a glob's variants in play order (`isMediaGlob`: a `*` or `?` in the last path
  segment). Each file
  carries `{ path, abs, sha256, bytes, mime }`: project-relative name, real absolute path, and
  the hash, size and sniffed type. No bytes go over the hub or into history. `compileQuestions(input, files?, media?)`
  attaches resolved entries; absent entries render as unloaded. `mediaRefs(text)` shares
  markdown-it's grammar with the renderer, preserves destination spelling, reads valid
  ```` ```compare ```` fences (`parseCompare`: two non-empty lines, each `<path>` or `<path> <label>`
  with `<path with spaces>` in angle brackets, defaulting labels to `A` and `B`, images only), and skips other code,
  fences, schemes and protocol-relative URLs. `askMediaRefs` (and `askCompareFences` for server validation) scans questions, option descriptions
  and previews, review details and previews, show content and shown markdown files. The tool's
  Zod input is unchanged. Caps: 25 MB per file, 200 media files per ask (each variant counts),
  1–12 variants per glob (`MEDIA_VARIANTS_MAX`); inline payloads use 2 MB per image and 8 MB per
  ask (source bytes), and never carry sounds. `SOUND_GAP_MS` (150) is the pause between
  variants. `looksLikeSound(src)` guesses a ref's kind from its name before it's resolved (a
  glob, or a sound extension). SVG uses a path-backed show.
- **Show caps** (`show.ts`): `content` up to 20,000 characters (in the Zod schema); a file's text,
  after `lines`, up to 100,000 characters, and at most 2 MB read from disk; everything one ask
  shows, content and files together, up to 200,000, with an editable file counted twice (its
  text is in `x-content` and `x-original`); an editable show's `text`, the edit sent back, up to
  200,000 (`SHOW_EDIT_MAX`, the schema's `maxLength` and the textarea's `maxlength`). They keep a
  form and an answer well under the hub's 1 MiB line, and history's snapshots bounded. A line
  over it never arrives: the hub closes the connection, and the server re-sends its pending asks
  on reconnect.
- **The result** (`askResultSchema`): `status` (`answered`, `dismissed`, `timed_out`,
  `cancelled`), `message`, `answers` keyed by id, `remember` and `note`. Each answer has `header`, `value`
  (a string, strings, a number, a boolean, or null for an optional question left blank), `custom`
  (the user's own text when it isn't an option) and, for a review, `review`: every item's
  `{ label, decision, comment? }` in order, while `value` is the labels of the items given the
  first decision (the approved ones, without `decisions`). A text question
  with a draft adds `edited`: whether the final text differs from the draft, both trimmed and with
  line endings normalised, so re-wrapping the end isn't an edit. A draft cleared to blank is
  `value: null`, `edited: true`. A capture's `value` is the pasted text verbatim (null when
  there's none, or only whitespace), and `images` its screenshots' paths. An editable show's
  `value` is its path, `edited` whether the text differs from the file (line endings
  normalised), and, once edited, `written` (Parley saved it), `conflict` (it didn't: the file
  changed on disk after it was shown), `error` (it didn't: the write failed or the path was
  refused) and `diff` (unified, 3 lines of context, against the text the user was shown).
  Past 20,000 characters a saved edit's diff is left out for `changedLines` (`SHOW_DIFF_MAX`);
  an unsaved one keeps it, since it's the only copy of the edit. `ShowEdit` (`show.ts`) is what
  the server hands `shapeAnswer` in `extra.edits`.
- **Remembered answers** ([decision](../decisions/dont-ask-again.md)): `remember` is a list of
  `{ id, header, value }`, one per question the user turned "Don't ask again here" on for, in
  question order, with `value` the answer given. Only a single-select choice or a boolean
  qualifies (`canRemember`); an id that isn't a question in the ask, is of another type, or whose
  answer was left blank is dropped, and so is all of it on a skip. The key is left out when
  nothing is left.
- **The text** (`shapeAnswer`) leads with "The user answered:" and one line per question. Own
  answers are quoted and marked as not one of the options. A draft reads "accepted the draft as
  written", or "edited the draft:" with the final text indented below, or "(cleared the
  draft)"; there's no diff. A review leads with the majority
  decision and lists only the exceptions and the comments. With its own decisions it leads with
  the counts, majority first ("Port 8, TODO 4, Skip 2 (of 14)", or "Port all 14"), then the
  other decisions' items grouped by decision, then majority items with a comment. A capture fences its
  text verbatim, indented under the line ("pasted 24 lines:"), with a fence longer than any run
  of backticks in it; one line of 120 characters or fewer is quoted instead (`pasted "v2.1.296"`).
  Screenshots follow as paths, one per line, introduced as PNG files the agent can read. A
  remembered answer follows the answers: "They don't want to be asked this again in this
  project:" ("these" for more than one) and a line per question, then the instruction: write one
  line for the project's agent instructions (`AGENTS.md`, or `CLAUDE.md` if there's no
  `AGENTS.md`), show it with `ask` as a `text` question with that line as its `draft`, save it
  only if they accept or edit it, and until then act on the answer without asking again in this
  session. A note is quoted after that.
  A show has no entry in `answers` and no line; its id is still taken in `questionIds`, so the
  ids around it don't shift. An editable one does: "left docs/plan.md unchanged", "edited
  docs/plan.md, and Parley saved it:" with the diff fenced as ```` ```diff ```` and indented, or
  that it wasn't saved, why, and the diff; over the cap, "(N lines changed) … run `git diff`".
  Without `edits` (the gallery) the line says the server saves it, and `extra.files`, when given,
  tells an edit from the file as it was. A draft's answer stays the full text: the diff is for
  files ([decision](../decisions/drafts-to-edit.md)).
  Skips and timeouts each get a sentence that tells the model what to do next (don't ask again,
  continue and say what you assumed); a cancel only says so. `message` is the same text.
- **Fixtures** in `packages/protocol/fixtures/` are `ask` tool input, at least one per question type.
  The gallery, `fake-ask` and the desktop tests all read them.

## Rules worth keeping

- **The app renders JSON Schema only.** It knows nothing about the questions array. A new
  question type is a compiler case here, a renderer with a tester in the app
  ([the card](card-ui.md)), and a fixture.
- **Keep choice options in the titled-enum shape** MCP elicitation uses (`oneOf`/`anyOf` of
  `{ const, title }`). A flat form can then downgrade to native elicitation by dropping the Other
  branch. `review` has no downgrade: elicitation forms are flat. A `show` has none either: it has
  no field.
- **A review's data is always a full array** when it comes from the app (the renderer writes the
  defaults, or the form requires every decision). `shapeAnswer` still fills gaps from `fake-hub` or
  partial data with the default, and under `none` with the last decision: reject, or the most
  cautious of the agent's own if it followed the tool description. Nothing gets the first
  decision that the user didn't give it. An entry whose decision isn't one of the question's is a
  gap too.
- **Tuples need `minItems` and `additionalItems`.** AJV's strict mode warns without them, and the
  desktop's `schemas.test.ts` compiles every fixture under strict mode.
- **The tool description carries the shape and an example;** the fields aren't `.describe()`d one
  by one, since that bloats every `tools/list`.

## Decisions

- **Why a questions array, not raw JSON Schema:** models already write `AskUserQuestion`'s shape
  reliably, and raw JSON Schema is the input shape they write worst. The schema stays the
  intermediate form, so a raw-schema `ask_form` later is a pass-through.
- **Why `x-widget` hints, not JSON Forms UI schemas:** UI schemas are verbose, and the model
  shouldn't write them. JSON Forms generates a default layout, and the testers match on `x-widget`.
- **The cost:** nearly every widget is a custom renderer, so JSON Forms pays off mostly later, with
  arbitrary schemas. Its AJV validation compiles with `new Function`, so the CSP allows
  `'unsafe-eval'` ([the desktop shell](desktop-shell.md#rules-worth-keeping)).
- **Rejected:** a compact markdown-ish DSL (fewer tokens, but the model relearns it from the tool
  description every call, and Parley would own a parser), and raw HTML components in a sandboxed
  view (the most power, at the most security and consistency cost). That was about interactive
  input; brief 14's previews, static pictures with nothing to answer, don't reopen it.
