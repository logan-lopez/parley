---
expect: no-ask
reply: first
---
`fromCents` in `src/utils/money.ts` gets negative amounts wrong: -5 cents prints as `$0.05` and -150 as `$-1.50`. They should print as `-$0.05` and `-$1.50`. Fix it.
