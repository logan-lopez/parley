---
description: "`p` plays the focused row's next sound chip, Shift+`p` replays, Esc stops; digits keep deciding the row"
decided: 2026-11-02
by: "Logan"
covers: ["docs/architecture/card-ui.md"]
---
# Audition play keys

## Choice

In the review and choice renderers, `p` plays the focused row's or option's next sound chip,
wrapping round; Shift+`p` replays the last one; Esc stops playback before it hides the window.
Autoplay on focus is off unless `settings.json` turns it on.

## Why

Digits `1`–`4` already decide the focused row in a review with labelled decisions, and audition
forms use exactly that (Take 1, Take 2, Take 3, None), so playing can't take the digits. Cycling
needs one key and still reaches every take (Logan, 2026-11-02,
[brief 24](../briefs/24-audition-keys.md)).
