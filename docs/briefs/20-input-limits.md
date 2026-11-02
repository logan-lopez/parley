---
size: M
size-note: "the code is small; the full trial pass and the Codex baseline are most of it"
status: not-started
---
# Brief 20: Fewer bounced asks: soft input limits

Read `CLAUDE.md`, [`README.md`](README.md), [the ask tool](../architecture/ask-tool.md), [the form
spec](../architecture/form-spec.md), [the card](../architecture/card-ui.md),
[testing](../architecture/testing.md), `apps/server/trials/README.md` and FUTURE.md's [Trial
tune-ups after the 10–12 pass](FUTURE.md#trial-tune-ups-after-the-1012-pass) first.

**Prerequisites:** brief 19 lands first. Its `usage --transcripts` report is the before number,
and its `## Real use` section in the trials README is where the after number goes.

## Goal

Stop asks bouncing on lengths a few characters over the limit. Across 1,006 real `ask` calls
from Claude Code (2026-10-10 to 11-01), 66 (6.6%) failed input validation, and each one cost the
agent a round trip and a re-sent call:

- an option `description` or review item `detail` over 300 characters: about 40. All of them were
  301 to 475 characters long; none was over 500;
- a `header` over 12 characters: 20. Every one was 13 or 14 (`Steam'n'Rails`, `Hollow recipes`,
  `Gate progress`), although the tool description already says "12 characters or fewer";
- a choice `label` over 60 or a review item `label` over 120: 7.

The fix is a soft limit: keep the limits the model sees, and accept a margin past them. The
advertised limit keeps cards short, and the margin catches the near misses. Then run the full
trial pass, which also records the Codex baseline that FUTURE.md's trial tune-ups have been owed
since 2026-10-11.

## Decisions already made

- **A long header is clipped on the card, not rejected** (Logan, 2026-11-01). The chip shows the
  start of it and an ellipsis. Answer ids and the result keep the full header.
- **No server-instructions line about backgrounded calls** (Logan, 2026-11-01). While an ask was
  backgrounded, agents kept working in 64% of cases, mostly drafting briefs. Revisit only if brief
  19's report shows code edits that the answer then undid.
- **Labels stay hard limits.** A label is the answer value, so clipping it would change the
  answer. Seven bounces don't justify that.
- From before: the model-facing input is the questions array ([its
  decision](../decisions/model-facing-input.md)), and the result is `structuredContent` plus text
  ([result shape](../decisions/result-shape.md)). Neither changes here.

## Already checked

- **Advertise one limit, accept another** (2026-11-01, zod 4.6.5 and `@modelcontextprotocol/server`
  2.3.1 in `apps/server/node_modules`). `z.string().min(1).max(24).meta({ maxLength: 12 })`
  publishes `"maxLength": 12` through both conversion paths the SDK uses
  (`schema['~standard'].jsonSchema.input(...)` and the `z.toJSONSchema` fallback), and still
  parses a 14-character string. The SDK validates with the Zod schema and publishes the JSON
  Schema, so `.meta()` sets what the model reads and `.max()` sets what's accepted. Check that
  `tools/list` shows it once you've built it (Acceptance).
- **Where things are:** the limits are in `packages/protocol/src/ask.ts`, lines 28–44
  (`option`, `reviewItem`, `question.header`). The tool description is in
  `apps/server/src/tools/ask.ts`. The chip is
  `<span class="chip">{{ header }}</span>` in
  `apps/desktop/src/forms/renderers/QuestionFrame.vue:16`, styled by `.chip` in
  `apps/desktop/src/styles.css:154`. The same renderer draws the inline card. Answer ids come from
  `questionIds` (`slug(q.header)`), and `compileQuestions` sets the schema's `title` from
  `q.header`.
- **Bounce lengths** were measured from the transcripts on 2026-11-01 (the ideate's scratch
  scripts; brief 19 makes this a command).

## Open questions

- **How far past the limit to accept?** Default: header up to 24, `description` and `detail` up
  to 500. A header over 24 is a sentence, and the existing error ("the full question goes in
  `question`") is the right answer to it.

## Shape

**`packages/protocol/src/ask.ts`:**
- `header`: `.max(24, <the current message, saying 12 is the size of the chip>)` plus
  `.meta({ maxLength: 12 })`.
- `option.description` and `reviewItem.detail`: `.max(500, '… 300 characters or fewer is the
  aim; put anything longer in `preview`')` plus `.meta({ maxLength: 300 })`.
- Nothing else changes: ids, `readAnswer` and the result text use the full header as now.
  Clipping happens only where the chip is drawn.

**`apps/desktop/src/forms/renderers/QuestionFrame.vue` and `styles.css`:** the chip clips with an
ellipsis past roughly 12 characters (`max-width` in `ch`, `overflow: hidden`, `text-overflow:
ellipsis`, `white-space: nowrap`) and carries the full header in `title`, so it shows on hover.
The colors come from the theme tokens as now (no color literals: `no-color-literals.test.ts`).

**`apps/server/src/tools/ask.ts` (model-facing):** say the description limit where the shape is
described. The choice line becomes "each { label (60 characters at most), description? (300),
preview? }", and the review item gets the same treatment (label 120, detail 300). Keep the
header wording. That's the whole description change; keep it that small, because the trial pass
measures it.

**Tests:** `packages/protocol/src/ask.test.ts`: a 14-character header and a 450-character
description parse; 25 and 501 are rejected with the messages above; the compiled schema's
`title` and the answer's `header` keep the full 14 characters. The published input schema
(`z.toJSONSchema(askInputSchema, { io: 'input' })`) still says `maxLength: 12` and `300`.

**Docs:**
- [The form spec](../architecture/form-spec.md): the soft limits and why (the bounce numbers above).
- [The card](../architecture/card-ui.md): the chip clips, with the full text on hover.
- The guide: if `docs/guide/question-types.md` or `answering.md` describe the chip, add a line
  that a long one is cut short and shows in full on hover.
- The decision is already recorded in `docs/decisions/soft-input-limits.md`, written with this
  brief. If the defaults under Open questions change, update its Choice.
- FUTURE.md's trial tune-ups: drop the "No Codex baseline" bullet once it's recorded. Update the
  `crash-output` bullet with the real-use number from brief 19's report (agents used `capture` 20
  times in three weeks, 11 with screenshots), which answers its "check a real debugging session
  first" question.

**The trial pass:** after the change, `pnpm --filter @parley/server trial --runs 3` (Claude, the
full prompt set), then `pnpm --filter @parley/server trial --client codex --runs 1`. Compare with
the baseline in `apps/server/trials/README.md`. Record Codex as a new baseline row there, and
Claude's pass beside the old one. The scores to watch are "first call valid" (should hold or
rise) and "asked when it should" (should hold).

## Out of scope

- Server instructions: no change (Decisions).
- Label limits, question limits (1–4) and the option count (2–6).
- The other trial tune-up items (`changelog-draft` wording, fake-hub's `as you see fit`, the
  string-match `used`, decision order). They stay in FUTURE.md.
- Anything in brief 21's area (the card's note row, the result's `remember`).

## Acceptance

- `pnpm --filter @parley/protocol test` passes, with the new cases above.
- `pnpm --filter @parley/desktop test` passes (`schemas.test.ts`, `no-color-literals.test.ts`).
- `pnpm typecheck` and `pnpm --filter @parley/server build` pass.
- `pnpm --filter @parley/server fake-host` passes every scenario.
- `tools/list` from the built server (`fake-host`'s log, or a one-off client) shows
  `"maxLength": 12` on `header` and `300` on `description` and `detail`.
- `pnpm --filter @parley/server fake-ask` with a form whose header is `Gate progress` and with a
  420-character option description gets through to `fake-hub` (with `PARLEY_SOCKET` and
  `PARLEY_NO_LAUNCH=1`) instead of failing validation.
- The gallery (`pnpm --filter @parley/desktop dev`, then
  `http://localhost:1420/?gallery`) with a fixture or a local edit that has a 14-character header
  shows a clipped chip with an ellipsis, and the full header on hover. Check it in light and dark.
- The trial results are in `apps/server/trials/README.md`: Claude's first-call-valid at least the
  baseline's, and a Codex row.
- Hand check for Logan, after his next week of normal use: brief 19's `usage --transcripts`
  shows fewer bounces than the 66 in 1,006 (6.6%). Leave it in the report as his to run.

Then stop. Report the trial numbers next to the baseline, and ask Logan before committing if
anything in them dropped.
