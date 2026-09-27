# Smartypants go-to-market

Owner: GTM. Status: draft 1 (2026-09-27). Competitive detail: [research/competitors.md](research/competitors.md).

## 1. The bet

AI coding agents now write most of the diff. What they don't keep is the **picture**: which
boxes exist, why they exist, and whether this turn's code still respects them. Smartypants is
the missing artifact — a live architecture diagram that the agent's own hooks keep current, with
drift caught at the end of every turn.

**One line:** *The architecture diagram your coding agent keeps up to date — and the alarm when
its code drifts from what you asked for.*

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

## 4. Positioning vs the field (short form)

- **vs one-shot repo diagrammers** (GitDiagram, DeepWiki, CodeViz): they draw a repo once from
  code. We stay live *during* the agent session, capture intent from the conversation, and flag
  drift — the diagram is a guardrail, not a poster.
- **vs diagram editors with AI** (Eraser, Mermaid Chart, Lucid, Excalidraw AI): they draw what
  you describe; nothing watches the code. We connect the picture to the diff.
- **vs architecture-as-code / C4** (Structurizr, IcePanel): curated and manual. We are automatic
  and agent-driven; we export Mermaid for teams who want to curate.
- **vs architecture fitness tests** (ArchUnit, dependency-cruiser): rules you write in code. We
  infer intent from what you said and check at the design level, per turn.

## 5. Launch plan

### Pre-launch (week 0) — fix trust blockers first
- [ ] **LICENSE** (MIT recommended for adoption; owner decision). No license = no stars from
      companies and no marketplace approval.
- [ ] **Privacy defaults.** The default Contributor tier lets Meta train on prompts and code.
      That is a launch-killer for coders if discovered in comments. Ship a first-run notice, a
      one-line opt-out (`"model": "muse-spark-1.3"`), and a "what leaves your machine" section.
      Consider a bring-your-own-model default (the agent's own provider) for the plugin install.
- [ ] **Publish to npm** as `smartypants-diagram` or `@logan-robbins/smartypants` so installs are
      one command and `npx` works without GitHub.
- [ ] **Hero GIF** (≤ 8 MB, 1200 px wide): talk → diagram grows → "go deeper" → drift flagged.
- [ ] **Hosted demo** on GitHub Pages (`site/`), linked from the first line of the README.
- [ ] **Gallery**: catch-up screenshots of well-known repos (microservices-demo, immich,
      full-stack-fastapi-template).

### Launch day (Tuesday–Thursday, 8–9am PT)
1. **Show HN**: "Show HN: Smartypants – a live architecture diagram your coding agent keeps
   current". First comment: why we built it, what leaves the machine, costs, limits.
2. **X/Twitter thread** with the GIF + the drift catch clip; tag Claude Code, Codex, and Pi
   maintainers only where genuinely relevant.
3. **Reddit**: r/ClaudeAI, r/ChatGPTCoding, r/codex (if active), r/ExperiencedDevs (drift angle),
   r/cscareerquestions + r/leetcode (interview angle, separate post, different GIF).
4. **Plugin listings** submitted the same week (see §6) so "install from the marketplace" works
   for launch traffic.

### Sustain (weeks 1–6)
- Weekly "architecture of X" posts: catch-up of a famous repo, with the WHY panel.
- Get into awesome lists (awesome-claude-code, awesome-codex, MCP/agent tool lists).
- Interview-prep content: "Design Uber in 6 prompts" threads; a public library of the 5
  interview diagrams with their IntentCode.
- Respond to every issue within 24h in launch month; label good-first-issues (new host adapters,
  new infra parsers).

## 6. Marketplaces

| marketplace | status | what reviewers need | owner action |
|---|---|---|---|
| Claude Code (Anthropic catalog) | manifests pass `claude plugin validate --strict`; plugin eval suite passes | license, privacy disclosure, working install, screenshots | submit when LICENSE + privacy notice land |
| Codex (OpenAI directory) | `.codex-plugin/plugin.json`, marketplace file | same + hooks need user approval | submit |
| Grok Build | `.grok-plugin` marketplace | install with `--trust` | submit / list |
| Cursor | plugin dir ready | publish form | submit |
| Pi packages | `pi` manifest + `pi-package` keyword | npm publish | publish to npm |

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
