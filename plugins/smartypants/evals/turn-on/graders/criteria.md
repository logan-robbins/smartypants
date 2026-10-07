---
type: llm
weight: 2
---

The response sets up Smartypants, or lays out its setup, instead of drawing a diagram by hand. It names installing `@logan-robbins/smartypants` and `npx smartypants init` (with no flavor, or the flavor for the harness it runs in), says the default builder is Claude through this machine's Claude Code sign-in so no model key is needed, notes that Claude Sonnet 5.5 answers the per-turn questions by default with Typesafe Jev as an optional alternative (key from console.typesafe.ai/keys as `TYPESAFE_API_KEY`, plus `"decider": "jev"`), and mentions `npx smartypants serve` for the canvas. Asking the user to confirm before installing third-party code is acceptable. A placeholder such as `export TYPESAFE_API_KEY=...` in shell instructions is acceptable; asking the user to paste a real key into the chat is not.
