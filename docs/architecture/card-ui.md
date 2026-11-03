---
sources: ["apps/desktop/src/card/", "apps/desktop/src/forms/", "apps/desktop/src/platform.ts", "apps/desktop/src/styles.css", "apps/desktop/src/zoom.ts", "apps/desktop/src/ZoomControl.vue", "apps/desktop/src/App.vue", "apps/desktop/src/main.ts", "apps/desktop/src/gallery/"]
---
# The card

The ask card and the question renderers: one ask as a form, rendered by JSON Forms from the
compiled schema, driven from the keyboard. The same card runs in the window, in the inline card in
Claude Desktop, and in the dev gallery.

**History:** [brief 2](../briefs/archive/02-ask-tool-and-ui.md), [brief 5](../briefs/archive/05-review-question.md) (the review renderer), [brief 7](../briefs/archive/07-inline-cards.md) (the platform adapter, `html.inline`), [brief 11](../briefs/archive/11-review-decisions.md) (labelled review decisions), [brief 12](../briefs/archive/12-capture-question.md) (copy buttons, the capture renderer), [brief 13](../briefs/13-color-chips.md) (color chips, palettes), [brief 14](../briefs/14-fenced-previews.md) (HTML and SVG previews), [brief 15](../briefs/15-themes.md) (tokens from themes), [brief 16](../briefs/16-show-blocks.md) (the show renderer, `[data-passive]`), [brief 17](../briefs/17-editable-show.md) (Edit and View), [brief 21](../briefs/21-dont-ask-again.md) ("Don't ask again here"), [brief 24](../briefs/24-audition-keys.md) (audition keys), [brief 25](../briefs/25-compare-images.md) (before/after compare frames)

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
- **The header chip** (`QuestionFrame.vue`, `.chip`): clips with an ellipsis at `14ch` and carries
  the full header in `title`, so it shows on hover. The server accepts headers up to 24
  characters ([the form spec](form-spec.md)); the same renderer draws the inline card.
- **"Don't ask again here"** (`forms/remember.ts`, `QuestionFrame.vue`): the card keeps the set
  of toggled question ids, seeds it from `initialRemember` (the draft, or history), emits
  `remember` on each change and passes it to `submit(data, note, remember)`; a skip ignores it.
  It `provide`s the set unless `embedded`, so the inline card has none. `QuestionFrame` injects it
  and, for a renderer that passes `rememberable` (single choice, not multi, and boolean) and the
  question's `id` (`useQuestion`'s `frame.id`, the property key), draws a quiet pill at the right of
  the header row: a button with `aria-pressed` and, when on, the accent and a hint under the
  question ("The agent will draft a line for AGENTS.md for you to approve."). Locked (history,
  withdrawn), a toggle that was on shows as a plain "Don't ask again" mark and one that wasn't
  isn't drawn. The button is `tabindex="-1"`: the card owns Tab (it moves between questions), so
  like the copy buttons it's mouse only. There's no chord.
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
  `[data-advance-on-pick]` moves to the next question after a number-key pick. `[data-passive]`
  marks a question with nothing to answer (a show): Tab still stops on it, but the card's first
  focus on mount, and its fallback when the window regains focus with nowhere to return to, go to
  the first question without it (`firstToAnswer`), and so does the target of a digit when no
  question has focus. Other plain keys belong to the renderer, handled on its own elements. A renderer that takes a digit for itself
  (a labelled review row) prevents it, and the card leaves prevented digits alone.
- **Renderers** (`forms/renderers/`) are JSON Forms controls, one per `x-widget`, each ranked 10
  by `widgetTester` so it beats the vanilla set, which stays as the fallback
  (`forms/renderers.ts`). `useQuestion` gives each one its schema, data and frame.
  - Choice: option cards as radios or checkboxes (`p`, Shift+`p` and Esc on a focused option, as
    in the review; not in the Other input, where `p` types and only Esc applies); with an Other branch, the last row is a text
    input, and typing in it selects it. ↑/↓ move among options and Space picks. The `x-preview` of the
    option last focused or picked shows below the list (the last picked one's before that). It
    isn't cleared on blur, so a click in the preview, on a missed copy button say, doesn't swap it
    out from under the pointer. The review renderer keeps its last focused row's preview the same
    way.
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
    On the row (never in a comment box), `p`, Shift+`p` and Esc drive its sound chips
    (the Audition keys bullet below); the hint lists them when the form has an audio ref.
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
  - Show: the frame with `passive` (no "Optional"), then `x-content` through `Markdown.vue` in
    `.show-pane`: a hairline `--border`, the card's radius, at most 55vh (480 px under
    `html.inline`, where the card has no inner scroll), scrolling inside. The pane is the
    `[data-primary]` with `tabindex="0"`, so Tab reaches it and the arrow keys, Page Up/Down and
    Space scroll it natively; Enter on it sends, as on any non-button. It has no `[data-pick]`, so
    digits do nothing. With `x-source`, a muted caption under the pane: `docs/plan.md`, or
    `src/index.ts · lines 10–80 of 212`. With `x-source` and no `x-content` (compiled without the
    file: the gallery, `show-file`), the pane reads "`<path>` isn't loaded here." Read-only it's
    the same view, and it's never required, so it never appears in "Still needs an answer".
    An editable show (`x-editable` with `x-original`) isn't passive: it opens on **Edit**, a
    monospace `textarea.show-edit` (no wrapping, 12 lines growing to 30 with `field-sizing`,
    then scrolling, `maxlength` 200,000) that's the `[data-primary]`, so first focus lands in it, with the caret put
    at the top on that first focus (setting the value leaves it at the end). On mount it writes
    `{ text: x-original, base: x-source.sha256 }`, not over data already there. Edit and View
    are a small `.segmented` toggle above it (mouse only, `tabindex="-1"`); View renders the
    current text through `fileMarkdown`, in the ordinary pane. "Reset to original" shows under
    the box once the text differs, line endings normalised, since a textarea gives back `\n`
    for a CRLF file. Enter is a new line (the card leaves Enter in a textarea alone) and
    Cmd+Enter sends. Read-only it's View with the text sent, and "· edited" after the caption
    when it differs. The card never diffs or writes; the server does
    ([the ask tool](ask-tool.md#editable-shows)).
- **Markdown** (`forms/markdown.ts`, markdown-it) renders model text without raw HTML. Links are
  linkified, and ```` ```diff ```` blocks color their lines. Every fenced block
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
- **Project images** (`forms/media.ts`, `Markdown.vue`): markdown images become a `figure.md-media`
  with a destination in `data-media`, a caption, path and an image with no `src`. Schemes and
  protocol-relative URLs stay text, so no model URL is fetched. `AskCard` provides one media
  context per mount: all markdown surfaces share one `mediaUrls` promise, including previews
  mounted later. A form change or a later mount rechecks the files, so history doesn't reuse a
  stale grant. `paintMedia` fills only a resolved URL from `x-media`, ignores stale async results,
  and handles loading, drawn, changed, missing, refused and unresolved states; decode failures
  keep the caption and path too. Bitmaps keep natural size, at most the column's width. Clicking
  a drawn image opens the granted file through the platform adapter. An inline image above the
  caps says “Open in the Parley window”.
  A ```` ```compare ```` fence that parses (`parseCompare`, two image lines with optional labels,
  checked against `env.media`) renders as `figure.md-compare[data-compare][tabindex="0"]` with
  both items (`img` with no `src` and a badge, both `hidden`), the corner label (`hidden` until
  drawn), `<span class="md-compare-path">` (`a · b`), and `<span class="md-compare-status" role="status">`.
  `paintCompare` resolves both through the shared `mediaUrls` grant: when both load with the same
  `naturalWidth` and `naturalHeight`, it adds `.flippable`, shows the first image and the corner
  label, and `flipCompare` toggles between them in place on click or `x` while the figure has
  focus (`mousedown` is prevented when `.md-compare` is inside `.preview`, so option focus stays
  put). When their natural sizes differ, it adds `.stacked`, shows both images with their badges,
  and sets the status to `<w1>×<h1> and <w2>×<h2>`. When one or both fail, it shows whichever
  loaded and sets the status to a failure line naming both paths. A `compare` fence that doesn't
  parse falls back to an ordinary code block.
- **Sound chips** (`forms/markdown.ts`, `Markdown.vue`, `forms/player.ts`): the image rule draws
  an audio ref (by its `x-media` kind, or by `looksLikeSound` when unresolved) as
  `button.md-sound[data-media][data-sound]` with ▶, the caption (the file name without one), and
  no URL from the text. `renderMarkdown(source, inline, env)` takes the form's media and a
  `scope`; renderers pass the question id and surface (`<id>/question`, `/option-<i>`,
  `/item-<i>`, `/preview-<i>`, `/show`), and the chip's id is the scope plus its position in
  that markdown (`audition/preview-1#2`), so it survives a preview being swapped out and back.
  `paintChip` enables a chip only when every variant's grant is `ok`; otherwise it stays
  `aria-disabled` and says why, naming the first file that failed (“Plays in the Parley window”
  in the inline card). Its `title` lists the variants' paths. The meta reads “3 variants · 0.4 s”
  (the first variant's length, from `soundDuration`'s cached `loadedmetadata`), and “2/3” with ■
  while playing. A click plays, a click on the playing chip stops; the click doesn't reach an
  option underneath, and mousedown is prevented so focus stays on the row or option. The chip is
  `tabindex="-1"`: the keys are on the row, below.
  The player (**pinned**; `forms/audition.ts` drives it) is one `HTMLAudioElement` for the window:
  `play(id, urls, gapMs = SOUND_GAP_MS)` stops whatever was playing and plays the urls in order
  with the gap; a variant that errors is skipped. `stop()`, reactive `state` (`id`, `variant`,
  `count`, `playing`), and `onEnd(id)` after the last variant ends on its own (not after a stop).
  `paintSounds` repaints every chip from `state`. `AskCard` stops the player on unmount, so an
  answered or withdrawn ask goes quiet.
- **Audition keys** (`forms/audition.ts`): the review and choice renderers each call
  `useAudition(rootsOf, canAutoplay)`, where `rootsOf(i)` is the DOM holding row i's chips: the
  row or option itself (its description) and, while it's the previewed one, the preview pane. A
  chip is playable when `chipUrls` has it (`Markdown.vue` sets the WeakMap once every variant has
  its grant and clears it otherwise), so a disabled chip is never in the cycle. `p` plays the chip
  after the last one played in that row (`createCycle`: one remembered chip id per row, for the
  life of the renderer, so a row that comes back continues after the take heard last; the first
  when nothing was played or the remembered chip is gone); Shift+`p` plays the remembered one
  again, or the first. A chip played with the mouse moves the memory on too, through a watch on
  `player.state.id`. A row with no playable chip ignores both keys. `escStops` stops the player
  and the event when something is playing, so `App.vue`'s window-level Esc never sees it; with
  nothing playing, Esc is untouched. The review handles all three on the row (`@keydown.self`),
  so a comment box is untouched; the choice handles `p` on the option and Esc on the whole
  options list, which includes the Other input. The chip `p` plays next, when the row has two or
  more, is `audition.next`, a reactive chip id that `paintSounds` turns into `.next` (an accent
  outline and a `p` from `::after`), cleared when focus leaves the question.
  **Autoplay** (`audition.autoplay`, from settings.json) plays a row's first chip when focus
  *moved* onto it: `enter(row, moved)` is called with `relatedTarget instanceof Element`, which
  is false when the card put focus there itself (mount on a new ask, the window regaining focus,
  where `focusout` had already left the question) and true for keys, clicks and Tab. It waits
  for the render and for `settled()` (every `Markdown.vue` media paint in flight, registered
  through `track`), because a preview that has just been swapped in has no URLs yet. It stays off
  when the card isn't `enabled` (history), and for a row focus has already left.
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
  the option whose preview it is (the choice pane shows the last focused option's preview).
  Previews are drawn again when the theme changes, through one shared `MutationObserver` on
  `:root`'s `style` and a `prefers-color-scheme` listener (`onThemeChange`), and when the
  Markdown's width changes (a `ResizeObserver` per instance).
- **The platform adapter** (`platform.ts`): `pickPaths` (the Tauri dialog, or `window.prompt`
  outside Tauri), `openExternal` (http(s) and mailto only; the opener plugin in Tauri, the
  host's `openLink` in the inline card through `setPlatform`, `window.open` in a plain browser),
  `copyText` (`navigator.clipboard.writeText`, false on failure), and `saveImage`, which writes a
  PNG to `$APPDATA/captures/<YYYY-MM-DD>/<8 hex>.png` with the fs plugin and returns the
  absolute path (a made-up `/tmp/parley-capture-n.png` outside Tauri, so the gallery works). All
  of them can be overridden through `setPlatform`. `mediaUrls(entries)` batches `allow_media`
  and maps hashes to status/URL pairs using `convertFileSrc` (with per-path statuses when equal
  hashes belong to different files); inline and gallery hosts override
  it. `openMedia(file)` calls `open_media` only in Tauri.
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
  real card without the hub; submitting shows `shapeAnswer`'s output. Files under
  `packages/protocol/fixtures/files/` load for a show that names one, with a stand-in hash, so
  `show-edit` is editable there; nothing is written. `&fixture=<name>` picks one,
  and `&source=<label>` replaces the meta row's `gallery · fixtures` (the screenshots use
  `claude-code · parley`). `&theme=<id>` paints a bundled theme (`parley-light`, `parley-dark`);
  without it the pair follows the system.

## Rules worth keeping

- **Renderers import `platform.ts`, never `@tauri-apps/*`,** so they run in the inline card. The
  card keeps no Tauri import either.
- **Keys:** the card claims digits, Enter, Tab and Cmd chords; the window claims Esc. A renderer
  that needs Esc for itself stops its propagation (the audition keys do, but only while a sound
  plays). `p` is a renderer's, on a focused row or option: never bind it on the card. `Cmd+.` skips because it's macOS's cancel and
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
