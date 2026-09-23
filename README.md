# Smartypants

Keep a system diagram while an agent codes. Flag where the code leaves the request.

![Smartypants system diagram](diagram.png)

The hook does nothing until `smartypants.config.json` is in the project root.

## Start

1. Copy the starter config.

```sh
cp smartypants.config.example.json smartypants.config.json
```

2. Edit `smartypants.config.json`.

```json
{
  "flavor": "claude",
  "depth": "module",
  "seed": false
}
```

- `flavor`: `claude`, `codex`, `grok`, `muse`, or `pi`. Use one. An unknown value does not call another.
- `depth`: `module` (default), `component`, or `system`.
- `seed`: `true` when the project already has code. The first turn draws that tree as the baseline. Later turns store only the delta. `false` when the design starts from the conversation.

3. Install the SDK for that flavor.

| flavor | install | key |
| --- | --- | --- |
| `claude` | `@anthropic-ai/claude-agent-sdk` | `ANTHROPIC_API_KEY` |
| `codex` | `@openai/agents` | `OPENAI_API_KEY` |
| `grok` | `openai`, base URL `https://api.x.ai/v1` | `XAI_API_KEY` |
| `muse` | `@muse-code/sdk` plus a `muse` binary on `PATH` | |
| `pi` | `@earendil-works/pi-coding-agent` | Pi's own login |

4. Point the host at the hook. This repo already has these files. In another project, copy the file and set `command` to `node /absolute/path/to/smartypants/bin/smartypants-hook.mjs`. The working directory must be the project root.

| host | file |
| --- | --- |
| Claude Code | `.claude/settings.json` |
| Codex | `.codex/hooks.json` |
| Grok Build | `.grok/hooks/smartypants.json` |
| Muse Code | `.muse/hooks.json` |
| Pi | `.pi/extensions/smartypants/index.js` |

Codex hooks need the `codex_hooks` feature and do not run on Windows. Pi has no command hook. Start it with `pi -e .pi/extensions/smartypants/index.js`.

5. Open the diagram.

```sh
node bin/smartypants-serve.mjs
```

Open http://127.0.0.1:4173. Drag to pan. Scroll to zoom.

## Levels

- **system**: the whole application a person would name.
- **component**: one job other parts can use without its internals. Not a file or a function.
- **module**: one slice of that job, inside exactly one component. Above files, classes, functions, and endpoints.

Each node has `what` and `why`. Both are required. They are not the same sentence.

## Files

- `smartypants.config.json` — the on switch.
- `.smartypants/design.json` — the diagram.
- `.smartypants/ledger.json` — gists only. Folded near 10000 tokens. Never a transcript.

## Hook rules

- Exit 0. Do not block or rewrite the user turn.
- A builder failure leaves the previous design on disk.
- The same result twice does not add a second copy of a node.
- A drift flag states the intent and how the code differs. Store each divergence once. Keep a divergence that fits no node.
