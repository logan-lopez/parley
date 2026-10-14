# Brief 18: A show that follows its file (spike first)

Read `CLAUDE.md`, [`README.md`](README.md), [brief 16](16-show-blocks.md), [brief
17](17-editable-show.md), [the hub](../architecture/hub.md), [asks and
history](../architecture/asks-and-history.md) and [the ask tool](../architecture/ask-tool.md)
first.

**Prerequisites:** briefs 16 and 17 merged.

## Goal

While an ask is open, a path-backed show follows its file. Whoever changes the file, the window's
card re-renders with the new version. That could be Logan in Neovim, an agent whose call Claude
Code has backgrounded, or a build step. Two flows motivate it:

- **Logan edits the shown file himself.** For example, he fixes the plan in Neovim and watches the
  card catch up, then answers the questions about it.
- **The agent iterates while the card is open.** After 2 minutes, Claude Code moves the call to
  a background task and the model can keep working
  ([the ask tool](../architecture/ask-tool.md#claude-code-and-long-asks)). An agent revising
  `mock.html` would update the open card, and Logan answers once it's right.

**This is spike-gated.** Step 0 checks the mechanics and both flows, and ends in a go or no-go. A
no-go stops the brief with a report. Only a go builds §1 onward.

Why now: briefs 16 and 17 make the shown file the shared artifact between Logan and the agent.
Today the card is a snapshot from the moment of the ask. (Ideate, 2026-10-14. Logan chose a
spike-gated brief over a straight build or a `FUTURE.md` entry, 2026-10-14.)

## Decisions already made

- **Spike first, then build.** (Logan, 2026-10-14.)
- **The window only.** The inline card keeps the snapshot it was given. It receives data only when
  a tool call returns, and Claude Desktop's chat has no project directory for `path` anyway
  (brief 16).
- **No new wire message, if the spike allows it.** `ask` is idempotent by id, and the app's
  handler for a known id already does `Object.assign(existing, { ...ask, conn, session })`
  (`apps/desktop/src/asks/store.ts`, the `ask` handler). Re-sending the same id with a new `form`
  is the update. An app that predates this still takes it. The spike confirms the card re-renders.
- **Edits made against an older version are never written over a newer one.** Brief 17's `base`
  is the guard: the server compares the disk against the version the user's text started from,
  not the latest one shown.

Don't revisit these silently.

## Already checked

- **The re-send path** (`store.ts`, `hubHandlers.ask`, read 2026-10-14) updates a pending record
  in place but only `save`s for an orphaned one. A pending record whose form changed isn't written
  to `history.jsonl` until its next save (an answer saves the full record). §3 adds the save.
- **`AppClient`** re-sends every pending `ask` message after a reconnect (`app-client.ts`, the
  `pending` map). An update has to replace the stored message, or a reconnect would send the old
  form back.
- **Not checked, and step 0 settles each:**
  - whether `fs.watch` on macOS reliably reports a save from Neovim (which may write through a
    rename, depending on `backupcopy`), from Claude Code's Edit tool, and from `git checkout`.
    Watching the parent directory and filtering by name is the usual answer to renames.
  - whether JSON Forms re-renders cleanly when the record's `form.schema` is replaced under an open
    card, and keeps the other questions' data and focus;
  - whether a backgrounded Claude Code agent actually keeps working on the file while the ask is
    open, or just waits.

## Open questions

- **An "updated" mark.** Default: the meta row shows "updated 12s ago" next to the age while the
  card is open, after the first change.
- **Debounce.** Default: 200 ms after the last event, then re-read.
- **What the agent hears.** Default: when the file changed while the ask was open, the answer's
  line for the show says so ("changed 3 times while open; the user answered on the latest").

## Step 0: the spike (go or no-go)

Work in the session's scratchpad, not the repo. It touches Logan's running app and needs him for
part (c): ask him once before starting, and say it takes about twenty minutes, with ten of them
his.

a. **Watching.** A scratch Node script watches a file's directory and logs events with timestamps.
   Save the file from Neovim (Logan, with his config), with a scripted `writeFile`, with a
   rename-over write, and with `git checkout -- <file>`. Record which events arrive and how many
   per save.
b. **Live update.** A scratch session script (start from `scripts/fake-session.ts`) sends an `ask`
   with a show, then re-sends the same id with an edited form every few seconds. Watch it in the
   dev app (`pnpm app`): does the show re-render, and do the other questions keep their data and
   focus? Try it with a draft typed into a text question.
c. **The agent flow** (Logan, in a real Claude Code session in a scratch project): a prompt that
   has the agent write `mock.html`, show it with brief 16, and keep refining it until he answers.
   It doesn't need the live update to work yet. The question is whether, once the call is
   backgrounded, the agent edits the file while the ask is open, and whether it picks up the
   answer when it arrives.

**Go:** (a) catches every save with a debounce, and (b) re-renders without losing the other
answers. **No-go:** (b) needs a remount that drops data or focus, or (a) misses saves. Then stop
and report. Don't design a new wire message without Logan. Report (c) either way. If agents don't
iterate while waiting, the Neovim flow alone may still justify a go. That's Logan's call, so ask
him with the results in hand.

## Shape (after a go)

### 1. Watching (`apps/server/src/show-watch.ts`, **new**)

`watchShows(askId, input, files, onChange: (files: ShowFiles) => void): () => void`. It uses one
`fs.watch` per distinct parent directory and filters by basename, debounced. On a change it
re-reads with brief 16's rules (`readShowFiles` for that one show). A read that now fails (deleted,
grown past the cap) keeps the last good version and logs to stderr. An unchanged hash does nothing.
Watchers close when the ask ends. Start it from `showAsk` and `runAsk` for any ask with a
path-backed show.

### 2. Updating the ask (`app-client.ts`, `ask-lifecycle.ts`)

- `AppClient.update(id, form)`: replace the stored pending message's `form`, and write it if
  connected. A reconnect re-sends the latest.
- The shown ask keeps every version it has shown, `Map<sha256, text>`, beside `files`. Brief 17's
  diff takes the base version's text from there, and `applyShowEdits` compares the disk to `base`
  as before.
- Recompile with the new files and send the update. Count changes per show for the answer line.

### 3. The app (`store.ts`, the card)

- `hubHandlers.ask`: when a pending record's `form` changed, `save` it and set `updatedAt`.
- The meta row shows the updated mark (Open questions).
- **Editable shows:** when the new `x-original` arrives and the user's text still equals the old
  original, replace it with the new text and `base`. When they've edited, keep their text and
  `base`, and show "The file changed since you started editing", with a "Load the new version"
  button that discards their edit. Sending anyway goes through brief 17's conflict path, unless
  the disk is back at their base.

### 4. Shaping

Add the change count to the show's line when it's over zero. `ShowEdit` gains nothing.

### Docs

- **Guide.** `question-types.md`, Show: the card follows the file in the Parley window, the updated
  mark, and an editable show's "changed since you started editing".
- **Architecture.** `hub.md`: a re-sent `ask` for a pending id updates its form, deliberately now.
  `ask-tool.md`: the watcher. `asks-and-history.md`: `updatedAt` and the save. Add `show-watch.ts`
  to Sources and run `areas.py`.

## Out of scope

- Live updates in the inline card.
- Watching anything but shown files, or following a file after its ask ends.
- Merging Logan's edits with a newer version. He picks one.

## Acceptance

Step 0 ends in a report appended to this brief and a go or no-go from Logan. After a go:

1. `pnpm --filter @parley/server test`: `show-watch.test.ts` in a temp dir covering a write, a
   rename-over write, a delete (the last version is kept), an unchanged rewrite (no update), and
   close on end.
2. `pnpm --filter @parley/desktop test`: `store.test.ts` covers a re-sent pending ask with a new
   form being saved and getting `updatedAt`, and a re-sent ask with the same form not saving.
3. `pnpm typecheck`, `pnpm --filter @parley/server build`, and `fake-host` pass.
4. **Dev app** (ask Logan once): `fake-ask show-file` from the repo root, then edit
   `docs/guide/question-types.md` and save. The card updates within a second and the updated mark
   shows. With `show-edit`, edit in the card, change the file on disk, and see the "changed since
   you started editing" line. Sending gives brief 17's conflict, and the file isn't overwritten.
   Restore the files with `git checkout` after.

By hand, for Logan:

- The Neovim flow on a real plan.
- An agent iterating on `mock.html` while the card is open, if (c) said agents do that.

Then stop. Ask Logan before committing.
