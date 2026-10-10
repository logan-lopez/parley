# Brief 4: Persisted history and the inbox view

Read `CLAUDE.md` and [`README.md`](../README.md) first. Briefs 1 and 2 are merged. This brief doesn't
depend on brief 3, but rerun the harness at the end if it exists.

## Goal

Asks outlive the moment they're answered. Every ask the app sees is written to disk, comes back
after a restart, and can be read in a history view inside the Parley window. Unsent drafts survive
a reload and a restart.

Three reasons:

- A card that times out or is withdrawn while you're halfway through it isn't lost.
- The notes you leave for the agent, including feedback on Parley itself, add up to something you
  can read back.
- The draft-persistence item in Obsidian's `Ideas.md` falls out of the same store.

It's also the groundwork a future inbox or `ask_async` would need.

`asks/store.ts` was built for this: ended records stay in `records` with their final status, and its
header says a history view is "a filter over `records`, not a new store." Keep it that way. This
brief adds a disk behind the store and a view over it. It does not add a second store.

## Ownership

You own `apps/desktop/src/asks/` (the store, plus a new persistence module), a new
`apps/desktop/src/history/` for the view, the navigation in `App.vue`, the `fs` plugin wiring
(`Cargo.toml`, `lib.rs`, `package.json`, `capabilities/default.json`), and the draft handling that
moves out of `App.vue`. The wire protocol and the server don't change: history is app-side only.

## 1. Storage (pinned)

- **`@tauri-apps/plugin-fs`, writing to one JSONL file at `$APPDATA/history.jsonl`.** Scope the
  capability to that file (and the temp file used for compaction), not all of `$APPDATA`:
  `hub.sock` lives there too.
- **Why not `plugin-store`:** it rewrites the whole JSON file on every save. A month of asks with
  their forms and previews is megabytes, rewritten on every status change. Appending is cheap, and
  a half-written last line after a crash only loses that line.
- **Why not SQL:** nothing here needs queries. The whole history loads into memory at startup, and
  the view filters in memory.
- **Why not Rust:** CLAUDE.md keeps the Rust side to the tray, hotkey, windows and the hub.

Each line is a snapshot of one record:

```ts
{ v: 1, ...record }   // AskRecord without `conn`, which is per-connection runtime state
```

Append a line when a record is created, when its status changes, and when its draft changes
(debounce drafts, about 500 ms). The last line for an id wins.

**At startup:** read the file and fold it to the last line per id. Skip lines that don't parse and
log them. Drop records that ended more than 30 days ago. Write the compacted result to a temp file
and rename it over the original. Then hydrate `records`.

**Order matters:** hydrate before the webview calls `hub_ready`. Servers re-send their pending asks
on connect, and those must find their existing records. That keeps them from notifying twice, and
it brings their drafts back.

**Records left `pending` by the last run** load as `orphaned`, with `endedReason: 'disconnected'`.
The store's existing re-send handler already revives an orphaned record when its server comes back
within the 30 s reconnect window. Past that window the server has failed the call, so the record
stays orphaned. That's the truth, so show it.

Writes must never block the UI or break the ask flow. If a write fails, log it and carry on, and
show a quiet marker in the history view that history isn't being saved.

## 2. Drafts

The `drafts` map in `App.vue` becomes `draft?: { data?: unknown; note?: string }` on the record, in
the store, persisted with it. Clear it when the ask ends, and keep it on the record after that, so
history can show what you'd typed into a card that was withdrawn under you. Focus and scroll
position stay in memory, as they are now.

This also replaces the `sessionStorage` guard against double notifications if that guard becomes
redundant. Check, and remove it only if it is.

## 3. The history view

The window is 440 px wide.

- **Getting there:** a key from the card and from the empty state, plus a small button in each.
  `Cmd+Y` is the browser convention for history. Check `~/.config/keymap/keymap.md` for a global
  claim before you settle it. The same key or Esc goes back. Esc in the history view goes back
  rather than hiding the window; say in the hints which one it does.
- **The list:** newest first, grouped by day. Each row shows the source label (`client · project`,
  from `asks/source.ts`), the form title or the first question's header, a status chip, and the
  time. A row with a note shows a marker.
- **Filters:** by status (answered, skipped, withdrawn, which covers `cancelled`, `timed_out` and
  `orphaned`), "has a note", and a text filter over titles, headers, answers and notes. These are
  computed filters over `records`.
- **Detail:** Enter or a click opens the ask read-only. Reuse `AskCard` with the answer (or the
  last draft) as `initialData`, with nothing editable and no Send or Skip. Add a `readonly` prop if
  `withdrawn` doesn't fit. Show the note in full. Escape goes back to the list.
- **Keyboard:** ↑/↓ or j/k move through the list, Enter opens, and `/` focuses the text filter. Use
  the same quiet hint style as the card.
- **Clearing:** a "Clear history" action behind a confirm. It truncates the file and drops every
  ended record. It leaves pending asks alone.
- The queue still wins. If an ask arrives while the history view is open, show the pending count
  in the view's header, and make getting back to the queue one key. Don't yank the user out of
  history.

Pending asks don't appear in history. They're the queue.

## 4. Out of scope

Answering an ask after it ended: the server is gone, and there's no channel back. Syncing history
across machines. Export, beyond what selecting text in the detail view already allows. A separate
retention setting: 30 days is a constant for now.

## Acceptance

Run each of these and report the results.

1. Answer and skip a few asks with `fake-ask`, some with notes. Quit Parley from the tray and
   relaunch: they're all in history with the right status and notes, and the queue is empty.
2. Start an ask, type a partial answer and a note, and quit Parley. Relaunch within 30 s: the card
   comes back with the draft, and no second notification arrives. Repeat, waiting over 30 s:
   history shows the ask as orphaned, with the draft.
3. A webview reload with a draft in progress keeps the draft.
4. Compaction: with a hand-built `history.jsonl` holding old, duplicate and truncated lines, a
   restart keeps only the latest snapshot per id from the last 30 days and doesn't crash. Use an
   injected clock or a backdated fixture; don't wait a month.
5. The history view is fully usable from the keyboard, in light and dark.
6. Make the file unwritable: asks still work, and the view shows that history isn't being saved.
7. If brief 3's harness exists, rerun it. Nothing model-facing changed, so the numbers should hold.
8. `pnpm typecheck` passes.

Then stop, and ask Logan before committing.
