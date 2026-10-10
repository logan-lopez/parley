import { defineConfig } from 'tsdown'

// Bundles @parley/protocol in, so dist/index.mjs runs standalone, and ships
// the inline card (the desktop app's single-file MCP Apps build, which the
// `build` script makes first) next to it as dist/card.html.
export default defineConfig({
  entry: ['src/index.ts'],
  platform: 'node',
  format: 'esm',
  deps: { alwaysBundle: ['@parley/protocol'] },
  copy: [{ from: '../desktop/dist-mcp-app/mcp-app.html', rename: 'card.html' }],
})
