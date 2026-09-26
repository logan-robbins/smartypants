---
name: smartypants
description: Turn on Smartypants so a coding agent keeps a Mermaid-style system diagram (system, component, module), a compact IntentCode memory of the user's architectural intent, and drift flags where the code leaves that intent. Use when the user says smartypants, system diagram, architecture diagram, design interview, go deeper on a part, intent drift, or runs /smartypants.
user-invocable: true
argument-hint: "[reset | deeper <part> | intent | drift | mermaid | open]"
---

# Smartypants

Smartypants watches the conversation and the edits in this project. A free local
triage and a Jev-style selector decide what each turn is worth; only turns that
change the design reach the builder (Meta Muse Spark 1.3 Contributor by default).

## Turn it on

Do the steps. Do not ask the user to run them. If you cannot run commands in this session, give the user the exact commands below, in order, instead of drawing a diagram yourself.

1. Install the package in the project unless `@logan-robbins/smartypants` is already installed:
   `npm install github:logan-robbins/smartypants` (or `npm install <path>` for a local checkout).
2. Run `npx smartypants init --flavor meta`. Use another builder flavor only when the user asks:
   `claude`, `codex`, `grok`, `muse`, or `pi`. Add `--seed` when the project already has code and
   `.smartypants/design.json` is not seeded. An existing `smartypants.config.json` is kept.
3. The `meta` flavor needs `META_API_KEY` (Meta Model API). The selector uses Jev when
   `TYPESAFE_API_KEY` is set, otherwise Muse Spark, otherwise local rules. When the user has a
   dotenv file, set `envFile` in the config to its path relative to the project. Never print keys.
4. Codex only runs project hooks after the user approves them in the startup hooks review;
   tell Codex users to approve the Smartypants hooks once.
5. To show the diagram, run `npx smartypants serve` in the background and give the printed URL
   (use `SMARTPANTS_PORT` when 4173 is taken; reuse a server already running for this project).

## Arguments

- `deeper <part>`: run `npx smartypants deeper "<part>"`. Report the line it prints.
- `intent`: run `npx smartypants intent` and show it as a code block.
- `drift`: run `npx smartypants drift` and summarize each flag in one line.
- `mermaid`: run `npx smartypants mermaid` and show a ```mermaid block.
- `open`: start or reuse the canvas server and give the URL.
- `reset`: run `npx smartypants reset`. Do not ask again. Tell the user the next design turn redraws.

The user can also just say "go deeper on the cache" in chat: the hook handles it.

## Watching another agent

To diagram a separate Claude Code or Codex instance, add `"watch": {"host": "claude", "home": "/absolute/claude-home"}`
(or `"host": "codex"`) to `smartypants.config.json`, or `"session": "/absolute/session.jsonl"` for one session.
Restart the server after changing `watch`. The watched instance needs no hook.
