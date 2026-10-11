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

## Report

*2026-10-10, implemented in one session. Not committed.*

### Built

- **Protocol** (`packages/protocol/src/ask.ts`, `form.ts`): `draft` (1–4,000 characters) on the
  question; the wrong-type message from the brief in `superRefine`; `x-draft` in the compiled
  `text` schema, with `x-multiline` forced by a line break; `edited` on the answer, comparing
  trimmed text with normalised line endings; "accepted the draft as written", "edited the draft:"
  with the final text indented, and "(cleared the draft)". `x-draft` and its `default` downgrade
  are in the vocabulary comment.
- **Renderer** (`apps/desktop/src/forms/renderers/TextRenderer.vue`, `styles.css`): writes the
  draft into the data on mount unless data is already there or the view is read-only; the caret
  goes to the end on first focus, never select-all; "Reset to draft" (`tabindex="-1"`) once the
  text differs; a draft textarea fits its text, 4 to 12 lines, then scrolls.
- **Server** (`apps/server/src/tools/ask.ts`): the one sentence on the `text` line. Server
  instructions untouched.
- **fake-hub and the scorer:** `first` sends a draft unchanged and `other:<text>` appends a line;
  `questionsOf` records `text+draft`.
- **Trials:** `trials/prompts/changelog-draft.md` as written in the brief, with its row in the
  trials README.
- **Fixture:** `packages/protocol/fixtures/text-draft.json`, a five-line commit message and an
  optional one-line PR title with a placeholder.

### Deviations

- **Sizing uses `field-sizing: content`, not just `rows`.** A `rows` estimate at 72 characters a
  line cut off the fixture's last line in WebKit at the window's width and 110% zoom. Draft
  textareas get a `.draft` class with `field-sizing: content` between `4lh` and `12lh`, so they
  also grow as you type. The `rows` estimate (now 60 characters a line) stays as the fallback.
  Playwright's WebKit 27.2 supports it; the system Safari is 27.0, and the textarea in Logan's run
  of the installed build showed no problem, though he wasn't asked about sizing specifically.

### Defaults taken

- **How tall the textarea grows:** fit the draft, up to 12 lines, then scroll (the default).

### Acceptance

1. **Protocol tests: pass,** 56 tests. New: draft validation (allowed with a placeholder, the
   wrong-type message on choice and boolean, the length limits), compiling a draft including a
   line break forcing multiline over `multiline: false`, and `shapeAnswer` for untouched, edited,
   whitespace and CRLF only (not edited), and an optional draft cleared to blank.
2. **Desktop tests: pass,** 32 tests; `text-draft compiles without warnings` under strict AJV.
3. **`pnpm typecheck`: pass.**
4. **Gallery: pass,** in headless WebKit (Playwright 1.64, WebKit 27.2) on a second Vite at port
   1430: both drafts prefilled, light and dark; the textarea focused with the caret at 230 of
   230; Reset hidden before an edit, shown after, and restoring the draft; Cmd+Enter untouched
   gives "accepted the draft as written" twice; an edited commit plus a cleared title gives the
   indented text and "(cleared the draft)". Screenshots weren't kept in the repo.
5. **`fake-ask text-draft` against the real app: pass.** Reinstalled with `pnpm install:desktop`,
   and Logan reopened Parley. He sent the commit untouched and edited the PR title, after trying
   Reset to draft ("Reset to draft works"): "Commit: accepted the draft as written", "PR title:
   edited the draft: Keeping the sign on negative amounts in fromCents", with `edited` false and
   true.
6. **Trial `--prompt changelog-draft --runs 3`: 3/3 asked, 3/3 first call valid, 3/3 used, no
   errors** (`results/2026-10-11T03-10-19-833Z.jsonl`, Claude Code 2.1.296, `claude-opus-5-5`).
   Questions per run:

   | run | questions |
   | --- | --- |
   | 1 | Wording `text+draft`, Code fix `choice` |
   | 2 | Wording `text+draft`, The fix `choice` |
   | 3 | Fix missing `choice`, Wording `text+draft` |

   Every run drafted the entry. Every run also asked a `choice` about the fix itself, because the
   prompt says "the fix" and `tally`'s `fromCents` still has its planted bug. That's the prompt,
   not the tool (Follow-ups).

The fake-hub policies were also checked through `fake-ask` against `fake-hub` on a temp socket:
`first` gives "accepted the draft as written", and `other:` gives "edited the draft" with the text
as the last line.

### Spot checks for Logan

- A real Claude Code session with a commit to make: does the model reach for a draft, and does
  editing it in the window feel right?
- The draft box's height in the window: it should fit a commit message without scrolling and grow
  as you add lines. If it stays at 4 lines whatever the draft, the system WebKit lacks
  `field-sizing`, and the fallback estimate is doing the work.
- A draft in Claude Desktop's inline card (not checked): prefilled, and Cmd+Enter sends it.

### Docs updated

- `docs/architecture/form-spec.md`: `draft` in what the model writes, the validation list, `x-draft`
  over the wire, `edited` in the result, the draft lines in the text, History.
- `docs/architecture/card-ui.md`: the text renderer's draft behavior.
- `docs/architecture/testing.md`: fake-hub's draft policies.
- `docs/guide/question-types.md`: a paragraph on drafts under Text.
- `README.md`: the question types line mentions drafts.
- `apps/server/trials/README.md`: the prompt row and the `text+draft` note.

### Follow-ups

- **`changelog-draft` asks about a fix that isn't there.** All three runs added a choice question
  about the missing `fromCents` fix. Rewording it ("I've fixed…" plus applying the fix in a
  fixture, or pointing at the bug as already fixed) would make the drafted entry the only
  question. The prompts are the spec, so it's Logan's call, best before brief 12's full pass.
- **"Draft" now means two things in the guide.** `answering.md` (and the README's keyboard line)
  call the user's unsent answers, kept across a restart, "drafts". With the agent's drafts in
  `question-types.md`, one might want a different word.
- **A cleared draft comes back after a restart.** If the user empties a draft box and Parley
  restarts before they send, the saved form has no value, so the renderer writes the draft back
  in. Rare, and harmless, since they'd see it.
- **An orphan Vite on port 1420** (from 17:15, no `tauri dev` around it) is still running in
  `apps/desktop`. Left alone. It blocks `pnpm --filter @parley/desktop dev` and `pnpm app` until
  it's stopped.
