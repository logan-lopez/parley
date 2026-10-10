// The card for MCP Apps hosts: the desktop app's single-file build of
// src/mcp-app/. `pnpm --filter @parley/server build` copies it next to
// dist/index.mjs. From source (tsx) it's read where the desktop build leaves
// it; both src/ and dist/ sit two levels under apps/.

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const CARD_URI = 'ui://parley/card.html'

const CANDIDATES = [
  new URL('./card.html', import.meta.url),
  new URL('../../desktop/dist-mcp-app/mcp-app.html', import.meta.url),
].map((url) => fileURLToPath(url))

// Read on every request, so a rebuilt card needs no server restart. Throws a
// readable error when there's no build, which the client sees on
// `resources/read`; the server itself starts either way.
export async function readCard(): Promise<string> {
  const path = CANDIDATES.find((p) => existsSync(p))
  if (!path) {
    throw new Error(
      `Parley's inline card isn't built. Run \`pnpm --filter @parley/server build\` (looked in ${CANDIDATES.join(' and ')}).`,
    )
  }
  return readFile(path, 'utf8')
}
