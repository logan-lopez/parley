# The form spec

Two layers. The model writes a questions array, shaped like Claude's `AskUserQuestion`. The server
compiles it to JSON Schema with `x-widget` hints, which is all the app renders. After the user
answers, the same package shapes the answer back into a structured result and a line of text per
question.

**Sources:** `packages/protocol/src/ask.ts`, `packages/protocol/src/form.ts`, `packages/protocol/fixtures/`

**History:** [brief 2](../briefs/archive/02-ask-tool-and-ui.md), [brief 5](../briefs/archive/05-review-question.md) (`review`)

`ask.ts` is the `@parley/protocol/ask` entry: the tool's Zod input schema (`askInputSchema`), the
result schema, `compileQuestions` and `shapeAnswer`. They're pure functions, shared by the server,
`fake-ask`, the gallery, the inline card and the tests. `form.ts` documents the schema vocabulary
the app renders and holds its types.

## How it works

- **What the model writes.** `{ title?, questions: 1–4, timeoutSeconds?: 10–3600 }`. Each question
  has a `header` (a chip of 12 characters or fewer), the `question` (markdown), a `type` (default
  `choice`), optional `id` (snake_case) and `required` (default true), and the fields for its
  type:
  - `choice`: 2–6 `options`, each `{ label (≤60), description?, preview? }`, plus `multiSelect`
    and `allowOther` (default on).
  - `text`: `multiline`, `placeholder`. `number`: `min`, `max`, `integer`. `boolean`: nothing.
  - `path`: `pathKind` (`file` or `directory`), `multiple`, `extensions`.
  - `review`: 1–30 `items`, each `{ label (≤120), detail?, preview? }`, and `defaultDecision`
    (`approve`, `reject` or `none`).
- **Validation errors are written for the model.** The `superRefine` in `askInputSchema` catches
  the mistakes models make (options on a review, items on a choice, an "Other" option, duplicate
  labels or ids, `min` above `max`) and says what to do instead. The SDK rejects invalid input
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
  - `text`: a `string`, `minLength: 1` when required, `x-multiline`, `x-placeholder`.
  - `number`: `number` or `integer`, with `minimum`/`maximum`.
  - `boolean`: a `boolean` with no default, so nothing is picked at first.
  - `path`: a string, or an array of strings for `multiple`, with `x-path-kind` and
    `x-extensions` (dots stripped).
  - `review`: a tuple array, one object schema per item (`title`, `description`, `x-preview`,
    `properties: { decision: approve|reject, comment }`), index-aligned with the data, with
    `minItems`, `maxItems` and `additionalItems: false` pinning the length.
    `x-default-decision` tells the renderer what to write into every entry on mount; under `none`
    each item has `required: ['decision']` instead.
- **Markdown** in `description` and `x-preview` renders without raw HTML and without images
  (`apps/desktop/src/forms/markdown.ts`).
- **The result** (`askResultSchema`): `status` (`answered`, `dismissed`, `timed_out`,
  `cancelled`), `message`, `answers` keyed by id, and `note`. Each answer has `header`, `value`
  (a string, strings, a number, a boolean, or null for an optional question left blank), `custom`
  (the user's own text when it isn't an option) and, for a review, `review`: every item's
  `{ label, decision, comment? }` in order, while `value` is the approved labels.
- **The text** (`shapeAnswer`) leads with "The user answered:" and one line per question. Own
  answers are quoted and marked as not one of the options. A review leads with the majority
  decision and lists only the exceptions and the comments. A note is quoted after the answers.
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
  branch. `review` has no downgrade: elicitation forms are flat.
- **A review's data is always a full array** when it comes from the app (the renderer writes the
  defaults, or the form requires every decision). `shapeAnswer` still fills gaps from `fake-hub` or
  partial data with the default, and under `none` that default is reject, so nothing is approved
  that the user didn't approve.
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
  view (the most power, at the most security and consistency cost).
