---
description: "A color in a code span (hex or a CSS color function, no named colors) gets a swatch"
decided: 2026-10-11
by: "Logan"
covers: []
---
# Colors in markdown

## Choice

A color in a code span (hex or a CSS color function, no named colors) gets a swatch; a ```` ```palette ```` block draws labelled swatches. Set through the CSSOM, never a `style` attribute.

## Why

Prose `#123` is as often an issue number. The release CSP drops `style` attributes while dev allows them (Logan, 2026-10-11, brief 13).
