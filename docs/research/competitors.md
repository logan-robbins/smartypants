# Smartypants: competitors, positioning, and launch channels

Research date: 2026-09-27. GitHub star counts were read from the GitHub search API on that date.
Every other number comes from a linked source; anything I could not confirm is marked
**unverified**.

## Summary

- **Diagrams for coding agents are the hottest category of 2026.** Archify, an agent *skill*
  that draws architecture as self-contained HTML, went from 4.2k stars (Aug 28) to 72.7k
  (today). It was #1 on GitHub's weekly all-language Trending list on 2026-09-01. Close behind
  are drawio-skill (9.7k), the official jgraph/drawio-mcp (5.5k, released 2026-02-03), and
  Whiteboard (YC W26), whose Show HN on 2026-09-24 got 415 points. People clearly want this.
- **Every one of those tools is pull-based and makes one-shot snapshots.** You ask, it draws,
  and the picture goes stale. Whiteboard says outright that its diagrams are regenerated on
  request. None of them hooks into the agent loop to keep one layered diagram current on every
  turn.
- **Drift tools compare code with code, or code with rules, never with what the user said.**
  drawio-skill diffs two diagrams, ridge diffs two commits, ArchUnit and dependency-cruiser
  enforce rules someone wrote by hand, and Aegis checks a baseline. That leaves Smartypants'
  sharpest gap: it records **the user's architectural intent from the conversation**
  (IntentCode) and flags **each agent turn** that departs from it, automatically, for fractions
  of a cent.
- **Launch playbook.** Archify and drawio-skill show what works: a hero GIF, a one-command
  install that runs on many agents (`npx skills add …`), a Chinese README, and heavy X
  amplification (Archify reported more than 100k likes on X). Hacker News still rewards a
  no-signup demo; Smartypants' need for an API key and its default of sending code to Meta's
  "Contributor" tier (which trains on that traffic) are the biggest launch risks.
- **Marketplaces.**
  - **Anthropic** now takes submissions only through the claude.ai developer portal
    (`claude.ai/directory/manage`, paid plan). The old `platform.claude.com/plugins/submit`
    Console form that `SUBMISSION.md` points to is no longer supported.
  - **Smartypants would be blocked today** because it has no LICENSE. Its Node hook script and
    its Meta data flow will also be held for manual review.
  - **Codex's public directory** takes skills and remote MCP servers only; hooks have to go
    through a repo marketplace.
  - **Grok Build** takes a pull request with a pinned commit SHA.
  - **Cursor** reviews every plugin by hand, and plugins must be open source.
  - **Pi** lists npm packages that carry the `pi-package` keyword.

## Competitor profiles

"Live" means the diagram updates on its own as code or the conversation changes. "Drift"
means it detects a departure from a design or intent.

### A. Agent-native diagram and architecture tools (the direct threat)

| Tool | What / input | Live? | Agent integration | Drift | License / price | Stars / traction |
|---|---|---|---|---|---|---|
| **Archify** (tt-a1i/archify) | Architecture, sequence, data-flow, and lifecycle diagrams as animated self-contained HTML, from a prompt or a repo, with source-verified nodes (`SRC n` git evidence) | No: one-shot, then refined in chat | Skill for Claude Code, Codex, opencode, and Cursor; `npx skills add tt-a1i/archify -g` | "Architecture Delta" compares before/after snapshots | MIT, free | **72,699**. #1 weekly GitHub Trending (2026-09-01); QbitAI coverage; more than 100k likes on X (KuCoin) |
| **drawio-skill** (Agents365-ai) | Prompt, code, Terraform/K8s/compose, SQL, OpenAPI, and more, turned into editable `.drawio` | Partial: `diagramctl sync` updates incrementally but is run on demand | Skill (Agent Skills format) plus an optional MCP server | Yes: color-coded diagram diff, git time-lapse, CI architecture tests | MIT | **9,700** (created 2026-03-03) |
| **Whiteboard** (devdotfast, YC W26) | Desktop IDE (Code-OSS based) where agents draw sequence and ER diagrams through an SDK; semantic AST diff; decision log | No: "agents regenerate visualizations on-demand" | Plugs into Claude Code and Codex | Decision log; no intent-drift check | MIT; pricing not stated (asked on HN) | **1,853**. Show HN 415 pts / 141 comments (2026-09-24). HN comments: 736 MB app, macOS-first |
| **draw.io MCP** (jgraph/drawio-mcp) | Official MCP server and plugin; XML/CSV/Mermaid to draw.io; 10k+ shapes | No | MCP; plugin for Claude Code, Codex, and Copilot CLI | No | License **unverified**; free hosted endpoint (mcp.draw.io) | **5,527** (released 2026-02-03) |
| **GitNexus** | Code knowledge graph (tree-sitter), impact analysis, process clustering, web graph UI | Index on demand | 19 MCP tools plus skills | Blast-radius analysis only | License **unverified** | **47,615** |
| **Aegis** | Makes agents "architecture-aware": baseline first, drift-checked | Per task | Multi-host skills (Claude Code, Codex, opencode, DeepSeek Harness…) | Yes, against a baseline (no diagram) | MIT | **1,288** |
| Long tail | mneme (ADR drift, 21★), mick-gsk/drift (Claude Code plugin, 16★), ridge (MCP, drift between commits, 6★), living-docs-skill (13★), fallow-skills (124★), svg-diagram (Bybit, 589★), Archscribe (352★) | Mostly no | Skills, MCP, plugins | Some | Mostly MIT | Small |

### B. Repo-to-diagram and codebase wiki

| Tool | What / input | Live? | Agent integration | Drift | License / price | Stars / traction |
|---|---|---|---|---|---|---|
| **GitDiagram** | GitHub URL (swap `hub` for `diagram`) to interactive Mermaid diagram, plus narrated one-minute videos; private repos via token | No | None found | No | MIT; free hosted | **17,223**. Show HN 222 pts (2024-12-27) |
| **DeepWiki** (Cognition) | Swap `github` for `deepwiki` to get a wiki with diagrams and Q&A; 50k+ repos pre-indexed | Re-indexed; not per edit | Free no-auth remote MCP (`ask_question`, `read_wiki_*`) | No | Free for public repos; private repos via Devin (**unverified**). Clone deepwiki-open: **18,084★** | HN 231 pts (2025-08-24) |
| **CodeViz** (YC S24) | VS Code extension, architecture down to call graphs; now "a diagram editor that understands your code" | On demand | IDE | No | Free; $19/mo individual, $50/mo teams (third-party listing) | Launch HN 189 pts (2024-08-29) |
| **Swimm** | Code-coupled docs; Mermaid diagrams with smart tokens that update with code; architecture maps queryable by MCP | Docs auto-sync | MCP | Flags stale docs, not intent | Commercial; price **unverified** | n/a |
| **Driver AI** | Pre-compiled, symbol-complete codebase context for agents | Multi-branch in progress | MCP | No | Commercial; **unverified** | n/a |
| **Greptile** | PR review over a repo graph | Per PR | GitHub app | Catches bugs, not intent | $30/seat Pro; base plus usage since 2026-03-05; free Starter seat since 2026-06-24 | Series A, $180M valuation (reported) |
| **CodeSee** | Code maps | n/a | n/a | n/a | **Shut down Feb 2024**; assets bought by GitKraken (May 2024) | Dead |

### C. Diagram suites with AI and MCP

| Tool | Summary | Price |
|---|---|---|
| **Eraser** (DiagramGPT) | Diagram-as-code from a prompt, Terraform, a schema, or a connected repo; MCP server for Claude, Cursor, VS Code, and ChatGPT; one-shot | Free (3 AI diagrams), Starter $15–20, Business $45–60 per member per month |
| **Mermaid Chart** (mermaid.ai) | Official MCP server and a "Claude MCP App" that renders in chat; Anthropic partner connector. Mermaid core: **90,447★** | **Unverified** |
| **IcePanel** | C4 model tool; MCP server reads *and writes* the model, "update the model and every view stays current"; kept up by hand | Free (≤5 editors), $40 / $80 per editor per month |
| **Structurizr** | C4 reference implementation; "vNext"; MCP server for DSL validation; its docs pitch "detecting architectural drift" by parsing the DSL | OSS; structurizr/java 1,136★ (archived) |
| **Lucid** | Lucid MCP server creates diagrams; Cloud Agent (beta) | Commercial |
| **Excalidraw / tldraw** | Canvases; Excalidraw open-sourced text-to-diagram (via Mermaid); MCP front-ends exist | 133,090★ / 50,605★ |

### D. Runtime-derived maps

- **Multiplayer.app**: an OpenTelemetry-driven System Dashboard that auto-discovers
  components, APIs, and dependencies from real traffic, with diffs over time. It needs
  instrumented, running systems, so it is useless before code runs. Pricing **unverified**.
- **AppMap + Navie**: runtime traces (calls, SQL, HTTP). Navie's `@diagram` draws sequence and
  class diagrams, and an MCP server (`get_call_tree`, `find_queries`…) runs locally.
  appmap-js has 53★.

### E. Repo-to-context packers (adjacent, not diagrams)

Repomix (**28,507★**), Gitingest (**15,662★**), and Aider's repo map (tree-sitter plus
personalized PageRank in about 1k tokens; Aider **49,218★**) pack code *for the model*. They
render nothing and remember no intent. Sourcegraph Cody is now enterprise-only ($59/user). Amp
split from Sourcegraph on 2025-12-02. Neither draws architecture.

### F. Architecture fitness functions

ArchUnit (**3,842★**, Java), dependency-cruiser (**7,224★**, JS/TS; validates rules and
renders graphs), and jQAssistant (**295★**, graph rules) are deterministic, need rules written
by hand, and know nothing about the conversation. Thoughtworks Radar lists "architecture drift
reduction with LLMs" as a technique that pairs these tools with LLM judgment. That is the slot
Smartypants fills, without anyone writing rules.

## Comparison table

| | Updates by itself every agent turn (hooks) | Remembers user intent from chat | Flags drift vs *intent* | Code + IaC catch-up | Layered, go-deeper | Local canvas / OSS | Marginal cost |
|---|---|---|---|---|---|---|---|
| **Smartypants** | **Yes** (prompt, edit, and Stop hooks in 5 hosts) | **Yes** (IntentCode) | **Yes**, each turn | Yes (Helm, k8s, compose, Terraform) | Yes (system → component → module) | Yes / license **missing** | ~$0.015 per 32-turn interview |
| Archify | No (on request) | No | Snapshot delta | Repo, git-verified | Multiple diagram types | HTML file / MIT | Host agent tokens |
| drawio-skill | Sync on request | No | Diagram diff, CI tests | Yes, broadest IaC | Multi-view | draw.io / MIT | Host agent tokens |
| Whiteboard | No (on request) | Decision log | No | Via agent | Some | Desktop app / MIT | Host agent tokens |
| GitDiagram | No | No | No | Code only | One level | Web / MIT | Free |
| DeepWiki | No | No | No | Code only | Wiki pages | Web + MCP / closed | Free (public) |
| CodeViz | No | No | No | Code | Yes (to calls) | VS Code / closed | $19+/mo |
| Eraser | No | No | No | Terraform, schema, repo | No | SaaS / closed | $15+/member |
| IcePanel | Kept by hand | Model is the intent | No | No | C4 levels | SaaS / closed | $40+/editor |
| Multiplayer | Yes, from runtime | No | Runtime diff | Runtime only | Some | SaaS / closed | **Unverified** |
| AppMap | From traces | No | No | Runtime | Sequence-level | Local / mixed | Free tier (**unverified**) |
| ArchUnit / dep-cruiser | In CI | Hand-written rules | Rules only | Code only | No | CLI / OSS | Free |

## Positioning options

1. **"The architecture diagram that draws itself while your agent codes, and tells you when
   the code wanders."** Plays up the two things no trending tool has: live updates through
   hooks and intent drift. Contrasts cleanly with Archify and GitDiagram ("you ask, it draws
   once"). Best for Show HN and X.
2. **"Your agent forgets what you asked for. Smartypants doesn't."** A guardrail framing aimed
   at the 2026 worry about "cognitive debt" and AI architectural drift (SIG, Thoughtworks,
   techdebt.guru, and HN comments on Whiteboard all voice it). It sells to team leads and
   survives the "just another diagram skill" objection.
3. **"A staff engineer's whiteboard for Claude Code, Codex, Pi, and Grok. Always current,
   about a tenth of a cent a turn."** Leads with the layered house style, multi-host support,
   and cost (Jev-style triage skips most turns). Best for marketplace listings and Reddit,
   where install friction and cost come up first.

My recommendation is (1) as the headline and (2) as the subhead. Name Archify and Whiteboard
in the comparison table rather than ignoring them.

## GitHub trending playbook

**What worked in 2026:**
- Archify: a skill that installs on any agent, visual output, a Chinese README, QbitAI press,
  and an underdog founder story on X.
- drawio-skill: a hero GIF of Terraform becoming a diagram, a comparison table against the
  official tool, and an English/中文 README.
- gstack: 134k★ since 2026-03-11 on a famous founder's name.
- rtk: 82k★, sold on a single measurable claim, "60–90% fewer tokens".
- Repomix grew to 28k★ with no HN success (its best post got 4 pts), riding tool-name keywords
  and integrations.

**README checklist:**
1. A 10–15 s hero GIF above the fold: Claude Code in the left pane typing *"Design YouTube
   top-K"*, the canvas filling in on the right, then a red drift flag appearing after an edit.
   The motion is the product.
2. Two install lines per host, above everything else: `/plugin install smartypants@…` and
   `npx smartypants init`. Also add a `SKILL.md`-only path so `npx skills add
   logan-robbins/smartypants` works. skills.sh ranks by install telemetry, with no submission.
3. **A zero-key demo:** `npx smartypants demo youtube-top-k && npx smartypants serve`, plus the
   GitHub Pages live demo. Show HN rules ask for "no signup"; needing an API key is a barrier.
4. Badges (license, npm, stars, "works with" host logos), a "vs Archify / GitDiagram /
   Whiteboard" table, a star-history chart, and README_zh.md.
5. A plain data-flow box. Say exactly what goes to Meta or Typesafe, and consider defaulting to
   the non-training `muse-spark-1.3` tier for launch. Otherwise the HN comment thread will be
   about the training-tier default.

**Launch sequence:**

| When | Action |
|---|---|
| T-14 d | Make the repo public and keep committing. awesome-claude-code requires 14 days of age plus active development, or 100★. Add a LICENSE. |
| T-10 d | Submit to the Claude directory (review time "isn't fixed"). Open a Grok PR. Publish to npm (Pi gallery). Submit to Cursor. |
| T0, Tue–Thu, 9am–12pm ET | Show HN with a plain title: "Show HN: Smartypants – a live architecture diagram for Claude Code and Codex". Reply for hours. Never ask for upvotes. |
| T0 + 2 h | X thread with the video. Tag hosts' devrel only where a mention is natural. |
| T+1 | Post to r/ClaudeAI, r/ChatGPTCoding, and r/codex (**unverified** sub rules; read each sidebar). Skip r/LocalLLaMA until there is a local-model flavor. |
| T+2–5 | Chinese channels: Juejin, V2EX, and a QbitAI pitch (the Archify precedent). Also DeepSeek Harness's `dsh-plugin` ecosystem (awesome-dsh-plugin, 17k★). |
| T+3 | Newsletters. Console.dev takes only pre-1.0 or beta devtools with self-serve access, so v0.2.0 qualifies. TLDR's submission path is **unverified**. |
| T+7 | Product Hunt (lower developer return on effort). |
| After 100★ | awesome-claude-code: web **issue form only**, no PRs, human-submitted, one resource at a time, a descriptive one-liner with no emojis. awesome-mcp-servers: PR, alphabetical, only if an MCP server ships. awesome-claude-plugins (composio), awesome-claude-code-toolkit, and awesome-dsh-plugin. |

**Name risk:** "SmartyPants" is also John Gruber's well-known typography filter. Search for
"smartypants claude code" or "smartypants diagram" to rank, and use those phrases in the repo
description and topics.

## Marketplace requirements

### (a) Anthropic: Claude directory and marketplaces

- **Routes.**
  - `claude-plugins-official` does **not** take portal submissions ("ask your partner
    contact").
  - The community marketplace (`claude-community`) is a read-only mirror fed from the
    directory review pipeline. Pull requests are auto-closed.
  - Submit from **`claude.ai/directory/manage`**. You need a paid plan (Pro or Max from your
    own account; Owner on Team or Enterprise).
  - `platform.claude.com/plugins/submit` is the old Console form. It "is no longer supported";
    move earlier submissions there by withdrawing or by emailing directory@anthropic.com.
- **Process.** The portal's **Validate** step runs, then Submit. A security scan runs on every
  new commit, and a person reviews a new listing. After that, merges to the tracked branch
  auto-publish once scanned. Subject to the Software Directory Terms and Policy.
- **Blocking checks:**
  - `.claude-plugin/plugin.json` present.
  - Kebab-case name that is unique and not reserved (`claude`, `official`, `mcp`…).
  - README of at least 40 words outside code blocks.
  - **LICENSE file or `license` field.**
  - No `.DS_Store` or similar system files.
  - Paths stay inside the plugin folder.
  - Package launchers pinned to exact versions.
  - No secrets.
  - Valid `hooks/hooks.json` and front matter.
  - Repo under 50 MiB.
- **Held for a reviewer:**
  - Hook scripts that aren't plain shell when the plugin sits in a repo **subfolder**.
    Smartypants' `node ${CLAUDE_PLUGIN_ROOT}/scripts/hook.mjs` in `plugins/smartypants`
    qualifies.
  - Credentials read from the environment and sent to a server (`META_API_KEY`). Use
    `userConfig` with `sensitive: true`.
  - Lockfile installs.
  - Files over 256 KiB.
- **Security scan** looks for undisclosed behavior ("Sends data to an undisclosed
  destination"). Name Meta and Typesafe as destinations in the README, and commit readable
  source.
- **Recommended:** run `claude plugin validate --strict` and `claude plugin eval`.

Checklist: ☐ LICENSE ☐ `license` in plugin.json ☐ README data-flow section ☐ API key via
`userConfig` ☐ consider moving the plugin to its own repo root, or a shell hook wrapper ☐
Validate in the portal ☐ submit from a paid claude.ai account.

### (b) OpenAI: Codex and ChatGPT Plugin Directory

- **One directory for ChatGPT and Codex** (the app directory migrated to it on 2026-07-09).
  - Submitters need the "Apps Management: Write" role and individual or business identity
    verification.
  - Accepted: **skills-only, remote-MCP, or both.** MCP servers must be public HTTPS with a
    verified domain.
- **Required material:**
  - Name, descriptions, logo, and category.
  - Website, support, **privacy policy**, and terms URLs.
  - Tool annotations (`readOnlyHint`, `openWorldHint`, `destructiveHint`).
  - **5 positive and 3 negative test cases.**
  - Starter prompts and release notes.
  - Demo credentials without MFA.
  - Skills go through automated policy and security scanning.
- **Common rejections:** trial or demo plugins, wrong annotations, misleading names, missing
  privacy policy.
- **Hooks:** Codex runs plugin hooks only after the user trusts them. "Installing a plugin on
  the web doesn't deploy them." So Smartypants' hook-driven core goes through a **repo
  marketplace** (`.agents/plugins/marketplace.json`, installed with `codex plugin marketplace
  add logan-robbins/smartypants`). A skills-only listing could serve as the directory
  storefront.

Checklist: ☐ verified identity ☐ privacy policy URL ☐ 5+3 test cases ☐ skills-only variant ☐
repo marketplace for hooks.

### (c) xAI: Grok Build

- Open a PR to `xai-org/plugin-marketplace`.
  - Third-party plugins go in `external_plugins/`, or as a `url` source with a **full 40-char
    commit `sha`**.
  - Add an entry in `.grok-plugin/marketplace.json` with `name` (kebab-case) and `source`
    required and `description` recommended.
  - Run `scripts/validate-catalog.py` locally.
  - CI plus code-owner review follow.
- Grok reads Claude Code marketplaces and plugins with no extra configuration, so the Claude
  plugin works as is.

Checklist: ☐ bump `.grok-plugin` version (it says 0.1.0 against 0.2.0) ☐ pin SHA ☐ validator
passes.

### (d) Cursor Marketplace

- Submit at `cursor.com/marketplace/publish`. **All plugins must be open source.** Every
  plugin and every update is manually reviewed.
- Checklist from the docs:
  - Unique kebab-case name.
  - Clear description.
  - Valid component files and front matter.
  - Logo committed and referenced by a relative path.
  - README covering usage and configuration.
  - Relative paths only (no `..`).
  - Tested locally.

Checklist: ☐ LICENSE ☐ logo ☐ confirm the hook events match Cursor's hook names
(**unverified**; Smartypants doesn't list Cursor as a supported host yet).

### (e) Pi packages gallery (pi.dev/packages)

- There is no review step. An **npm** package whose `keywords` include `pi-package` becomes
  eligible for the gallery. Optional `pi.image` and `pi.video` fields add previews.
- Users install with `pi install npm:<pkg>@<ver>`. Pi runs package code only after project
  trust.
- Smartypants already has the keyword and a `pi` manifest but **isn't on npm**.

Checklist: ☐ `npm publish` ☐ add `pi.image` (diagram.png) and `pi.video` ☐ declare the
`@earendil-works/*` host packages as `peerDependencies: "*"`.

## Sources

- Archify: https://github.com/tt-a1i/archify · https://www.kucoin.com/news/flash/github-trending-tool-archify-automates-architecture-diagrams-with-ai · https://dev.to/mehmetakar/archify-theyve-just-got-4239-github-stars-on-aug-28-2026-2ghd · https://botmonster.com/coding/archify-architecture-diagram-agent-skill/
- drawio-skill: https://github.com/Agents365-ai/drawio-skill
- Whiteboard: https://github.com/devdotfast/whiteboard · https://news.ycombinator.com/item?id=49833867
- draw.io MCP: https://github.com/jgraph/drawio-mcp · https://www.drawio.com/docs/manual/generate/drawio-mcp-server/ · https://medium.com/google-cloud/automating-mastering-infrastructure-diagrams-with-draw-io-mcp-and-antigravity-2839b78df143
- GitNexus: https://github.com/abhigyanpatwari/GitNexus · Aegis: https://github.com/GanyuanRan/Aegis · ridge: https://github.com/olgasafonova/ridge · mneme: https://github.com/MnemeHQ/mneme · drift: https://github.com/mick-gsk/drift
- GitDiagram: https://github.com/ahmedkhaleel2004/gitdiagram · https://news.ycombinator.com/item?id=42521769
- DeepWiki: https://cognition.com/blog/deepwiki-mcp-server · https://docs.devin.ai/work-with-devin/deepwiki-mcp · https://codersera.com/blog/deepwiki-complete-guide-2026/ · https://news.ycombinator.com/item?id=45002092 · https://github.com/AsyncFuncAI/deepwiki-open
- CodeViz: https://news.ycombinator.com/item?id=41393458 · https://news.ycombinator.com/item?id=46112279 · https://www.toptool.app/en/product/codeviz-yc-s24 · https://marketplace.visualstudio.com/items?itemName=CodeViz.codeviz
- Eraser: https://www.eraser.io/ai · https://docs.eraser.io/docs/using-ai-agent-integrations · https://www.therundown.ai/tools/eraser-ai
- Mermaid Chart: https://mermaid.ai/docs/ai/mcp-server · https://mermaid.ai/docs/ai/mcp-apps-server
- IcePanel: https://docs.icepanel.io/integrations/mcp-server · https://icepanel.io/pricing · https://icepanel.medium.com/top-integrations-to-use-with-icepanel-109f9460982d
- Structurizr: https://docs.structurizr.com/ai · https://www.bcs.org/events-calendar/2026/may/the-c4-model-structurizr-vnext-and-ai/
- Lucid: https://community.lucid.co/product-updates/lucid-suite-release-notes-june-2026-13650 · https://community.lucid.co/admin-questions-2/update-to-the-lucid-mcp-server-generate-diagrams-12684
- Excalidraw/tldraw: https://github.com/excalidraw/mermaid-to-excalidraw · https://codepic.cc/blog/excalidraw-vs-tldraw
- Multiplayer: https://www.multiplayer.app/system-dashboard/ · https://www.multiplayer.app/docs/features/system-auto-documentation/
- AppMap: https://appmap.io/ · https://appmap.io/docs/navie-reference.html
- Swimm: https://swimm.io/ · Driver: https://www.driver.ai/changelog/
- Greptile: https://weavai.app/blog/en/2026/05/12/greptile-2026-review-ai-code-review-pricing-debate/ · https://www.stork.ai/en/greptile
- Sourcegraph/Amp: https://sourcegraph.com/blog/changes-to-cody-free-pro-and-enterprise-starter-plans · https://weavai.app/blog/en/2026/04/30/sourcegraph-cody-review-2026-enterprise-ai-at-59-mo/
- CodeSee: https://www.gitkraken.com/press/gitkraken-acquires-codesee-launches-devex-platform · https://tracxn.com/d/companies/codesee/__o6zMe1rh78pFMS0ckgUz_zCAjuL7WytX_IcxS96VIKk
- Aider repo map: https://aider.chat/2023/10/22/repomap.html · Repomix: https://github.com/yamadashy/repomix · Gitingest: https://github.com/coderamp-labs/gitingest
- Fitness functions: https://github.com/TNG/ArchUnit · https://github.com/sverweij/dependency-cruiser · https://github.com/jQAssistant/jqassistant · https://www.thoughtworks.com/radar/techniques/architecture-drift-reduction-with-llms · https://www.softwareimprovementgroup.com/blog/architectural-debt-ai/ · https://techdebt.guru/ai-architecture-drift/
- HN data: https://hn.algolia.com/api (queries run 2026-09-27) · Show HN rules: https://news.ycombinator.com/showhn.html · https://syften.com/blog/hacker-news-marketing/
- Skills ecosystem: https://vercel.com/changelog/introducing-skills-the-open-agent-skills-ecosystem · https://www.skills.sh/ · https://rywalker.com/research/skills-sh
- Awesome lists: https://github.com/hesreallyhim/awesome-claude-code/blob/main/CONTRIBUTING.md · https://github.com/punkpeye/awesome-mcp-servers/blob/main/CONTRIBUTING.md · https://github.com/composio-community/awesome-claude-plugins · https://github.com/rohitg00/awesome-claude-code-toolkit · https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
- Newsletters: https://console.dev/selection-criteria · https://tldr.tech/
- Anthropic: https://code.claude.com/docs/en/plugins/publish · https://code.claude.com/docs/en/plugins/anthropic-marketplaces · https://claude.com/docs/directory/publish · https://claude.com/docs/plugins/pre-submission-checklist · https://claude.com/blog/build-plugins-for-claude · https://github.com/anthropics/claude-plugins-official · https://github.com/anthropics/claude-plugins-community · https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy · https://platform.claude.com/plugins/submit
- OpenAI: https://developers.openai.com/plugins/deploy/submission · https://developers.openai.com/plugins/app-guidelines · https://developers.openai.com/plugins/build/plugins · https://learn.chatgpt.com/docs/plugins · https://help.openai.com/en/articles/20001256-plugins-in-codex
- xAI: https://github.com/xai-org/plugin-marketplace · https://docs.x.ai/build/features/skills-plugins-marketplaces · https://x.ai/news/grok-plugin-marketplace · https://www.marktechpost.com/2026/06/11/xai-ships-grok-build-plugin-marketplace-with-mongodb-vercel-sentry-chrome-devtools-cloudflare-and-superpowers-plugins-at-launch/
- Cursor: https://cursor.com/docs/plugins · https://cursor.com/docs/reference/plugins · https://cursor.com/blog/marketplace
- Pi: https://pi.dev/packages · https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md
- GitHub star counts: GitHub search API via the GitHub MCP connector, 2026-09-27.
