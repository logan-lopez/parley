---
size: M
size-note: "card toggle, one additive wire field, result text, a trial prompt; model-facing, so a trial pass"
status: awaiting-review
---
# Brief 21: "Don't ask again here"

Read `CLAUDE.md`, [`README.md`](README.md), [the ask tool](../architecture/ask-tool.md), [the form
spec](../architecture/form-spec.md), [the card](../architecture/card-ui.md), [asks and
history](../architecture/asks-and-history.md), [the hub and the wire
protocol](../architecture/hub.md), [testing](../architecture/testing.md) and
[`docs/guide/answering.md`](../guide/answering.md) first.

**Prerequisites:** briefs 19 and 20 land first. 19's report gives the "asked again" number this
brief should move. 20 changes `packages/protocol/src/ask.ts` and the trial baseline, and this
brief's trial pass compares against 20's.

## Goal

Let Logan retire a question instead of answering it again every session. Real use (2026-10-10
to 11-01, from `history.jsonl`): 15 choice questions with the same option set were asked in
three or more separate sessions, and the answer almost never changed. "Commit / Not yet" was
asked 17 times and never answered "Not yet". "Not now / Yes, run them" was asked 13 times in
one project, always yes. "Go ahead / Not now" was asked 7 times, always "Go ahead". Overall, 61%
of answered asks changed nothing: every answer was the recommendation.

The fix for a standing permission belongs in the project's instructions, not in a faster way to
say yes. So the card gets a per-question **Don't ask again here** toggle. The answer goes back as
usual, and the result also tells the agent that Logan wants this recorded. The agent drafts a
line for the project's `AGENTS.md`, shows it to Logan as a `text` draft in a second ask, and saves
it only if he accepts it. Parley never answers anything on his behalf.

## Decisions already made

- **Where it's saved: `AGENTS.md`, as a draft Logan approves** (Logan, 2026-11-01). Project facts
  live in `AGENTS.md` (`CLAUDE.md` is `@AGENTS.md` in his projects), never in Claude Code memory,
  which other agents can't see. He curates that file, so nothing lands in it without his approval
  of the exact line. Recorded in `docs/decisions/dont-ask-again.md`.
- **Parley never auto-answers.** It doesn't match future asks against past answers. Questions
  are worded differently each time, and a wrong match would answer for Logan. The agent and the
  project's instructions do the remembering (ideate, 2026-11-01).
- **Per question, not per card.** In a four-question card, usually one of them is the standing
  one ("Commit") and the rest are real forks.
- **Additive on the wire.** `remember` rides the existing `answer` message like `note` did ([note
  for the agent](../decisions/note-for-the-agent.md)), so the wire stays v1 and Rust forwards it
  without reading it.

## Already checked

2026-11-01, in the code:

- The answer path: `AskCard.vue` emits `submit(data, note)` (line 31) → the store sends
  `{ type: 'answer', id, data, note? }` (`packages/protocol/src/wire.ts:38`) → the server's
  outcome `{ status: 'answered', data, note? }` (`wire.ts:32`) → `shapeAnswer` in
  `packages/protocol/src/ask.ts`, which adds the note to the text ("They also left a note:") and
  the structured result.
- Claude Code shows the model only `structuredContent` (as JSON) when a tool has an
  `outputSchema`, and drops the text block; `message` in the structured result repeats the text
  ([the ask tool](../architecture/ask-tool.md), checked against Claude Code 2.1.296). So the
  instruction to the agent must be in `message`, and `remember` must be added to
  `askResultSchema`.
- `AskRecord` (`apps/desktop/src/asks/store.ts:19`) and `Draft` (`store.ts:14`, `{ data?, note? }`)
  are what history persists. A new optional key goes into `history.jsonl` without a format
  change (`persist.ts` writes the whole record).
- The trial project (`apps/server/trials/project/`) has no `AGENTS.md`. Prompts are
  `prompts/<name>.md` with `expect`, `reply` and `match` frontmatter.
- `Cmd+D` is Zellij's "split pane right" in `~/.config/keymap/keymap.md`, so it's a poor chord
  even though the panel takes keys while it has focus.

## Open questions

- **A key chord for the toggle?** Default: none. Tab reaches it, and the mouse works. If you add
  one, check `~/.config/keymap/keymap.md` first, as `AGENTS.md` says.
- **Which question types get the toggle?** Default: `choice` (single, not multi) and `boolean`,
  the shapes every repeat in the data had. Reviews, drafts, captures and paths are answers about
  the moment.
- **In the inline card?** Default: no, the window only. Desktop answered 10 of 956 asks, and the
  inline answer path (`ask_wait`, `resolved`) would need the field too. The renderer hides the
  toggle when it runs in the card.

## Shape

**Card (`apps/desktop/src/card/AskCard.vue`, `apps/desktop/src/forms/renderers/QuestionFrame.vue`,
`styles.css`):**
- In the question head row, right-aligned after the chip: a quiet toggle button,
  "Don't ask again here", with `aria-pressed`. Pressed, it reads as on (accent color from the
  theme tokens) and the row shows a one-line hint under the question: "The agent will draft a
  line for AGENTS.md for you to approve." Only on the types above.
- AskCard keeps the set of toggled question ids (provide/inject into the renderers is the obvious
  route) and emits `submit(data, note, remember)`. A skip ignores it: skipping isn't an answer
  to remember.
- The set is part of the unsent draft (`Draft.remember?: string[]`), so it survives a restart
  like the note does.

**Wire (`packages/protocol/src/wire.ts`), pinned:**
- `{ type: 'answer'; id; data; note?; remember?: string[] }`, where `remember` holds question ids
  (the `id`s `questionIds` gives). Omitted when empty.
- The server-side outcome `{ status: 'answered'; data; note?; remember?: string[] }`.
  `AppClient` (`apps/server/src/app-client.ts`) passes it through.

**Result (`packages/protocol/src/ask.ts`), model-facing, pinned once the trial passes:**
- `askResultSchema` gains optional `remember: { id, header, value }[]`, one per remembered
  question, `value` being the answer given.
- `shapeAnswer` appends, after the answers and before the note, when `remember` is non-empty:

  ```
  They don't want to be asked this again in this project:
  - Commit: Commit (Recommended)
  Write one line for the project's agent instructions (AGENTS.md, or CLAUDE.md if there's no
  AGENTS.md) that makes this a standing answer, and show it to them with `ask` as a `text`
  question with that line as its `draft` before you save it. Save it only if they accept it or
  edit it. Until then, act on the answer above and don't ask it again in this session.
  ```

  Use "these" for more than one. Ids that aren't questions in this ask, or are of a type without
  the toggle, are dropped, not an error.

**Store and history (`apps/desktop/src/asks/store.ts`, `history/HistoryDetail.vue`):**
`AskRecord.remember?: string[]`, saved with the answer. The history detail marks those questions
with "Don't ask again" beside the chip. No filter chip.

**fake-hub (`apps/server/scripts/fake-hub.ts`):** a `remember:<policy>` reply that answers as
`<policy>` does and sets `remember` to every `choice` and `boolean` question's id. Document it in
[testing](../architecture/testing.md).

**Trial (`apps/server/trials/`):**
- A prompt, `standing-commit.md`, that leads the model to ask before committing (in the style of
  the existing prompts, where Logan's request says to check with him first). Its replies:
  `remember:first` for the first ask, then `first`, which accepts the draft unchanged. If the
  prompt frontmatter takes only one `reply`, extend it to a list in the order the asks arrive,
  which fake-hub already supports through repeated `--reply`.
- Add an `AGENTS.md` to `trials/project/` with a line or two of ordinary project rules, so the
  model has a file to add to. Check it doesn't move the other prompts' scores (the full pass below
  does that).
- Scoring (`scripts/trial-score.ts`): for this prompt, two new checks: **drafted** (a later `ask`
  has a `text` question with a `draft`) and **saved** (the diff adds a line to `AGENTS.md` or
  `CLAUDE.md`, and only after the draft was answered).

**Docs:**
- The guide: `docs/guide/answering.md`, a short section on the toggle (what it does, what the
  agent does next, that nothing is saved without your approval). The root README's feature list
  gets a line.
- [The form spec](../architecture/form-spec.md) and [the ask tool](../architecture/ask-tool.md):
  `remember` in the result and the text. [The hub](../architecture/hub.md): the field on
  `answer`. [Asks and history](../architecture/asks-and-history.md): the record key.

## Out of scope

- Any matching of new asks against old answers, or answering for Logan (Decisions).
- The tool description and the server instructions: the agent learns about this only from the
  result.
- The inline card (Open questions) and `resolved`.
- Changing Logan's skills (`implement`'s commit question is one of the repeats). If the report
  shows a skill is the main source, say so in the report; the fix is in `~/Dev/dotfiles`.

## Build order

1. Wire, outcome, `shapeAnswer` and `askResultSchema`, with protocol tests (remembered choice,
   remembered boolean, an unknown id dropped, a skip with `remember` ignored, text and structured
   result).
2. fake-hub's `remember:` policy, then a `fake-ask` run that shows the new text.
3. The card, the draft and history. The gallery for the look.
4. The trial prompt, the project's `AGENTS.md`, scoring, then the trial pass.
5. Docs and the guide.

## Acceptance

- `pnpm --filter @parley/protocol test` and `pnpm --filter @parley/desktop test` pass, with the
  cases in step 1 and a store test that `remember` reaches the record and the `answer` message.
- `pnpm typecheck`, `pnpm --filter @parley/server build` and
  `pnpm --filter @parley/server fake-host` pass.
- `fake-ask choice` against `fake-hub --reply remember:first` (with `PARLEY_SOCKET` and
  `PARLEY_NO_LAUNCH=1`) prints a result whose `message` has the block above and whose structured
  result has `remember`.
- `pnpm --filter @parley/server trial --prompt standing-commit --runs 3`: drafted and saved in at
  least 2 of 3 runs, and no run saves before the draft is answered. Then the full pass,
  `trial --runs 3`, holds the scores against brief 20's numbers.
- The gallery (`pnpm --filter @parley/desktop dev`, `http://localhost:1420/?gallery&fixture=choice`)
  shows the toggle on choice and boolean questions only, pressed and unpressed, in light and dark.
- Hand checks for Logan, in the installed build (`pnpm install:desktop`, then quit and reopen
  Parley from the tray; ask him before it): toggle "Don't ask again here" on a real commit
  question in a real session; the agent comes back with a draft line for `AGENTS.md`; accepting
  it saves the line; history shows the mark. And, after a week: brief 19's "asked again" section
  is shorter for the projects where he used it.

Then stop. Report the trial numbers next to brief 20's, and ask Logan before committing if the
standing-commit prompt saved without a draft in any run.

## Report

**Built**
- **Protocol** (`packages/protocol/src/wire.ts`, `ask.ts`): `answer` carries `remember?: string[]`;
  the `answered` outcome too; `askResultSchema` gains `remember: { id, header, value }[]`.
  `shapeAnswer` appends the "They don't want to be asked this again in this project:" block after
  the answers and before the note, exactly as pinned for one question; `canRemember` limits it to
  single-select choice and boolean. `apps/server/src/app-client.ts` passes the strings through.
- **fake-hub** (`apps/server/scripts/fake-hub.ts`): `remember:<policy>`, with `remember` set to
  every choice and boolean question's id.
- **Card** (`apps/desktop/src/card/AskCard.vue`, `forms/remember.ts`,
  `forms/renderers/QuestionFrame.vue`, `ChoiceRenderer.vue`, `BooleanRenderer.vue`,
  `useQuestion.ts`, `styles.css`): the toggle with `aria-pressed`, the accent when on, and the hint
  under the question. The card provides the toggled ids unless `embedded`, so the inline card has
  none. `submit(data, note, remember)`.
- **Store and history** (`asks/store.ts`, `App.vue`, `history/HistoryDetail.vue`,
  `gallery/Gallery.vue`): `Draft.remember` and `AskRecord.remember`, sent with the answer (and
  again on a re-send), dropped by `resolved`; history shows a "Don't ask again" mark beside the
  header.
- **Trial** (`apps/server/scripts/trial.ts`, `trial-score.ts`, `trials/prompts/standing-commit.md`,
  `trials/project/AGENTS.md`): `reply:` may repeat; `drafted`, `saved` and `savedEarly` for prompts
  with a `remember:` reply, ordered by the client's event stream.
- **Tests:** a `remember` block in `ask.test.ts`; a store block in `store.test.ts`.

**Deviations**
- **Tab doesn't reach the toggle.** The brief says it does, but the card's `onKey` takes Tab and
  moves between `[data-question]` roots, so an inner button is never a tab stop. The toggle is
  mouse only (`tabindex="-1"`), like the copy buttons and Edit/View. No chord, per the default.
  See Follow-ups.
- **The prompt's wording.** "Check with me before you commit anything" got a `text` question with a
  draft commit message, which has no toggle (one smoke run). The prompt now asks for a yes/no on
  committing, which is the shape of the real repeats.
- **The harness diffed against `HEAD`,** so a change the model committed vanished from
  `diff.patch`, and `saved` would have read false. It diffs against the start commit now, which
  also affects every prompt where a model commits.
- **`remember` drops more than the brief listed:** an id whose answer was left blank, and a
  multi-select choice, as well as unknown ids and other types. fake-hub still sends every choice
  id; the shaper drops the multi-select ones.
- **The plural text** ("these", "one line each", "the lines") is mine; the brief pinned only the
  single form and "use 'these' for more than one". The trial covers the single form only.
- **No separate `--prompt standing-commit --runs 3`.** The full pass at `--runs 3` includes it.
- **`screenshots` rerun,** per the testing page: 16 PNGs under `docs/guide/images/cards/`, the
  fixtures with a single-choice or boolean question. The other 26 re-rendered with different bytes
  and no visible change; I restored them. The script also wrote `show-file-{light,dark}.png`,
  which the repo has never tracked; I removed them.

**Defaults taken**
- No key chord. Choice (single) and boolean only. The window only, not the inline card.

**Acceptance**
- `pnpm --filter @parley/protocol test`: 129 passed (the five `remember` cases: a choice, a
  boolean, a typed answer, dropped ids, a skip). `pnpm --filter @parley/desktop test`: 160 passed,
  with the store block (record, `answer` message, re-send, draft, `resolved`).
- `pnpm typecheck`, `pnpm --filter @parley/server build`, `pnpm --filter @parley/server fake-host`
  (all 11 scenarios): pass.
- `fake-ask choice` against `fake-hub --reply remember:first` (`PARLEY_SOCKET`,
  `PARLEY_NO_LAUNCH=1`): `message` has the block (plural, for the fixture's two questions) and the
  structured result has `remember`.
- Trial, Claude `--runs 3`: **`standing-commit` drafted 3/3, saved 3/3, saved early 0.** Every run
  asked a yes/no, got "Yes" with `remember`, committed, asked a `text` question with a `draft`,
  and edited `AGENTS.md` only after it was accepted. None saved without a draft, so there was
  nothing to ask about before committing. The full pass holds against brief 20's numbers except
  `date-library` asking 2/3 (was 3/3: run 2 installed `date-fns` as the request said and never
  asked, without reading `AGENTS.md`), and `used` on `prune-unused` 2/3 and `sort-helpers` 0/1
  (the label problem). 40 of 40 calls valid. Tables in `apps/server/trials/README.md`, "After
  "Don't ask again here" (brief 21)". Codex: not run (brief 20's pass is still missing its
  baseline).
- Gallery: headless WebKit, light and dark, on `four-questions`: the toggle on the single choice
  and the boolean, none on the multi-select or the text; unpressed, pressed (accent), and the hint.
  Looked at the screenshots by eye. A hover bug (the hover tint beat the pressed accent) turned up
  and is fixed.

**Size:** sized M, this session S (10 active min, 49 wall, 0 compactions), from `docket sessions`
run before this report. The trial passes ran in the background.

**Spot checks for Logan**
- The gallery is already up at `http://localhost:1420/?gallery&fixture=four-questions` (a Vite
  from this repo was already on 1420; it serves the working tree). Click **Don't ask again here**
  on Scope and Keep API, send, and read the Text output.
- In the installed build (`pnpm install:desktop`, then quit and reopen Parley from the tray; I
  didn't, as that opens and closes GUI apps and needs your say-so): toggle it on a real commit
  question; the agent should come back with a draft line for `AGENTS.md`; accepting it saves the
  line; history shows the mark beside the header.
- After a week: brief 19's "asked again" section for the projects where you used it.
- Hover a toggled pill in the app: it keeps the accent (the first version lost it).

**Docs updated:** architecture pages `form-spec.md`, `ask-tool.md`, `card-ui.md`,
`asks-and-history.md`, `hub.md`, `testing.md`; guide `answering.md` (a new section), `history.md`,
`README.md` there; the root README (a feature line, and "Parley never answers for you" under what
it's built around); `apps/server/trials/README.md`. No Areas row: no new area. The decision
(`docs/decisions/dont-ask-again.md`) already matched; no new decision.

**Follow-ups**
- **A way to reach the toggle from the keyboard.** Parley is built for it, and Tab can't get there.
  A key on a focused choice or boolean question (a plain letter isn't taken on choice; boolean owns
  `y` and `n`) or a chord, checked against `~/.config/keymap/keymap.md`. Logan's call.
- **The drafted lines are broad.** Run 1's: "Once a change works, commit it without asking first."
  The result text doesn't ask for a narrow one, and wording it to ("scope it to the question
  asked") is model-facing, so a trial pass. Not done: he sees every line before it's saved.
- **Which repeats come from skills.** Not looked at here; if `implement`'s commit question is the
  main source, the fix is in `~/Dev/dotfiles`, and brief 19's report has the projects.
- **`usage`** doesn't read `remember` yet; once there's a week of it, a count of remembered asks
  next to "asked again" would show whether it's working.
- **Codex baseline** is still missing (brief 20's follow-up).
