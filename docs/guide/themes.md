# Themes

Every color in Parley's window comes from a theme, in the format inn and Quire use: a base16 or
base24 scheme in a YAML file. Your inn themes work as they are, without copying anything. You pick
one in a settings file; there's no settings page.

**Covers:** [Themes](../architecture/themes.md), [The card](../architecture/card-ui.md), [The desktop shell](../architecture/desktop-shell.md)

## Without a setting

Parley Light and Parley Dark, Parley's own colors, following the system: light when macOS is in
Light mode, dark in Dark mode, switching while the window is open.

## Picking one

Write `~/.config/parley/settings.json` (make the folder yourself; Parley never writes it):

```json
{ "theme": "claude-dark" }
```

Then show the window: Parley reads the file each time the window comes up, so there's nothing to
restart. One id shows that theme in Light and Dark mode alike, so `claude-light` stays light at
night.

To follow the system with themes of your own, give a pair:

```json
{ "theme": { "light": "claude-light", "dark": "claude-dark" } }
```

It switches when the appearance does while Parley runs: when you flip System Settings →
Appearance, and when Auto switches at sunrise and sunset, with the window shown or hidden.

`theme` is the only setting. Any other key gets a banner (`settings.json: unknown key "thme"`), so
a typo shows.

## Where themes come from

A theme's id is its file name without `.yaml`. Parley looks in three places, and on the same id the
later one wins:

1. The bundled themes: `parley-light` and `parley-dark`.
2. inn's folder, `~/.config/inn/themes/`, read in place: Claude Dark, Claude Light, Claude OLED and
   Telnet, and whatever you add there. An edit shows in inn and Parley alike.
3. Parley's own folder, `~/.config/parley/themes/`, for one only Parley should see, or to give
   Parley its own version of an inn theme under the same id.

## Writing one

Use inn's format, which inn's guide has in full (`~/Code/personal/inn/docs/guide/themes.md`). In
short:

```yaml
system: base24
name: Harbour
variant: dark
palette:
  base00: "#1b1d22"
  # … every slot: base00–base0F, and base10–base17 for base24
overrides:
  accent: base09           # a slot…
  highlight: "#8a8f98"     # …or a color
```

Parley draws these tokens, with inn's names, from these slots unless `overrides` says otherwise:

| Token | Default | What it colors in Parley |
| --- | --- | --- |
| `bg` | base00 | the window |
| `surface-raised` | base01 | option cards, inputs, lists, buttons |
| `text` | base05 | text |
| `text-muted` | base04 | descriptions, the meta row |
| `text-faint` | base03 | hints, key labels, placeholders |
| `border` | base02 | hairlines |
| `border-strong` | base03 | input and button outlines |
| `accent` | base0D | actions and marks: Send, the lead decision, the question chip, the diff hunk |
| `highlight` | follows `accent` | what's picked or selected: options, segments, the history row |
| `link` | base0D | links |
| `accent-text` | base00 | text on an accent fill |
| `focus-ring` | base0D | the keyboard focus ring |
| `danger` | base08 | rejections, errors |
| `warning` | base0A | the countdown under a minute, withdrawn asks, banners |
| `success` | base0B | added diff lines, "Copied" |

inn's other tokens (the syntax colors, roles, vim modes …) are accepted in `overrides` and
ignored, so an inn theme loads unchanged. A token that's in neither list is an error. For a color
just for Parley, add a `parley:` block: it takes the tokens above, comes after `overrides`, and inn
and Quire ignore it.

```yaml
parley:
  highlight: base0C
```

Hover and tinted shades aren't tokens: Parley mixes them from these, so a theme never lists them.

## When one is broken

If the theme you picked doesn't load, the window shows Parley's own for that appearance and a
banner across the top says which file and why:

> Theme "harbour" didn't load: themes/harbour.yaml: palette.base0D is missing. Showing Parley Dark.

`themes/` is Parley's folder and `inn themes/` is inn's. Fix the file and show the window again:
the banner goes. A broken `settings.json` (not JSON, or a `theme` that isn't an id or a pair)
shows Parley Light and Dark, with the banner saying what's wrong.

## What it doesn't do

- No settings page, picker or hotkey for themes: the file is the interface.
- The inline card in Claude Desktop keeps following Claude: its surfaces and text are Claude's,
  over Parley Light or Dark as Claude says, with Parley's accents. It never reads your setting.
- Fonts and zoom aren't part of a theme.
