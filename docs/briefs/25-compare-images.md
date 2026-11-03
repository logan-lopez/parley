---
size: S
size-note: "one fence and one renderer on brief 22's plumbing"
status: awaiting-review
---
# Brief 25: Before and after, flipped in place

Read `AGENTS.md`, [`README.md`](README.md), [brief 22](22-media-images.md), [the form
spec](../architecture/form-spec.md) and [the card](../architecture/card-ui.md) (Markdown,
Previews) first.

**Prerequisites:** brief 22 has landed. Brief 23 needn't have.

## Goal

A ```` ```compare ```` fence with two image paths draws one full-width frame showing the first,
and flips to the second in place. Of the five screenshot asks that led to brief 22, two were
before/after pairs (Logan's history, 2026-11-02). Side by side in a 440 px window each half is too
small to judge a detail. Flipping in place, the way visual diffs are checked, keeps both at full
width.

```compare
shots/menu-now.png Now
shots/menu-big.png Bigger
```

## Decisions already made

- Brief 22's: reference and hash, the server as the gate, images inline in Claude Desktop's card
  within the caps (2026-11-02).
- **A fence, next to `palette` and `html preview`** (ideate, 2026-11-02), not a question type.

## Open questions

- **How it flips.** Default: a click on the frame flips it, and so does `x` while the frame has
  focus (`tabindex="0"`); the label in the corner says which image is showing ("Now", "Bigger").
  Check `~/.config/keymap/keymap.md` before settling `x`. Hover-to-flip was considered and left
  out: a pointer resting on the frame would keep it flipped.
- **Images of different sizes.** Default: if their natural sizes differ, draw both stacked with a
  line saying the sizes ("1280×720 and 1920×1080"), since flipping between different sizes reads
  as a jump, not a change.
- **Labels.** Default: the text after the path on each line; without one, "A" and "B".

## Shape

- **Finding refs.** Brief 22's `mediaRefs` already reads ```` ```compare ```` fences (it was
  written to claim them): each line is a path, then an optional label. Exactly two lines, both
  images. Otherwise the server's error says what a compare fence takes.
- **Renderer** (`forms/markdown.ts`, `Markdown.vue`, perhaps a small `forms/compare.ts`): the
  fence becomes `figure.md-compare` with both entries' `data-media` and labels. `paint()` fills
  both `img`s through `mediaUrls` and stacks them in one grid cell, the second hidden. The frame
  takes the column's width at most. A mousedown on it is prevented when it sits in an option's
  preview, so focus stays on the option (as for preview Source buttons).
- **States:** if either image is `changed`, `missing` or unresolved, draw what loads and say what
  didn't, with both paths.
- **Tool description:** the markdown paragraph gains "a ```compare block with two image paths
  (each with an optional label) shows a before and after that the user flips between".
  Model-facing: see Acceptance.
- Tokens only for styling.

## Out of scope

- A slider or swipe, more than two images, diff overlays, zoom.

## Acceptance

- `pnpm typecheck`, `pnpm build` and the three packages' tests pass, with protocol tests for the
  fence (two lines, labels, a third line or a non-image refused) and a server test for its error.
- `packages/protocol/fixtures/media.json` gains a compare question with two same-size PNGs and
  one with different sizes. In the gallery (`http://localhost:1420/?gallery&fixture=media`):
  clicking and `x` flip it, the label follows, and the mismatched pair stacks with its sizes.
  `pnpm --filter @parley/desktop screenshots media` refreshes the guide's images.
- `pnpm --filter @parley/server fake-host` passes.
- A trial prompt, `apps/server/trials/prompts/before-after.md`, with two screenshots of a change
  committed in the trial project. `--runs 3`, then `screenshot-look` once. Results in the trials
  README.
- Docs: the guide page brief 22 wrote, the form spec and the card pages.

By hand, for Logan (ask before launching anything): in the installed build, a before/after from a
game project flips, and in Claude Desktop's inline card it flips too.

Then stop. Ask Logan before merging anything.

## Report

**Completed:** 2026-11-02
**Session:** `fec656dc-db96-4e56-9ec6-fad39ae0cee5` (Antigravity)

### What changed

- **Protocol (`packages/protocol/src/media.ts`, `packages/protocol/src/ask.ts`, `packages/protocol/src/media.test.ts`):**
  - Added `CompareSide`, `ComparePair`, `isCompareFence`, `parseCompare(source, media?)` (two non-empty lines, `<path>` or `<path> <label>` with `<path with spaces>` in angle brackets, default labels `A` and `B`, images only), `compareFences` and `askCompareFences`.
  - Extended `mediaRefs(text)` to include both image paths from valid ```` ```compare ```` fences.
- **Server (`apps/server/src/show-media.ts`, `apps/server/src/tools/ask.ts`, `apps/server/src/show-media.test.ts`):**
  - `readShowMedia` checks every ```` ```compare ```` fence (`askCompareFences`) before and after resolving `x-media`, throwing a `ShowFileError` (`A \`\`\`compare fence takes two image paths (PNG, JPEG, GIF or WebP), one per line with an optional label after the path`) when a fence has the wrong line count or references a non-image (including a file without an audio extension that sniffs as audio).
  - Added the ```` ```compare ```` sentence to the `ask` tool description in `apps/server/src/tools/ask.ts`.
- **Desktop (`apps/desktop/src/forms/markdown.ts`, `apps/desktop/src/forms/Markdown.vue`, `apps/desktop/src/styles.css`, `apps/desktop/src/forms/markdown.test.ts`, `apps/desktop/src/forms/media.test.ts`):**
  - Rendered valid ```` ```compare ```` fences as `<figure class="md-compare" data-compare tabindex="0">` with no model-supplied `src` attributes, falling back to an ordinary `.code-block` when unparsed.
  - Added `paintCompare` and `flipCompare` in `Markdown.vue`: when both images load with matching `naturalWidth` and `naturalHeight`, `.flippable` stacks them in one grid cell, shows the active corner label, and flips in place on click or `x` while focused (`mousedown` prevented inside `.preview` so option focus stays put). When natural sizes differ, `.stacked` shows both images with their badges and sets status to `<w1>×<h1> and <w2>×<h2>`. When one or both fail, whichever image loaded is shown and status names both paths.
- **Fixtures, screenshots, trials and docs:**
  - Added `packages/protocol/fixtures/files/layout-after.png` (320×64) and `packages/protocol/fixtures/files/layout-tall.png` (320×88), updated `packages/protocol/fixtures/media.json`, and refreshed `docs/guide/images/cards/media-{light,dark}.png`.
  - Added `apps/server/trials/project/layout-after.png` and `apps/server/trials/prompts/before-after.md`, ran the trials, and recorded the results in `apps/server/trials/README.md`.
  - Updated `docs/guide/pictures.md`, `README.md`, `docs/architecture/form-spec.md`, `docs/architecture/card-ui.md`, `docs/architecture/ask-tool.md` and `docs/architecture/testing.md`.

### Decisions made

- **Flip on click or `x` while focused** (`tabindex="0"`, checked against `~/.config/keymap/keymap.md`), with the active side's label in the top-right corner (`A` and `B` when unlabelled).
- **Mismatched natural dimensions stack** instead of flipping in place, showing each image's badge and `<w1>×<h1> and <w2>×<h2>` in the caption status.

### Verification

- `pnpm typecheck` and `pnpm build` — pass.
- `pnpm --filter @parley/protocol test` (146 tests), `pnpm --filter @parley/server test` (74 tests), `pnpm --filter @parley/desktop test` (218 tests, including `no-color-literals.test.ts` and `schemas.test.ts`) — pass.
- `pnpm --filter @parley/server fake-host` — all 12 scenarios pass.
- `pnpm --filter @parley/desktop screenshots media` — updated `docs/guide/images/cards/media-{light,dark}.png`.
- `pnpm --filter @parley/server trial --client all --prompt before-after --runs 3 --keep` and `--prompt screenshot-look --runs 1 --keep` — 6/6 `before-after` runs wrote ```` ```compare ```` fences with both images resolved in `x-media` (Claude 3/3 asked, 2/3 first-call valid, 3/3 used; Codex 3/3 asked, 3/3 first-call valid, 3/3 used); `screenshot-look` 2/2 first-call valid.

### Follow-ups

- Hands-on check for Logan in the installed app (`pnpm install:desktop` when ready) and in Claude Desktop's inline card.
