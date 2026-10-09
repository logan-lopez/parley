import { defineConfig } from 'tsdown'

// Bundles @parley/protocol in, so dist/index.mjs runs standalone.
export default defineConfig({
  entry: ['src/index.ts'],
  platform: 'node',
  format: 'esm',
  noExternal: ['@parley/protocol'],
})
