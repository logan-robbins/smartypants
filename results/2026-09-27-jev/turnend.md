Turn-end review on 11 labeled turns of the shop-monorepo example (3 reps each; the last turn changes three files at once).

| decider | four-way verdict | drift flag correct | missed drift | false flags | p50 review latency | selector calls | selector cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| heuristic | 18/39 | 18/39 | 0 | 21 | 637 ms | 0 | $0.0000 |
| meta | 36/39 | 39/39 | 0 | 0 | 5067 ms | 33 | $0.0041 |
| jev | 36/39 | 33/39 | 0 | 6 | 1011 ms | 33 | $0.0000 |
| auto | 35/39 | 39/39 | 0 | 0 | 1718 ms | 45 | $0.0013 |
