---
size: S
size-note: "one fence and one renderer on brief 22's plumbing"
status: not-started
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
