# Jev selects, Muse Spark writes

Date: 2026-10-02. Supersedes the `auto` setup in [2026-09-27-jev](../2026-09-27-jev/README.md),
where Muse Spark also re-answered Jev's unsure picks. That mixed the two roles. This run pairs
them the way WindTunnel pairs Jev with Mercury
([provenance](https://github.com/nekuda-ai/WindTunnel/blob/main/results/2026-09-18-jev-mercury/PROVENANCE.md):
"Jev selects actions. Mercury writes arguments or field values and the final answer"):

| job | model |
|---|---|
| answer the per-turn menus (remember? design change? level? which part? does this diff conform?) | Typesafe Jev (`jev-1.13.0`) |
| write what the menus asked for: diagram delta, drift note, IntentCode | Muse Spark 1.3 Contributor |

An unsure Jev pick leans toward doing the work (build unless a skip is confident; send an
unsure file to the drift writer), and the writer decides what lands. Muse Spark answers the menus
only when there is no Typesafe key or Jev is unreachable.

## The fix that mattered

End to end, the first run missed the same two drifts every time ("products skip the cache",
"cache TTL raised to 10 minutes"): Jev flagged the files, but the drift writer was given only the
intent atoms whose subject matched the file's owner (`api`), so it never saw
`E products.cache read-through` or `N products.cache.ttl 60s`. The writer now gets the whole
IntentCode when it is small (≤ 2,400 characters; typically ~200 tokens) and the owner-narrowed
view only for large memories.

## Turn-end review, end to end

The whole Stop hook on 11 labeled turns of the shop-monorepo example, 2 repeats: git changes →
the selector picks which files to check → Muse Spark writes the drift note → a turn counts as
flagged only if a flag lands on the diagram. (`node eval/turnend.mjs --e2e`)

| selector (writer: Muse Spark) | drift flag right | missed drift | false flags | p50 hook time |
|---|---:|---:|---:|---:|
| **Jev** | **22/22** | 0 | 0 | **7.3 s** |
| Muse Spark | 22/22 | 0 | 0 | 12.6 s |
| local rules | 20/22 | 0 | 2 | 11.5 s |

Before the intent fix: Jev 18/22, Muse Spark 17/22, local rules 15/22.

## Five design interviews, end to end

(`node eval/run.mjs --arms auto,jev-meta`)

| selector (writer: Muse Spark) | triage | false skips | builder calls | parts drawn | drift | cost | mean turn |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Jev** (`auto`) | 32/32 | 0 | 28 | 33/33 | **10/10** | $0.0147 | 15.2 s |
| Muse Spark (`meta`) | 32/32 | 0 | 27 | 33/33 | 8/10 | $0.0150 | 14.3 s |

Turn latency here is the builder's (Muse Spark writing the diagram); the selector itself takes
~200 ms with Jev against ~3 s with Muse Spark (held-out triage, [2026-09-27-jev](../2026-09-27-jev/README.md)).
Muse Spark as selector raised two false drift flags (`chat/router.ts`, `redirect/handler.js`).

Files: `turnend-e2e.{md,json}`, `summary.{md,json}`, `runs.json`.
