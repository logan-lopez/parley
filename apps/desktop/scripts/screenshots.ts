// Screenshots of the gallery for the guide and the README: every fixture (or
// the ones named) through the real card, in light and dark, at 2x, headless.
// WebKit, because the window is WKWebView.
//
//   pnpm --filter @parley/desktop screenshots [fixture...]
//
// Writes docs/guide/images/cards/<fixture>-<light|dark>.png. The frame is the
// window's 440 x 600, so a long card is cut where the window would scroll it.

import { mkdir, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { webkit } from 'playwright'
import { createServer } from 'vite'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixturesDir = resolve(desktop, '../../packages/protocol/fixtures')
const outDir = resolve(desktop, '../../docs/guide/images/cards')
const SOURCE = 'claude-code · parley'
const THEMES = ['light', 'dark'] as const

const all = (await readdir(fixturesDir)).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort()
const wanted = process.argv.slice(2)
const unknown = wanted.filter((name) => !all.includes(name))
if (unknown.length) {
  console.error(`unknown fixture: ${unknown.join(', ')}\nfixtures: ${all.join(', ')}`)
  process.exit(1)
}
const names = wanted.length ? wanted : all

// Its own port, so it runs beside `pnpm app`; no HMR, which the dev CSP only
// allows on 1420 and 1421.
const server = await createServer({
  root: desktop,
  logLevel: 'warn',
  server: { port: 1430, strictPort: false, hmr: false },
})
await server.listen()
const base = server.resolvedUrls!.local[0]!

await mkdir(outDir, { recursive: true })
const browser = await webkit.launch()
try {
  for (const theme of THEMES) {
    const page = await browser.newPage({ colorScheme: theme, deviceScaleFactor: 2, viewport: { width: 600, height: 760 } })
    for (const name of names) {
      const url = new URL(base)
      url.search = new URLSearchParams({ gallery: '', fixture: name, source: SOURCE }).toString()
      await page.goto(url.href)
      const frame = page.locator('.gallery-frame')
      await frame.locator('.card').waitFor()
      await page.evaluate(() => document.fonts.ready)
      const path = resolve(outDir, `${name}-${theme}.png`)
      await frame.screenshot({ path, animations: 'disabled' })
      console.error(`${name}-${theme}.png`)
    }
    await page.close()
  }
} finally {
  await browser.close()
  await server.close()
}
