---
name: smartypants
description: >
  Turn on or update Smartypants, the hook that diagrams a system at
  system, component, and module depth and flags code that leaves the
  user's intent. Use when the user says smartypants, system diagram,
  seed the design, intent drift, or runs /smartypants.
  /smartypants reset clears the diagram.
user-invocable: true
argument-hint: reset
---

# Smartypants

Follow `README.md` in this repo for startup. Do the steps. Do not ask the user to run them.

1. In the project, run `npm install github:logan-robbins/smartypants` if `@logan-robbins/smartypants` is not installed.
2. Run `npx smartypants init --flavor <host>`. Add `--seed` only when the project already has code and `.smartypants/design.json` is not seeded. `flavor` is `claude`, `codex`, `grok`, `muse`, or `pi`.
3. Leave an existing `smartypants.config.json` in place. Set `depth` to `module` unless the user names `component` or `system`.
4. When the user wants to see the diagram, run `npx smartypants serve` and use http://127.0.0.1:4173.

## Reset the graph

When the user runs `/smartypants reset` or `/reset-graph`, or asks to clear the diagram, run `npx smartypants reset` in the project root. That deletes `.smartypants/design.json` and `.smartypants/ledger.json`. Leave `smartypants.config.json`. Do not ask again after the slash command. Tell them the graph is empty and the next design turn draws it again.

## Write the diagram

Use `applyDesign` and `saveDesign` from `src/model.js`. Do not hand-edit `.smartypants/design.json`.

- **system**: the application a person would name.
- **component**: one job other parts can use without its internals. Not a file or a function.
- **module**: one slice of that job, inside exactly one component. Not a file, class, function, or endpoint.
- Every node needs `what` and `why`. They must not be the same sentence.

Record history with `rememberTurn` from `src/ledger.js`. Pass a short gist. Do not store a transcript.

## Hook rules

- Missing config: do nothing.
- Unknown flavor: do not call another flavor.
- Exit 0. Do not block or rewrite the user turn.
- Builder failure: leave the previous design.
- The same result twice: do not duplicate nodes.
- Drift: one flag with the intent and how the code differs. Keep unmapped drift.
