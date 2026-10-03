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

1. `npm install -D @logan-robbins/smartypants` (skip if it is already installed; use
   `npm install <path>` for a local checkout).
2. Pick the builder model for the harness you are running in, then run
   `npx smartypants init [--flavor <flavor>]`. It writes `smartypants.config.json` and hooks for
   Claude Code, Codex, Pi, Muse, and Grok without touching other hooks. On an existing codebase it
   also starts a background catch-up that draws the whole system from the code. Keep an existing
   config.

   | you are running in | flavor | how it connects |
   |---|---|---|
   | Claude Code | `claude` (default, no flag) | runs this machine's `claude` CLI headless, so it signs in exactly the way Claude Code does: `ANTHROPIC_API_KEY`, Bedrock / Vertex / Foundry, a gateway on `ANTHROPIC_BASE_URL`, or the `claude` login. Nothing to configure. |
   | Codex | `--flavor codex` | OpenAI Agents SDK, `OPENAI_API_KEY` |
   | Pi | `--flavor pi` | Pi's own session and models |
   | Grok | `--flavor grok` | `XAI_API_KEY` |
   | Muse / Meta | `--flavor meta` | Muse Spark on api.meta.ai, `META_API_KEY` |

   Any harness can keep the `claude` default if Claude Code is installed and signed in on this
   machine. Check with `claude --version`; if it is missing, use the row for your harness. If the
   hook later logs `Not logged in`, the user runs `claude` once and signs in, or exports
   `ANTHROPIC_API_KEY`. `"model"` in the config pins a Claude model; otherwise Claude Code's
   default for that sign-in is used.
3. Tell the user about Jev (optional, recommended). Jev answers the small per-turn questions (is
   this turn worth remembering, does this diff conform) in about 0.2 s for a fraction of a cent, so
   Claude only runs when there is something to write. Without a key, Claude answers those questions
   too (about 3 s and 1–2 cents each). To get a key:
   1. Sign in at https://console.typesafe.ai/keys and create an API key.
   2. Make it visible to the hook as `TYPESAFE_API_KEY`: export it in the shell profile that
      starts the agent, put it in a dotenv file and set `"envFile"` in `smartypants.config.json`,
      or (Claude Code plugin) enter it in the plugin's "Typesafe (Jev) API key" setting.
   3. Restart the agent session so the hook sees it.

   Never print, echo, or ask for key values in chat.
4. `npx smartypants serve` in the background; give the user the URL it prints (it takes the next
   free port if 4173 is busy; reuse a server already running for this project).
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
