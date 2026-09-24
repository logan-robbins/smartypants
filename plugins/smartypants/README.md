# Smartypants plugin

Keeps a system, component, and module diagram while an agent codes, and flags where the code leaves the request.

The skill in this folder installs the hook, opens the diagram, and resets the graph. `/smartypants reset` and `/reset-graph` delete `.smartypants/design.json` and `.smartypants/ledger.json`. They leave `smartypants.config.json`.

```sh
npm install github:logan-robbins/smartypants
npx smartypants init --flavor claude
npx smartypants serve
```

The package name is `@logan-robbins/smartypants`. Use `--flavor` `claude`, `codex`, `grok`, `muse`, or `pi`. Add `--seed` when the project already has code. Open http://127.0.0.1:4173.

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
