---
paths:
  - "apps/desktop/src/theme/**"
---

Before changing these files, read [Themes](../../docs/architecture/themes.md).

Decisions that bind these files, newest first:

- [Hide on blur](../../docs/decisions/hide-on-blur.md): `hideOnBlur` in settings.json, on by default, hides the window when it loses focus; the file picker doesn't count
- [Derived theme shades](../../docs/decisions/derived-theme-shades.md): Mixed from the tokens in `src/theme/tokens.css`, each subtle shade a `light-dark()` pair of `color-mix()`es keyed to the theme's variant (through `color-scheme`), not the system
- [Themes](../../docs/decisions/themes.md): inn's format (base16/base24 YAML with `overrides`, inn's token names), set as `theme` in `~/.config/parley/settings.json`: one id, or `{ light, dark }` following the macOS appearance live
- [Themes and the inline card](../../docs/decisions/themes-and-the-inline-card.md): The card keeps following Claude's surfaces and text over Parley Light or Dark
