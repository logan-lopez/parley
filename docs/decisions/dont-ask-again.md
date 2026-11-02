---
description: "A per-question \"Don't ask again here\" toggle; the agent drafts a standing line for AGENTS.md and saves it only after Logan accepts the draft; Parley never answers on his behalf"
decided: 2026-11-01
by: "Logan"
covers: ["docs/architecture/form-spec.md", "docs/architecture/ask-tool.md", "docs/architecture/card-ui.md"]
---
# Don't ask again

## Choice

Choice and boolean questions in the window get a "Don't ask again here" toggle. The answer goes
back as usual, with `remember` listing the toggled question ids, and the result tells the agent to
draft one line for the project's `AGENTS.md` (or `CLAUDE.md`), show it to Logan as a `text` draft,
and save it only if he accepts it. Parley doesn't match later asks against earlier answers and
never answers for him.

## Why

15 choice questions with the same option set were asked in three or more sessions between
2026-10-10 and 11-01 ("Commit / Not yet" 17 times, never "Not yet"), and 61% of answered asks
changed nothing. A standing permission belongs in the project's instructions, which every agent
reads, not in Claude Code memory (other agents can't see it) or in Parley's guesswork (asks are
worded differently each time). Logan curates `AGENTS.md`, so the line goes through a draft he
approves. From the ideate of 2026-11-01; built in [brief 21](../briefs/21-dont-ask-again.md).
