// Renders the icon sources in icons/ to the PNGs the app is built with, in
// headless WebKit (transparent background).
//
//   pnpm --filter @parley/desktop icons
//
// parley.svg -> a 1024 PNG -> `tauri icon`, which writes src-tauri/icons/.
// tray.svg -> src-tauri/icons/tray.png at 2x (36 x 36), embedded by tray.rs.

import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { webkit } from 'playwright'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = (name: string) => resolve(desktop, 'icons', name)
const out = resolve(desktop, 'src-tauri/icons')

async function render(svgPath: string, size: number, scale: number, path: string) {
  const svg = await readFile(svgPath, 'utf8')
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: scale })
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`)
  await page.locator('svg').screenshot({ path, omitBackground: true })
  await page.close()
}

const tmp = await mkdtemp(join(tmpdir(), 'parley-icons-'))
const browser = await webkit.launch()
try {
  const app = join(tmp, 'parley.png')
  await render(src('parley.svg'), 1024, 1, app)
  await render(src('tray.svg'), 18, 2, join(out, 'tray.png'))
  execFileSync('pnpm', ['tauri', 'icon', app, '--output', out], { cwd: desktop, stdio: ['ignore', 2, 2] })
  // macOS only: drop the mobile sets `tauri icon` also writes.
  await rm(join(out, 'android'), { recursive: true, force: true })
  await rm(join(out, 'ios'), { recursive: true, force: true })
  console.error('icons written to src-tauri/icons/')
} finally {
  await browser.close()
  await rm(tmp, { recursive: true, force: true })
}
