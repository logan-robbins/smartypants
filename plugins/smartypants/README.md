# Smartypants plugin

Keeps a system, component, and module diagram while an agent codes, and flags where the code leaves the request.

The hook is the npm package. The skill in this folder tells the agent to install it.

```sh
npm install github:logan-robbins/smartypants
npx smartypants init --flavor claude
npx smartypants serve
```

`/smartypants reset` and `/reset-graph` clear the diagram and the gist ledger. They leave `smartypants.config.json`.

Install this plugin from https://github.com/logan-robbins/smartypants. The repository README has the host commands.
