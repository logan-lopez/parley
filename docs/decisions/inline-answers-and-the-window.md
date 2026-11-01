---
description: "The window races the card quietly (no notification)"
decided: 2026-10-10
covers: ["docs/architecture/inline-cards.md", "docs/architecture/asks-and-history.md"]
---
# Inline answers and the window

## Choice

The window races the card quietly (no notification). The server sends an inline answer to the app (`resolved`), and history records it as answered in the chat.

## Why

The user already sees the card. History stays complete (2026-10-10).
