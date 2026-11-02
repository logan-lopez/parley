---
paths:
  - "apps/desktop/src/card/**"
  - "apps/desktop/src/forms/**"
  - "apps/desktop/src/platform.ts"
  - "apps/desktop/src/styles.css"
  - "apps/desktop/src/zoom.ts"
  - "apps/desktop/src/ZoomControl.vue"
  - "apps/desktop/src/App.vue"
  - "apps/desktop/src/main.ts"
  - "apps/desktop/src/gallery/**"
---

Before changing these files, read [The card](../../docs/architecture/card-ui.md).

Decisions that bind these files, newest first:

- [Don't ask again](../../docs/decisions/dont-ask-again.md): A per-question "Don't ask again here" toggle; the agent drafts a standing line for AGENTS.md and saves it only after Logan accepts the draft; Parley never answers on his behalf
- [Soft input limits](../../docs/decisions/soft-input-limits.md): The model sees tight limits on headers and descriptions; the server accepts a margin past them, and clips a long header on the card
- [Colors in markdown](../../docs/decisions/colors-in-markdown.md): A color in a code span (hex or a CSS color function, no named colors) gets a swatch
- [HTML and SVG previews](../../docs/decisions/html-and-svg-previews.md): Opt-in ```` ```html preview ```` / ```` ```svg preview ```` fences, drawn as an SVG image from a `data:` URL at a size the agent gives
- [Pasted screenshots](../../docs/decisions/pasted-screenshots.md): `capture` saves them as PNGs under `$APPDATA/captures/<day>/` and returns the paths
- [Review decisions](../../docs/decisions/review-decisions.md): `review` takes 2–4 `decisions` of its own
- [`review` question](../../docs/decisions/review-question.md): 1–30 items, each approved or rejected with an optional comment
- [Note for the agent](../../docs/decisions/note-for-the-agent.md): Every card has an optional note, sent with an answer or a skip, returned as `note` and quoted in the text
- [UI stack](../../docs/decisions/ui-stack.md): Vue 3 (Composition API, `<script setup>`), JSON Forms 3.x Vue bindings, the three `@jsonforms/*` at the same exact version
