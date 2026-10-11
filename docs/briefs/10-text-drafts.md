# Brief 10: Drafts you edit in place

Read `CLAUDE.md`, [`README.md`](README.md), [the form spec](../architecture/form-spec.md),
[the card](../architecture/card-ui.md) and [testing](../architecture/testing.md) first. Brief 5
([`archive/05-review-question.md`](archive/05-review-question.md)) is the model for adding to a
question type end to end. No prerequisites.

## Goal

A `text` question can carry a `draft`: text the agent wrote, prefilled in the card for the user to
edit or send as it is. The answer says whether they changed it.

Why now: about 10 real asks were "Commit as written (Recommended) / Not yet" cards with the whole
commit message in a code block in the question. A trial-prompt review offered "Approve as drafted /
Approve with edits / Rework". Changing one word of a drafted commit message, PR body or changelog
entry takes two round trips today: one to say no, and one to say what to change. With a draft, it's
one edit and Cmd+Enter. (From `ideate`, 2026-10-10, mining the session transcripts and
`history.jsonl`.)

## Decisions already made

- **The field is `draft`, on `text` only.** Not a new question type. (Logan, 2026-10-10, from the
  ideate write-up.)
- **What comes back:** `value` is the final text, plus `edited: true | false` on the answer. The
  message says "accepted the draft as written", or "edited the draft" and quotes the final text.
  No diff in the message. (Logan, 2026-10-10.)
- **Trials:** this brief runs only its own new prompt (`--prompt changelog-draft`). Brief 12 runs
  the full pass for all three briefs and compares it with the baseline. (Logan, 2026-10-10.)

Don't revisit these silently.

## Already checked

- `TextRenderer.vue` keeps a local `text` ref and writes `undefined` for whitespace-only input
  (`apps/desktop/src/forms/renderers/TextRenderer.vue`, 2026-10-10). There's no prefill today.
- JSON Forms doesn't apply schema `default`s to the data unless AJV runs with `useDefaults`. The
  review renderer writes its defaults into the data on mount for this reason
  (`ReviewRenderer.vue`, `onMounted`). Do the same here rather than relying on `default`.
- The trial scorer records each question as `{ header, type }` (`apps/server/scripts/trial-score.ts`,
  `questionsOf`), and `used` searches the final message plus the added lines of `git diff --cached
  HEAD` (`trial.ts`). A prompt whose result is a commit wouldn't show up in that diff, so the new
  prompt writes a file instead.

## Open questions

- **How tall the textarea grows.** Default: fit the draft, up to about 12 rows, then scroll.
  Logan says if it feels wrong in the window.

## Shape

### Tool input (pinned)

`draft: z.string().min(1).max(4000).optional()` on the question, in `askInputSchema`. Checks in
`superRefine`, with messages written for the model:

- `draft` on any type but `text`: "question N has a draft but type 'X'; drafts only apply to type
  'text', so set type to 'text' or drop it".
- `draft` and `placeholder` together: allowed. The placeholder only shows if the user clears the
  box.

A draft containing a newline implies `multiline`, whatever `multiline` says.

### Compiled schema (pinned)

The `text` case in `compileQuestion` adds `'x-draft': q.draft`, and `'x-multiline': true` when the
draft has a newline. Document `x-draft` in the vocabulary comment in `form.ts`. Elicitation
downgrade: `x-draft` maps to `default` on a string field, so say that in the comment too.

### Renderer

`TextRenderer.vue`:

- **Prefill.** On mount, if the data is empty and `x-draft` is set, write the draft into the data
  and the local ref, like `ReviewRenderer`'s `onMounted`. An untouched draft then satisfies
  `required`, and Cmd+Enter sends it as written. Don't overwrite data that's already there (a
  restored draft from `persist.ts`, or a read-only history view).
- **Size.** The textarea grows to fit the draft, up to about 12 rows.
- **Style.** Keep the existing text style, not monospace. Commit messages read fine in it.
- **A way back.** A small "Reset to draft" link button under the box, shown only once the text
  differs from the draft. It's `tabindex="-1"`, like the review renderer's "Approve all".
- **Focus.** `data-primary` stays on the textarea. Put the caret at the end of the draft, not at
  the start, and don't select all: a stray keystroke would replace the whole draft.

### Answer (pinned)

`askResultSchema`'s answer gains `edited: z.boolean().optional()`, set only for a text question
with a draft. In `readAnswer`, `edited` is the final text compared with the draft, with both
trimmed and line endings normalised.

Text from `shapeAnswer`:

```text
The user answered:
- Commit: accepted the draft as written
- Changelog: edited the draft:
  Fix negative amounts in `fromCents`.

  Amounts below zero lost their sign.
```

The edited text is indented like the multi-line text that `describe` already handles. An optional
draft question cleared to blank reads `- Commit: (cleared the draft)`, with `value: null` and
`edited: true`.

### Tool description

One sentence on the `text` line in `apps/server/src/tools/ask.ts`, along the lines of: "`draft`:
text you wrote for the user to edit in place, such as a commit message or PR description; the
answer says whether they changed it." Keep it to one sentence. Leave the server instructions
alone.

### fake-hub and the trial scorer

- `fill` in `apps/server/scripts/fake-hub.ts`, for a `text` with `x-draft`:
  - under `first`, the draft unchanged;
  - under `other:<text>`, the draft with `<text>` appended as its last line;
  - otherwise, as now.
- `questionsOf` in `trial-score.ts` records `type: 'text+draft'` when a text question has a draft,
  so the results show it without opening the transcript.

### Trial prompt

`apps/server/trials/prompts/changelog-draft.md`:

```markdown
---
expect: ask
reply: other:Also thank the zephyr importer folks
match: zephyr
---
Add a CHANGELOG.md entry for the fix to negative amounts in fromCents. Let me check the wording before you write it.
```

Add its row to the prompts table in `apps/server/trials/README.md`: "an edit-in-place draft:
should be one `text` with a `draft`". Judge it by eye from `questions`, like `prune-unused`.

### Fixture

`packages/protocol/fixtures/text-draft.json`: a multi-line commit message draft and a one-line
optional title draft, so the gallery shows both sizes.

### Docs

- **Guide:** the Text section of `docs/guide/question-types.md` gains a paragraph on drafts: the box
  starts with the agent's text, Cmd+Enter sends it as is, and "Reset to draft" puts it back.
- **Form spec page:** the `text` bullets under "What the model writes" and "What goes over the
  wire", and `edited` under "The result".
- **README:** the root README's "A form language" bullet if the list of types reads wrong. It
  probably doesn't need to change.

## Out of scope

- Diffs in the message (decided against above).
- Drafts on `choice`'s Other row, or on anything but `text`.
- Track-changes styling in the textarea.
- A full trial pass. Brief 12 does it.

## Acceptance

1. `pnpm --filter @parley/protocol test` passes, with new tests for:
   - compiling a draft, including the newline-forces-multiline rule;
   - the wrong-type validation message;
   - `shapeAnswer` for an untouched draft, an edited one, a whitespace-only change (not edited),
     and an optional draft cleared to blank.
2. `pnpm --filter @parley/desktop test` passes. `schemas.test.ts` compiles the new fixture under
   strict AJV.
3. `pnpm typecheck` passes.
4. The gallery (`pnpm --filter @parley/desktop dev`, then `?gallery&fixture=text-draft`) shows both
   drafts prefilled, in light and dark. Cmd+Enter sends them untouched, and "Reset to draft"
   appears after an edit and works.
5. `pnpm --filter @parley/server fake-ask text-draft` against the real app prints "accepted the
   draft as written" when sent untouched, and the edited text when changed. This opens the app
   window: ask Logan once before running it.
6. `pnpm --filter @parley/server trial --prompt changelog-draft --runs 3`: report the table and the
   `questions` per run. It should ask with `text+draft` in most runs. A model that asks with a
   choice instead is a finding to report, not a reason to change the description further in this
   brief.

By hand, for Logan:

- A real Claude Code session with a commit to make: does the model reach for a draft, and does
  editing it in the window feel right?

Then stop. Ask Logan before committing.
