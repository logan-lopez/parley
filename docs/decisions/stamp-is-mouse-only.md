---
description: "Stamp has no key and can't be reached from the keyboard, and a click in a card's first 500 ms is ignored"
decided: 2026-11-05
by: "Logan"
covers: ["docs/architecture/card-ui.md"]
---
# Stamp is mouse only

## Choice

Stamp has no chord, Tab doesn't reach it, and Enter and Space don't fire it. A click in the first
500 ms after a card appears is ignored, so a double click can't stamp the next card in the queue.

## Why

A stamp should take a deliberate reach and not happen automatically. The result tells the agent the
user read the card, which Parley can't verify, and the recommended option is already picked 92.1% of
the time (`apps/server/trials/README.md`), so a chord would become a reflex. Logan first chose a
chord, then changed it to mouse only the same day. The cost is a trip to the mouse on a card
otherwise run from the keyboard. From [brief 27](../briefs/27-stamp.md).
