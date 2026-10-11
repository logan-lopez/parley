# Brief 11: Review with its own decisions

Read `CLAUDE.md`, [`README.md`](../README.md), [the form spec](../../architecture/form-spec.md),
[the card](../../architecture/card-ui.md), [testing](../../architecture/testing.md) and brief 5
([`archive/05-review-question.md`](05-review-question.md)) first. That brief built the
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

## Report

*2026-10-11.*

### Built

- **Protocol** (`packages/protocol/src/ask.ts`, `form.ts`): `decisions` (2–4 labels, ≤12
  characters) and a string `defaultDecision` on the question, checked in `superRefine` with the
  brief's messages. The compiler puts the decisions in each item's `decision.enum` and the default
  (the first decision unless given) in `x-default-decision`. `shapeAnswer` reads any of the
  question's decisions, fills gaps with the default, or the last decision under `none`, and sets
  `value` to the items given the first decision. Questions with their own decisions get the
  grouped text from `describeDecisions`; without them, `describeReview` is untouched.
  `ReviewDecision` and `DefaultDecision` are now `string`, and `REVIEW_DECISIONS` is the default
  pair. The vocabulary comment in `form.ts` describes the enum.
- **Fixtures:** `review-decisions.json` (8 dotfile configs, Port / TODO / Skip) and
  `review-checklist.json` (5 hands-on checks for the panel window, Pass / Fail / Didn't try, under
  `none`, each with what to look for).
- **Renderer** (`ReviewRenderer.vue`, `styles.css`): reads the decisions from the first item's
  enum. Approve/reject renders exactly as before. Any other set gets a labelled segmented control
  per row: the first decision in the accent when pressed, the rest neutral (muted fill), and the
  row bar accent or muted, never struck through. The header counts each decision, plus undecided.
  `1`–`4` and Shift+`1`–`4` (matched on `event.code`) decide the row or all rows, and Space
  cycles. `a`/`r` and the "all" links are off, and the hint line lists the digits with their labels.
  The item label keeps 12rem; past that the control wraps under it, right-aligned, and a button
  that still doesn't fit is cut with an ellipsis (its title has the full label).
- **Card** (`AskCard.vue`): `if (event.defaultPrevented) return` before the digit branch.
  `forms/keyboard.ts` documents the review exception to the card owning digits.
- **Server** (`apps/server/src/tools/ask.ts`): one sentence added to the `review` line of the
  tool description, as the brief worded it. Server instructions untouched.
- **fake-hub / scorer / trials:** `fill` reads the decisions from the enum (`first`, `second`,
  `other:` as specified). `questionsOf` records `review+decisions`. New prompt
  `trials/prompts/sort-helpers.md` and its row in the trials README.

### Deviations

- **The counts line puts the majority first.** The brief's example ("Port 8, TODO 4, Skip 2")
  happens to have the majority first in decision order too. When a later decision wins, decision
  order read as "Port 2, TODO 2, Skip 4", where the lead wasn't the lead. It's now "Skip 4, Port
  2, TODO 2 (of 8)", majority first and then decision order, with empty decisions left out.
- **A decision labelled `none` is rejected**, with "…which is reserved for defaultDecision; pick
  another label". It would have been ambiguous with `defaultDecision: 'none'`. Not in the brief's
  list of checks.
- **Comments on minority items are inline in their group:** `TODO: nvim ("after the plugin
  audit"), jetbrains`. The brief's example only showed a comment on a majority item. Several
  commented majority items read "Port, with comments: a ("…"), b ("…")".
- **No "all" links for labelled decisions.** "Pass 0 · Fail 0 · Didn't try 0 · 5 undecided"
  already fills the line in a 440 px window, so per the brief they're dropped, not measured.
- **`.at(-1)` → index.** The desktop's TS lib doesn't include ES2022, and it typechecks
  `@parley/protocol` source.

### Defaults taken

- **The fallback under `none`:** the last decision, as the brief's default says. The tool
  description says to put the most cautious one last. With no `defaultDecision` the fallback is
  the first decision, matching approve today. My first cut used the last decision there too,
  which the existing "falls back to the default" test caught.

### Acceptance

1. **`pnpm --filter @parley/protocol test`:** pass, 69 tests (56 before). Every existing review
   test passed unchanged. New: validation (accepts label/none defaults, decisions on a choice,
   duplicates, `none` as a label, count and length limits, `defaultDecision` with and without
   decisions), compiling (the enum, the first-decision default, a label default, `none` with
   `required`), and `shapeAnswer` (all one decision, a mix with comments, a later majority,
   gaps under a label default and under `none`, no default, `value` as the first decision's
   labels, the result schema).
2. **`pnpm --filter @parley/desktop test`:** pass, 34 tests. `review-decisions` and
   `review-checklist` compile under strict AJV.
3. **`pnpm typecheck`:** pass.
4. **Gallery:** driven headless (Playwright, Chromium headless shell, since neither cached WebKit
   matched an installed Playwright) on a separate Vite port, in light and dark, keyboard only:
   - `review-decisions`: Shift+3 set all to Skip; `1`, `2`, Space (Skip → Port, wrapping),
     Space twice, `c` + a comment + Esc on two rows; `5` did nothing. Cmd+Enter sent "Port 2, TODO
     2, Skip 4", which reads "Skip 4, Port 2, TODO 2" after the deviation above.
   - `review-checklist`: started with 5 undecided; Cmd+Enter didn't send ("Checks: 5 items
     undecided"). Digits, a comment on the Fail, then sent.
   - `review`, `review-diff`: `1` changed nothing, `a`/`r`/Space worked as before, and the hint
     and "Approve all / Reject all" links were unchanged. Screenshots matched the old look.
   - Four 11–12 character labels beside a 70-character item label (a temporary fixture, since
     removed): the control wrapped under the label and nothing overflowed.
5. **`fake-ask review-decisions` against the real app:** run after `pnpm install:desktop` and
   your restart. You answered Port 6, TODO 1, Skip 1; the text was "Ports: Port 6, TODO 1, Skip 1
   (of 8)", then "TODO: zellij" and "Skip: jetbrains". The run's own output got cut by my `tail`,
   so that text was re-derived from the answer in `history.jsonl` through `shapeAnswer`.
6. **Trials** (Claude Code 2.1.296, `claude-opus-5-5`):

   | prompt | asked | first call valid | used |
   | --- | --- | --- | --- |
   | sort-helpers | 3/3 | 3/3 | – |
   | prune-unused | 3/3 | 3/3 | 1/3 |

   `sort-helpers` questions per run:
   1. `review+decisions`: `["Approve", "Keep as-is", "Reject"]`, `none`, with the proposed action
      in each item's label ("format-old.ts → delete").
   2. `review+decisions`: `["Keep", "Fold", "Delete"]`, `none`. The intended shape, except Delete
      is last, the opposite of "most cautious last".
   3. Plain `review`, `none`, proposals in the labels ("dates.ts → fold into
      scripts/migrate-v1.ts").

   `prune-unused` still asks with one plain `review` in 3/3. `used` 1/3 (baseline 3/3) isn't a
   regression: runs 1 and 3 kept `format-old.ts` exactly as the reply asked, but their summaries
   don't contain "zephyr", the string `used` matches on.
- Also run: `fake-host --server dist`, all 8 scenarios pass (the tool description changed).

### Spot checks for Logan

- **Four decision labels with a long item label, in the 440 px window:** does the row still read?
  The gallery has no such fixture now. To see it, add a review with `"decisions": ["Port it
  now", "Leave a TODO", "Skip for now", "Delete it"]` and a long label, or send one through
  `fake-ask` with a file.
- `fake-ask review-checklist` in the real window: that the neutral pressed state (muted fill)
  reads as "chosen" next to the accent one, in your actual theme.

### Docs updated

- Guide: `docs/guide/question-types.md`, Review → "The agent's own decisions" (keys included).
- Root `README.md`: the form-language line and the question-types feature line.
- Architecture: `form-spec.md` (input, validation, compiled schema, result, text, the fallback
  rule, History), `card-ui.md` (the review renderer, the digit exception, History),
  `testing.md` (`fake-hub`'s review policies).
- `apps/server/trials/README.md`: the prompt row and `review+decisions`.

### Follow-ups

- **Decision order in the trials.** One of the two runs with decisions put the destructive one
  last. The fallback only matters for gaps, which the app never sends, but if the order matters
  for reading the card, the tool description could say "the most cautious one last, like Keep"
  more firmly. That's model-facing, so it's brief 12's full pass to judge.
- **`used` is a string match.** It misses an answer acted on without being echoed (prune-unused
  above). A diff-based check for prompts whose reply asks to keep something would be steadier.
- **`fake-hub`'s `second` and `other:` policies** with custom decisions weren't exercised by a
  trial (`sort-helpers` replies `first`).
- **A non-review `defaultDecision`** used to be rejected by the enum; now any string passes on
  other types and is ignored. Harmless, but it could get a "only applies to review" message.
