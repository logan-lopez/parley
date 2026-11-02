---
description: "The model sees tight limits on headers and descriptions; the server accepts a margin past them, and clips a long header on the card"
decided: 2026-11-01
by: "Logan (clipping the header); the margins are brief 20's defaults"
covers: ["docs/architecture/form-spec.md", "docs/architecture/card-ui.md"]
---
# Soft input limits

## Choice

The published input schema keeps `header` at 12 characters and option `description` and review
item `detail` at 300 (through Zod's `.meta({ maxLength })`). The server accepts a `header` up to
24 and a `description` or `detail` up to 500. A header past 12 is clipped on the card's chip with
an ellipsis and shown in full on hover; ids and the result keep the full header. Labels stay
hard limits, because a label is the answer value.

## Why

66 of 1,006 real `ask` calls from Claude Code (2026-10-10 to 11-01) bounced on validation and
cost a round trip each: about 40 on a description or detail of 301 to 475 characters, and 20 on
a header of 13 or 14, although the tool description already said 12. Advertising the tight limit
keeps cards short; the margin catches the near misses. Rejecting cost more than a clipped chip.
From the ideate of 2026-11-01; built in [brief 20](../briefs/20-input-limits.md).
