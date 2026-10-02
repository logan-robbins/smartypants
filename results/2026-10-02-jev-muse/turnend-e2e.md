End-to-end Stop hook on 11 labeled turns of the shop-monorepo example (2 reps): the selector picks which changed files to check, Muse Spark writes the drift note, and a turn counts as flagged only if a flag lands on the diagram.

| selector (writer: Muse Spark) | drift flag right | missed drift | false flags | p50 hook time | errors |
|---|---:|---:|---:|---:|---:|
| heuristic | 20/22 | 0 | 2 | 11.5 s | 0 |
| meta | 22/22 | 0 | 0 | 12.6 s | 0 |
| jev | 22/22 | 0 | 0 | 7.3 s | 0 |
