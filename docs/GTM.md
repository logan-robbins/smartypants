# Smartypants go-to-market

Owner: GTM. Status: draft 2 (2026-09-27), updated with competitor research. Competitive detail: [research/competitors.md](research/competitors.md).

## 1. The bet

AI coding agents now write most of the diff. What they don't keep is the **picture**: which
boxes exist, why they exist, and whether this turn's code still respects them. Smartypants is
the missing artifact — a live architecture diagram that the agent's own hooks keep current, with
drift caught at the end of every turn.

**Headline:** *The architecture diagram that draws itself while your agent codes — and tells you
when the code wanders.*
**Subhead:** *Your agent forgets what you asked for. Smartypants doesn't.*

The category is hot and crowded with **pull-based snapshots**: Archify (72.7k★ in a month, #1
weekly Trending on 2026-09-01), drawio-skill (9.7k★), the official draw.io MCP (5.5k★), Whiteboard
(YC W26, 415-point Show HN on 2026-09-24), GitDiagram and DeepWiki. You ask, they draw once, the
picture goes stale. Drift tools (ArchUnit, dependency-cruiser, ridge, Aegis) compare code with
code or hand-written rules. **Nobody hooks every agent turn and checks the code against what the
user said.** That is the whole wedge; every message leads with it.

## 2. Who it is for (ICP, in order)

1. **Heavy Claude Code / Codex users on real systems** (services, queues, databases, k8s) — they
   delegate whole features and lose the mental model. Pain: "what did it just build?" and silent
   boundary violations (frontend querying the DB, sync write on the hot path).
2. **Engineers preparing for system-design interviews** — talk through YouTube top-K or Uber and
   get a staff-level diagram, "go deeper" on any box, and a compact record of the decisions. Pain:
   whiteboard practice with no feedback. This is the viral wedge: screenshots travel.
3. **Tech leads reviewing agent PRs** — want a one-glance "does this change the architecture?"
   answer. Pain: reviewing 2k-line agent diffs for architectural impact.
4. **Platform teams onboarding onto unfamiliar repos** — catch-up draws a repo (incl. Helm/k8s/
   Terraform boundaries) in about a minute.

Not for: teams wanting a hand-curated C4 model as a system of record (Structurizr/IcePanel do
that), or runtime-trace maps (AppMap/Multiplayer).

## 3. Why it wins (and what we must prove)

| claim | proof we have | proof to add |
|---|---|---|
| Stays current with zero effort | hooks on prompt, edit, and turn end; background worker never blocks the agent | a 60-second screen capture of a real Claude Code session |
| Catches drift | held-out drift verdicts 9/10, 0 missed; live Codex/Claude runs flagged a frontend→DB bypass | a public "drift zoo" of 10 real agent mistakes it caught |
| Reads like a staff engineer drew it | layered convention (users → edge → … → storage), names + one-line blurbs, WHY on click | side-by-side vs GitDiagram / DeepWiki on the same repo |
| Works on existing repos | catch-up from code + compose/k8s/Helm/Terraform, ~1 min, <$0.01 | README gallery of 6 well-known OSS repos caught up |
| Cheap | noise turns cost $0; 5 full interviews cost $0.015; ~200-token intent memory | cost per 100 turns on a real project |
| Agent-native | Claude Code, Codex, Pi, Muse, Grok; plugin eval +1.00 Δ with vs without | listings in each marketplace |

## 4. Positioning vs the field

| | Smartypants | Archify | drawio-skill | Whiteboard | GitDiagram / DeepWiki | ArchUnit / dep-cruiser |
|---|---|---|---|---|---|---|
| Updates by itself as the agent works | **every turn (hooks)** | on request | on request | on request | on request | in CI |
| Knows what the user asked for | **IntentCode from the conversation** | chat context only | no | decision log | no | hand-written rules |
| Flags drift | **per turn, vs intent** | before/after diff | diagram diff | no | no | rule violations |
| Existing repo + infra (Helm/k8s/compose/TF) | **yes, background catch-up** | repo | code + IaC | repo | repo | code only |
| Layered, interactive, WHY on click | **yes** | animated HTML | draw.io editing | canvas | static/interactive | n/a |
| Hosts | Claude Code, Codex, Pi, Muse, Grok | many (skill) | many (skill) | desktop app | web | build tools |
| Cost | ~$0.003 per design turn, $0 for noise | model tokens | model tokens | subscription | free / hosted | free |

Lines we use in comments: "Archify draws a great poster; we keep the map and sound the alarm."
"If you already love your draw.io diagrams, keep them — export ours to Mermaid."

## 5. Launch plan

### Pre-launch (T-14 → T-1) — fix trust blockers first
- [ ] **LICENSE** (MIT recommended for adoption; owner decision). No license = no stars from
      companies and no marketplace approval.
- [ ] **Privacy defaults.** The default Contributor tier lets Meta train on prompts and code.
      That is a launch-killer for coders if discovered in comments. Ship a first-run notice, a
      one-line opt-out (`"model": "muse-spark-1.3"`), and a "what leaves your machine" section.
      Consider a bring-your-own-model default (the agent's own provider) for the plugin install.
- [ ] **Publish to npm** as `smartypants-diagram` or `@logan-robbins/smartypants` so installs are
      one command and `npx` works without GitHub.
- [ ] **Hero GIF** (≤ 8 MB, 1200 px wide): talk → diagram grows → "go deeper" → drift flagged.
- [ ] **Zero-key demo**: `npx smartypants demo youtube-top-k && npx smartypants serve` and the
      GitHub Pages demo (`site/`), linked from the first line of the README. Show HN needs "no signup".
- [ ] **Repo public ≥ 14 days before launch** (awesome-claude-code's age rule) with visible commits.
- [ ] **`npx skills add logan-robbins/smartypants`** works (skills.sh ranks by installs; Archify's
      growth rode it).
- [ ] **README_zh.md** — Archify and drawio-skill both grew through Chinese channels.
- [ ] **Search name**: "SmartyPants" is Gruber's typography filter. Repo description and topics
      say "smartypants claude code architecture diagram"; tagline always includes "diagram".
- [ ] **Gallery**: catch-up screenshots of well-known repos (microservices-demo, immich,
      full-stack-fastapi-template).

### Launch day (Tuesday–Thursday, 9am–12pm ET)
1. **Show HN**: "Show HN: Smartypants – a live architecture diagram your coding agent keeps
   current". First comment: why we built it, what leaves the machine, costs, limits.
2. **X/Twitter thread** with the GIF + the drift catch clip; tag Claude Code, Codex, and Pi
   maintainers only where genuinely relevant.
3. **Reddit**: r/ClaudeAI, r/ChatGPTCoding, r/codex (if active), r/ExperiencedDevs (drift angle),
   r/cscareerquestions + r/leetcode (interview angle, separate post, different GIF).
4. **Plugin listings** submitted at T-10 (see §6) so "install from the marketplace" works for
   launch traffic.
5. **T+2–5**: Chinese channels (Juejin, V2EX, a QbitAI pitch); Console.dev (takes pre-1.0 tools);
   Product Hunt at T+7 (lower developer return).

### Sustain (weeks 1–6)
- Weekly "architecture of X" posts: catch-up of a famous repo, with the WHY panel.
- Get into awesome lists (awesome-claude-code, awesome-codex, MCP/agent tool lists).
- Interview-prep content: "Design Uber in 6 prompts" threads; a public library of the 5
  interview diagrams with their IntentCode.
- Respond to every issue within 24h in launch month; label good-first-issues (new host adapters,
  new infra parsers).

## 6. Marketplaces

Details and sources: [research/competitors.md](research/competitors.md#marketplace-requirements);
checklist: [../SUBMISSION.md](../SUBMISSION.md).

| marketplace | route | blockers for us today | what we did |
|---|---|---|---|
| Claude Code directory | claude.ai/directory/manage (paid plan); old Console form retired | **LICENSE**; unpinned `npm install github:` | strict validation passes; plugin eval +1.00; key moved to a sensitive `userConfig` |
| Grok Build | PR to `xai-org/plugin-marketplace`, `url` source pinned to a 40-char SHA | LICENSE | Grok reads the Claude plugin as is; versions aligned |
| Codex | repo marketplace for hooks; OpenAI directory = skills-only storefront | privacy policy URL, verified identity, 5+3 test cases | `.agents/plugins/marketplace.json` works with `codex plugin marketplace add` |
| Cursor | manual review; open source required | LICENSE | plugin dir ready |
| Pi gallery | npm package with `pi-package` keyword | not on npm yet | `pi install git:…` verified |
| skills.sh | install telemetry, no submission | none | skill at `plugins/smartypants/skills/smartypants` |

## 7. Metrics

- North star: **weekly active projects** (projects with ≥ 1 builder call in the week) — opt-in,
  anonymous ping only if the user enables it; otherwise proxy by npm downloads + plugin installs.
- Launch: stars/day (target: 500 in week 1 puts it on GitHub trending for TypeScript/JavaScript),
  HN front page, plugin installs, demo-site sessions.
- Quality: drift precision/recall on the public drift zoo; catch-up success rate on the gallery.

## 8. Risks

| risk | mitigation |
|---|---|
| "It sends my code to Meta for training" | opt-out default for plugin installs; loud disclosure; BYO model |
| Diagram quality on messy repos disappoints | crawler hardened on real repos; honest limits in README; "Tidy" + go deeper |
| Hook friction (Codex trust, Stop hooks) | clear per-host setup; `smartypants review` works without hooks |
| Cost surprises | stats command, per-turn skip rate, contributor pricing; budget cap setting |
| Platform owners ship this natively | move fast on intent + drift, which platform diagrams won't do soon |
| "Just another diagram skill" next to Archify | lead with the drift GIF, not the diagram; the comparison table names them |
| Name collision with Gruber's SmartyPants | always pair the name with "diagram"/"claude code" in titles and topics |
