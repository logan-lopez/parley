# Brief 15: Themes, from a config file

Read `AGENTS.md`, [`README.md`](README.md), [the card](../architecture/card-ui.md),
[the desktop shell](../architecture/desktop-shell.md), [inline cards](../architecture/inline-cards.md)
and [testing](../architecture/testing.md) first. Then read the two systems this one copies:
inn's guide page `~/Code/personal/inn/docs/guide/themes.md`, and Quire's
`~/Code/personal/quire/docs/guide/themes.md` and `~/Code/personal/quire/apps/desktop/src/theme/`.
Brief 13 must be merged first: it adds the swatch styles this brief re-tokens. Brief 14 adds
preview styles to `styles.css` too, so if it's in flight, do this one after it merges.

## Goal

Every color in Parley's window comes from a theme, in the format inn and Quire already use: a
base16 or base24 scheme in a YAML file, with optional `overrides`. That means Logan's inn themes in
`~/.config/inn/themes/` (Claude Dark, Claude Light, Claude OLED, Telnet) work in Parley without
copying anything. He picks one in `~/.config/parley/settings.json`. There's no settings page.

The setting takes one theme id, or a light/dark pair that follows the macOS appearance. The pair
has to follow the system while Parley runs: a manual switch in System Settings, and Appearance set
to Auto when macOS switches by itself at sunrise and sunset. inn and Quire take only one id today,
and Logan wants the pair there too later. So the pair's setting shape and its resolution are
written here as a small, pure contract that those two can copy unchanged ([Shape](#the-setting-pinned)).

With no setting, nothing changes: two bundled themes, Parley Light and Parley Dark, reproduce
today's colors and follow the system, as the window does now.

## Decisions already made

Decided with Logan, 2026-10-12. Don't revisit silently.

- **The setting** is `theme` in `~/.config/parley/settings.json`: a theme id (`"claude-dark"`),
  or `{ "light": "<id>", "dark": "<id>" }` to follow the system. No setting means
  `{ "light": "parley-light", "dark": "parley-dark" }`.
- **Follow the system live.** A pair switches when the appearance changes while Parley runs,
  including Auto's own switches, with no reload. (Logan, after the first round.)
- **inn's themes are read in place.** Parley lists the bundled themes, then
  `~/.config/inn/themes/` (read-only), then `~/.config/parley/themes/`. On the same id, Parley's
  folder wins over inn's, and inn's over a bundled theme. Nothing to copy or symlink.
- **The inline card keeps following Claude.** The theme applies to the window and the dev
  gallery. The card in Claude Desktop still takes Claude's surfaces and text and keeps Parley's
  accents, over Parley Light or Dark as the host says. The server never reads `~/.config`.
- **Bundled: Parley Light and Parley Dark,** base24 files reproducing today's token values from
  `styles.css`.
- **Built to be copied.** The setting's shape and `resolveThemeSetting` are the contract inn and
  Quire will adopt for their own light/dark pairs (a later brief in each repo, not this one).
- **No settings page and no theme picker.** Editing the file is the interface for now.

## Already checked

2026-10-12.

- Parley has no config file today. Everything it keeps is under
  `~/Library/Application Support/com.loganlopez.parley/` (`history.jsonl`, `captures/`,
  `hub.sock`). `~/.config/parley/` doesn't exist.
- `~/.config/inn/themes/` holds `claude-dark.yaml`, `claude-light.yaml`, `claude-oled.yaml` and
  `telnet.yaml`, all regular files with no symlinks. The Claude ones are base24 and set every inn
  token in `overrides`. They also carry top-level keys the parser must ignore: `slug`, `author`,
  `description`. `telnet.yaml` overrides a few tokens by slot name (`accent: base0A`).
- inn's token names (`~/Code/personal/inn/apps/chat/server/utils/theme.ts`, `TOKENS`, last changed
  2026-10-11): `bg surface surface-raised surface-sunken text text-muted text-faint text-strong
  border border-strong selection accent highlight accent-text focus-ring link danger warning
  success info caret shadow-color search-match role-user role-assistant role-system mode-normal
  mode-insert mode-visual mode-replace syntax-comment syntax-keyword syntax-string syntax-number
  syntax-constant syntax-function syntax-type syntax-variable syntax-property syntax-operator
  syntax-punctuation syntax-regexp syntax-tag syntax-attribute syntax-builtin syntax-meta
  syntax-inserted syntax-deleted syntax-changed md-heading md-emphasis md-strong md-link md-url
  md-code md-quote md-list md-mark macro`. Defaults: `bg` base00, `surface-raised` base01,
  `text` base05, `text-muted` base04, `text-faint` base03, `border` base02, `border-strong`
  base03, `accent` base0D, `highlight` follows `accent`, `accent-text` base00, `focus-ring` base0D,
  `link` base0D, `danger` base08, `warning` base0A, `success` base0B.
- Quire's parser (`quire/apps/desktop/src/theme/theme.ts`, 281 lines) is the one to port: it's
  pure, accepts inn's tokens it doesn't draw (`INN_TOKENS`: checked, then dropped), applies an
  app-only block after `overrides` (`quire:`), and errors on a token neither app knows. Its loader
  (`load.ts`) and the first-paint cache (`index.ts`, `quire.themeCache` in localStorage) port too.
  Quire uses `yaml@^2.9.1`.
- Tauri fs scopes: a permission's object form `{ "identifier": "fs:allow-read-text-file",
  "allow": [{ "path": "$HOME/.config/parley/**" }] }` scopes that one command (Context7,
  `/tauri-apps/tauri-docs`, plugin/file-system). Parley's capability today grants
  `read-text-file`, `write-text-file`, `read-dir` and the others under one global `fs:scope` of
  `$APPDATA` paths. Adding `~/.config` there would make it writable too, so use command-scoped
  read grants instead. Parley's fs plugin is 2.6.0 (Rust and JS). Quire found on 2.7 that the
  scope is checked on a symlink's resolved path. Unverified on 2.6, so a symlink in
  `~/.config/parley/themes/` pointing outside the two granted folders may be refused.
- `@tauri-apps/api` 2.12.2 is installed and has `getCurrentWindow().theme()` and
  `getCurrentWindow().onThemeChanged(handler)` (`window.d.ts`). `tauri.conf.json` sets no window
  `theme`, so the webview follows the system appearance.
- The window already gets `focus` events when it's shown: `AskCard.vue` listens for them to put
  focus back ([the card](../architecture/card-ui.md)).
- Setting custom properties on `document.documentElement.style` through the CSSOM is how
  `Markdown.vue`'s `paint()` already gets past the release CSP's `style-src 'self'`
  ([the card](../architecture/card-ui.md#rules-worth-keeping)).
- Today's `--faint` in light, `#9a9893` on `#f6f6f4`, is 2.66:1, under inn's 3:1 floor for
  `text-faint`. Dark's is 3.67:1. That's why the brief adds no contrast test of the bundled themes
  (see Out of scope).

## Open questions

- **Where the error shows.** Default: a one-line banner at the top of the window, over whatever
  view is up (card, empty state, history), in the warning colors. For example: `Theme "harbour"
  didn't load: themes/harbour.yaml: palette.base0D is missing. Showing Parley Dark.` It goes away
  the next time the file is read and loads.
- **Whether `onThemeChanged` is needed at all.** Default: listen to both it and the
  `prefers-color-scheme` media query, and recompute on either (cheap, and idempotent because
  painting the same tokens does nothing). If the hand check shows the media query alone fires
  reliably, shown and hidden, keep both anyway and say so in the report.

## Shape

### The setting (pinned)

This is the contract inn and Quire will copy, so changing it needs Logan.

```ts
// apps/desktop/src/theme/setting.ts. Pure: no DOM, no Tauri.
export type ThemeSetting = string | { light: string; dark: string }
export type Appearance = 'light' | 'dark'

/** The theme id to show. A single id ignores the appearance. */
export function resolveThemeSetting(setting: ThemeSetting, appearance: Appearance): string

/** settings.json's `theme` value, or the problem with it. Missing → the default pair. */
export function parseThemeSetting(value: unknown):
  | { ok: true; setting: ThemeSetting }
  | { ok: false; problem: string }
```

- A string is an id (`THEME_ID`, as inn's: `^[a-z0-9][a-z0-9._-]*$`).
- An object needs both `light` and `dark`, each an id, and no other keys.
- Anything else is a problem. The default pair shows, and the banner says what was wrong.
- A pair whose one side doesn't load shows the bundled theme for that side only, with the banner.
- A single id whose theme is light shows light whatever the system says. `color-scheme` follows
  the theme's `variant`, not the system.

### `settings.json`

`~/.config/parley/settings.json`, read-only for Parley, which never writes it or creates the
folder. A missing file or folder is no settings, not an error. `theme` is the only key. An unknown
key is listed in the banner (`settings.json: unknown key "thme"`), so a typo shows. A file that
isn't JSON shows the default pair and the parse error.

### The theme module, `apps/desktop/src/theme/`

Port Quire's, renamed where it's Quire's. Keep the files pure except `index.ts`:

- `theme.ts`: `parseTheme(id, yamlText, { source, file })`, Quire's rules unchanged: base16 or
  base24, `#rrggbb` only, slot or color in `overrides`, unknown top-level keys ignored, inn's
  tokens Parley doesn't draw accepted and dropped, any other unknown token an error. The app-only
  block is `parley:`, which inn and Quire ignore (Parley ignores `quire:`). `TOKENS` is Parley's
  set (pinned, below), and `INN_TOKENS` the rest of inn's list.
- `load.ts`: `loadThemes(fs, dirs, bundled)` over a minimal `{ list, read }` interface so it's
  tested without Tauri. Lists each folder, where a missing one means none. Precedence as in
  Decisions. A file that throws becomes `{ id, broken: reason }`. Errors name the file as
  `inn themes/<id>.yaml` or `themes/<id>.yaml`, so Logan knows which folder.
- `setting.ts`: the pinned contract above.
- `appearance.ts`: `watchAppearance(onChange)`. Read the current appearance from
  `matchMedia('(prefers-color-scheme: dark)')`. Call `onChange` on the query's `change` event and,
  in Tauri, on `getCurrentWindow().onThemeChanged`. The gallery and the card have no Tauri: guard
  it, as `platform.ts` does.
- `index.ts`: `initTheme()` runs synchronously before mount and paints the last painted tokens
  from localStorage (`parley.themeCache`), or Parley Light or Dark by the media query. Then
  `refreshTheme()` reads `settings.json` and the folders, resolves, paints, caches, and sets
  `themeError`, a ref the banner shows. It runs at launch, on every window `focus`, and on every
  appearance change. Painting identical tokens again is a no-op, as in Quire. `paint` sets every
  token and `color-scheme` on `:root` through the CSSOM.
- `themes/parley-light.yaml`, `themes/parley-dark.yaml`: base24, `?raw` imports. Today's values,
  from the two token blocks in `styles.css`, go in the palette where a slot means that thing, and
  in `overrides` where it doesn't (`border-strong`, `accent-text`, `warning: base09`). Fill the
  unused slots sensibly. Write a comment heading each file, like Telnet's.
- `tokens.css`: derived shades only, by `color-mix()` from the tokens, as Quire's. This is the
  only stylesheet outside the YAML allowed to hold a color literal: the swatch checker
  (`#c8c8c8`, `#fff`) moves here as `--swatch-checker`, since it shows alpha and isn't the theme.

Everything reads the same files through `@tauri-apps/plugin-fs` and `homeDir()` from
`@tauri-apps/api/path`. Rust doesn't change.

### Parley's tokens (pinned)

These are the names theme files set, so they're a user-facing contract: inn's names, a subset of
inn's set.

| Token | Default | Replaces in `styles.css` |
| --- | --- | --- |
| `bg` | base00 | `--bg` |
| `surface-raised` | base01 | `--surface` (option cards, inputs, lists) |
| `text` | base05 | `--text` |
| `text-muted` | base04 | `--muted` |
| `text-faint` | base03 | `--faint` |
| `border` | base02 | `--border` |
| `border-strong` | base03 | `--border-strong` |
| `accent` | base0D | `--accent` on actions and marks: Send and primary buttons, the lead decision, the approve bar, the question chip, the diff hunk, the zoom flash |
| `highlight` | follows `accent` | `--accent` on what's picked or selected: picked options and segments, the selected history row, a pressed filter chip, the "waiting" pill |
| `link` | base0D | `--accent` on links: markdown links, `.link-button` |
| `accent-text` | base00 | `--accent-text` |
| `focus-ring` | base0D | the color inside `--focus` |
| `danger` | base08 | `--danger` |
| `warning` | base0A | `--warn` |
| `success` | base0B | `--success` |

Derived in `tokens.css` (names free to change; tune the percentages so Parley Light and Dark land
close to today's literals, and say how close in the report): `--hover` (was `--surface-2`),
`--code-bg` (was `--code-bg`, a mix of `bg` toward `text`), `--highlight-subtle` and
`--accent-subtle` (was `--accent-soft`), `--warning-subtle`, `--danger-subtle`, `--focus-shadow`
(was `--focus`).

Split each `--accent` use between `accent`, `highlight` and `link` by inn's meanings (inn's guide,
"Accent, highlight and link"). With Parley's bundled themes all three are the same color, so
nothing moves. With Claude Dark, Send is coral and picked options are grey, which is that theme's
intent.

### `styles.css`

- No color literals and no palette slot names. Both dark blocks and the light one go, along with
  `color-scheme: light dark` on `:root`. This also closes `FUTURE.md`'s "One dark token block".
- The picked checkbox's check is an SVG with `stroke='white'`. Draw it as a mask (`-webkit-mask`
  plus `mask`, filled with `var(--accent-text)`) so it follows the theme.
- The rejected decision button's text, `var(--surface)` on `--danger`, becomes `var(--bg)`.
- `html.inline` keeps its fonts. Its colors come from the card's path below.

### The inline card, `src/mcp-app/theme.ts`

`applyHostContext` paints Parley Light or Parley Dark by the host's `theme` (the module's `paint`,
bundled themes only, no fs, no settings, no cache), then maps Claude's variables over it as now.
Rename `MAPPED`'s keys to the new tokens: `--bg`, `--surface-raised`, `--text`, `--text-muted`,
`--text-faint`, `--border`, `--border-strong`. Claude's tertiary background, which used to fill
`--surface-2`, is dropped or mapped to `--code-bg`, your call; say which in the report. Keep the
host-context-changed path working.

### The window

- `main.ts`: `initTheme()` before mounting, in both the app and gallery branches.
  `refreshTheme()` and `watchAppearance` in the app branch, plus `window`'s `focus` listener.
- `App.vue`: the banner when `themeError` is set.
- Gallery: `&theme=<id>` picks a bundled theme. Without it, the default pair follows the media
  query, so `pnpm --filter @parley/desktop screenshots` (Playwright's `colorScheme`) still shoots
  light and dark.

### The capability, `src-tauri/capabilities/default.json`

Add read-only grants and leave the global `fs:scope` alone:

- `fs:allow-read-text-file` scoped to `$HOME/.config/parley/settings.json`,
  `$HOME/.config/parley/themes/*`, `$HOME/.config/inn/themes/*`.
- `fs:allow-read-dir` scoped to `$HOME/.config/parley/themes`, `$HOME/.config/inn/themes`.

Check that `getCurrentWindow().onThemeChanged` and `theme()` work under `core:default`. If they
need a permission, add it, and record it in [the desktop shell](../architecture/desktop-shell.md).

### Tests (vitest, `apps/desktop`)

- `theme.test.ts`: the bundled pair parses, and its tokens equal today's values (list them in the
  test). Fixture copies of `claude-dark.yaml` and `telnet.yaml` in `src/theme/fixtures/` parse,
  with their `accent`, `highlight` and `link` as set. A `parley:` block wins over `overrides`. An
  unknown token, a bad color and a missing slot each throw a message naming the file. A
  base16 file gets base10–base17 filled in.
- `load.test.ts`: precedence across the three sources, a missing folder, a broken file listed
  with its reason.
- `setting.test.ts`: `parseThemeSetting` on a string, a pair, a pair missing a side, extra keys,
  a number, and missing; `resolveThemeSetting` on both appearances.
- `no-color-literals.test.ts`: port Quire's scanner (`test/support/color-literals.ts`) and run it
  over `src/`, skipping `src/theme/`. It must pass with zero findings.

### Docs (per `AGENTS.md`)

- A new architecture page, `docs/architecture/themes.md`, with **Sources:**
  `apps/desktop/src/theme/`. Then run `python3 -I ~/.claude/skills/brief/scripts/areas.py .` for
  the Areas row and `.claude/rules/themes.md`. Update the styles bullet on the card page and the
  permissions bullet on the desktop-shell page.
- `AGENTS.md`'s "two identical dark token blocks" rule becomes: every color comes from
  `src/theme/`, and the no-color-literals test enforces it.
- A new guide page, `docs/guide/themes.md`, in the README index. It covers picking one in
  `settings.json`, the pair and following the system, inn's folder and your own, writing a theme
  (point at inn's format, and list Parley's tokens), the banner, and what it doesn't do: no
  picker, the inline card follows Claude. Add a line to the root README's feature list.

## Out of scope

- A settings page, a theme picker, a hotkey to switch themes.
- Theming the inline card, or the server reading anything in `~/.config`.
- Fonts, zoom, or any setting but `theme`.
- Contrast checks of the bundled themes. Today's colors don't all meet inn's floors (Already
  checked), and this brief doesn't change them.
- The light/dark pair in inn and Quire. That's a brief in each repo, copying `setting.ts` and
  `appearance.ts` ([`FUTURE.md`](FUTURE.md#the-lightdark-pair-in-inn-and-quire)).
- Watching the theme files with the fs plugin. Re-reading on focus is enough, and the plugin's
  `watch` feature isn't enabled in Parley.
- `apps/server`, `packages/protocol`, the hub, Rust code.

## Build order

1. `setting.ts`, `theme.ts`, `load.ts` with their tests, and the bundled YAML matching today's
   values.
2. `tokens.css` and the `styles.css` rename. Shoot screenshots before and after (`pnpm --filter
   @parley/desktop screenshots`) and compare them; the bundled pair should look the same.
3. `index.ts`, `appearance.ts`, `main.ts`, the banner, the capability.
4. The inline card's path, then `fake-host`.
5. The no-color-literals test, then docs.

## Acceptance

- `pnpm typecheck` and `pnpm build` pass.
- `pnpm --filter @parley/desktop test` passes, including the four new test files, and the scanner
  reports nothing.
- `rg -n -- '--surface-2|--accent-soft|--warn-soft|--danger-soft|--muted\b|--faint\b|data-theme=.dark' apps/desktop/src`
  finds nothing.
- `pnpm --filter @parley/server build` passes. Record `dist/card.html`'s size before and after
  (`yaml` joins the card's bundle).
- `pnpm --filter @parley/server fake-host` passes every scenario.
- `pnpm --filter @parley/desktop screenshots`: the light and dark shots in
  `docs/guide/images/cards/` look like the committed ones. Commit them only if they changed
  visibly, and say what changed.

Logan checks these by hand. `pnpm app` launches the dev app and needs the installed Parley quit,
so **ask Logan once before that run** (about ten minutes). Then:

1. With no `settings.json`, the window looks as it does today, light and dark.
2. Write `{ "theme": "claude-dark" }`, then show the window: Claude Dark, from inn's folder. Then
   try `telnet`.
3. Write `{ "theme": { "light": "claude-light", "dark": "claude-dark" } }`. Switch System Settings
   → Appearance between Light and Dark with the window shown, then with it hidden and shown again.
   It follows each time, without a reload.
4. Set Appearance to Auto and leave Parley running across a sunset or sunrise. Logan reports this
   one later; don't block the report on it.
5. Put a typo in a theme file and select that theme: the banner names the file and the problem,
   and the default theme shows. Fix it and show the window again: the banner goes.
6. The inline card in Claude Desktop looks as it did (needs `pnpm --filter @parley/server build`
   and a Desktop restart).

Then stop. Append the report, and ask Logan before merging anything.

## Report

Built 2026-10-12, on `main`, uncommitted. Brief 13 had landed (324ff0e); brief 14 wasn't started,
so the "after 14 if it's in flight" condition didn't hold, and 15 went first.

### Built

- **The theme module, `apps/desktop/src/theme/`.** `setting.ts` is the pinned contract as written,
  plus `THEME_ID` and `DEFAULT_THEME_SETTING` (the one line inn and Quire change when they copy
  it). `theme.ts` is Quire's parser with Parley's 15 tokens and the `parley:` block. `load.ts` is
  `loadThemes` over `{ list, read }` and `pickThemes`, which resolves both appearances and falls
  back per side. `settings.ts` parses `settings.json`. `appearance.ts` is `currentAppearance` and
  `watchAppearance`. `paint.ts` holds the bundled themes and `paint`. `index.ts` is the window's
  side: the cache, `refreshTheme`, `startTheme`, `themeError`, and `initGalleryTheme`.
  `themes/parley-light.yaml` and `themes/parley-dark.yaml` reproduce the old tokens exactly.
  `tokens.css` mixes the derived shades.
- **`styles.css`:** the three token blocks and `color-scheme: light dark` are gone. Every
  `--accent` use is split by inn's meanings (accent: actions and marks; highlight: picked and
  selected; link: links; focus rings take `focus-ring`). The checkbox tick is a mask filled with
  `--accent-text`. The rejected and neutral pressed decisions take `--bg` for their text.
- **The window:** `main.ts` calls `initTheme()` before mounting and `startTheme()` after it (and
  `initGalleryTheme` in the gallery). `App.vue` wraps its views in `.window`, with the banner on
  top.
- **The inline card:** `src/mcp-app/theme.ts` paints Parley Light or Dark (`initCardTheme` before
  connecting, then the host's `theme`), maps Claude's seven surface, text and border variables
  over it, and maps them again after each repaint. A variable the host stops sending gets the
  bundled value back.
- **The capability:** scoped read grants, global `fs:scope` unchanged. `cargo check` validates it.
- **Tests:** `theme.test.ts`, `load.test.ts`, `setting.test.ts`, and `no-color-literals.test.ts`
  with the scanner ported to `src/theme/color-literals.ts`.
- `yaml@^2.9.1` added to `apps/desktop`.

### Deviations

- **`fs:allow-exists`, scoped to `settings.json` and the two folders,** is added beside the two
  grants the brief lists. Without it, telling a missing folder from a refused path means parsing
  error strings. A scope mistake would then look like "no themes" instead of a banner.
- **`paint.ts` split from `index.ts`.** The card needs `paint` and the bundled themes, and
  `index.ts` imports the fs plugin and `homeDir`. The card importing it would break "the card keeps
  no Tauri import".
- **`settings.ts`** holds `parseSettingsFile`, separate from `setting.ts`, so the contract file
  stays exactly what inn and Quire copy.
- **The gallery gets `initGalleryTheme(id)`, not `initTheme()`.** `initTheme` paints from the
  cache. In the gallery that would show whatever was last cached, and the screenshot run reuses one
  page per scheme.
- **Derived shades use `light-dark()`.** No single `color-mix()` percentage reproduced both old
  sets (hover wants 3% in light and 10% in dark), so each subtle shade is two mixes picked by
  `color-scheme`, which `paint` sets from the theme's variant.
- **The scanner skips `*.test.ts`.** `forms/markdown.test.ts` holds colors as model text under
  test. Quire's scan covers `src/`, and its tests live outside it. Two comments in
  `forms/colors.ts` (`red`, `rgb(nonsense)`) were reworded to pass.
- **The scanner reads files through `import.meta.glob`,** not `node:fs`. The app's tsconfig has no
  Node types, so vue-tsc failed on `node:fs`.
- **Extra derived names:** `--accent-hover`, `--focus-ring-soft` and `--swatch-edge`, for three
  `color-mix()` calls that used to sit in `styles.css`.
- **`FUTURE.md`'s "One dark token block" entry is removed,** since this closes it. **Brief 14**
  gets a note under its "Tokens" bullet with the new names, because its preview code reads
  `--surface` and `--muted`.

### Defaults taken

- **Where the error shows:** a banner across the top of the window over any view, warning
  colors, one problem a line, gone on the next read that finds nothing wrong.
- **`onThemeChanged`:** both it and the media query are listened to, plus one `theme()` read at
  start. Whether the media query alone fires reliably while the panel is hidden is for check 3.
- **Claude's tertiary background in the card:** dropped. `--hover` and `--code-bg` mix from the
  mapped `bg` and `text`, so they follow Claude without it.

### Acceptance

- `pnpm typecheck`: pass. `pnpm build`: pass.
- `pnpm --filter @parley/desktop test`: 8 files, 122 tests, all pass, including the four new
  files. The scanner reports nothing. It caught brief 13's comments and test data on its first run
  (fixed above), so it really is scanning.
- The `rg` for old token names and `data-theme=.dark` in `apps/desktop/src`: no matches.
- `pnpm --filter @parley/server build`: pass. `dist/card.html` grew from 725,785 to 829,857 bytes
  (+104 KB, +14%); gzipped, 221,064 to 253,237. Most of that is `yaml`. The built card, loaded
  headless in WebKit in light and dark, paints Parley Light or Dark before connecting, with no
  errors.
- `pnpm --filter @parley/server fake-host`: all 9 scenarios pass, from source and with
  `--server dist`.
- `pnpm --filter @parley/desktop screenshots`: pixel-diffed against shots taken before the change,
  which matched the committed PNGs byte for byte. Light: at most 9/255 per channel anywhere. Dark:
  at most 14/255, and only in the accent tint behind the question chip (old `#263152`, now about
  `#2d3243`, a little greyer; the old color had more chroma than any mix of `bg` and `accent`
  reaches). Nothing visibly changed, so the PNGs aren't recommitted. A one-off headless shot of
  multi-select under Claude Dark's tokens showed coral Send and chip, grey picked options, and a
  dark tick on them, as the theme intends.

Not run: the hand checks below. They need the dev app, and the brief says to ask first.

### Spot checks for Logan

Needs the installed Parley quit, then `pnpm app` (about ten minutes). I can run it if you want.

1. No `settings.json`: the window looks as it does today, light and dark.
2. `{ "theme": "claude-dark" }`, then show the window: Claude Dark from inn's folder, with coral
   Send and grey picked options. Then `telnet`. **If the banner says the files "couldn't be
   read" or names a forbidden path, the scoped grants didn't work at runtime.** That's the one part
   nothing here could test.
3. `{ "theme": { "light": "claude-light", "dark": "claude-dark" } }`. Switch Appearance in System
   Settings with the window shown, then hidden and shown again. It should follow each time.
4. Appearance on Auto across a sunset or sunrise. Report later.
5. A typo in a theme file, with that theme selected: the banner names the file and the problem,
   and the bundled theme shows. Fix it and show the window: the banner goes. Also try an unknown
   key in `settings.json`.
6. The inline card in Claude Desktop looks as before (`pnpm --filter @parley/server build` is
   done; restart Desktop).

### Docs updated

- New: [`docs/architecture/themes.md`](../architecture/themes.md), its Areas row in `AGENTS.md`,
  and `.claude/rules/themes.md` (from `areas.py`, which also put `.claude/rules/testing.md`'s paths
  back in its page's order).
- `AGENTS.md`: the two-dark-blocks rule became the no-color-literals rule.
- [The card](../architecture/card-ui.md): the styles bullet, the gallery's `&theme=`, and the rule.
  [The desktop shell](../architecture/desktop-shell.md): permissions.
  [Inline cards](../architecture/inline-cards.md): how the card takes the host's look.
  [Testing](../architecture/testing.md): the new tests.
- Guide: new [`docs/guide/themes.md`](../guide/themes.md), a line in the guide's index, and the root
  README's feature list and "What it's built around".
- `FUTURE.md`: removed "One dark token block". Brief 14: the token note.

### Follow-ups

- **The card carries `yaml` (+104 KB)** just to parse two bundled files. Parsing them at build
  time (a JSON import, or a small Vite transform) would drop it from the card and the window.
- **The scanner skips test files wholesale.** A styled fixture inside a `.test.ts` would slip
  through. Unlikely, but an allowlist of the files that hold model-text colors would be tighter.
- **Contrast of Parley Light's `text-faint`** (2.66:1) is still under inn's 3:1 floor. That's out
  of scope here, and it's the old color.
- **Symlinked theme files** pointing outside the two folders may load as broken on fs 2.6
  (unverified, as the brief said).
