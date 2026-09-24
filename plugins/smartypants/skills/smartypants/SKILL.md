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
2. For an agent working in this project, run `npx smartypants init --flavor <host>`. `<host>` is the agent you are running in: `claude`, `codex`, `grok`, `muse`, or `pi`. Add `--seed` only when the project already has code and `.smartypants/design.json` is not seeded. When only watching another instance, write the project config with `flavor`, `depth`, `seed`, and `watch` instead; do not install project hooks.
3. Leave an existing `smartypants.config.json` in place. Set `depth` to `module` unless the user names `component` or `system`.
   When the user supplies a dotenv file, set `envFile` to its path relative to the project.
4. When the user wants to see the diagram, run `npx smartypants serve` and open http://127.0.0.1:4173.
   If that port belongs to another project, use a free port with `SMARTPANTS_PORT` and report
   the actual URL. Reuse an existing server for this project when one is already running.

When the user wants to document a separate Claude Code or Codex instance, add `watch`
to the working project's `smartypants.config.json`: `{"host":"claude","home":"/absolute/claude-home"}`
or `{"host":"codex","home":"/absolute/codex-home"}`. The canvas server reads new user
turns from that home's session transcripts. To watch one session, use an absolute
`session` JSONL path in place of `home`. `watch.host` is the transcript format;
`flavor` chooses the diagram builder. Restart the server after changing `watch`. The
watched instance needs no Smartypants hook or plugin setting.

For an hx Partner, the Claude home is `<hx-instance>/run/partner/home`. Tell the Partner
the project's absolute path for future work. Verify both UI URLs, the Partner's `main`
and `companion` windows, and the Smartypants server's watched-home log. Prefer the hx
instance outside the product project; if it is nested, do not turn on `--seed` based
on harness files. A greeting may be observed without adding diagram nodes. Never
print dotenv values while checking the setup.

## Reset the graph

When the user runs `/smartypants reset` or `/reset-graph`, or asks to clear the diagram, run `npx smartypants reset` in the project root. That deletes `.smartypants/design.json` and `.smartypants/ledger.json`. Leave `smartypants.config.json`. Do not ask again after the slash command. Tell them the graph is empty and the next design turn draws it again.
