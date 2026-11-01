---
description: "Opt-in ```` ```html preview ```` / ```` ```svg preview ```` fences, drawn as an SVG image from a `data:` URL at a size the agent gives"
decided: 2026-10-11
by: "Logan"
covers: []
---
# HTML and SVG previews

## Choice

Opt-in ```` ```html preview ```` / ```` ```svg preview ```` fences, drawn as an SVG image from a `data:` URL at a size the agent gives. A sandboxed iframe is the fallback only if the spike fails.

## Why

Plain ```` ```html ```` is how agents show source. An image is static by construction and needs no CSP change in the window or the card; inline sanitized HTML would rest on the sanitizer alone in the card (Logan, 2026-10-11, brief 14). HTML is drawn on a plain light page in any theme; SVG takes the theme's text color: models write HTML for a browser's default page, and on a themed dark one their text vanished (Logan, 2026-10-14, brief 14's trial).
