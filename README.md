# Smartypants

**The architecture diagram that draws itself while your coding agent works — and tells you when
the code wanders.**

Your agent forgets what you asked for. Smartypants doesn't. It hooks into Claude Code, Codex, Pi,
Muse Code, and Grok Build, keeps one layered diagram of the system current on every turn, and
flags the moment a diff leaves the design you described.

[**Live demo**](https://logan-robbins.github.io/smartypants/) · [Install](#install) · [How it compares](#how-it-compares) ·
[Proof](#proof) · [What leaves your machine](#what-leaves-your-machine)

![A design interview becoming a diagram, then a drift flag](docs/hero.gif)

- **Live, not a snapshot.** Prompts, edits, and the end of every agent turn update the diagram in
  the background. Your agent never waits.
- **Drift against what you said.** Decisions and constraints from the conversation are kept as
  IntentCode (~200 tokens per design). At turn end, one batched check reads what changed in git;
  code that breaks a decision, a constraint, or a boundary turns red.
- **Catches up on existing repos.** From code plus compose, Kubernetes, Helm, and Terraform: real
  service names, flows, and network boundaries, in about a minute for about a cent.
- **Reads like a staff engineer drew it.** Users on top, storage at the bottom, the journey left
  to right, boundaries as frames. Each box has a plain name and one line; click it for the **why**.

## Install

```sh
npm install github:logan-robbins/smartypants
npx smartypants init        # hooks for every host + config; catches up if code exists
export META_API_KEY=...     # the default builder (Meta Muse Spark)
npx smartypants serve       # open the printed URL
```

Or as a plugin: `/plugin marketplace add logan-robbins/smartypants` then
`/plugin install smartypants@smartypants` (Claude Code) ·
`codex plugin marketplace add logan-robbins/smartypants` (Codex) ·
`pi install git:github.com/logan-robbins/smartypants` (Pi) ·
`npx skills add logan-robbins/smartypants` (any skills host).

**No key? See it first:** `npx smartypants demo youtube-top-k && npx smartypants serve`, or the
[live demo](https://logan-robbins.github.io/smartypants/) (source in `site/`).

Then just work. Say *"design YouTube top-K"* and the diagram appears; say *"go deeper on the
aggregator"* (or double-click it) to expand a box; let the agent code and watch for red.

## How it compares

| | **Smartypants** | Archify | drawio-skill | Whiteboard | GitDiagram · DeepWiki | ArchUnit · dep-cruiser |
|---|---|---|---|---|---|---|
| Updates by itself as the agent works | **every turn, via hooks** | on request | on request | on request | on request | in CI |
| Knows what you asked for | **yes (IntentCode)** | chat context | no | decision log | no | rules you write |
| Flags drift | **per turn, vs your intent** | before/after diff | diagram diff | no | no | rule violations |
| Existing repo + Helm/k8s/compose/TF | **yes, background** | repo | code + IaC | repo | repo | code only |
| Output | layered interactive canvas, Mermaid export | animated HTML | draw.io | desktop canvas | web diagram / wiki | test failures |

Archify draws a great poster; Smartypants keeps the map and sounds the alarm. Details and
sources: [docs/research/competitors.md](docs/research/competitors.md).

## Proof

Live runs with Typesafe Jev and Muse Spark ([Jev results](results/2026-09-27-jev/README.md) ·
[earlier runs](results/2026-09-27-tiers/README.md)):

| | result |
|---|---|
| "Is this turn worth remembering?" on 34 held-out turns × 3 | **102/102** with Jev + Muse Spark (23/34 with local rules alone) |
| Drift verdicts on 10 held-out edits × 3 | **30/30, none missed** (Muse Spark alone 26/30, Jev alone 26/30) |
| Turn-end review of labeled agent changes × 3 | **39/39 drift flags right, 0 false alarms**, 1.7 s per review (Muse Spark alone: 5.1 s) |
| Per-turn decision | **~250 ms** with Jev first (~3 s with Muse Spark alone), at half the selector cost |
| Five design interviews (32 turns, 10 edits) | triage 32/32, all 33 expected parts drawn, drift 10/10 and 9/10 across runs, **$0.015 total** |
| Noise turns ("thanks", "run the tests") | **$0**, no model call |
| Turn-end review of 3 changed files | 1 batched selector call; caught a frontend querying Postgres directly; added a service from a new k8s manifest; 23 s |
| Catch-up on 10 open-source repos | 36–115 s, $0.001–0.011 each ([crawler notes](docs/crawl/)) |

Caught up from code alone — GoogleCloudPlatform/microservices-demo (11 services, Istio gateway,
AlloyDB, GCS), twenty, and immich:

<p>
<img src="docs/crawl/microservices-demo.png" width="32%" alt="microservices-demo caught up from code">
<img src="docs/crawl/twenty.png" width="32%" alt="twenty caught up from code">
<img src="docs/crawl/immich.png" width="32%" alt="immich caught up from code">
</p>

## The canvas

| top to bottom | |
|---|---|
| Users and clients | who starts the journey |
| Edge | CDN, WAF, load balancer, ingress, gateway |
| Frontend → API → Services | third parties at the right edge |
| Async | streams first, then the workers that consume them |
| Data | caches beside the databases they front |
| Storage | always the bottom row |

Inside a row the journey runs left to right. Dashed frames are network and trust boundaries.
Everything is clickable and draggable — boxes, subgraphs, arrows, frames, layer labels. A click
leads with **why the part exists** (the requirement or trade-off that forces it), then what it
does, deep-dive notes, flows, drift, and the intent recorded about it.

![Click a box: why first](docs/panel.png)

Keys: **F** fit · **T** tidy · **L** tiers/flow layout · **I** intent memory · **/** search ·
double-click to go deeper.

## What leaves your machine

Nothing, in a project without `smartypants.config.json`. With the default `meta` builder:
design turns, part names, changed-file diffs at turn end, and (for catch-up) key source files go
to **api.meta.ai**. The default model, `muse-spark-1.3-contributor`, is Meta's discounted tier
that **may be used for training**; set `"model": "muse-spark-1.3"` to opt out, or pick another
builder (`claude`, `codex`, `grok`, `pi`, `muse`). With `TYPESAFE_API_KEY`, per-turn triage
questions (turn text, part names) go to Typesafe (Jev). Keys are never written to the diagram,
memory, or logs; the plugin stores them in your OS credential store.

## Commands

```
smartypants catchup     build the diagram from existing code, in the background
smartypants review      review what the working tree changed, now
smartypants deeper X    system → components → modules → deep-dive notes
smartypants intent      print the IntentCode memory
smartypants drift       list where code left the intent
smartypants mermaid     export Mermaid
smartypants stats       turns skipped, calls, tokens, cost
smartypants demo NAME   shop-monorepo · youtube-top-k · uber · news-feed · messenger · url-shortener
smartypants reset       clear the diagram and memory
```

Plugin commands mirror these: `/smartypants`, `/smartypants:deeper`, `:catchup`, `:review`,
`:intent`, `:drift`, `:diagram`, `:mermaid`, `:reset-graph`.

## Config

`smartypants.config.json` is the on switch. `init` writes:

```json
{ "flavor": "meta", "depth": "auto", "seed": false, "decider": "auto", "background": true, "review": "turn" }
```

| key | meaning |
|---|---|
| `flavor` | builder: `meta` (default), `claude`, `codex`, `grok`, `muse`, `pi` |
| `model` | builder model; `muse-spark-1.3` = no training |
| `depth` | `auto` (start from what you said, go finer as you do) or `system` / `component` / `module` |
| `decider` | per-turn selector: `auto` (Jev, with Muse Spark re-checking answers under `escalateBelow`; then Muse Spark alone; then local rules), `jev`, `meta`, `heuristic` |
| `escalateBelow` | Jev confidence under which Muse Spark gets a second look (default 0.6) |
| `review` | `turn` (once per agent turn), `edit` (every edit), `both` |
| `background` | hooks return immediately; a project worker does the work |
| `seed` | existing codebase: catch up from code |
| `autoDeepen` | expand a box on its own when detail piles up (default 3; `false` to disable) |
| `envFile` | dotenv path for keys |
| `watch` | diagram another Claude Code / Codex instance ([docs/WATCH.md](docs/WATCH.md)) |

## Hosts

| host | hooks | notes |
|---|---|---|
| Claude Code | prompt, edit, `Stop` | project settings or the plugin |
| Codex | prompt, `apply_patch`, `Stop` | approve the hooks once in Codex's hooks review |
| Pi | `input`, `tool_result`, `agent_end` | project extension or `pi install`; Pi itself can run on Muse Spark |
| Muse Code, Grok Build | prompt, edit | `.muse/hooks.json`, `.grok/hooks/smartypants.json` |

## How it works

A free local pass drops noise. Then Typesafe Jev answers small menus in about 200 ms — is this
worth remembering, does it change the design, what level, which part, does this diff conform —
and any answer it is less than 60% sure of goes to Muse Spark for a second opinion (every wrong
Jev answer in our tests was under that line). Only then does the builder write a delta. Without
a Typesafe key, Muse Spark answers the menus itself.
Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/INTENTCODE.md](docs/INTENTCODE.md) ·
[docs/PROMPTING.md](docs/PROMPTING.md) · go-to-market: [docs/GTM.md](docs/GTM.md).

## Develop

```sh
npm test                      # 86 tests, no network
npm run eval                  # live interview transcripts on the Meta API (cents)
npm run eval:triage           # held-out triage benchmark
npm run eval:turnend          # turn-end review on labeled agent changes
node scripts/build-site.mjs   # website demo into site/demo
```

## License

[Apache-2.0](LICENSE). Use it, fork it, ship it; keep the [NOTICE](NOTICE) with any copy or
derivative so the credit travels with it. Citing it: [CITATION.cff](CITATION.cff).
