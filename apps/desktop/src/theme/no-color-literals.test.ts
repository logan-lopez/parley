import { describe, expect, test } from 'vitest'
import { scanSource, type Finding } from './color-literals'

/** Everything that renders or styles the window and the card, by path from apps/desktop. */
const sources = {
  ...import.meta.glob<string>('../**/*.{vue,ts,css,js}', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob<string>('../../*.html', { query: '?raw', import: 'default', eager: true }),
}
// Glob keys are relative to this folder: ./x is src/theme/x, ../x is src/x, ../../x is apps/desktop's.
const fromRoot = (key: string) =>
  key.startsWith('../../') ? key.slice(6) : key.startsWith('../') ? `src/${key.slice(3)}` : `src/theme/${key.slice(2)}`
const SCANNED = Object.entries(sources).map(([key, text]) => [fromRoot(key), text] as const)
/** src/theme/ is the one place colors live. */
const ALLOWED = 'src/theme/'
/** Tests: their colors are model text under test (forms/markdown.test.ts), not styles. */
const TEST = /\.test\.ts$/

describe('the scanner catches what it must', () => {
  const cases: [string, string, string, Finding['rule']][] = [
    ['short hex in CSS', 'a.css', '.x { color: #fff; }', 'hex'],
    ['long hex in a script', 'a.ts', "const c = '#12aB34'", 'hex'],
    ['hex with alpha', 'a.css', '.x { background: #12345678 }', 'hex'],
    ['rgb()', 'a.css', '.x { color: rgb(0 0 0) }', 'function'],
    ['rgba() in a script', 'a.ts', "x.style.color = 'rgba(0,0,0,.5)'", 'function'],
    ['hsl()', 'a.vue', '<style>.x { color: hsl(10 20% 30%) }</style>', 'function'],
    ['oklch()', 'a.css', '.x { color: oklch(70% 0.1 200) }', 'function'],
    ['named color in CSS', 'a.css', '.x { border: 1px solid black; }', 'named'],
    ['named color in a <style> block', 'a.vue', '<template/><style scoped>\n.x {\n  background: White;\n}\n</style>', 'named'],
    ['system color in CSS', 'a.css', '.x { color: CanvasText }', 'named'],
    ['named color in a style attribute', 'a.vue', '<div style="color: red"></div>', 'named'],
    ['named color in a style object', 'a.ts', "el.style = { backgroundColor: 'white' }", 'named'],
    ['named color as a bare string', 'a.ts', "const c = 'tomato'", 'named'],
    ['palette slot in a component', 'a.vue', '<style>.x { color: var(--base0D) }</style>', 'slot'],
  ]
  for (const [what, file, source, rule] of cases) {
    test(what, () => expect(scanSource(file, source).map((f) => f.rule)).toContain(rule))
  }

  const allowed: [string, string, string][] = [
    ['tokens and transparent', 'a.css', '.x { color: var(--text); background: transparent; border: 1px solid var(--border) }'],
    ['color-mix from tokens', 'a.css', ':root { --hover: color-mix(in oklab, var(--text) 7%, transparent); }'],
    ['currentColor', 'a.css', '.x { fill: currentColor }'],
    ['selectors and pseudo-classes', 'a.vue', '<style>\n.a:hover,\n.b :deep(.red-herring) {\n  color: var(--accent);\n}\n</style>'],
    ['the highlight token', 'a.css', '.x { color: var(--highlight); background: var(--highlight-subtle) }'],
    ['words in prose and fonts', 'a.vue', '<template><p>Use British spelling</p></template><style>.x { font-family: system-ui, sans-serif; white-space: nowrap }</style>'],
    ['ids that are not colors', 'a.ts', "const id = '#main'; const tag = 'mark'"],
  ]
  for (const [what, file, source] of allowed) {
    test(`allows ${what}`, () => expect(scanSource(file, source)).toEqual([]))
  }
})

test('no color literals outside src/theme/', () => {
  const paths = SCANNED.map(([path]) => path)
  // Guard against scanning nothing: a moved directory would make this pass vacuously.
  expect(paths.length).toBeGreaterThan(10)
  expect(paths).toContain('src/styles.css')
  expect(paths).toContain('index.html')
  expect(paths).toContain('src/forms/renderers/ChoiceRenderer.vue')
  const findings: string[] = []
  for (const [path, text] of SCANNED) {
    if (path.startsWith(ALLOWED) || TEST.test(path)) continue
    for (const f of scanSource(path, text)) findings.push(`${f.file}:${f.line} [${f.rule}] ${f.text}`)
  }
  expect(findings).toEqual([])
})
