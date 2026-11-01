---
description: "Mixed from the tokens in `src/theme/tokens.css`, each subtle shade a `light-dark()` pair of `color-mix()`es keyed to the theme's variant (through `color-scheme`), not the system"
decided: 2026-10-12
covers: ["docs/architecture/themes.md"]
---
# Derived theme shades

## Choice

Mixed from the tokens in `src/theme/tokens.css`, each subtle shade a `light-dark()` pair of `color-mix()`es keyed to the theme's variant (through `color-scheme`), not the system. No color literal outside `src/theme/`, enforced by a test.

## Why

One percentage couldn't reproduce both old bundled sets: dark's steps were bigger (brief 15, 2026-10-12, [themes](../architecture/themes.md#decisions)).
