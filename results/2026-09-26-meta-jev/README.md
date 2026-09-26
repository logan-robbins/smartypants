# Smartypants on Meta Muse Spark 1.3 Contributor, with Jev-protocol triage

Date: 2026-09-26. Builder: `muse-spark-1.3-contributor` on the Meta Model API for every arm.
Real Jev was not run: no `TYPESAFE_API_KEY` was available, so the model selector is
the Jev protocol answered by Muse Spark at `reasoning_effort: minimal` (`decider: meta`).

Reproduce: `node eval/run.mjs --arms jev-meta,always` and
`node eval/triage.mjs --deciders heuristic,meta` (paid calls, a few cents each).

## 1. Interview transcripts (examples/transcripts.json)

Five Meta-style design interviews (YouTube Top-K, Uber, News Feed, Messenger, Bitly), 32
labeled turns and 10 labeled edits, replayed end to end through the real pipeline.

- **jev-meta**: local triage, then the Muse Spark selector for ambiguous turns.
- **always**: local triage only; everything not obviously noise goes to the builder.

| arm | triage accuracy | skipped free | false skips | builder calls | node recall | drift accuracy | intent atoms (tokens) | total tokens in/out | cost | mean turn latency | errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| jev-meta | 32/32 | 7 | 0 | 27 | 33/33 | 10/10 | 85 (882) | 62126/49450 | $0.0159 | 16.6s | 0 |
| always | 32/32 | 7 | 0 | 29 | 33/33 | 9/10 | 72 (788) | 51880/42638 | $0.0134 | 12.7s | 0 |

Node recall counts golden concepts (per example) found in the final diagram. Drift accuracy
compares the flag outcome of each edit with its label. Latency is per turn in foreground mode;
the default background mode hides it from the coding agent.

Reading: these transcripts were used while building the local rules, so the free local stage
already makes every triage call correctly here and both arms tie on triage and recall. The
selector's verdicts on edits saved 2 builder calls and it added $0.0026 across 42 events.
Drift outcomes move by one or two edits between runs because the drift builder is sampled;
across the seven runs made during development (with code changing between them) the
jev-meta arm scored between 7 and 10 of 10. The conforming Messenger
router edit is the most common miss for both arms: by then the builder has drawn a
membership-checking conversation service and an async fanout bus, and a router that skips
both is arguably drift, so that label is conservative.

The compact graph sent to the builder was 45% of the characters of the same graph as JSON
(14,268 vs 31,873 over the five final jev-meta diagrams). IntentCode held each interview's
intent in 133 to 222 tokens (mean 176).

## 2. Held-out triage (examples/triage-holdout.json)

34 turns and 10 edits written after the local rules were fixed and never used to tune them,
against the saved diagrams and intent from part 1. Triage only, no builder calls.

| decider | 4-way triage | keep vs skip | false skips (lost info) | false keeps | drift verdicts | missed drift | builder calls avoided on edits | selector calls | selector cost |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| heuristic | 18/34 | 23/34 | 0 | 11 | 5/10 | 1 | 2 | 0 | $0.0000 |
| meta | 30/34 | 34/34 | 0 | 0 | 9/10 | 0 | 4 | 40 | $0.0057 |

- **keep vs skip** is the question "is this worth remembering": the selector gets 34/34.
  Local rules alone never lose information (0 false skips) but keep 11 turns of chit-chat
  and logistics, each of which would cost a builder call and could pollute the memory.
- **drift verdicts**: the selector clears 4 conforming edits without a builder call and misses
  no drift; local rules clear only quiet paths and let one real drift through.
- **cost**: 40 selector calls cost $0.0057 (about $0.00014 per decision). The 11 avoided
  builder calls on turns and 2 more on edits cost about $0.0005 each on the Contributor tier,
  so on this tier the selector roughly pays for itself and its value is precision. With real
  Jev as the selector, or with the standard tier as the builder (`muse-spark-1.3`, 12.5x
  input and 21x output prices), the saved builder calls dominate.

Two local-rule bugs found on this set were fixed before the final run and are general: "zoom
into X" was not parsed as go-deeper, and Go `*_test.go` files were not treated as quiet paths.

## Files

- `summary.md`, `summary.json`, `runs.json`: part 1, per turn and per edit.
- `triage-holdout.md`, `triage-holdout.json`: part 2, per decision.
- `../../examples/*.design.json`, `*.intent.txt`: the diagrams and IntentCode the jev-meta arm produced
  (`npx smartypants demo <name>`).
