---
name: smartypants
description: Turn on Smartypants so a coding agent keeps a system, component, and module diagram and flags code that leaves the user's intent. Use when the user says smartypants, system diagram, seed the design, intent drift, or runs /smartypants or /smartypants reset.
user-invocable: true
argument-hint: reset
---

# Smartypants

Install and run Smartypants in the project the user is working in. Do the steps. Do not ask the user to run them.

1. If the user supplied a local `smartypants/` checkout, install it into the project with
   `npm install <path-to-smartypants>`; otherwise run `npm install github:logan-robbins/smartypants`.
   Skip installation when `@logan-robbins/smartypants` is already installed.
2. Run `npx smartypants init --flavor <host>`. `<host>` is the agent you are running in: `claude`, `codex`, `grok`, `muse`, or `pi`. Add `--seed` only when the project already has code and `.smartypants/design.json` is not seeded.
3. Leave an existing `smartypants.config.json` in place. Set `depth` to `module` unless the user names `component` or `system`.
   When the user supplies a dotenv file, set `envFile` to its path relative to the project.
4. When the user wants to see the diagram, run `npx smartypants serve` and open http://127.0.0.1:4173.
   If that port belongs to another project, use a free port with `SMARTPANTS_PORT` and report
   the actual URL. Reuse an existing server for this project when one is already running.

When Smartypants is paired with an hx Partner, remember that the Partner runs in its isolated
instance directory. Write `<hx-instance>/config/smartypants.json` with absolute
`project_root` and `hook_script` paths so the Partner's `UserPromptSubmit` hook targets the
project diagram. Reload the idle Partner so its home settings pick up the hook. Tell the
Partner the project's absolute path for future work.

## Reset the graph

When the user runs `/smartypants reset` or `/reset-graph`, or asks to clear the diagram, run `npx smartypants reset` in the project root. That deletes `.smartypants/design.json` and `.smartypants/ledger.json`. Leave `smartypants.config.json`. Do not ask again after the slash command. Tell them the graph is empty and the next design turn draws it again.
