# Brief 14: HTML and SVG previews, drawn as pictures

Read `CLAUDE.md`, [`README.md`](README.md), [brief 13](13-color-chips.md), [the card](../architecture/card-ui.md),
[the form spec](../architecture/form-spec.md), [inline cards](../architecture/inline-cards.md),
[the desktop shell](../architecture/desktop-shell.md) and [testing](../architecture/testing.md)
first. Brief 13 must be merged first: this brief extends its post-render pass in `Markdown.vue` and
its paragraph in the tool description, and it runs the trial pass for both.

## Goal

Let an agent show Logan what it means, not only describe it: two layouts for a settings screen, a
card design, a report header, a palette laid out in context. A fenced block marked `preview`
renders as a picture of its content in place of the code:

````md
```html preview height=240
<style>.row{display:flex;gap:8px}.box{flex:1;height:60px;border-radius:6px;background:#38bdf8}</style>
<div class="row"><div class="box"></div><div class="box"></div></div>
```
````

An ```` ```svg preview ```` block does the same for SVG. Like brief 13, this is markdown rendering: there's
no new field, no question type and no wire change. It works anywhere block markdown renders,
including an option's `preview` (where ↑/↓ flips between layouts in one spot), a review item's
`preview` and the question text, in the window, the inline card, the gallery and history.

The picture is built in the app as an SVG image from a `data:` URL. HTML goes inside a
`<foreignObject>`. A browser draws an SVG used as an image in a locked-down mode: no scripts, no
network loads, no interaction. So the preview is static by construction. The CSP already allows
`img-src data:` in the window and in the MCP Apps card, so neither one changes.

Then the full trial pass for briefs 13 and 14.

Why now: color chips (brief 13) cover single values. Layout and visual-design questions still
arrive as prose or as HTML source Logan has to render in his head. (From `ideate`, 2026-10-11.)

## Decisions already made

- **Opt-in marker.** Only fences whose info string is `html preview …` or `svg preview …` render.
  A plain ```` ```html ```` or ```` ```svg ```` block stays code with its copy button, because
  agents use those to show source. (Logan, 2026-10-11.)
- **An image, not an iframe or inline HTML.** It's static by construction, the CSP doesn't change,
  and the window and the card run the same code. A sandboxed iframe is the fallback, and only if
  step 0 fails ([Fallback](#fallback-a-sandboxed-iframe)). Sanitized HTML in the main DOM or a
  shadow root is rejected. The card's host CSP allows inline script, so a sanitizer miss there
  would run script in a frame that can call `parley_submit` and answer for the user. (Ideate,
  2026-10-11.)
- **The size comes from the agent.** An image can't size itself to its content, so the info string
  carries `width=` and `height=`. The content is laid out at that size and scaled down to fit the
  card. Content past the height is cut off.
- **One trial pass, here, for briefs 13 and 14.** (Logan, 2026-10-11.)
- **The decision row "rejected: raw HTML components in a sandboxed view"** (form spec page) was
  about the form's input language, meaning interactive components. A static picture doesn't reopen
  it. Say so on the form spec page.

Don't revisit these silently.

## Already checked

- **CSP, window:** `img-src 'self' data:` in both the release CSP (`tauri.conf.json`) and the dev
  header (`vite.config.ts`). `style-src` is `'self'` in release and adds `'unsafe-inline'` in dev
  (2026-10-11).
- **CSP, inline card:** the MCP Apps default is `img-src 'self' data:`, and `frame-src 'none'`
  unless the resource declares `frameDomains` (ext-apps spec 2026-01-26, Context7
  `/modelcontextprotocol/ext-apps`, 2026-10-11). The image route needs neither change. The iframe
  fallback would hit `frame-src`. Whether Claude Desktop enforces exactly the default is
  unverified.
- **markdown-it:** a fence token's `info` is the whole info string (`html preview height=240`).
  `md.disable('image')` turns off the `![]()` syntax only. HTML that the fence rule emits itself is
  unaffected (2026-10-11, `apps/desktop/src/forms/markdown.ts`).
- **Tokens:** `styles.css` defines `--bg`, `--surface`, `--surface-2`, `--text`, `--muted`,
  `--border`, `--accent` and `--accent-text`, with the font on `:root`. In the card, `theme.ts`
  sets some of them on `document.documentElement.style` as `var(--color-…)` from the host, and sets
  `data-theme`. `getComputedStyle(...).getPropertyValue('--bg')` returns the value with `var()`
  substituted, so the resolved colors can be baked into the image. The host's value may itself be
  `light-dark(...)`, which needs `color-scheme` set inside the image (2026-10-11).
- **Not checked, and step 0 settles each:** how well WKWebView draws HTML inside `foreignObject` in
  an `<img>` (flex, grid, borders, `system-ui`, form controls), and whether the page's CSP leaks
  into the image's own `<style>`. Per spec it shouldn't: an image document isn't a browsing
  context.

## Open questions

- **Default size.** Default: 400 wide, 200 high. `width` from 200 to 800 and `height` from 40 to
  800, clamped quietly.
- **A cap on `preview`.** It has no length limit today (`packages/protocol/src/ask.ts:28`), and
  previews are stored in `history.jsonl`. Default: cap `preview` (option and item) at 10,000
  characters, with a message for the model ("previews are 10,000 characters or fewer"). Leave
  `question` uncapped.
- **The base font size inside the preview.** Default: the card's, 13 px.

## Build order

0. **Spike foreignObject in the real webview.** Add a scratch fixture with a hand-built
   `<img src="data:image/svg+xml,…">` in a preview. Put a flex row, a CSS grid, a bordered card
   with a button and a text input, `system-ui` text and an `oklch()` color inside a
   `<foreignObject>`. Look at it:
   - in the gallery in headless Playwright WebKit;
   - in the dev app (`pnpm app`);
   - in the installed build, which is the release CSP (`pnpm install:desktop`, then Logan quits
     and reopens Parley).

   **Go:** the layout draws, the image's own `<style>` applies in the installed build, and the text
   is legible. **No-go:** stop, report what failed, and don't build the fallback without Logan.
   It's a CSP decision. This step opens and replaces his running app: ask him once before starting,
   and say it takes about ten minutes.
1. The preview builder (`preview.ts`) and its tests.
2. The fence rule, the figure, painting, and theme changes.
3. The fixture, the docs and the tool description.
4. The trial prompt, then the full trial pass.

## Shape

### 1. The fence (**pinned**: the syntax is model-facing)

Info string: `html preview` or `svg preview`, followed by optional `width=N` and `height=N` in any
order. Anything else after `preview` is ignored. In `markdown.ts`'s `fence` override, a block with
the marker emits:

```html
<figure class="md-preview" data-preview="html" data-width="400" data-height="240">
  <img class="md-preview-img" alt="Preview (HTML)">
  <figcaption>
    <span class="md-preview-status">Preview</span>
    <button type="button" class="md-preview-toggle" data-preview-source tabindex="-1">Source</button>
  </figcaption>
  <div class="md-preview-source">…the ordinary code block, with its copy button…</div>
</figure>
```

The `img` has no `src` in the markup. `paint()` sets it (§3). The source block stays in the DOM:
it's what `paint()` reads, what the Source button shows, and what a client without Parley would
see.

### 2. The builder (`apps/desktop/src/forms/preview.ts`, **new**)

```ts
export interface PreviewTheme { vars: Record<string, string>; font: string; scheme: 'light' | 'dark' }
export function previewSrc(kind: 'html' | 'svg', source: string, size: { width: number; height: number }, theme: PreviewTheme): string | undefined
```

It returns a `data:image/svg+xml;charset=utf-8,` URL (with `encodeURIComponent`), or `undefined`
when the source can't be drawn.

- **HTML.** `new DOMParser().parseFromString(source, 'text/html')`. Remove `script`, `iframe`,
  `frame`, `object`, `embed`, `link`, `meta` and `base`, and every `on*` attribute. None of these
  could run or load inside an image anyway; removing them keeps the markup honest and small. Keep
  form controls, since mockups need them. Prepend a base `<style>` to `head`:

  ```css
  html { color-scheme: <scheme>; --bg: …; --surface: …; --text: …; … }
  html, body { margin: 0; }
  body { background: var(--bg); color: var(--text); font: 13px/1.45 <font>; }
  ```

  The agent's own `<style>` and `body` rules come after the base and win. Serialize
  `documentElement` with `XMLSerializer` (so it's well-formed XHTML with the XHTML namespace). Put
  it in `<svg xmlns width=W height=H viewBox="0 0 W H"><foreignObject x="0" y="0" width="100%"
  height="100%">…</foreignObject></svg>`.
- **SVG.** Parse with `DOMParser` as `image/svg+xml`. A `parsererror`, or a root that isn't `svg`,
  returns `undefined`. Remove `script` and `on*` attributes. Set the `xmlns` if it's missing. If
  the root has no `width`/`height`, set them from the info string. If it has no `viewBox`, add one
  from the same numbers. Insert the same base `<style>` (tokens on the root, font, `color-scheme`)
  as its first child.
- **Cache.** A `Map` keyed by kind, size, source and a theme key, with a small cap (about 50).
  `paint()` runs on every render.

### 3. Painting and themes (`Markdown.vue`)

- Extend brief 13's `paint()`. For each `.md-preview` without a current `src`, read the source from
  its `.md-preview-source code` text. Build the theme from `getComputedStyle(document.documentElement)`
  (the tokens above, the font family, and the scheme: `data-theme` on the root when it's set,
  otherwise the `prefers-color-scheme` media query). Set `img.src`, and `img.width`/`img.height` to the clamped size. CSS
  shows it at `max-width: 100%; height: auto`.
- **Failure.** If `previewSrc` returns `undefined`, or `img` fires `error`, the figure gets
  `.failed`, the status reads "Couldn't draw this preview", and the source shows.
- **Theme changes.** Repaint every preview when the theme changes: a `matchMedia('(prefers-color-scheme: dark)')`
  listener, plus a `MutationObserver` on `document.documentElement` for `data-theme` and `style`
  (the card sets host variables there). Use one shared observer for all `Markdown` instances, in
  a small module such as `forms/theme-watch.ts`, not one per instance.
- **Source.** The delegated click handler toggles `.showing-source` on the figure for
  `[data-preview-source]`, and the button reads "Source" or "Preview". Mouse only, like copy. It
  gets no key.

### 4. Styles (`styles.css`)

`.md-preview`: a hairline `--border` frame with the card's radius and no padding around the image.
The caption is a small muted row under the image, with the toggle at the right. The source is
hidden unless the figure has `.showing-source` or `.failed`. Previews in a choice option's preview
pane must fit the 440 px window without horizontal scroll.

### 5. Tool input (`packages/protocol/src/ask.ts`)

The `preview` cap from Open questions, on option and item `preview`, with a test.

### 6. Tool description (`apps/server/src/tools/ask.ts`)

Extend brief 13's markdown paragraph, along these lines:

> A ```` ```html preview ```` or ```` ```svg preview ```` block (static HTML and CSS, or SVG: no
> scripts, no external images or fonts) is drawn as a picture instead of shown as code, 400×200 by
> default; set the size on its first line, such as ```` ```html preview width=400 height=240 ````.
> Use it in an option's `preview` for layouts, UI options and visual designs.

Leave the server instructions alone.

### 7. Fixture

Add `packages/protocol/fixtures/previews-visual.json`, with two questions:

1. A choice, "Which layout for the settings screen?", with three options. Each option's `preview` is
   an `html preview` (a sidebar layout, a tabbed one, a single column), and one uses CSS grid. Each
   option's `description` has brief 13's chips.
2. A review of two items whose previews are `svg preview` icons, and a third item whose `svg
   preview` is malformed on purpose, to show the failure state.

### 8. Tests

- `apps/desktop/src/forms/preview.test.ts`, in a DOM environment
  (`// @vitest-environment jsdom`, with `jsdom` as a desktop devDependency; its `XMLSerializer` is
  spec-faithful). Cover:
  - HTML that wraps to valid XML, which re-parses as `image/svg+xml` without `parsererror`;
  - `script`, `on*` and `link` stripped;
  - the base style comes before the agent's;
  - size clamping;
  - SVG without `xmlns`, size or `viewBox`;
  - malformed SVG returns `undefined`;
  - a cache hit.
- In `markdown.test.ts` (brief 13): the info-string parsing, `html` without `preview` staying
  code, and the figure markup.
- Add the new test file to the testing page and the `AGENTS.md` Areas row and rule, as brief 13
  did.

### 9. Trial prompt and the full pass

Add `apps/server/trials/prompts/report-look.md`:

```markdown
---
expect: ask
reply: first
---
Add an `--html` flag to tally that writes the totals as a styled HTML page. I haven't settled on a
look yet, so check that with me before you build it.
```

Add its row to the prompts table in `apps/server/trials/README.md`: "a visual choice: should
preview layouts or colors (`html preview`, chips, a palette)". Judge it by eye from `questions`:
for each run, record which of chips, palette, `html preview` and `svg preview` appear.

Then run the full pass: `pnpm --filter @parley/server trial --runs 3`. That's every prompt,
including `report-look`. Report it next to the current baseline in `trials/README.md`. Replace the
baseline section with the new one, dated, with a line on what changed (the description grew by
one paragraph). Call out whether uptake on the old prompts stayed within noise, and whether any
run put an `html preview` where a code sample was meant.

### Docs

- **Guide.** In `docs/guide/answering.md`, extend brief 13's Colors section into "Colors and
  pictures": what a preview looks like, the Source button, the failure line, that previews are
  pictures (no clicking inside them, text isn't selectable), and that they follow the theme. In
  `question-types.md`, the choice Previews bullet mentions layout pictures. Update the root
  README's feature line.
- **Architecture.**
  - `card-ui.md`: the preview figure, `preview.ts`, theme repaint, and a rule worth keeping:
    previews are images, never inline HTML.
  - `form-spec.md`: the Markdown bullet ("without raw HTML and without images" becomes: model
    HTML only ever reaches the screen as an image the app builds), the `preview` cap, and the
    note on the rejected sandboxed-view option.
  - `inline-cards.md`: previews work inline, and say whether it was checked in Desktop.
- **Decisions table.** Update the `'unsafe-eval'` row's "Why": markdown still renders without raw
  HTML, and model HTML becomes an SVG image, which can't run script.

## Fallback: a sandboxed iframe

Use this only if step 0 says no-go, and only with Logan's go-ahead. The figure would hold an
`<iframe sandbox="allow-same-origin" srcdoc="…">`: no `allow-scripts`, sanitized with DOMPurify.
`allow-same-origin` without scripts lets the parent measure `scrollHeight` (automatic height) and
write the theme in. The cost:

- **The window's CSP.** A `srcdoc` document inherits the parent's CSP, so the agent's `<style>`
  needs `'unsafe-inline'` in the release `style-src`. That's a decisions-table change.
- **The inline card.** Desktop's frame is probably `frame-src 'none'`. If so, the card shows the
  source and "Open this ask in the Parley window to see the preview", the way window-only forms
  work.

That's about a day and a half instead of a day. Record the outcome in the report either way.

## Out of scope

- Previews you can interact with: scripts, hover states, links that work inside the picture.
- Previews that size themselves to their content.
- Previews attached to the form as a whole (a form-level `context` field), and a tile layout that
  shows every option's preview at once. Both came up in the 2026-10-11 ideate and wait for a real
  ask that needs them.
- Remote images and fonts inside previews. They can't load in an image anyway.

## Acceptance

1. `pnpm --filter @parley/desktop test` passes, with `preview.test.ts`, and `previews-visual.json`
   compiles under strict AJV.
2. `pnpm --filter @parley/protocol test` passes, with the `preview` cap's message.
3. `pnpm typecheck` and `pnpm --filter @parley/server build` pass.
4. `pnpm --filter @parley/server fake-host` passes (nothing on the surface changed; it's a guard).
5. Gallery, in light and dark (headless Playwright WebKit is fine): `previews-visual` shows three
   layouts that flip with ↑/↓, the SVG icons, the failed item with its source showing, and Source
   toggling back and forth. Switching the theme repaints the previews.
6. **Installed build** (ask Logan once; it replaces his running app): after
   `pnpm install:desktop` and a reopen, `pnpm --filter @parley/server fake-ask previews-visual`
   shows the same as step 5 under the release CSP. Step 0's spike is the early version of this
   check.
7. The full trial pass from §9, reported as described there.

By hand, for Logan:

- A preview in Desktop's inline card, in light and dark, including the host's theme colors.
- Whether 400×200 is a sensible default at the window's width, or the scaled-down text is too
  small to read.
- The next real ask with a visual choice: did the agent reach for a preview on its own?

Then stop. Ask Logan before committing.
