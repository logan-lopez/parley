# The card

The ask card and the question renderers: one ask as a form, rendered by JSON Forms from the
compiled schema, driven from the keyboard. The same card runs in the window, in the inline card in
Claude Desktop, and in the dev gallery.

**Sources:** `apps/desktop/src/card/`, `apps/desktop/src/forms/`, `apps/desktop/src/platform.ts`, `apps/desktop/src/styles.css`, `apps/desktop/src/zoom.ts`, `apps/desktop/src/ZoomControl.vue`, `apps/desktop/src/App.vue`, `apps/desktop/src/main.ts`, `apps/desktop/src/gallery/`

**History:** [brief 2](../briefs/archive/02-ask-tool-and-ui.md), [brief 5](../briefs/archive/05-review-question.md) (the review renderer), [brief 7](../briefs/archive/07-inline-cards.md) (the platform adapter, `html.inline`)

`card/AskCard.vue` is the card. It knows nothing about the hub or Tauri. `App.vue` is the window
around it: the queue, Send and Skip, history. `forms/` holds the renderers, their registration, the
keyboard contract and markdown. `platform.ts` is the one way renderers reach the host.

## How it works

- **The window** (`App.vue`) shows the queue of pending asks one card at a time, oldest first,
  with "n of m" in the meta row. After Send or Skip it moves to the next ask, and hides the window
  when none are left. An ask that ends under the user (withdrawn, timed out, its agent gone, or
  answered in the chat) stays up read-only with a banner until they press Enter to continue; if
  the window is hidden at the time, it moves on without the banner. Esc hides the window; it
  doesn't dismiss the ask. `Cmd+Y` switches to history and back.
- **The card** (`AskCard.vue`): a meta row (source as `client · project dir`, age, a countdown to
  `expiresAt`, orange under a minute, the meta slot with zoom and history), the title, JSON
  Forms with `ValidateAndHide`, the note for the agent, and the actions. Send is blocked while the
  form has errors, and the footer lists what's missing by header ("Still needs an answer", "n items
  undecided"). Props switch it to `readonly` (history) or `embedded` (the inline card: no focus on
  mount, no Esc hint), and `withdrawn` makes it read-only with a banner.
- **The note for the agent:** a collapsed textarea (2,000 characters) opened with `Cmd+N`, sent
  with an answer or a skip, and kept in the draft.
- **Keys the card owns:** `1`–`9` pick in the active question, Tab and Shift+Tab move between
  questions, Enter picks a focused unpicked option or else sends (not in a textarea or on another
  button), `Cmd+Enter` sends, `Cmd+.` skips, `Cmd+N` opens the note, `Cmd+[` and `Cmd+]` move
  through the queue. When the window regains focus, focus goes back where it was, without
  scrolling.
- **The keyboard contract** (`forms/keyboard.ts`) is how renderers and the card talk, through the
  DOM only: `[data-question]` marks each question's root in order, `[data-pick="n"]` is what key
  n picks (clicked, or focused if it's a text input), `[data-primary]` is where focus lands, and
  `[data-advance-on-pick]` moves to the next question after a number-key pick. Other plain keys
  belong to the renderer, handled on its own elements.
- **Renderers** (`forms/renderers/`) are JSON Forms controls, one per `x-widget`, each ranked 10
  by `widgetTester` so it beats the vanilla set, which stays as the fallback
  (`forms/renderers.ts`). `useQuestion` gives each one its schema, data and frame.
  - Choice: option cards as radios or checkboxes; with an Other branch, the last row is a text
    input, and typing in it selects it. ↑/↓ move among options and Space picks. A focused option's
    `x-preview` shows below the list.
  - Text, number: inputs with the schema's limits. A text question with `x-draft` writes the
    draft into the data on mount (not over data already there: a restored draft or history), sizes
    its textarea to the text, 4 to 12 lines (`field-sizing: content`, with a `rows` estimate as
    the fallback), puts the caret at the end on first focus rather than selecting all, and shows
    "Reset to draft" once the text differs.
  - Boolean: Yes and No, with `y` and `n`, and the arrow keys between them.
  - Path: a button that opens the native picker through `pickPaths`; paths only, never contents.
  - Review: one row per item. `j`/`k` or the arrows move, `a`/`r` approve or reject, Space toggles,
    `c` opens a comment, Shift+`a`/`r` decide all. It writes the default decision into every entry
    when it mounts (an empty entry per item under `none`). In a comment, Esc goes back to the row
    instead of hiding the window.
- **Markdown** (`forms/markdown.ts`, markdown-it) renders model text with no raw HTML and no
  images. Links are linkified, and ```` ```diff ```` blocks color their lines. The webview never
  navigates: a capture-phase click handler in `main.ts` stops every link, and links open through
  `openExternal`.
- **The platform adapter** (`platform.ts`): `pickPaths` (the Tauri dialog, or `window.prompt`
  outside Tauri) and `openExternal` (http(s) and mailto only; the opener plugin in Tauri, the
  host's `openLink` in the inline card through `setPlatform`, `window.open` in a plain browser).
- **Styles** (`styles.css`): one set of tokens. Light on `:root`; dark under the system media
  query (`:root:not([data-theme='light'])`) and again under `:root[data-theme='dark']`, which the
  inline card sets from the host. The window sets neither, so it follows the system.
  `html.inline` (set by the card) is content height with no inner scroll, at most 640 px wide.
- **Zoom** (`zoom.ts`): page zoom from 80% to 150% in 10% steps, default 110%, kept in
  localStorage. `Cmd+=` (or `Cmd++`) and `Cmd+-`, or the control in the meta row, where a click on
  the percentage resets it. The inline card has no zoom.
- **The gallery** (dev only): `pnpm --filter @parley/desktop dev`, then
  `http://localhost:1420/?gallery`. It renders every fixture through `compileQuestions` and the
  real card without the hub; submitting shows `shapeAnswer`'s output. `&fixture=<name>` picks one.

## Rules worth keeping

- **Renderers import `platform.ts`, never `@tauri-apps/*`,** so they run in the inline card. The
  card keeps no Tauri import either.
- **Keys:** the card claims digits, Enter, Tab and Cmd chords; the window claims Esc. A renderer
  that needs Esc for itself stops its propagation. `Cmd+.` skips because it's macOS's cancel and
  isn't an editing key (`Cmd+Backspace` is). `Cmd+N` opens the note because plain `n` is No on a
  focused Yes/No. `Cmd+0` belongs to AeroSpace, so zoom reset is a click. Check
  `~/.config/keymap/keymap.md` before adding a chord.
- **Keep the two dark blocks in `styles.css` in step.** Host colors are mapped onto the tokens in
  `src/mcp-app/theme.ts`; accents and status colors stay Parley's.
