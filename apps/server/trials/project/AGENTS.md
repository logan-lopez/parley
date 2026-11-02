# AGENTS.md

- Node 24 runs the TypeScript directly (`node src/index.ts`); there's no build step.
- Money is integer cents everywhere. Convert at the edges with `fromCents` and `toCents` in
  `src/utils/money.ts`.
