# IntentCode

The most architectural information per token. No grammar, no prose, no transcript.

```
<K> <subject>[.<facet>] <value>
```

| K | meaning | example |
|---|---|---|
| `G` | goal / purpose | `G sys short-links click-counts` |
| `F` | functional requirement | `F redirect 301 to long-url` |
| `N` | non-functional constraint | `N redirect.latency p99<50ms` |
| `D` | decision, `chosen>rejected` | `D link-store cassandra>mysql` |
| `X` | excluded or forbidden | `X redirect sync-analytics-write` |
| `E` | flow `from>to` | `E redirect>cache get-url` |
| `Q` | open question or assumption | `Q feed.ranking ml-or-chrono` |
| `!` | drift, from code | `! redirect intent:async-clicks code:sync-insert` |

## Rules

- **Key** = `K subject[.facet]`. A later atom with the same key replaces the value. The same
  value again only increments its reinforcement count `n`.
- **Evolution** — when a *user* changes a `D` atom, the old choice is kept as `X subject old`,
  so code that goes back to it is caught as drift.
- **Source** — atoms from user turns have `src: user`; `!` atoms from edits have `src: code`.
- **Budget** — the rendering is kept under `intentTokens` (default 1,200). When it is over,
  the atom with the lowest value per token is dropped:
  `weight(K) × (1 + log2 n) × 0.97^(turns since last seen) / tokens`, with weights
  G 6, N 5, D 5, X 4, ! 4, F 3, E 2, Q 1.
- **Values** drop filler words and keep operators and units (`p99<50ms`, `100B messages/day`).
- A line that does not parse as IntentCode is rejected, so prose cannot leak in.

## Rendering

Prompts and the canvas get the atoms grouped by subject, so each subject is spelled once:

```
sys|G short-links click-counts|N users-dau 100M dau|N at-least-once required
link-store|D dynamodb|X cassandra
redirect|N latency p99<50ms|X sync-analytics-write
```

`npx smartypants intent` prints this. Drift checks receive only the lines for the owner
nodes and `sys`.

## Where atoms come from

1. The builder returns `intent: [...]` with every design or deepen delta.
2. Turns the selector marks `annotate` never reach the builder: local extraction pulls
   numeric constraints (`500M DAU`, `p99 under 200ms`, `50k views per second`), delivery
   guarantees (`at least once`, `in order`, `idempotent`), `use X instead of Y` decisions, and
   `never …` exclusions.
3. Drift results become `!` atoms.
