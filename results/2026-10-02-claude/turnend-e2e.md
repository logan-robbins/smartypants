End-to-end Stop hook on 11 labeled turns of the shop-monorepo example (2 reps): the selector picks which changed files to check, Claude writes the drift note, and a turn counts as flagged only if a flag lands on the diagram.

| selector (writer: Claude) | drift flag right | missed drift | false flags | p50 hook time | errors |
|---|---:|---:|---:|---:|---:|
| jev | 22/22 | 0 | 0 | 7.3 s | 0 |
| claude | 22/22 | 0 | 0 | 9.7 s | 0 |
