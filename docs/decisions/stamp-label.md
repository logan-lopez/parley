---
description: "The third button on a card is labelled \"Stamp\", with the tooltip \"Approve every recommendation\""
decided: 2026-11-05
by: "Logan"
covers: ["docs/architecture/card-ui.md"]
---
# Stamp label

## Choice

The button says "Stamp", and its tooltip says "Approve every recommendation". The agent reads plain
language in the result, so the label only has to work for the person pressing it.

## Why

"Approve all" needs no learning but is wrong in two places: a review preset to reject stamps
rejects, and Shift+`a` in a review already means approve every item. The cost of "Stamp" is a line
in the guide and a little learning. From [brief 27](../briefs/27-stamp.md).
