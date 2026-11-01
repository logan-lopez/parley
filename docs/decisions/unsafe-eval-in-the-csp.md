---
description: "Allowed"
covers: ["docs/architecture/desktop-shell.md"]
---
# `'unsafe-eval'` in the CSP

## Choice

Allowed

## Why

AJV (JSON Forms validation) compiles validators with `new Function`. Markdown still renders without raw HTML, and model HTML becomes an SVG image (brief 14), which can't run script, so model text can't inject any.
