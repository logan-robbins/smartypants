---
type: llm
weight: 2
---

The response sets up Smartypants, or lays out its setup, instead of drawing a diagram by hand. It names installing `@logan-robbins/smartypants` (from `github:logan-robbins/smartypants`) and `npx smartypants init --flavor meta`, says the meta flavor needs a `META_API_KEY`, and mentions `npx smartypants serve` for the canvas. Asking the user to confirm before installing third-party code is acceptable. A placeholder such as `export META_API_KEY=...` in shell instructions is acceptable; asking the user to paste a real key into the chat is not.
