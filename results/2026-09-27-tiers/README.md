# Names, layers, and zones — rerun on Muse Spark 1.3 Contributor

Date: 2026-09-27. Same transcripts, held-out set, and arms as
[2026-09-26-meta-jev](../2026-09-26-meta-jev/README.md), rerun after the schema gained a
readable name rule, a one-line `blurb`, a `tier` (layer), and a `zone` (network or trust
boundary) for every part. Real Jev was not run (no `TYPESAFE_API_KEY`); the selector is the Jev
protocol answered by Muse Spark at minimal effort.

## Interview transcripts

| arm | triage accuracy | skipped free | false skips | builder calls | node recall | drift accuracy | intent atoms (tokens) | total tokens in/out | cost | mean turn latency | errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| jev-meta | 32/32 | 7 | 0 | 26 | 33/33 | 9/10 | 83 (885) | 68879/44019 | $0.0151 | 10.5s | 0 |
| always | 32/32 | 7 | 0 | 30 | 33/33 | 9/10 | 82 (816) | 67517/46335 | $0.0154 | 10.6s | 0 |

Every part in the five saved example diagrams has a tier, a zone, and a blurb (69 of 69).
The richer schema did not cost accuracy or money: triage and recall are unchanged and the
selector arm made 26 builder calls against 30. The compact graph context is 41% of the JSON
(14,869 vs 35,976 characters); IntentCode held 126 to 232 tokens per interview.

The two drift misses are conforming edits flagged as drift (url-shortener redirect in the
jev-meta arm, messenger router in the always arm); no real drift was missed.

## Held-out triage

| decider | 4-way triage | keep vs skip | false skips (lost info) | false keeps | drift verdicts | missed drift | builder calls avoided on edits | selector calls | selector cost |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| heuristic | 18/34 | 23/34 | 0 | 11 | 6/10 | 0 | 1 | 0 | $0.0000 |
| meta | 31/34 | 34/34 | 0 | 0 | 9/10 | 0 | 4 | 39 | $0.0048 |

## Code-aware runs (same day, same model)

- **Catch-up** of `examples/shop-monorepo` (Next.js web, Express API on Postgres, Redis, and
  Kafka, a Python worker, S3, Stripe, compose, k8s with Ingress and NetworkPolicy, a Helm chart,
  Terraform): 3 unit reads and 1 synthesis, 64 s, $0.0029. Result: shopper → CloudFront → NGINX
  Ingress → Next.js storefront → Orders API → Stripe (right edge); Kafka → fulfillment worker;
  Redis beside Postgres; S3 at the bottom; zones for public internet, edge, the `shop` namespace,
  the private subnet, and AWS.
- **Turn-end review** after three edits (storefront reading Postgres directly, a new test, a new
  k8s Deployment): the test was skipped for free, one batched selector call gave the storefront
  "diverges" at 0.9, one drift check flagged "direct SELECT … skipping cache and API boundary",
  and one design sync added a Recommendations Service from the manifest. 23 s. A second review
  found nothing new.
- **Codex CLI 0.157.1** fired `UserPromptSubmit`, `PostToolUse` (`apply_patch`), and `Stop`; the
  turn-end review ran in the background worker.
