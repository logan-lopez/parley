# Themes

Every color in the window comes from a theme: a base16 or base24 scheme in a YAML file, in inn's
format, picked as `theme` in `~/.config/parley/settings.json`. The setting is one id, or a
light/dark pair that follows the macOS appearance while Parley runs. inn's themes in
`~/.config/inn/themes/` load in place. The inline card in Claude Desktop takes Parley Light or
Dark under Claude's colors and reads no files.

**Sources:** `apps/desktop/src/theme/`

**History:** [brief 15](../briefs/15-themes.md), [brief 14](../briefs/14-fenced-previews.md) (the preview page's colors)

`theme.ts` parses a theme file into tokens. `load.ts` lists the folders and picks the theme for
each appearance. `setting.ts` is the `theme` setting's shape and resolution, the contract inn and
Quire will copy. `settings.ts` reads `settings.json`. `appearance.ts` watches the system
appearance. `paint.ts` holds the bundled themes and writes tokens onto `:root`. `index.ts` is the
window's side: the first-paint cache, reading the files, the banner text. `tokens.css` mixes the
derived shades. All but `paint.ts`, `appearance.ts` and `index.ts` are pure and tested in Node.

## How it works

- **A theme file** (`parseTheme`, ported from Quire's): `system` (`base16` or `base24`), `name`,
  `variant` (`light` or `dark`) and a `palette` of `#rrggbb` slots. A base16 scheme gets base10 to
  base17 filled in (backgrounds repeat base00, brights repeat the normals). `overrides` maps a
  token to a slot or a color; then a `parley:` block does the same and wins, and inn and Quire
  ignore it. Unknown top-level keys (`slug`, `author`, `quire:` …) are ignored. inn's tokens that
  Parley doesn't draw (`INN_TOKENS`) are accepted in `overrides` and dropped; any other unknown
  token is an error, so a typo shows. Errors name the file: `themes/<id>.yaml` or
  `inn themes/<id>.yaml`.
- **Parley's tokens** (`TOKENS`) are inn's names, a subset of inn's set: `bg`, `surface-raised`,
  `text`, `text-muted`, `text-faint`, `border`, `border-strong`, `accent`, `highlight`, `link`,
  `accent-text`, `focus-ring`, `danger`, `warning`, `success`. `highlight` follows `accent`'s final
  color unless the theme sets it. They're the names theme files set, so they're a user-facing
  contract: add, never rename.
- **Accent, highlight and link**, by inn's meanings. `accent` is actions and marks: Send and
  primary buttons, the lead decision and the approve bar, the question chip, the answered chip,
  the diff hunk, the zoom flash. `highlight` is what's picked or selected: picked options and
  their indicators, a picked segment, the selected history row, a pressed filter chip, the
  "waiting" pill. `link` is markdown links and `.link-button`. Focus rings take `focus-ring`.
- **Derived shades** (`tokens.css`): `--hover`, `--code-bg`, `--highlight-subtle`,
  `--accent-subtle`, `--warning-subtle`, `--danger-subtle`, `--accent-hover`, `--focus-shadow`,
  `--swatch-edge`, all `color-mix()` from the tokens. The subtle ones are opaque mixes of `bg`
  toward a token, each wrapped in `light-dark()` with a smaller step for light themes than dark,
  because Parley's old dark shades were brighter steps than its light ones. `light-dark()` follows
  `color-scheme`, which `paint` sets from the theme's `variant`, not the system, so a light theme
  shown in dark mode gets light steps. The literals are the ones that aren't the theme's:
  `--swatch-checker`, since a swatch's checkerboard is grey on any theme, and `--preview-paper`
  and `--preview-ink`, the white page and black text an HTML preview is drawn on in any theme
  ([the card](card-ui.md)).
- **Painting** (`paint`) sets every token and `color-scheme` on `document.documentElement.style`
  through the CSSOM, which the release CSP (`style-src 'self'`) lets through. Painting the same
  tokens again does nothing and returns false.
- **The bundled themes** are Parley Light and Parley Dark (`themes/*.yaml`, base24, `?raw`
  imports): the colors from before themes. `BUNDLED` is the default pair and what stands in for a
  side that doesn't load.
- **The setting** (`setting.ts`): `parseThemeSetting` takes a theme id (`THEME_ID`, inn's
  pattern) or `{ light, dark }` with nothing else, and a missing value is the default pair
  (`DEFAULT_THEME_SETTING`, the one line that differs between apps). `resolveThemeSetting` picks
  the id for an appearance; a single id ignores it.
- **settings.json** (`parseSettingsFile`): no file is no settings. A file that isn't a JSON object,
  or a bad `theme`, shows the default pair and says why. `theme` is the only key, and any other is
  reported but doesn't stop `theme` working. Parley never writes the file or creates the folder.
- **Loading** (`loadThemes`, over a `{ list, read }` interface): the bundled themes, then
  `~/.config/inn/themes/`, then `~/.config/parley/themes/`; on the same id a later folder wins. A
  missing folder is none. Files are `<id>.yaml` with a theme id for a stem; anything else is
  skipped. A file that throws is listed as broken with the reason. `pickThemes` then resolves the
  setting for both appearances; a side that's missing or broken gets its bundled theme and a
  problem.
- **The window** (`index.ts`). `initTheme`, before mounting, paints from the cache
  (`parley.themeCache` in localStorage: the theme for each appearance, last read) or else the
  bundled pair by the media query. `startTheme`, after mounting, reads the files (`refreshTheme`)
  at once, on every window `focus` (the panel gets one each time it's shown), and on every
  appearance change. A refresh reads `settings.json` and both folders, picks, paints, caches, and
  sets `themeError`. A newer refresh supersedes one still reading. An appearance change repaints
  from what was last read at once, then reads again.
- **The banner** (`App.vue`): `themeError` over whatever view is up, one problem a line, in the
  warning colors, until a read finds nothing wrong. For a theme that doesn't load it names the
  file and the problem and what shows instead: `Theme "harbour" didn't load: themes/harbour.yaml:
  palette.base0D is missing. Showing Parley Dark.` For the side of a pair not showing, it says
  which side, and that the bundled one stands in.
- **The appearance** (`appearance.ts`): `currentAppearance` reads `prefers-color-scheme`.
  `watchAppearance` calls back on the media query's `change` and, in Tauri, on the window's
  `onThemeChanged` (and once with `theme()` at start), which also arrive while the panel is
  hidden. Either may repeat the other; painting the same tokens is free. Both calls are in
  `core:default` (`core:window:allow-theme`, `core:event:allow-listen`).
- **The gallery** (`initGalleryTheme`): `&theme=<id>` paints that bundled theme; without it the
  bundled pair follows the media query, which is how `screenshots` gets light and dark. No cache
  and no files.
- **The inline card** (`src/mcp-app/theme.ts`, [inline cards](inline-cards.md)): `initCardTheme`
  paints Parley Light or Dark by the media query before the host connects, then
  `applyHostContext` paints by the host's `theme` and maps Claude's surface, text and border
  variables over the tokens, again after each repaint. Claude's tertiary background isn't mapped:
  `--hover` and `--code-bg` mix from the mapped `bg` and `text`. The card imports `paint.ts`
  only, never `index.ts`, so it has no Tauri, fs or settings.
- **Reading files** goes through `@tauri-apps/plugin-fs` with `homeDir()`, under read-only grants
  scoped per command in `capabilities/default.json`: `read-text-file` on `settings.json` and both
  theme folders' files, `read-dir` and `exists` on the folders (and `exists` on `settings.json`).
  The global `fs:scope` stays the app's data dir, so `~/.config` is never writable. Rust doesn't
  change.

## Rules worth keeping

- **No color literals outside `src/theme/`.** `no-color-literals.test.ts` (Quire's scanner) checks
  `src/`, `index.html` and `mcp-app.html` for hex colors, color functions other than
  `color-mix()`, named and system colors in CSS, and palette slot names. Test files are skipped:
  their colors are model text under test. A new shade goes in `tokens.css`.
- **Tokens are inn's names.** A new one takes inn's name if inn has it, and moves out of
  `INN_TOKENS`; a token inn lacks would make Parley themes fail in inn, so ask first.
- **The card never reads `~/.config`.** It stays on Parley Light or Dark under Claude's colors.
- **Symlinks:** the fs plugin may check a symlink's resolved path against the scope (Quire saw it
  on 2.7; Parley is on 2.6, unverified). A theme symlinked from outside the two folders may load as
  broken with "forbidden path".

## Decisions

- **inn's format, inn's names, read in place** (Logan, 2026-10-12): one theme file serves inn,
  Quire and Parley, with no copying or symlinking.
- **The pair follows the system live** (Logan, 2026-10-12), including Auto's own switches, with no
  reload. `setting.ts` and `appearance.ts` are written to be copied into inn and Quire
  ([`FUTURE.md`](../briefs/FUTURE.md#the-lightdark-pair-in-inn-and-quire)).
- **No settings page or picker:** editing `settings.json` is the interface for now.
- **`light-dark()` for the derived shades,** not one percentage: no single mix reproduced both of
  the old bundled sets (hover wanted 3% in light and 10% in dark). Parley Light lands within 9/255
  per channel of the old literals in every screenshot, Parley Dark within 14/255, the largest
  being the accent tint behind the question chip, a little greyer than the hand-picked `#263152`.
