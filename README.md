# Smartypants

Keep a system diagram while an agent codes. Flag where the code leaves the request.

![Smartypants system diagram](diagram.png)

The hook does nothing until `smartypants.config.json` is in the project root.

## Start

1. Install the package in the project.

```sh
npm install github:logan-robbins/smartypants
```

The package name is `@logan-robbins/smartypants`. The npm name `smartypants` belongs to a different library.

2. Wire the config and the host hooks. This writes `smartypants.config.json` when it is missing, and adds the hook without removing other hooks.

```sh
npx smartypants init --flavor claude
```

Use `--seed` when the project already has code. Use `--flavor` `claude`, `codex`, `grok`, `muse`, or `pi`.

3. Edit `smartypants.config.json` if you need to change the starter.

```json
{
  "flavor": "claude",
  "depth": "module",
  "seed": false,
  "model": null,
  "reasoningEffort": null
}
```

- `flavor`: `claude`, `codex`, `grok`, `muse`, or `pi`. Use one. An unknown value does not call another.
- `depth`: `module` (default), `component`, or `system`.
- `seed`: `true` when the project already has code. The first turn draws that tree as the baseline. Later turns store only the delta. `false` when the design starts from the conversation.
- `model`: optional model ID for the selected flavor.
- `reasoningEffort`: optional reasoning effort for the Codex flavor: `none`, `low`, `medium`, `high`, `xhigh`, or `max`.

4. Install the SDK for that flavor.

| flavor | install | key |
| --- | --- | --- |
| `claude` | `@anthropic-ai/claude-agent-sdk` | `ANTHROPIC_API_KEY` |
| `codex` | `@openai/agents` | `OPENAI_API_KEY` |
| `grok` | `openai`, base URL `https://api.x.ai/v1` | `XAI_API_KEY` |
| `muse` | `@muse-code/sdk` plus a `muse` binary on `PATH` | |
| `pi` | `@earendil-works/pi-coding-agent` | Pi's own login |

5. `npx smartypants init` writes these host files. Run it again after you move `node_modules`. Codex hooks need the `codex_hooks` feature and do not run on Windows. Pi loads `.pi/extensions/smartypants/index.js`.

| host | file |
| --- | --- |
| Claude Code | `.claude/settings.json` |
| Codex | `.codex/hooks.json` |
| Grok Build | `.grok/hooks/smartypants.json` |
| Muse Code | `.muse/hooks.json` |
| Pi | `.pi/extensions/smartypants/index.js` |

6. Open the diagram.

```sh
npx smartypants serve
```

Clear the diagram and start it over with `/reset-graph` or:

```sh
npx smartypants reset
```

Open http://127.0.0.1:4173. Drag a card to move that card. Drag empty space to pan. Scroll to zoom.

Teal arrows are data. Amber arrows are control. Gray lines show what sits inside what.

- Hosts send a prompt or an edit to the chosen model.
- Switch sends flavor and depth.
- Notes send gists. The chosen model writes a new gist back.
- Starting picture sends file names when `seed` is on.
- The chosen model writes the design into Picture, and Picture sends the diagram to the Board.
- While that turn is drawing, control tells Quiet turn not to start another one.

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
