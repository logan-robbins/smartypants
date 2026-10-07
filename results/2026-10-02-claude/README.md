# Claude as the default builder, Jev selecting

> **Selector default changed in [2026-10-07-sonnet-decider](../2026-10-07-sonnet-decider/README.md):**
> Claude Sonnet 5.5 at high effort now answers the per-turn menus by default; Jev is the
> alternative (`"decider": "jev"`). The builder results below still hold.

Date: 2026-10-02. The builder (the writer) is Claude, called through the host's own Claude Code
CLI in headless mode (`claude -p`, no tools, no settings, no MCP, no saved session), so it signs in
the way that Claude Code does. No model was pinned, so Claude Code's default for the session's sign-in
answered (`claude-opus-5-5` / `claude-sonnet-5-5`). The selector is Typesafe Jev (`jev-latest`) or,
without a Jev key, Claude answering the same menus at low effort.

## End-to-end Stop hook (`turnend-e2e.md`)

Eleven labeled agent changes to the shop-monorepo example, two reps, each in a fresh git copy.
The selector picks which changed files to check, Claude writes the drift note, and a turn counts
as flagged only if a flag lands on the diagram.

| selector (writer: Claude) | drift flag right | missed drift | false flags | p50 hook time | errors |
|---|---:|---:|---:|---:|---:|
| Jev | **22/22** | 0 | 0 | **7.3 s** | 0 |
| Claude | 22/22 | 0 | 0 | 9.7 s | 0 |

## Held-out triage, Claude as the selector (`triage-holdout.md`)

| | Claude | Jev (2026-09-27, per rep) | local rules |
|---|---:|---:|---:|
| 4-way triage, 34 turns | 31/34 | 29/34 | 18/34 |
| keep vs skip | 34/34 | 33/34 | 23/34 |
| false skips (lost information) | 0 | 0 | — |
| drift verdicts, 10 edits | 8/10, 0 missed | 26/30 over 3 reps, 0 missed | 6/10 |
| p50 per decision, sequential | ~2.9 s | ~0.18 s | ~10 ms |
| selector cost, 39 calls | $0.59 | a fraction of a cent | $0 |

Claude is a slightly more accurate selector, but it is ~16× slower and costs ~1.5¢ per decision
against Jev's fraction of a cent. That is the pairing: Jev selects, Claude writes.

## Design turn, live

A design turn ("an API service writes links to Postgres, a Redis cache serves redirects, a click
worker reads click events from Kafka") drew seven parts with readable names in one Claude call:
14–15 s and $0.04–0.07. "thanks, looks good" was skipped by the local pass with no model call.

## Reproduce

```sh
node eval/turnend.mjs --e2e --deciders jev,claude --writer claude --reps 2 --out results/2026-10-02-claude
node eval/triage.mjs --deciders claude --out results/2026-10-02-claude
```
