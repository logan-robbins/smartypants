# Smartypants plugin

Keeps a system, component, and module diagram while an agent codes, and flags where the code leaves the request.

The skill in this folder installs the hook, opens the diagram, and resets the graph. `/smartypants reset` and `/reset-graph` delete `.smartypants/design.json` and `.smartypants/ledger.json`. They leave `smartypants.config.json`.

```sh
npm install -D @logan-robbins/smartypants
npx smartypants init --flavor claude
npx smartypants serve
```

The package name is `@logan-robbins/smartypants`. The default builder is `claude`: this machine's Claude Code CLI, signed in the way Claude Code already is. Use `--flavor` `codex`, `grok`, `meta`, `muse`, or `pi` on a harness without Claude Code. Claude Sonnet 5.5 at high effort answers the per-turn questions by default. Alternative: a Jev key from https://console.typesafe.ai/keys as `TYPESAFE_API_KEY` plus `"decider": "jev"` makes them ~0.2 s. Add `--seed` when the project already has code. Open http://127.0.0.1:4173.

## Install the plugin

Claude Code:

```
/plugin marketplace add logan-robbins/smartypants
/plugin install smartypants@smartypants
```

Codex:

```sh
codex plugin marketplace add logan-robbins/smartypants
codex plugin add smartypants@smartypants
```

Grok Build:

```sh
grok plugin marketplace add logan-robbins/smartypants
grok plugin install smartypants --trust
```

Cursor: submit https://github.com/logan-robbins/smartypants at https://cursor.com/marketplace/publish. This directory is the plugin.

Claude Code, Codex, and Grok Build install from this repository. Two directories still need a signed-in review:

- Anthropic community catalog: https://platform.claude.com/plugins/submit
- OpenAI directory for ChatGPT and Codex: https://platform.openai.com/plugins
