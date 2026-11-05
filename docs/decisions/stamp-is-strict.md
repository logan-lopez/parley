---
description: "Stamp fills blanks with the recommendations, and is disabled if an answer disagrees with one or a required question with none is blank; no recommendations, no button"
decided: 2026-11-05
by: "Logan"
covers: ["docs/architecture/card-ui.md", "docs/architecture/form-spec.md"]
---
# Stamp is strict

## Choice

A recommendation is a "(Recommended)" option, a draft or a review's preset decision. Stamp fills
blank questions with them. It's disabled, saying why, when an answer disagrees with a recommendation
or a required question with no recommendation is still blank. Answers to questions with no
recommendation stay. A card with no recommendations doesn't show the button. The result keeps status
`answered`, with `stamped: true` and its own first line.

## Why

Stamp can clear a gate only if "every recommendation" is literally true, so an agent never has to
read a list of exceptions. Rejected: filling blanks and keeping picks that differ, which works on
more cards but weakens the signal; and untouched cards only, which also blocks a card where only an
unrecommended question was answered. From [brief 27](../briefs/27-stamp.md).
