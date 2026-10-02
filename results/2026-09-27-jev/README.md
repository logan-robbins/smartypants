# Real Jev + Muse Spark

> **Superseded by [2026-10-02-jev-muse](../2026-10-02-jev-muse/README.md).** The `auto` setup
> below had Muse Spark re-answer Jev's unsure picks; `auto` is now Jev selects, Muse Spark
> writes. The selector-only comparisons below still hold.

Date: 2026-09-27. This is the first run against real Typesafe Jev (`jev-latest`, which served
`jev-1.13.0`). The builder is Muse Spark 1.3 Contributor throughout. Four selectors answer the
same Jev-protocol menus:

| decider | what answers the per-turn questions |
|---|---|
| `heuristic` | local rules only, no network |
| `meta` | Muse Spark at minimal reasoning effort, low effort for answers under 0.6 |
| `jev` | Jev only |
| `auto` (default) | Jev answers everything; only answers under 0.6 confidence get a Muse Spark second opinion |

## Result

Jev + Muse Spark is the most accurate selector on every benchmark here, and it is 3–12× faster
than Muse Spark alone at half or less of the selector cost:

| benchmark | Jev + Muse Spark | Muse Spark alone | Jev alone | local rules |
|---|---:|---:|---:|---:|
| held-out triage, 4-way (34 turns × 3 reps) | **97/102** | 92/102 | 88/102 | 18/34 |
| keep vs skip (lost information) | **102/102 (0)** | 102/102 (0) | 99/102 (0) | 23/34 |
| held-out drift verdicts (10 edits × 3 reps) | **30/30** | 26/30 | 26/30 | 6/10 |
| turn-end review drift flag (13 files × 3 reps) | **39/39**, 0 false flags | 39/39 | 33/39, 6 false flags | 18/39 |
| p50 per triage decision | **~250 ms** | ~3,000 ms | ~180 ms | ~10 ms |
| p50 turn-end review (git diff + one batched call) | **1.7 s** | 5.1 s | 1.0 s | 0.6 s |
| selector cost, held-out triage | $0.0028 | $0.0056 | Typesafe billing | $0 |

No selector ever skipped a turn that should have been kept, and none missed a real drift.

## Why the escalation floor is 0.6

`repeats-jev.json`: over three repeats of the held-out set, **every one of Jev's 18 wrong answers
had a confidence under 0.6** (the highest was 0.57), while 66 of its 114 right answers were at or
above 0.6. A floor of 0.6 sends about half of Jev's decisions to Muse Spark and catches every
mistake. Muse Spark alone is worse calibrated: its 14 wrong answers had confidences up to 0.85, so
no floor would have caught them.

The two selectors fail on different turns (Jev over-remembered "how does matching latency look
in the load test?"; Muse Spark marked two idempotency and retry constraints as design changes),
so a second opinion helps.

## Interview transcripts (end to end, builder included)

| arm | triage accuracy | skipped free | false skips | builder calls | node recall | drift accuracy | cost | mean turn latency | errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| auto (Jev + Muse Spark) | 32/32 | 7 | 0 | 28 | 32/33 | 9/10 | $0.0167 | 15.3 s | 0 |
| meta | 32/32 | 7 | 0 | 26 | 33/33 | 10/10 | $0.0155 | 14.0 s | 0 |

End to end the builder does most of the work and dominates both time and cost: selector spend
was $0.0009 (auto) against $0.0019 (meta) over five interviews. The one drift miss in the auto
arm is a false alarm (a conforming `redirect/handler.js` edit), not a missed drift.

## Failure handling (live)

| keys | what answered | latency |
|---|---|---:|
| both valid | Jev + Muse Spark | 0.2–3.6 s |
| Typesafe key rejected (401) | Muse Spark alone | 3.6 s |
| Meta key rejected (401) | Jev, answers kept | 0.2 s |
| both rejected | local rules | 0.1 s |

A hook never blocks on a provider outage.

## Reproduce

```sh
node eval/triage.mjs --deciders heuristic,meta,jev,auto --out results/2026-09-27-jev
node eval/triage-repeats.mjs jev 3      # also: auto, meta
node eval/turnend.mjs --deciders heuristic,meta,jev,auto --reps 3
node eval/run.mjs --arms auto,jev-meta --out results/2026-09-27-jev
```

Files: `triage-holdout.{md,json}`, `repeats-{jev,auto,meta}.json`, `turnend.{md,json}`,
`summary.{md,json}`, `runs.json`.
