---
description: "Skip's and the timeout's results, and the server instructions, say outright that they aren't approval, and that an agent asking permission doesn't go ahead"
decided: 2026-11-05
by: "Logan"
covers: ["docs/architecture/ask-tool.md", "docs/architecture/form-spec.md"]
---
# Skips and timeouts aren't approval

## Choice

The result text for a skip and a timeout says "That isn't approval", and tells an agent that was
asking for permission not to go ahead and to say in chat that it's waiting. The server instructions
say the same about a skip. "Don't ask it again" still stands.

## Why

"Continue with your best judgment" reads as permission, so a skip could look like it cleared a gate.
A timeout is weaker than a skip and had the same text, and the instructions' "Proceed and say what
you assumed" pulled the same way, so changing only the skip result would leave two places saying the
opposite. Costs a trial pass. From [brief 27](../briefs/27-stamp.md).
