# Claude Sonnet 5.5 as the default selector

Date: 2026-10-07. The selector answers the small per-turn menus (is this turn worth remembering,
does it change the design, does this diff conform). Claude is called through the host's own
Claude Code CLI (`claude -p`, no tools, no settings, no saved session). The writer is Claude
Code's default model for the sign-in.

## Effort sweep: held-out triage, Sonnet 5.5 (`triage-sonnet-*.json`)

34 held-out turns and 10 edits, no builder calls.

| effort | 4-way triage | keep vs skip | false skips | drift verdicts | missed drift | cost, 39 calls |
|---|---:|---:|---:|---:|---:|---:|
| low | 30/34 | 34/34 | 0 | 9/10 | 0 | $0.343 |
| **high (default)** | **32/34** | 34/34 | 0 | 9/10 | 0 | $0.372 |
| xhigh | 32/34 | 34/34 | 0 | 9/10 | 0 | $0.409 |

For comparison on the same set: Claude Code's default model (Opus 5.5) at low effort 31/34,
8/10 drift, $0.594 (`results/2026-10-02-claude`); Jev 29/34 per rep, 0 false skips
(`results/2026-09-27-jev`); local rules 18/34.

`high` matches `xhigh` on accuracy for 9% less, so it is the default. Sequential latency per
decision is ~3 s (2.8–4.7 s) and ~$0.003–0.01, depending on how much state the menu carries.

## End-to-end Stop hook (`turnend-e2e.md`)

Eleven labeled agent changes to the shop-monorepo example, two reps, each in a fresh git copy.
The selector picks which changed files to check, Claude writes the drift note, and a turn counts
as flagged only if a flag lands on the diagram.

| selector (writer: Claude) | drift flag right | missed drift | false flags | p50 hook time | errors |
|---|---:|---:|---:|---:|---:|
| **Claude Sonnet 5.5, high (default)** | **22/22** | 0 | 0 | 10.2 s | 0 |
| Jev (`"decider": "jev"`, 2026-10-02) | 22/22 | 0 | 0 | 7.3 s | 0 |

## Reproduce

```sh
for e in low high xhigh; do
  node eval/triage.mjs --deciders claude --decider-model claude-sonnet-5-5 --decider-effort $e --out results/<dir>
done
node eval/turnend.mjs --e2e --deciders auto --writer claude --reps 2 --out results/2026-10-07-sonnet-decider
```
