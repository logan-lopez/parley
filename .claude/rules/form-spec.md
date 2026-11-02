---
paths:
  - "packages/protocol/src/ask.ts"
  - "packages/protocol/src/form.ts"
  - "packages/protocol/src/show.ts"
  - "packages/protocol/src/media.ts"
  - "packages/protocol/fixtures/**"
---

Before changing these files, read [The form spec](../../docs/architecture/form-spec.md).

Decisions that bind these files, newest first:

- [Media by reference](../../docs/decisions/media-by-reference.md): Images and sounds in a form are references (path, sha256, size) the window reads from disk, never copies or base64
- [Don't ask again](../../docs/decisions/dont-ask-again.md): A per-question "Don't ask again here" toggle; the agent drafts a standing line for AGENTS.md and saves it only after Logan accepts the draft; Parley never answers on his behalf
- [Soft input limits](../../docs/decisions/soft-input-limits.md): The model sees tight limits on headers and descriptions; the server accepts a margin past them, and clips a long header on the card
- [Editing a shown file](../../docs/decisions/editing-a-shown-file.md): `editable` on a whole-file `path` show
- [Show blocks](../../docs/decisions/show-blocks.md): A `show` question type with no answer: `content` (markdown) or `path` (with `lines`)
- [Drafts to edit](../../docs/decisions/drafts-to-edit.md): `draft` on `text` only
- [Review decisions](../../docs/decisions/review-decisions.md): `review` takes 2–4 `decisions` of its own
- [`review` question](../../docs/decisions/review-question.md): 1–30 items, each approved or rejected with an optional comment
- [Note for the agent](../../docs/decisions/note-for-the-agent.md): Every card has an optional note, sent with an answer or a skip, returned as `note` and quoted in the text
- [Result shape](../../docs/decisions/result-shape.md): `structuredContent` (with an `outputSchema`) plus a text block, and `message` in the structured result repeats the text
- 3 more: `docket context docs/architecture/form-spec.md`
