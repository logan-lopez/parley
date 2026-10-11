# Asks and history

The app's record of every ask: one store, keyed by ask id, that holds pending asks (the queue) and
ended ones (history), persisted to a JSONL file and loaded before the hub starts. It also decides
when a new ask notifies.

**Sources:** `apps/desktop/src/asks/`, `apps/desktop/src/history/`, `apps/desktop/src/main.ts`

**History:** [brief 1](../briefs/archive/01-hub-and-lifecycle.md), [brief 4](../briefs/archive/04-history-and-inbox.md), [brief 7](../briefs/archive/07-inline-cards.md) (`resolved`, `answeredIn`), [brief 12](../briefs/archive/12-capture-question.md) (screenshot cleanup)

`asks/store.ts` is the store and the hub's handlers. `asks/persist.ts` is its disk.
`asks/notifications.ts` sends the system notification, and `asks/source.ts` makes the
`client · project dir` label. `history/` is the history view and its filters.

## How it works

- **A record** (`AskRecord`) holds the ask (`id`, `form`, `createdAt`, `expiresAt`, `inline`), the
  session it came from, the connection it's on (`conn`, 0 for a record loaded from disk), and its
  `status`: `pending`, `answered`, `dismissed`, `cancelled`, `timed_out` or `orphaned`. An ended
  record has `endedAt`, maybe `endedReason`, the `data` and `note` it was sent with, and
  `answeredIn: 'chat'` when the inline card won. `draft` is unsent input (`data` and `note`).
- **One store.** `queue` is the pending records, oldest first. `history` is the ended ones, newest
  first. Both are computed views over the same map; ended records stay in it. The queue length
  goes to the tray (`set_pending_count`).
- **The hub's handlers** (`hubHandlers`):
  - `ask`: a new id becomes a pending record, saved, and notifies unless it's `inline`. A known id
    is a re-send after a reconnect or a restart: the record moves to the new connection, an
    orphaned one is revived as pending, and one already answered or skipped sends its answer
    again (it went into a connection that had just died).
  - `cancel`: a pending or orphaned record ends as `cancelled` or `timed_out`. Only the connection
    that owns it may cancel it.
  - `resolved`: the inline card won. The record ends answered or skipped with `answeredIn:
    'chat'`, and that overwrites an answer or skip sent from the window that lost the race, so
    history matches what the agent got.
  - `disconnected`: every pending record on that connection becomes `orphaned`. If the server
    re-sends within its 30 s reconnect window, it's pending again.
- **Answer and skip** (`answer`, `dismiss`) end the record and send `answer` or `dismissed` with
  the note. Answering drops the draft; a skip keeps it.
- **Drafts.** `setDraft` keeps what's typed, ignoring JSON Forms' empty data on mount. A draft is
  saved after a 500 ms pause, a status change at once, and anything pending on `pagehide`.
- **The file** (`persist.ts`) is `$APPDATA/history.jsonl`: every save appends a full snapshot line
  (`{ v: 1, ...record }` without `conn`), and the last line per id wins. At startup `load` folds the
  file to one line per id, skips unreadable lines, turns records still pending into `orphaned`
  (their servers went with the last run), drops records that ended over 30 days ago, and rewrites
  the file through `history.jsonl.tmp` and a rename. Writes are serialized, and appends made during
  a write are batched into the next. A failed write is logged and sets `saveFailing`, which the
  history view shows as "not being saved"; it never breaks the ask flow.
- **Screenshots** pasted into captures are in `$APPDATA/captures/<YYYY-MM-DD>/`
  ([the card](card-ui.md) saves them). `persist.ts` keeps the folder: after `load`'s rewrite it
  removes day folders whose day ended over 30 days ago (`staleCaptureDays`), and
  `clearHistory` calls `clearCaptures`, which deletes every screenshot except those named in a
  pending record's draft (an `images` array anywhere in its data). Neither waits or fails the
  caller; errors are logged.
- **Startup order** (`main.ts`): mount the app, load history and ask for notification permission,
  `hydrate` the store, then start the hub. Servers re-send their pending asks on connect, and
  those must find their records and drafts already there.
- **Notifications** (`notifications.ts`): a new, non-inline ask sends one, titled with the source
  label, with the form's title (or "New question") as the body, unless the window is visible and
  focused. A sessionStorage list of notified ids, which survives a webview reload, stops a re-sent
  ask notifying twice. They never show or focus the window.
- **The history view** (`history/`): ended records grouped by day, newest first. Filters (kept in
  `filter.ts`, so they survive a trip back to the queue): text over titles, headers, questions,
  answers or drafts, notes and the source; status (answered, skipped, withdrawn); has a note. The
  detail is the card read-only, as answered or as far as it got, with what was sent. Clear history
  drops every ended record, on disk too. Keys: `j`/`k` or the arrows, `/` to filter, Enter to open,
  Esc goes back (detail → list → queue) and never hides.

## Rules worth keeping

- **History is a filter over the store, not a second store.** An ask is a record with an id and a
  final status, and the app never assumes the server is blocking. An `ask_async` later would be one
  more consumer of the same lifecycle.
- **Load before `hub_ready`.** Otherwise a re-sent ask creates a fresh record and loses its draft.
- **The fs capability covers exactly `history.jsonl`, `history.jsonl.tmp` and `captures/`.**
  `hub.sock` is in the same directory.
- **`resolved` is the server's word.** When the window and the card both answer, the server's
  first-in answer is what the agent got, and the record must say the same.
