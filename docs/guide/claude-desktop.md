# From Claude Desktop

In Claude Desktop the question appears as a card right in the chat, and in the Parley window at
the same time. Answer in whichever is closer; the first answer wins.

**Covers:** [Inline cards (show, then wait)](../architecture/inline-cards.md)

## What you see

The agent asks, and a card shows up in the conversation: the same card as the window's, in
Desktop's colors and fonts, sized to its content. It works the same way, keys included, except
there's no Esc to hide and no zoom ([Answering a card](answering.md)). Links open in your browser.

The same ask also waits in the Parley window, quietly: no notification, since it's already in
front of you. The tray count still includes it.

- **Answer in the chat,** and the agent gets that answer. The window's card is withdrawn with
  "Answered in the chat", and history records it as answered in the chat.
- **Answer in the window,** and the chat's card turns into a record of how it ended ("Answered in
  Parley.").
- **Skip** in either place works the same way.
- **Stop the chat** while it waits, and the ask is cancelled: the window shows "Withdrawn by the
  agent."

Behind the scenes the agent asks in two steps (it shows the card, then waits for your answer in
stretches of a few minutes), so you may see several "waiting" calls in the chat during a long ask.
That's normal.

## Path questions

The chat's card can't open a file picker. An ask with a path question shows in the chat read-only,
with a pointer to the Parley window, and the window notifies for it as usual. Answer it there.

## Things to know

- Desktop caches the card when it starts Parley's server. After rebuilding Parley's server, quit
  and reopen Desktop to get the new card.
- If Parley's window app isn't running and can't be launched, the chat's card still works on its
  own (except for path questions).
- If the agent ends its turn without waiting for your answer, an answer you give in the card
  doesn't reach the chat. It's rare; if it happens, tell the agent in the chat.
- Only Claude Desktop shows inline cards. claude.ai on the web and ChatGPT can't reach a server on
  your Mac.
