---
name: smartypants
description: Keep a live, layered architecture diagram of this project while you code — drawn from the conversation, caught up from existing code and infra (Helm, k8s, compose, Terraform), reviewed for drift at the end of every turn. Use when the user says smartypants, architecture/system diagram, design interview, "go deeper on X", intent drift, or runs /smartypants.
user-invocable: true
argument-hint: "[open | deeper <part> | catchup | review | intent | drift | mermaid | reset]"
---

# Smartypants

Set it up and run it yourself. If you cannot run commands here, give the user the exact
commands below instead of drawing a diagram by hand.

## Turn it on (no argument)

1. `npm install github:logan-robbins/smartypants` (skip if `@logan-robbins/smartypants` is installed;
   use `npm install <path>` for a local checkout).
2. `npx smartypants init` — writes `smartypants.config.json` and hooks for Claude Code, Codex, Pi,
   Muse, and Grok without touching other hooks. On an existing codebase it also starts a background
   catch-up that draws the whole system from the code. Keep an existing config.
3. The default builder needs `META_API_KEY`. If the user keeps keys in a dotenv file, set `envFile`
   in the config. Never print, echo, or ask for key values in chat.
4. `npx smartypants serve` in the background; give the user the printed URL (use `SMARTPANTS_PORT`
   if 4173 is taken; reuse a server already running for this project).
5. Codex users must approve the Smartypants hooks once in Codex's startup hooks review.

## Arguments

| argument | run | then |
|---|---|---|
| `open` | start or reuse `npx smartypants serve` | give the URL |
| `deeper <part>` | `npx smartypants deeper "<part>"` | report the line it prints |
| `catchup` | `npx smartypants catchup` | say it runs in the background; progress is on the canvas |
| `review` | `npx smartypants review` | one line per diverging file |
| `intent` | `npx smartypants intent` | show as a code block |
| `drift` | `npx smartypants drift` | one line per flag: part, intended, actual |
| `mermaid` | `npx smartypants mermaid` | show a ```mermaid block |
| `reset` | `npx smartypants reset` | the next design turn redraws; do not ask to confirm |

In chat, "go deeper on the cache" works without a command. Do not edit project code for any of
these.
