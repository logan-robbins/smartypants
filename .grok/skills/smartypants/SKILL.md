---
name: smartypants
description: >
  Turn on or update Smartypants, the hook that diagrams a system at
  system, component, and module depth and flags code that leaves the
  user's intent. Use when the user says smartypants, system diagram,
  seed the design, intent drift, or runs /smartypants.
---

# Smartypants

Follow `README.md` in this repo for startup. Do the steps. Do not ask the user to run them.

1. If `smartypants.config.json` is missing, copy `smartypants.config.example.json` to that name.
2. Set `flavor` to the host in use: `claude`, `codex`, `grok`, `muse`, or `pi`. Set `depth` to `module` unless the user names `component` or `system`. Set `seed` to `true` only when the project already has code and `.smartypants/design.json` is not seeded.
3. Confirm the host hook points at `bin/smartypants-hook.mjs`. Pi uses `.pi/extensions/smartypants/index.js`.
4. When the user wants to see the diagram, run `node bin/smartypants-serve.mjs` and use http://127.0.0.1:4173.

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
