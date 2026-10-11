# Brief 13: Color chips and palette blocks

Read `CLAUDE.md`, [`README.md`](README.md), [the card](../architecture/card-ui.md), [the form
spec](../architecture/form-spec.md) and [testing](../architecture/testing.md) first. Nothing needs
to be merged first. Brief 14 builds on this one.

## Goal

Agents ask about colors: an accent, a theme, a palette for a report. Right now a color reaches
Logan as text (`#38BDF8`), and he has to picture it. This brief makes colors in card markdown show
as colors:

1. **Chips.** A color in a code span (`` `#38BDF8` ``, `` `oklch(70% 0.15 230)` ``) renders with a
   small swatch before its value. This works anywhere markdown renders: the question, an option's
   one-line description, an option's or review item's preview, and history.
2. **Palette blocks.** A ```` ```palette ```` fenced block, with one color per line and an
   optional name after it, renders as a row of large labelled swatches.

Neither one adds a field, a question type or a wire change. They're markdown rendering, so they work
the same in the window, the inline card in Claude Desktop, the gallery and history. A palette
question can show every option's colors at once by putting chips in the option `description`s.

Why now: it's the cheap half of "show the user what I mean". Brief 14 (pictures drawn from HTML and
SVG) is the bigger half and reuses this brief's post-render pass in `Markdown.vue`. (From `ideate`,
2026-10-11.)

## Decisions already made

- **Chips only in code spans.** A bare `#123` in prose is an issue number or an anchor as often as
  it's a color, so plain text never becomes a chip. Models already put colors in backticks.
  (Ideate, 2026-10-11; Logan briefed it as proposed.)
- **The palette block is in scope.** (Logan, 2026-10-11.)
- **No named colors.** `` `red` `` and `` `transparent` `` stay code: in a code span they're as
  likely to be identifiers. Hex and the CSS color functions only.
- **The swatch color is set through the CSSOM, never a `style` attribute.** See Already checked.
- **No trial pass here.** This brief adds its line to the tool description, and brief 14 runs one
  full trial pass for both. (Logan, 2026-10-11.)
- **A chip is not a button.** Clicking a chip does nothing new. Clicks on code already mean the
  copy button, and the value is selectable text.

Don't revisit these silently.

## Already checked

- **The release CSP blocks `style` attributes.** `tauri.conf.json`'s CSP has `style-src 'self'`
  with no `'unsafe-inline'`, but the dev header in `apps/desktop/vite.config.ts` (line 14) adds
  `'unsafe-inline'` for Vite. So `<span style="background:#38bdf8">` would work in `pnpm app` and
  the gallery, and silently do nothing in the installed build. CSP doesn't restrict CSSOM writes
  (`el.style.setProperty(...)`), so setting a custom property from script is allowed. Verify this
  in the installed build (Acceptance 5). That check is the one that matters. (2026-10-11, the two
  config files.)
- **The inline card's CSP** allows inline styles (`style-src 'self' 'unsafe-inline'` is the MCP Apps
  default, ext-apps spec 2026-01-26 via Context7, 2026-10-11). The CSSOM route works there too, so
  both surfaces share one code path.
- **Where markdown renders.** `apps/desktop/src/forms/markdown.ts` (markdown-it 15, `html: false`,
  image syntax disabled) is called by `Markdown.vue`. Block mode is used for question text and
  previews, inline mode (`renderInline`) for option descriptions. markdown-it's `code_inline`
  renderer rule covers both modes. Its `fence` rule is already overridden for copy buttons, and
  `highlight` is overridden for ```` ```diff ````.
- **`Markdown.vue`** renders with `v-html` from a computed. Each change of `source` replaces the
  DOM, so a post-render pass has to run after every render, not only on mount.
- **Desktop tests run in Node.** There's no vitest config and no DOM environment
  (`apps/desktop/package.json`, 2026-10-11). `CSS.supports` doesn't exist there, so the color check
  has to work without it.

## Open questions

- **Palette size.** Default: 1 to 12 lines. More than that, and the block renders as ordinary code.
- **Palette name length.** Default: names up to 40 characters. A longer line still renders, with
  the name cut off by an ellipsis in CSS.

## Shape

### 1. What counts as a color (**pinned**: brief 14 reuses it)

Add a new `apps/desktop/src/forms/colors.ts`:

```ts
export function isColor(value: string): boolean
export function parsePalette(source: string): { color: string; name?: string }[] | undefined
```

- `isColor` accepts the whole string only:
  - hex: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`;
  - one function call: `rgb`, `rgba`, `hsl`, `hsla`, `hwb`, `lab`, `lch`, `oklab`, `oklch` or
    `color(...)`, with no nested parentheses.

  Matching is case-insensitive. When `globalThis.CSS?.supports` exists, the value must also pass
  `CSS.supports('color', value)`. That rejects `rgb(nonsense)` in the app and keeps tests working
  in Node.
- `parsePalette` splits on lines and ignores blank ones. Each line is a color (by the same rules)
  followed by optional whitespace and a name. It returns `undefined`, which means "render as code",
  if any line isn't a color, or if there are no lines or more than 12. A color function contains
  spaces, so split on the closing `)`, not on the first space.

### 2. Rendering (`markdown.ts`)

- **Chips.** Override `md.renderer.rules.code_inline`. When `isColor(content.trim())`, emit:

  ```html
  <code class="color-chip" data-color="#38bdf8"><span class="swatch" aria-hidden="true"></span>#38bdf8</code>
  ```

  Escape the value with `md.utils.escapeHtml` in both places. Anything else renders as it does
  now.
- **Palettes.** In the existing `fence` override, when the info string's first word is `palette`
  and `parsePalette` returns a list, emit this instead of the code block:

  ```html
  <div class="palette" role="list">
    <div class="palette-entry" role="listitem" data-color="#0f172a">
      <span class="swatch" aria-hidden="true"></span>
      <span class="palette-name">Ink</span>
      <code class="palette-value">#0f172a</code>
    </div>
    …
  </div>
  ```

  An entry without a name leaves out `.palette-name`. A block that doesn't parse falls through to
  the ordinary code block with its copy button, so nothing the agent wrote is lost.

### 3. Painting (`Markdown.vue`)

Give the root element a template ref, and add a `paint()` that sets
`el.style.setProperty('--swatch', el.dataset.color)` on every `[data-color]` under it. Run it
`onMounted` and from `watch(html, paint, { flush: 'post' })`. Keep it a general post-render step:
brief 14 adds preview images to the same pass.

### 4. Styles (`styles.css`)

- `.swatch`: about 0.9em square, a 3 px radius, aligned to the text, with a hairline inset border
  (`color-mix` of `--text` at about 25%) so white shows on a light card and black on a dark one.
  Draw a checkerboard under the color so alpha shows:
  `background: linear-gradient(var(--swatch), var(--swatch)), <a small conic-gradient checker>`.
- `.palette`: a wrapping row of entries, each about 64 px wide. A large swatch (64×40, the same
  border and checker) with the name and value below it in small text, both cut off with an ellipsis.
  It has to read well at 440 px (the window) and 640 px (the card).
- The dark token blocks don't change. If one does, keep both blocks in step (`AGENTS.md`).

### 5. Tool description (`apps/server/src/tools/ask.ts`)

After the list of types and before "Questions are required…", add a paragraph along these lines:

> In markdown, a color in a code span (`` `#38bdf8` ``, `` `oklch(70% 0.15 230)` ``) shows with a
> swatch, and a ```` ```palette ```` block, one color per line with an optional name after it, shows
> large labelled swatches.

Brief 14 extends this paragraph, so keep it a paragraph of its own. Leave the server instructions
alone. The trial pass is in brief 14.

### 6. Fixture

Add `packages/protocol/fixtures/colors.json`: a choice, "Which accent for the report?", with three
options. Each option's `description` holds three or four chips, one includes an `rgba()` with alpha,
and each option's `preview` holds a ```` ```palette ```` block with names. Add a second question
whose text has a chip and a `` `#123` `` meant as an issue number, which shows the false-positive
case honestly. The fixture flows into the gallery, `fake-ask` and `schemas.test.ts` with no wiring.

### 7. Tests

Add a new `apps/desktop/src/forms/markdown.test.ts` (Node is fine) that covers:

- `isColor`: every hex length, each function, case, and rejections (`#12`, `#ggg`, `red`,
  `rgb(1,2,3) x`, nested parentheses).
- `parsePalette`: names, no names, a function color with a name, a bad line, 13 lines, blank lines.
- `renderMarkdown`: a chip in block and inline mode, a code span that isn't a color, a palette, a
  palette that falls back to code (and still has its copy button), and an escaped value.

Add the file to the testing page's Sources and its unit-test list. Add it to the testing row in
`AGENTS.md`'s Areas table and the matching `.claude/rules/` pointer, with the same globs.

### Docs

- **Guide.** In `docs/guide/answering.md`, add a "Colors" section next to "Code in a question":
  chips, palette blocks, and that a chip is only for colors in code. In `question-types.md`, the
  intro's "formatting, links and code" gains colors. Add a line to the root README's feature list.
- **Architecture.** `card-ui.md`'s Markdown bullet gets chips, palettes and the `paint` pass, and
  a rule worth keeping: never put a model-derived value in a `style` attribute, because the
  release CSP drops it while dev allows it.

## Out of scope

- Colors in plain prose, named colors, and contrast checks between two colors.
- A `color` question type or a color picker. `<input type=color>` opens the system color panel,
  which would probably activate the app, against the non-activating panel. The free-text answer
  already takes a hex.
- HTML and SVG previews (brief 14).
- The trial pass (brief 14).

## Acceptance

1. `pnpm --filter @parley/desktop test` passes, with `markdown.test.ts`, and `colors.json`
   compiles under strict AJV in `schemas.test.ts`.
2. `pnpm --filter @parley/protocol test` passes. Its fixture-coverage test isn't affected.
3. `pnpm typecheck` and `pnpm --filter @parley/server build` pass. The build covers the card bundle.
4. In the gallery (`pnpm --filter @parley/desktop dev`, then `?gallery&fixture=colors`), in light
   and dark: the chips in option descriptions and the question, the alpha checker, the palette
   preview on focus, and the `#123` chip. Headless Playwright WebKit is fine, as in brief 12.
5. **Under the release CSP:** `pnpm install:desktop`, then Logan quits Parley from the tray and
   reopens it, then `pnpm --filter @parley/server fake-ask colors`. Ask Logan once before this
   step. It replaces his running app. The swatches show color. If they're empty, the CSSOM
   assumption is wrong: stop and report.

By hand, for Logan:

- The chips and the palette in Desktop's inline card. This needs a real ask from Desktop, or
  the next time one comes up.
- Whether the false-positive chip on `` `#123` `` bothers him.

Then stop. Ask Logan before committing.
