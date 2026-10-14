# The card

The ask card and the question renderers: one ask as a form, rendered by JSON Forms from the
compiled schema, driven from the keyboard. The same card runs in the window, in the inline card in
Claude Desktop, and in the dev gallery.

**Sources:** `apps/desktop/src/card/`, `apps/desktop/src/forms/`, `apps/desktop/src/platform.ts`, `apps/desktop/src/styles.css`, `apps/desktop/src/zoom.ts`, `apps/desktop/src/ZoomControl.vue`, `apps/desktop/src/App.vue`, `apps/desktop/src/main.ts`, `apps/desktop/src/gallery/`

**History:** [brief 2](../briefs/archive/02-ask-tool-and-ui.md), [brief 5](../briefs/archive/05-review-question.md) (the review renderer), [brief 7](../briefs/archive/07-inline-cards.md) (the platform adapter, `html.inline`), [brief 11](../briefs/archive/11-review-decisions.md) (labelled review decisions), [brief 12](../briefs/archive/12-capture-question.md) (copy buttons, the capture renderer), [brief 13](../briefs/13-color-chips.md) (color chips, palettes), [brief 14](../briefs/14-fenced-previews.md) (HTML and SVG previews), [brief 15](../briefs/15-themes.md) (tokens from themes)

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
  undecided"). A required error inside a question's object (a capture) counts against that
  question. Props switch it to `readonly` (history) or `embedded` (the inline card: no focus on
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
  belong to the renderer, handled on its own elements. A renderer that takes a digit for itself
  (a labelled review row) prevents it, and the card leaves prevented digits alone.
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
    instead of hiding the window. The decisions come from the items' `decision.enum`; any set
    other than approve/reject is labelled: a segmented control per row (the first decision in
    the accent, the rest neutral, no strike-through), counts per decision in the header and no
    "all" links. Digits `1`–`4` (by `event.code`, so Shift+digit sets every row) decide the
    focused row, and Space cycles; `a`/`r` are off. The row handler prevents the digit, and the
    card skips a prevented event, so its `pick` never runs as well. Long labels wrap the control
    under the item (the label keeps 12rem) and cut with an ellipsis if they still don't fit.
  - Capture: a monospace textarea (6 lines, growing to 14 with `field-sizing`, `maxlength`
    50,000) that keeps the text verbatim and sets `{ text?, images? }`, or nothing when both are
    empty, so `required` catches it at the top. A paste carrying an image file, anywhere in the
    question, is taken over (`preventDefault`): a non-PNG is redrawn as a PNG on a canvas, one
    over 10 MB or past the fifth is refused with a line under the box, and the rest go through
    `saveImage`. Each gets a row with a `data:` thumbnail (drawn small on a canvas; the CSP allows
    `img-src data:`, not `blob:`), its size and a remove button. Thumbnails are cached by path for
    the session; one restored from a draft after a restart shows its name only, since nothing
    reads the files back. An image-only capture's paste target is a text input that refuses
    typing (`beforeinput`), because WebKit may not deliver a paste to a focusable `div`.
    Read-only, it shows the text in a monospace block and the screenshots' file names.
- **Markdown** (`forms/markdown.ts`, markdown-it) renders model text with no raw HTML and no
  images. Links are linkified, and ```` ```diff ```` blocks color their lines. Every fenced block
  is wrapped in `.code-block` with a `[data-copy]` button that carries nothing: `Markdown.vue`'s
  delegated click copies the block's `<code>` text (less its trailing newline) through `copyText`,
  then says "Copied" for 1.5 s, or, when that fails, selects the code and says "Press ⌘C". The
  button has `tabindex="-1"` and no key. A color in a code span (hex or a CSS color function,
  checked by `isColor` in `forms/colors.ts`, which defers to `CSS.supports` where it exists)
  renders as `.color-chip` with a swatch, and a ```` ```palette ```` fence whose lines all parse
  (`parsePalette`: a color, then an optional name, 1 to 12 lines) renders as a row of labelled
  swatches; one that doesn't parse stays a code block. Both carry the color in `data-color`, and
  `Markdown.vue`'s `paint()`, run on mount and after every render (`v-html` replaces the DOM),
  sets it as `--swatch` through the CSSOM. The webview never navigates: a capture-phase click
  handler in `main.ts` stops every link, and links open through `openExternal`.
- **Previews** (`forms/preview.ts`): a fence whose info string is `html preview` or `svg preview`
  (then optional `width=N` and `height=N`, clamped to 200–800 by 40–800, default 400×200;
  `parsePreviewInfo`) renders as a `figure.md-preview` holding an `img` with no `src`, a caption
  (a status and a Source button, `[data-preview-source]`) and the ordinary code block with its
  copy button. A plain ```` ```html ```` or ```` ```svg ```` block stays code. `paint()` reads
  the code block's text and calls `previewSrc`, which builds an SVG image as a
  `data:image/svg+xml` URL: HTML is parsed with `DOMParser`, stripped of `script`, `iframe`,
  `frame`, `object`, `embed`, `link`, `meta`, `base`, `on*` and attributes XML can't name,
  given a base `<style>` first in `head` (the theme's tokens on `html` for `var()`, and a light
  page whatever the theme: `color-scheme: light`, `--preview-paper` and `--preview-ink` from
  `tokens.css` as the body's background and text, the 13 px font), serialized as XHTML and put
  in a `<foreignObject>`. Models write previews for a browser's default page, setting
  backgrounds and leaving text to the default, so a themed page left their text light on white
  in a dark theme (brief 14's trial). SVG is parsed as XML (namespaces added to the root when
  missing; a parse error or a root that isn't `svg` gives undefined), stripped of `script` and
  `on*`, and given the tokens, the theme's `color-scheme`, `color: var(--text)` (so
  `currentColor` icons follow the theme) and the font, a viewBox from its own size when it has
  none, and the info string's size. The theme (`forms/theme-watch.ts`, `previewTheme`) is every
  token's computed value (a host's `var()` comes back substituted), the body's font family,
  `color-scheme` from `:root`, and the page colors. The
  image is built at the size it's shown at, the column's width at most, and never scaled down by
  CSS: WebKit draws a `foreignObject` image shrunk below its own size with positioned elements
  left unscaled. So HTML is laid out at the info string's size and shrunk by `zoom` inside the
  image, and the `img` keeps its natural size. Built URLs are cached (50, keyed by kind, size,
  shown width, theme and source). A parse failure or the image's `error` adds `.failed`: the
  status reads "Couldn't draw this preview" and the source shows. Source toggles
  `.showing-source`, and a mousedown on it, or on a copy button, is prevented, so focus stays on
  the option whose preview it is (the choice pane shows the focused option's preview).
  Previews are drawn again when the theme changes, through one shared `MutationObserver` on
  `:root`'s `style` and a `prefers-color-scheme` listener (`onThemeChange`), and when the
  Markdown's width changes (a `ResizeObserver` per instance).
- **The platform adapter** (`platform.ts`): `pickPaths` (the Tauri dialog, or `window.prompt`
  outside Tauri), `openExternal` (http(s) and mailto only; the opener plugin in Tauri, the
  host's `openLink` in the inline card through `setPlatform`, `window.open` in a plain browser),
  `copyText` (`navigator.clipboard.writeText`, false on failure), and `saveImage`, which writes a
  PNG to `$APPDATA/captures/<YYYY-MM-DD>/<8 hex>.png` with the fs plugin and returns the
  absolute path (a made-up `/tmp/parley-capture-n.png` outside Tauri, so the gallery works). All
  of them can be overridden through `setPlatform`.
- **Styles** (`styles.css`): no colors of its own. Every color is a theme token (`--bg`,
  `--surface-raised`, `--text-muted`, `--accent`, `--highlight`, `--link` …) that `src/theme/`
  paints on `:root`, or a shade mixed from them in `src/theme/tokens.css` (`--hover`, `--code-bg`,
  `--highlight-subtle` …) ([themes](themes.md)). Actions and marks take `--accent`, what's picked
  or selected `--highlight`, links `--link`. The picked checkbox's tick is a mask filled with
  `--accent-text`. The window's root is `.window`, a column with the theme banner on top when
  there's a problem. `html.inline` (set by the card) is content height with no inner scroll, at
  most 640 px wide.
- **Zoom** (`zoom.ts`): page zoom from 80% to 150% in 10% steps, default 110%, kept in
  localStorage. `Cmd+=` (or `Cmd++`) and `Cmd+-`, or the control in the meta row, where a click on
  the percentage resets it. The inline card has no zoom.
- **The gallery** (dev only): `pnpm --filter @parley/desktop dev`, then
  `http://localhost:1420/?gallery`. It renders every fixture through `compileQuestions` and the
  real card without the hub; submitting shows `shapeAnswer`'s output. `&fixture=<name>` picks one,
  and `&source=<label>` replaces the meta row's `gallery · fixtures` (the screenshots use
  `claude-code · parley`). `&theme=<id>` paints a bundled theme (`parley-light`, `parley-dark`);
  without it the pair follows the system.

## Rules worth keeping

- **Renderers import `platform.ts`, never `@tauri-apps/*`,** so they run in the inline card. The
  card keeps no Tauri import either.
- **Keys:** the card claims digits, Enter, Tab and Cmd chords; the window claims Esc. A renderer
  that needs Esc for itself stops its propagation. `Cmd+.` skips because it's macOS's cancel and
  isn't an editing key (`Cmd+Backspace` is). `Cmd+N` opens the note because plain `n` is No on a
  focused Yes/No. `Cmd+0` belongs to AeroSpace, so zoom reset is a click. Check
  `~/.config/keymap/keymap.md` before adding a chord.
- **Model HTML reaches the screen only as an image the app builds.** Never as inline HTML, in a
  shadow root, or in an iframe: an SVG used as an image runs no script and loads nothing, so it's
  static by construction, and the CSP's `img-src data:` needs no change. In the inline card a
  sanitizer miss would run script in a frame that can call `parley_submit`.
- **Never scale a preview image down with CSS.** Build it at the shown size (`previewSrc`'s
  `scale`); see Previews above.
- **Never put a model-derived value in a `style` attribute.** The release CSP (`style-src 'self'`)
  drops it, while the dev header allows inline styles for Vite, so it looks right in the gallery
  and does nothing in the installed app. Set it through the CSSOM after render, as `paint()` does.
- **No color literals outside `src/theme/`.** Use a token, or add a shade to `tokens.css`; the
  scanner test fails otherwise. In the inline card, host colors are mapped onto the tokens in
  `src/mcp-app/theme.ts`; accents and status colors stay Parley's.
