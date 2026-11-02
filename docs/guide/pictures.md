---
description: "Project images in questions, previews and shows, with changed-file notices in history"
covers: ["docs/architecture/form-spec.md", "docs/architecture/ask-tool.md", "docs/architecture/card-ui.md", "docs/architecture/inline-cards.md", "docs/architecture/desktop-shell.md"]
---
# Pictures from the project

An agent can put a screenshot or other project image in a question, an option's preview, a review
item's preview, or a show. It writes ordinary markdown, such as `![The new layout](shots/layout.png)`.
The picture appears with its caption and path below it. Small pictures keep their size; wide ones
fit the card. Click a drawn picture in the Parley window to open the file in its default image app
(usually Preview).

PNG, JPEG, GIF and WebP work, up to 25 MB per file and 200 image references in one ask. The image
must be inside the asking agent's project. Secret-looking files and links outside the project are
refused. Remote URLs aren't loaded. For SVG, the agent uses a show with `path`, which draws it with
the card's theme. For a filename with spaces it can write `![Caption](<shots/new layout.png>)`.

Parley keeps a reference to the image, not a copy. When you open an ask in history, a file that has
changed says “changed since this was asked”, and a deleted file says “is gone”, with the caption and
path still there. A file that wasn't loaded says “isn't loaded here”. If an image can't be decoded,
the caption and path stay visible.

In Claude Desktop's inline card, images up to 2 MB each and 8 MB per ask appear in the chat.
Larger images keep their caption and say **Open in the Parley window**. You can still answer the
card in either place.
