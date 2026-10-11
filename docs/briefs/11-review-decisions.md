# Brief 11: Review with its own decisions

Read `CLAUDE.md`, [`README.md`](README.md), [the form spec](../architecture/form-spec.md),
[the card](../architecture/card-ui.md), [testing](../architecture/testing.md) and brief 5
([`archive/05-review-question.md`](archive/05-review-question.md)) first. That brief built the
`review` type this one extends, and its pinned shapes are where this starts. Brief 10 should be
merged first: both edit `ask.ts`, the tool description, `fake-hub` and `trial-score.ts`.

## Goal

A `review` question can name its own decisions, 2–4 short labels such as `["Port", "TODO",
"Skip"]`, instead of approve and reject. Each item gets one of them. Without `decisions`, a review
works exactly as it does now.

Why now: the real asks show per-item decisions crammed into multi-select plus free text. "Which
ports in the next pass?" came back as `zellij + hermes + oh-my-zsh, nvim, Leave jetbrains and fzf
marked as TODO`. "Which workspaces are pinned to the laptop" was really an assignment, not a pick.
Hands-on acceptance checklists came back as a multi-select of the checks that passed, with nowhere
to put the failures. Meanwhile, the per-item comment `review` already has went unused in every real
ask. The missing piece is the decision set, not more room to type. (From `ideate`, 2026-10-10,
mining the session transcripts and `history.jsonl`.)

## Decisions already made

- **Extend `review`, don't add a type.** One renderer, one answer shape. (Logan, 2026-10-10, from
  the ideate write-up.)
- **`value` is the labels of the items given the first decision.** It stays `string[]`, so the
  answer union doesn't change, and every item's decision is in `review`, as now. Without
  `decisions`, the first decision is approve, so this is the same rule as today's "approved
  labels". (Logan, 2026-10-10.)
- **Trials:** this brief runs only its own new prompt (`--prompt sort-helpers`). Brief 12 runs the
  full pass. (Logan, 2026-10-10.)

Don't revisit these silently.

## Already checked

- `REVIEW_DECISIONS = ['approve', 'reject']` in `packages/protocol/src/form.ts` types
  `ReviewDecision`, `ReviewItemSchema.properties.decision.enum`, `ReviewEntry.decision` and
  `askResultSchema`'s `reviewOutcome` (`ask.ts`). All of them widen to `string` (2026-10-10).
- The card's window `keydown` handler claims digits `1`–`9` and calls `pick(n)`, which looks for
  `[data-pick="n"]` in the active question and does nothing if there isn't one
  (`apps/desktop/src/card/AskCard.vue`, `onKey` and `pick`). Review rows aren't `[data-pick]`, so a
  row's own digit handler runs first (it's on the element; the card's is on `window`) and the card's
  `pick` is a no-op. Still, add `if (event.defaultPrevented) return` before the card's digit branch,
  so the two never both act.
- The review renderer handles row keys in `onRowKey` with `@keydown.self` on each row
  (`ReviewRenderer.vue`).
- `fake-hub`'s `fill` hardcodes approve/reject for reviews (`apps/server/scripts/fake-hub.ts`).

## Open questions

- **The fallback for a missing entry under `'none'`.** Today `shapeAnswer` fills a gap with reject,
  so nothing is approved that the user didn't approve. With custom decisions there's no "safe" one.
  Default: the last decision, and the tool description says to put the most conservative one last
  ("Skip", "Keep"). Gaps only come from `fake-hub` or partial data, since the app requires every
  decision under `'none'`.

## Shape

### Tool input (pinned)

On the question:

```ts
decisions: z.array(z.string().min(1).max(12)).min(2).max(4).optional(),
defaultDecision: z.string().optional(),   // was z.enum(['approve', 'reject', 'none'])
```

Checks in `superRefine`, with messages written for the model:

- `decisions` on any type but `review`: "question N has decisions but type 'X'; decisions only
  apply to type 'review'".
- Duplicate decision labels.
- With `decisions`, a `defaultDecision` that isn't one of them or `'none'`: "question N's
  defaultDecision 'approve' isn't one of its decisions; use one of 'Port', 'TODO', 'Skip', or
  'none'".
- Without `decisions`, `defaultDecision` must be `approve`, `reject` or `none`, as now.

With `decisions`, `defaultDecision` defaults to the first decision.

### Compiled schema (pinned)

The `review` case in `compileQuestion`: each item's `decision.enum` is the decisions, or
`['approve', 'reject']` without them. `x-default-decision` is a label or `'none'`. The renderer reads
the labels from the enum, so the schema describes itself and a raw-schema form could send the same
thing. No new `x-` key. Update the `review` paragraph of the vocabulary comment in `form.ts`.

Without `decisions`, the compiled schema is byte for byte what it is now. The existing tests should
pass untouched; if one has to change, that's a regression.

### Answer (pinned)

- `value`: the labels of the items whose decision is the first decision.
- `review`: every item's `{ label, decision, comment? }` in order, with `decision` now any string.

Without `decisions`, the text is exactly today's. With them, the majority decision leads with the
counts, and the exceptions are grouped by decision:

```text
The user answered:
- Ports: Port 8, TODO 4, Skip 2 (of 14)
  - TODO: jetbrains, fzf, nvim, helix
  - Skip: kitty, wezterm
  - Port, with a comment: zellij ("keep the old layout")
```

When every item has the same decision: `- Ports: Port all 14`. Items with the majority decision and
no comment aren't listed.

### Renderer

`ReviewRenderer.vue`, which reads the decision labels from `items[0].properties.decision.enum`.
With the default pair, nothing visible changes. With custom decisions:

- **Rows:** the ✓/✕ pair becomes a small segmented control with the labels (at most 12 characters
  each, and 4 of them, in a 440 px window: check it fits beside a long label). The first decision
  reads as the positive one; the rest stay neutral. Keep the "struck at a glance" treatment for
  rejects only in the default pair.
- **Header line:** "Port 8 · TODO 4 · Skip 2", plus "· 3 undecided" under `'none'`. The "Approve
  all / Reject all" links become one link per decision only if they fit on one line; otherwise drop
  them and rely on the keys.
- **Keys** (custom decisions only; the default pair keeps `a`/`r`/Space/Shift+A/Shift+R):
  - `1`–`4` set the focused row's decision.
  - Shift+`1`–`4` set every row. Match on `event.code` (`Digit1`), since Shift+1 is `!` in
    `event.key`.
  - Space cycles the focused row through the decisions.
  - `c`, ↑/↓, `j`/`k`, Home and End as now.
  - The hint line lists the digits with their labels: `1 Port · 2 TODO · 3 Skip`.
- Document the digits-in-review case in the DOM contract comment in `forms/keyboard.ts`. Check
  `~/.config/keymap/keymap.md` for nothing new: these are plain keys inside the window.

### Tool description

Extend the `review` line in `apps/server/src/tools/ask.ts` by one sentence, along the lines of:
"`decisions`: 2–4 short labels to use instead of approve/reject, such as ['Keep', 'Move',
'Delete'], with the most cautious one last; `defaultDecision` is then one of them or 'none', and
`value` is the items given the first decision." Leave the server instructions alone.

### fake-hub and the trial scorer

- `fill` reads the decisions from the first item's enum:
  - `first`: every item gets the first decision;
  - `second`: the first item gets the second decision;
  - `other:<text>`: the first item gets the second decision, with `<text>` as its comment.

  Without `decisions` this is exactly today's behavior.
- `questionsOf` in `trial-score.ts` records `type: 'review+decisions'` when a review has
  `decisions`.

### Trial prompt

`apps/server/trials/prompts/sort-helpers.md`:

```markdown
---
expect: ask
reply: first
---
Go through the files in utils/ and sort each one: keep it, fold it into another file, or delete it. Check the sorting with me before you change anything.
```

Add its row to the prompts table in `apps/server/trials/README.md`: "a per-item assignment: should
be one `review` with `decisions`". Judge it by eye from `questions`.

### Fixtures

- `packages/protocol/fixtures/review-decisions.json`: about 8 items with `["Port", "TODO", "Skip"]`.
- `packages/protocol/fixtures/review-checklist.json`: 5 hands-on checks with `["Pass", "Fail",
  "Didn't try"]`, `defaultDecision: 'none'`, each with a `detail` saying what to look for. This is
  the shape a FUTURE.md "Hands-on runs" step list would build on, so make it realistic.

### Docs

- **Guide:** the Review section of `docs/guide/question-types.md` covers the agent's own decisions
  and their keys.
- **Form spec page:** the `review` bullets, and the review rule under "Rules worth keeping" about
  the fallback.

## Out of scope

- Per-decision colors chosen by the model.
- More than 4 decisions, or decisions with descriptions.
- Changes to choice questions.
- A full trial pass. Brief 12 does it.

## Acceptance

1. `pnpm --filter @parley/protocol test` passes. Every existing review test passes unchanged, and
   new tests cover:
   - compiling with `decisions`, with each kind of `defaultDecision`;
   - every new validation message;
   - `shapeAnswer` for all one decision, a mix with comments, gaps under a label default and under
     `'none'`, and `value` holding the first decision's labels.
2. `pnpm --filter @parley/desktop test` passes. Both new fixtures compile under strict AJV.
3. `pnpm typecheck` passes.
4. The gallery shows `review-decisions` and `review-checklist` in light and dark. Each can be
   completed with only the keyboard (digits, Shift+digits, Space, comments). The existing `review`
   and `review-diff` fixtures look and behave as before.
5. `pnpm --filter @parley/server fake-ask review-decisions` against the real app prints the grouped
   text from "Answer". This opens the app window: ask Logan once before running it.
6. `pnpm --filter @parley/server trial --prompt sort-helpers --runs 3`: report the table and the
   `questions` per run. Also run `--prompt prune-unused --runs 3` and say whether it still asks with
   a plain `review`.

By hand, for Logan:

- Four decision labels in the 440 px window with a long item label: does the row still read?

Then stop. Ask Logan before committing.
