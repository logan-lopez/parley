# Brief 5: The `review` question type

Read `CLAUDE.md`, [`README.md`](../README.md) and brief 2 first. Brief 3 must be merged: this brief
changes the tool description, and the harness is how you check what that does to uptake.

## Goal

One question that lists items for the user to approve or reject, each with an optional comment.
For example: "Here are the 14 files I'd delete. Strike any you want to keep." Or "These are the 9
changes I'd make. Approve them one by one."

This is the everyday agent question the current shape can't express. A choice question caps at 6
options, and multi-select means "pick some", not "decide on each one, with a reason for each
rejection". Of the richer inputs in the project doc, this is the one coding agents would use daily.
Rank and slider are rarer, and `preview` already covers most A/B comparisons.

## Ownership

You own the `review` additions to `packages/protocol/src/ask.ts` and `form.ts`, their tests and
fixtures, a new `apps/desktop/src/forms/renderers/ReviewRenderer.vue` and its registration, any
additions to the DOM contract in `src/forms/keyboard.ts`, the `review` case in
`apps/server/scripts/fake-hub.ts`, and the tool description in `apps/server/src/tools/ask.ts`.

## 1. Tool input (pinned)

`'review'` joins `QUESTION_TYPES`. A review question takes:

```ts
items: z.array(z.object({
  label: z.string().min(1).max(120),     // the item, e.g. a path or a one-line change summary
  detail: z.string().max(300).optional(),
  preview: z.string().optional(),        // markdown, shown when the row is focused (a diff fence, say)
})).min(1).max(30).optional(),
defaultDecision: z.enum(['approve', 'reject', 'none']).optional(),   // default 'approve'
```

Checks in `superRefine`, with messages written for the model:

- A review with no `items`: "question 2 has type 'review' but no items; list 1–30 items to approve
  or reject".
- `items` on any other type, and `options` on a review, each with a message that says which field
  belongs where.
- Duplicate item labels. Labels identify items in the answer, so they must be unique.

`defaultDecision: 'none'` means every item needs a decision before Send. The tool description
should tell the model when to use it: when a hurried Enter shouldn't approve everything.

## 2. Compiled schema (pinned)

A tuple array, so the schema describes itself and a raw-schema `ask_form` later could send the same
thing:

```ts
{
  'x-widget': 'review', title: header, description: question,
  type: 'array',
  items: items.map((item) => ({
    type: 'object',
    title: item.label,
    description: item.detail,           // omitted when absent
    'x-preview': item.preview,          // omitted when absent
    properties: {
      decision: { type: 'string', enum: ['approve', 'reject'] },
      comment: { type: 'string' },
    },
    ...(defaultDecision === 'none' && { required: ['decision'] }),
  })),
  minItems: n, maxItems: n, additionalItems: false,
  'x-default-decision': 'approve' | 'reject' | 'none',
}
```

Index-aligned: entry `i` of the data is item `i`. With a default decision, the renderer writes the
defaults into the data when it mounts, so the data is complete before the user touches it.
`shapeAnswer` also falls back to the default for any missing entry, so fake-hub and partial data
behave.

Document the widget in the vocabulary comment in `form.ts`. There's no elicitation downgrade for
this type. Say so there.

JSON Forms validates with AJV. Check that the tuple form compiles under its settings without
strict-mode warnings. That's why `minItems`, `maxItems` and `additionalItems` are all present.

## 3. Answer (pinned)

`value` stays inside the existing union: it's the approved labels, as `string[]`. The full picture
goes on a new optional field of the answer:

```ts
review?: { label: string; decision: 'approve' | 'reject'; comment?: string }[]   // in item order
```

Extend `askResultSchema` to match. The text lists the exceptions, not the whole list:

```text
The user answered:
- Cleanup: approved 11 of 14
  - Rejected: src/old.ts ("still imported by cli.ts")
  - Rejected: README.md
  - Approved, with a comment: package.json ("bump the version too")
```

When everything is approved without comments, one line is enough: `- Cleanup: approved all 14`.
Do the same when everything is rejected.

## 4. Renderer

`ReviewRenderer.vue`, registered with `widgetTester('review')`. The window is 440 px wide.

- **Rows:** the label, the detail in muted text under it, and a decision control with Approve and
  Reject states (plus undecided under `'none'`). A rejected row reads as struck at a glance, beyond
  just color.
- **Header line:** "11 of 14 approved", plus "Approve all" and "Reject all".
- **Preview:** the focused row's `x-preview` shows below the list, as in the choice renderer. Diffs
  will arrive as fenced `diff` blocks. Coloring `+` and `-` lines in those blocks is welcome if it
  stays in the markdown renderer and costs little. No syntax highlighter.
- **Comment:** a per-row text input, opened on demand. A row with a comment shows it inline.
- **Keyboard:** number keys don't scale to 30 rows, so rows aren't `[data-pick]`.
  - ↑/↓ and j/k move between rows.
  - Space toggles the focused row.
  - `a` approves the focused row and `r` rejects it.
  - Shift+A approves all and Shift+R rejects all.
  - `c` opens the focused row's comment. Esc in a comment returns to the row; it doesn't hide the
    window.
  - Enter submits, as everywhere else. Tab leaves the question.

  These are plain keys inside the window. The card claims digits, Enter, Tab and a few Cmd chords,
  so check `AskCard.vue` for in-window clashes, and `~/.config/keymap/keymap.md` for anything global.
  If the card needs a new hook from renderers, add it to the DOM contract in `forms/keyboard.ts` and
  document it there. Renderers still don't import the card.
- **Validation:** under `'none'`, the card's "Still needs an answer" line should say how many items
  are left ("Cleanup: 3 items undecided"). It shouldn't just repeat the header.

## 5. Tool description and instructions

Add `review` to the type list in the tool description: one line covering `items`, `detail`,
`preview` and `defaultDecision`. Add a sentence to the server instructions only if the harness says
the model doesn't reach for `review` without one: for example, "To approve a list of items (files to
delete, changes to apply), use one `review` question instead of several choice questions." The
instructions are capped at 2,048 characters, so count before you add.

Add two prompts to the harness:

- one that should produce a review question, such as removing dead files when the trial project has
  about 10 candidates;
- one where a plain choice is right, to catch review being overused.

`fake-hub`'s `fill` needs a `review` case. Approve all under `first`, reject the first item under
`second`, and under `other:<text>` reject the first item with `<text>` as its comment, so "used"
still has a sentinel to search for.

## 6. Fixtures and tests

Fixtures in `packages/protocol/fixtures/`:

- `review.json`: about 12 file paths with details.
- `review-diff.json`: 4 hunks with `diff` previews, and `defaultDecision: 'none'`.
- Add a review question to a mixed fixture alongside a choice question.

Tests cover:

- compiling with each `defaultDecision`;
- every validation message;
- `shapeAnswer` for all approved, all rejected, mixed with comments, missing entries falling back
  to the default, and a blank optional review.

## Acceptance

Run each of these and report the results.

1. `pnpm --filter @parley/protocol test` passes.
2. The gallery renders both review fixtures in light and dark, and each can be completed with only
   the keyboard, including comments and the "all" actions.
3. `fake-ask review-diff` works end to end in the real app, and the printed text matches section 3.
4. Harness, before and after the description change, on the full prompt set: uptake on the existing
   prompts doesn't drop by more than run-to-run noise, the review prompt produces a `review`
   question, and the choice-is-right prompt doesn't. Report both tables.
5. `pnpm typecheck` passes.

Then stop, and ask Logan before committing.
