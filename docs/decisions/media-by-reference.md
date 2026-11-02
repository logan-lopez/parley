---
description: "Images and sounds in a form are references (path, sha256, size) the window reads from disk, never copies or base64"
decided: 2026-11-02
by: "Logan"
covers: ["docs/architecture/form-spec.md", "docs/architecture/ask-tool.md", "docs/architecture/card-ui.md", "docs/architecture/desktop-shell.md"]
---
# Media by reference

## Choice

A media file named in a form's markdown is resolved by the server (the project rule and secret
names of [files in shows](files-in-shows.md), plus type sniffing and caps) into `x-media`: its
path, sha256, size and type. The window loads it from disk through Tauri's asset protocol, after
a small Rust command grants the path when its hash still matches. History keeps the reference,
not a snapshot: a changed or deleted file says so instead of showing the new one.

## Why

An audition round references over a hundred files, and screenshots run to megabytes. Copying them
into `$APPDATA/media/` costs that much disk every round and makes pruning a job of its own; base64
in the form would ride every hub line, history line and reconnect re-send. Losing old media from
history when a project cleans its audition folders is the accepted cost (Logan, 2026-11-02,
[brief 22](../briefs/22-media-images.md)).
