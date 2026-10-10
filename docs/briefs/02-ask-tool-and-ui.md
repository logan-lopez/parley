# Brief 2: The `ask` tool and the question UI

Read `CLAUDE.md`, [`README.md`](README.md), and brief 1 first. Brief 1 must already be merged. You
build on its wire protocol, `AppClient`, `runAsk`, the webview ask store, and the `fake-ask` script.

## Goal

Turn the pipe into the product: an `ask` tool that models call well, a question-card UI that's fast
to answer from the keyboard, and answers the model can read at a glance. The bar is Claude's
built-in `AskUserQuestion`: it should feel at least that good to answer, and the model should use
it at least as readily.

## Ownership

You own `packages/protocol/src/form.ts` and a new `packages/protocol/src/ask.ts`;
`apps/server/src/tools/ask.ts` and the server instructions; and everything under
`apps/desktop/src/forms/` plus the card UI that replaces brief 1's crude `App.vue`.

## 1. Tool input (pinned)

Use a flat object with a `type` field. Don't use a Zod discriminated union: it emits `oneOf` in the
tool's input schema, and models and clients handle that worse than optional fields. Do cross-field
checks in `superRefine`, and write the error messages for the model to read, for example "question
2 has type 'choice' but no options".

```ts
const option = z.object({
  label: z.string().min(1).max(60),
  description: z.string().max(300).optional(),
  preview: z.string().optional(),            // markdown, shown when this option is focused
})

const question = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/).optional(),   // answer key; derived from header if absent
  header: z.string().min(1).max(12),         // short chip, e.g. "Auth method"
  question: z.string().min(1),               // markdown
  type: z.enum(['choice', 'text', 'number', 'boolean', 'path']).default('choice'),
  required: z.boolean().optional(),          // default true
  // choice
  options: z.array(option).min(2).max(6).optional(),
  multiSelect: z.boolean().optional(),
  allowOther: z.boolean().optional(),        // default true
  // text
  multiline: z.boolean().optional(),
  placeholder: z.string().optional(),
  // number
  min: z.number().optional(),
  max: z.number().optional(),
  integer: z.boolean().optional(),
  // path
  pathKind: z.enum(['file', 'directory']).optional(),   // default 'file'
  multiple: z.boolean().optional(),
  extensions: z.array(z.string()).optional(),
})

inputSchema: z.object({
  title: z.string().optional(),
  questions: z.array(question).min(1).max(4),
  timeoutSeconds: z.number().int().min(10).max(3600).optional(),   // default 600
})
```

Derived ids are a slug of the header, deduplicated with a numeric suffix.

## 2. The compiler and the `x-widget` vocabulary (`packages/protocol`)

`form.ts` documents the vocabulary: `choice`, `text`, `number`, `boolean` and `path`, plus the
`x-*` keys listed below. `ask.ts` holds two pure functions:

- `compileQuestions(input) → FormSpec`
- `shapeAnswer(input, outcome) → { structured, text }`

The root schema is `type: object`. It has one property per question, keyed by id, in the order
given, with a `required` array. Each property's `title` is the question's header and its
`description` is the question text. Treat every `description` as markdown.

| Type | Schema |
| --- | --- |
| choice, single | `type: string`. Options are `{ const: label, title: label, description, 'x-preview' }` entries. Use `oneOf` when `allowOther` is false. When it's true, use `anyOf` with the option entries followed by `{ type: 'string', minLength: 1, title: 'Other' }`. |
| choice, multi | `type: array`, `uniqueItems: true`, `items` set to the same `oneOf`/`anyOf`, and `minItems: 1` if required |
| text | `type: string`, `minLength: 1` if required, `x-multiline`, `x-placeholder` |
| number | `type: number` (or `integer`), `minimum`, `maximum` |
| boolean | `type: boolean`, with no default. A required boolean needs an explicit Yes or No. |
| path | `type: string`, or `array` of strings if `multiple`; `x-path-kind`, `x-extensions` |

Every property also gets its `x-widget`. Titled consts in `oneOf`/`anyOf` are MCP elicitation's
enum shape, so downgrading a flat form to native elicitation later means dropping the `Other`
branch, and nothing else.

`shapeAnswer` maps form data back to the questions. A choice value that isn't an option label is
the user's own text.

Add vitest to `packages/protocol` and unit-test both functions. Cover every type, Other in single
and multi select, a skipped optional question, id derivation and deduplication, and every outcome
status.

Put shared fixtures (question inputs) in `packages/protocol/fixtures/*.json`. The gallery,
`fake-ask` and the tests all use them. Cover each type, a preview-heavy choice, the four-question
maximum, and long markdown.

## 3. Tool result (pinned)

`structuredContent`, declared as an `outputSchema`:

```ts
{
  status: 'answered' | 'dismissed' | 'timed_out' | 'cancelled',
  message: string,                     // the text content, repeated (added in implementation, see below)
  answers?: Record<string, {           // keyed by question id; only when answered
    header: string,
    value: string | string[] | number | boolean | null,   // null = optional question left blank
    custom?: string,                   // the free text, if the user typed their own choice answer
  }>
}
```

Text content is what most models actually read, so make it scannable:

```text
The user answered:
- Approach: Workspace
- Name: "parley-ui" (their own answer, not one of the options)
- Files: /Users/logan/a.txt, /Users/logan/b.txt
```

- **dismissed:** "The user skipped this without answering. Don't ask it again. Continue with your
  best judgment and say what you assumed."
- **timed_out:** "No answer after N minutes, so the question was withdrawn. Continue with your best
  judgment and say what you assumed, or ask in chat."

Claude Code shows the model only `structuredContent` when a tool declares an `outputSchema`, and
drops the text content, so `message` repeats the text there. Without it, the skip and timeout
guidance never reaches Claude.

Return `isError` only for invalid input (Zod already handles that) and for the app being
unavailable. Set tool annotations `readOnlyHint: true` and `openWorldHint: false`; check the SDK's
field names.

## 4. Server instructions and tool description

These decide whether models reach for the tool at all. Start from this and tune it against what you
see in testing:

```text
Parley shows the user a form in a desktop window and returns their answers. Use `ask` when you need
a decision or preference from the user: choosing between approaches, confirming scope before a large
or irreversible change, or filling in a detail you can't infer.

- The user is notified, not interrupted. An answer can take minutes; the call waits until they
  answer, skip, or the timeout passes.
- Ask 1–4 questions per call. Prefer choice questions with 2–6 concrete options. Put your
  recommendation first and add " (Recommended)" to its label.
- Don't add an "Other" option. Choice questions accept free text automatically.
- Don't ask what the conversation, the code, or sensible defaults already answer.
- Never ask for passwords, API keys, or other secrets.
- If the user skips a question, don't ask it again. Proceed and say what you assumed.
```

Keep the tool description shorter. It's about the input shape, with one compact example call.

## 5. UI

Replace brief 1's crude `App.vue`. Window is 440 px wide, so design for that.

- **Card:** a source label (`client · project`), its age, an expiry countdown if `expiresAt` is set,
  and "1 of N". Below that, the title, then the questions stacked, each with its header chip, its
  markdown question and its widget. Skip and Send sit at the bottom. Send stays disabled until the
  form is valid, and the card says what's missing.
- **Renderers** go in `src/forms/renderers/`. Each has a tester that matches its `x-widget` and
  ranks above vanilla, and each is registered in `src/forms/renderers.ts`.
  - **choice:** option cards with label, description and a number-key hint. They act as radios or
    checkboxes. The Other row is an inline text input, and typing in it selects it. If any option
    has `x-preview`, show the focused or selected option's preview below the list; side by side
    doesn't fit 440 px.
  - **text:** single-line or multiline.
  - **number:** a number input with min and max.
  - **boolean:** a Yes/No segmented control with nothing selected at first.
  - **path:** a button that opens the native picker, the chosen paths with remove buttons, and
    paths only. No file contents.
- **Keyboard** (check `~/.config/keymap/keymap.md` for conflicts before you settle these):
  - `1`–`9` pick an option in the active question, unless a text input has focus.
  - Tab and Shift+Tab move between questions.
  - Enter submits when the form is valid and focus isn't in a multiline input. Cmd+Enter always
    submits.
  - Cmd+. skips. (Was Cmd+Backspace, but that's delete-to-line-start in a text field, so it couldn't
    skip from one. Cmd+. is macOS's cancel.)
  - Cmd+[ and Cmd+] move through the queue.
  - Esc hides the window (from brief 1).
  - Show the hints quietly in the UI.
- **Flow:** after Send or Skip, go to the next queued ask. When the queue is empty, hide the window.
  If the visible ask is cancelled or times out while the user is looking at it, show a short note
  ("Withdrawn by the agent") before moving on. Don't let it vanish under them.
- **Markdown:** `markdown-it` with `html: false` and `linkify: true`. Link clicks open in the
  default browser through the platform adapter and never navigate the webview. Code blocks are
  monospace, with no highlighter.
- **Platform adapter:** `src/platform.ts` exports `pickPaths(opts)` (the dialog plugin) and
  `openExternal(url)` (add `tauri-plugin-opener` and its capability). Renderers import only this,
  never `@tauri-apps/*`, so they can run in an MCP Apps iframe later.
- **CSP:** the config currently says `csp: null`, and you're rendering text a model wrote. Set a
  real CSP in `tauri.conf.json` and check that `tauri dev` and HMR still work with it.
- **Style:** restyle the vanilla renderers. System font, compact, light and dark through
  `prefers-color-scheme`. No component library.
- **Gallery:** a dev-only view (`import.meta.env.DEV`, for example with `?gallery`) that renders
  every fixture through `compileQuestions` without the hub. Submitting shows the `shapeAnswer`
  output. Do most of the UI work here.

## 6. Wire the tool

`tools/ask.ts`: parse the input, then `compileQuestions`, then `runAsk` from brief 1, then
`shapeAnswer`, then return. Also extend `fake-ask` so it accepts a question-input fixture: compile
it, ask, and print both the text and the structured result.

## 7. Real-client testing

- **Claude Code:** Claude Code will choose its built-in `AskUserQuestion` over Parley. In a scratch
  project, deny the built-in with `permissions.deny` in `.claude/settings.local.json`, and check
  that deny actually works for built-in tools. Allow `mcp__parley__ask` there so every ask doesn't
  trigger a permission prompt. Then write three prompts that should make the model ask, such as an
  ambiguous refactor, a choice between libraries, and a destructive cleanup. Record whether it asked,
  whether the first call validated, and whether it used the answer correctly. Tune the instructions
  and error messages on what fails.
- **One non-Claude client:** ask Logan which one. Confirm it negotiates with the SDK v2 server and
  that the round trip works.

## Acceptance

Run each of these and report the results.

1. `pnpm --filter @parley/protocol test` passes.
2. The gallery renders every fixture correctly in light and dark mode, and you can complete each
   one with only the keyboard.
3. `fake-ask` with each fixture works end to end.
4. In Claude Code, the model uses Parley without being told in at least 2 of the 3 prompts, its
   input validates, and it acts on the answer. Skip and timeout lead to sensible follow-up.
5. The non-Claude client round-trips.
6. `pnpm typecheck` passes.

Then stop, and ask Logan before committing.
