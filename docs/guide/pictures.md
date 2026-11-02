---
description: "Project images and sounds in questions, previews and shows: pictures drawn, sounds as play chips, with changed-file notices in history"
covers: ["docs/architecture/form-spec.md", "docs/architecture/ask-tool.md", "docs/architecture/card-ui.md", "docs/architecture/inline-cards.md", "docs/architecture/desktop-shell.md"]
---
# Pictures and sounds from the project

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

## Sounds

The same markdown with a sound file, such as `![Take 1](audition/jump/1.wav)`, is a play chip:
▶, the caption, and the sound's length once it's known. Click it to play; click it again to
stop. Starting another chip stops the one that was playing, so only one sound plays at a time.
Clicking a chip in a preview doesn't move focus off the row or option you're on, and a chip in
an option's description doesn't pick the option. Answering or closing the ask stops the sound.

A glob in the file name, such as `![Take 3](audition/jump/3_*.wav)`, makes one chip of
variants: it says how many (“3 variants”), plays them one after another with a short pause, and
shows which is playing (“2/3”). The glob matches 1 to 12 files in that one directory, in name
order with numbers counted properly (`take_2` before `take_10`). `*` and `?` work; a glob in a
directory name and `**` don't. Hover a chip to see its files.

WAV, AIFF, MP3, M4A/AAC, FLAC and Ogg (Vorbis or Opus) play, checked by their contents rather
than the extension. Each file counts toward the 200 per ask, variants included. Anything else is
refused, and the agent is told to convert it first (for example with `ffmpeg`).

Sounds follow the same rules as pictures: inside the project, no secret-looking files, a
reference rather than a copy. In history, a chip whose file changed or is gone is disabled and
says so, naming the file. In Claude Desktop's inline card, chips are disabled and say **Plays in
the Parley window**.

### Playing from the keyboard

When a review item or a choice option has chips in its preview (or its description), you can
audition without the mouse. Move with `j`/`k` or the arrows, and:

| Key | What it does |
| --- | --- |
| `p` | Play the focused row's next chip: the first, then the second, and round again. |
| Shift+`p` | Play the last one again. |
| Esc | Stop what's playing. With nothing playing, Esc hides the window as it always does. |

`1`–`4` still decide the row (Take 1, Take 2, Take 3, None in an audition), so you can listen,
decide and move on with the keys alone. A row with no chips ignores `p`, and in a comment box or
the Other box it types. Each row remembers the take you heard last, so coming back to it and
pressing `p` plays the take after that one. The chip `p` plays next is marked: an accent outline
and a small `p`. A chip you click plays from the mouse and moves that place on too.

The key list under a review shows `p` when the ask has sounds.

### Autoplay

Off by default, because a window that starts making noise when a notification brings it up is a
bad surprise. To have moving onto a row play its first chip, set `autoplay` in
`~/.config/parley/settings.json` (the file [themes](themes.md) use; make the folder yourself):

```json
{ "autoplay": true }
```

It plays when focus moves onto a row or option with `j`/`k`, the arrows, Tab or a click, then `p`
goes on to the second take. It never plays when a new ask arrives, when the window comes back to
the front, or in [history](history.md). A value that isn't `true` or `false` is ignored, with a
banner saying so. Parley reads the file each time the window comes up.
