// The contract between the MCP server and the desktop app. Source-only:
// consumers import the .ts directly (Vite and tsdown both handle it).
// The ask tool's schema and compiler are a separate entry, `@parley/protocol/ask`,
// so the app's bundle doesn't pull in Zod.

export * from './form.ts'
export * from './wire.ts'
