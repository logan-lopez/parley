# What it looks like

Every card here is a fixture from `packages/protocol/fixtures/`, drawn by the real card in the
gallery, in light and dark. Each frame is the window's size, so a long card is cut where the
window would scroll it.

**Covers:** [The card](../architecture/card-ui.md), [Testing](../architecture/testing.md)

To redraw them after a change to the card or a fixture:

```sh
pnpm --filter @parley/desktop screenshots            # every fixture
pnpm --filter @parley/desktop screenshots choice     # or just the ones named
```

## The window

The app's window, with a few asks queued. It's a screenshot of the installed app, taken by hand
(it's a floating panel, so it can't be captured headless).

![The Parley window with three asks queued](images/app.png)

## Choice

How it works: [Question types](question-types.md#choice).

Two choice questions, the recommendation first and a number key on each option.

| Light | Dark |
| --- | --- |
| ![choice, light](images/cards/choice-light.png) | ![choice, dark](images/cards/choice-dark.png) |

A multi-select.

| Light | Dark |
| --- | --- |
| ![multi select, light](images/cards/multi-select-light.png) | ![multi select, dark](images/cards/multi-select-dark.png) |

## Text

How it works: [Question types](question-types.md#text).

Short and long text.

| Light | Dark |
| --- | --- |
| ![text, light](images/cards/text-light.png) | ![text, dark](images/cards/text-dark.png) |

A draft the agent wrote, to edit in place: here a commit message.

| Light | Dark |
| --- | --- |
| ![text draft, light](images/cards/text-draft-light.png) | ![text draft, dark](images/cards/text-draft-dark.png) |

## Number

How it works: [Question types](question-types.md#number).

| Light | Dark |
| --- | --- |
| ![number, light](images/cards/number-light.png) | ![number, dark](images/cards/number-dark.png) |

## Yes or no

How it works: [Question types](question-types.md#yes-or-no).

| Light | Dark |
| --- | --- |
| ![boolean, light](images/cards/boolean-light.png) | ![boolean, dark](images/cards/boolean-dark.png) |

## Path

How it works: [Question types](question-types.md#path).

Files to pick (or type), and a folder.

| Light | Dark |
| --- | --- |
| ![path, light](images/cards/path-light.png) | ![path, dark](images/cards/path-dark.png) |

## Review

How it works: [Question types](question-types.md#review).

Approve or reject each item.

| Light | Dark |
| --- | --- |
| ![review, light](images/cards/review-light.png) | ![review, dark](images/cards/review-dark.png) |

The agent's own decisions (Port / TODO / Skip).

| Light | Dark |
| --- | --- |
| ![review decisions, light](images/cards/review-decisions-light.png) | ![review decisions, dark](images/cards/review-decisions-dark.png) |

A checklist of things to try by hand.

| Light | Dark |
| --- | --- |
| ![review checklist, light](images/cards/review-checklist-light.png) | ![review checklist, dark](images/cards/review-checklist-dark.png) |

Proposed fixes with their diffs.

| Light | Dark |
| --- | --- |
| ![review diff, light](images/cards/review-diff-light.png) | ![review diff, dark](images/cards/review-diff-dark.png) |

A review beside a choice.

| Light | Dark |
| --- | --- |
| ![review mixed, light](images/cards/review-mixed-light.png) | ![review mixed, dark](images/cards/review-mixed-dark.png) |

## Capture

How it works: [Question types](question-types.md#capture).

A command to run, with a copy button, and a box for its output or a screenshot.

| Light | Dark |
| --- | --- |
| ![capture, light](images/cards/capture-light.png) | ![capture, dark](images/cards/capture-dark.png) |

Pasted text only.

| Light | Dark |
| --- | --- |
| ![capture text, light](images/cards/capture-text-light.png) | ![capture text, dark](images/cards/capture-text-dark.png) |

## In the question text

How it works: [Answering a card](answering.md#code-in-a-question).

Color chips and a palette.

| Light | Dark |
| --- | --- |
| ![colors, light](images/cards/colors-light.png) | ![colors, dark](images/cards/colors-dark.png) |

Options with a preview of the focused one, here code.

| Light | Dark |
| --- | --- |
| ![previews, light](images/cards/previews-light.png) | ![previews, dark](images/cards/previews-dark.png) |

A long question with headings, lists and a table.

| Light | Dark |
| --- | --- |
| ![long markdown, light](images/cards/long-markdown-light.png) | ![long markdown, dark](images/cards/long-markdown-dark.png) |

Four questions on one card.

| Light | Dark |
| --- | --- |
| ![four questions, light](images/cards/four-questions-light.png) | ![four questions, dark](images/cards/four-questions-dark.png) |
