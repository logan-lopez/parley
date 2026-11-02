---
description: "Claude Desktop's inline card shows images as `data:` URLs from the result's `_meta` up to a cap; sounds play in the window only"
decided: 2026-11-02
by: "Logan"
covers: ["docs/architecture/inline-cards.md"]
---
# Media in the inline card

## Choice

Images under the caps go to the inline card as `data:` URLs in the `ask` result's
`_meta['parley/media']`, as show files do, so they draw in the chat; past the caps the card shows
the caption and points at the Parley window. Sound chips in the card are disabled and say they
play in the window. A form with media isn't window-only.

## Why

The MCP Apps default CSP allows `img-src data:`, which the card's previews already use; whether
Desktop allows `media-src data:` is unchecked, and audition-sized forms would be large as `data:`
URLs (Logan, 2026-11-02, [brief 22](../briefs/22-media-images.md),
[brief 23](../briefs/23-media-sounds.md)).
