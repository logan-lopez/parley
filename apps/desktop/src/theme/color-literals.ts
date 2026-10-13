/**
 * Finds color literals in source text (ported from Quire's `test/support/color-literals.ts`).
 * Every color must come from the theme (src/theme/), so outside it the scanner reports:
 *
 * - hex colors (`#fff`, `#12345678`), anywhere, comments included;
 * - color functions (`rgb(`, `hsl(`, `oklch(`, `color(`, ...), anywhere. `color-mix()` is how
 *   derived shades are made from tokens, so it is allowed;
 * - named colors (`white`, `red`, ...) in CSS: declarations in .css and <style> blocks, `style`
 *   attributes, and style-like object keys in scripts. `transparent` and
 *   `currentColor` are not colors of their own and are allowed;
 * - palette slot names (`base0D`) outside the theme loader: components use semantic tokens only.
 */
export interface Finding {
  file: string
  line: number
  rule: 'hex' | 'function' | 'named' | 'slot'
  text: string
}

// CSS Color 4 named colors (without transparent / currentcolor).
export const NAMED_COLORS = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood ' +
    'cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray ' +
    'darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen ' +
    'darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue ' +
    'firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew ' +
    'hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan ' +
    'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue ' +
    'mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred ' +
    'midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid ' +
    'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple ' +
    'rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue ' +
    'slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white ' +
    'whitesmoke yellow yellowgreen'
  ).split(/\s+/),
)

/** CSS system colors: browser defaults, not the palette. Only looked for in CSS, since as words they are common. */
export const SYSTEM_COLORS = new Set(
  (
    'canvas canvastext linktext visitedtext activetext buttonface buttontext buttonborder field fieldtext highlight ' +
    'highlighttext selecteditem selecteditemtext mark marktext graytext accentcolor accentcolortext'
  ).split(/\s+/),
)

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])/g
const FUNCTION = /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|device-cmyk)\(/gi
const SLOT = /\bbase(?:0[0-9A-Fa-f]|1[0-7])\b/g

/** Style-ish keys in scripts whose string values are CSS. */
const STYLE_KEY =
  /\b(?:color|background(?:Color)?|border(?:Top|Right|Bottom|Left)?(?:Color)?|outline(?:Color)?|fill|stroke|caretColor|accentColor|boxShadow|textDecoration(?:Color)?|textShadow|columnRuleColor)\s*:\s*(['"`])((?:(?!\1).)*)\1/g

function lineOf(text: string, index: number): number {
  let line = 1
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

/** Words of a CSS value that are named colors, ignoring custom property names inside var(). */
function namedIn(value: string): string[] {
  const cleaned = value
    .replace(/var\(\s*--[\w-]+/g, 'var(')
    .replace(/--[\w-]+/g, '')
    .replace(/url\([^)]*\)/g, '')
  return (cleaned.match(/[a-zA-Z]+/g) ?? []).filter(
    (word) => NAMED_COLORS.has(word.toLowerCase()) || SYSTEM_COLORS.has(word.toLowerCase()),
  )
}

/** CSS text (a .css file or a <style> block): declarations only, comments removed. */
function scanCss(file: string, source: string, css: string, offset: number, out: Finding[]): void {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
  const declaration = /(?:^|[;{\s])(-?[a-zA-Z-]+)\s*:\s*([^;{}]+)/g
  for (const match of stripped.matchAll(declaration)) {
    const [, property, value] = match
    if (property!.startsWith('--')) continue
    // A selector like `a:hover {` also matches `prop: value`; values of real declarations
    // never end at `{`, so check what follows.
    const end = match.index! + match[0].length
    if (stripped[end] === '{') continue
    for (const word of namedIn(value!)) {
      out.push({
        file,
        line: lineOf(source, offset + match.index!),
        rule: 'named',
        text: `${property}: ${value!.trim()} (${word})`,
      })
    }
  }
}

export interface ScanOptions {
  /** Files allowed to name palette slots (the theme loader's mapping). */
  allowSlots?: boolean
}

export function scanSource(file: string, source: string, options: ScanOptions = {}): Finding[] {
  const out: Finding[] = []
  for (const m of source.matchAll(HEX))
    out.push({ file, line: lineOf(source, m.index!), rule: 'hex', text: m[0] })
  for (const m of source.matchAll(FUNCTION))
    out.push({ file, line: lineOf(source, m.index!), rule: 'function', text: m[0] })
  if (!options.allowSlots) {
    for (const m of source.matchAll(SLOT))
      out.push({ file, line: lineOf(source, m.index!), rule: 'slot', text: m[0] })
  }

  if (file.endsWith('.css')) scanCss(file, source, source, 0, out)
  if (file.endsWith('.vue')) {
    for (const m of source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
      scanCss(file, source, m[1]!, m.index! + m[0].indexOf('>') + 1, out)
    }
    for (const m of source.matchAll(/\sstyle="([^"]*)"/g)) {
      for (const word of namedIn(m[1]!))
        out.push({
          file,
          line: lineOf(source, m.index!),
          rule: 'named',
          text: `style="${m[1]}" (${word})`,
        })
    }
  }
  if (/\.(ts|vue|js|mjs)$/.test(file)) {
    for (const m of source.matchAll(STYLE_KEY)) {
      for (const word of namedIn(m[2]!))
        out.push({ file, line: lineOf(source, m.index!), rule: 'named', text: `${m[0]} (${word})` })
    }
    // A bare string that is nothing but a color name: 'white', "Red".
    for (const m of source.matchAll(/(['"`])([a-zA-Z]+)\1/g)) {
      if (NAMED_COLORS.has(m[2]!.toLowerCase()))
        out.push({ file, line: lineOf(source, m.index!), rule: 'named', text: m[0] })
    }
  }
  return out
}
