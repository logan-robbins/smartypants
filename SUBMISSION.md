# Marketplace submission checklist

Plugin: `smartypants` 0.2.0, directory `plugins/smartypants`, marketplace
`.claude-plugin/marketplace.json` (Claude Code), `.agents/plugins/marketplace.json` (Codex),
`.grok-plugin/marketplace.json` (Grok Build), `.cursor-plugin` (Cursor), and a `pi` manifest in
`package.json` (Pi packages).

## Ready

- [x] `claude plugin validate --strict plugins/smartypants` passes.
- [x] `claude plugin validate --strict .` (marketplace) passes.
- [x] Installs with `/plugin marketplace add logan-robbins/smartypants` and
      `/plugin install smartypants@smartypants`; verified with a clean `CLAUDE_CONFIG_DIR`.
- [x] Components: 1 skill (`smartypants`), 8 commands (`deeper`, `catchup`, `review`, `intent`, `drift`,
      `diagram`, `mermaid`, `reset-graph`), 3 hooks (`UserPromptSubmit`, `PostToolUse`, `Stop`). About 340 always-on
      tokens per session (`claude plugin details smartypants`).
- [x] Plugin eval suite `plugins/smartypants/evals` (3 cases): with plugin 9/9 runs pass,
      without plugin 0/9; mean Δ +1.00 (`claude plugin eval plugins/smartypants --runs 3`).
- [x] Hooks are inert unless the project has `smartypants.config.json` and the package is
      installed; a project that wires its own hook is not run twice; hooks always exit 0 and, in
      background mode, return immediately.
- [x] End-to-end runs with the real CLIs: Claude Code 2.1.283 (`claude -p`, project hook and
      plugin hook), Codex CLI 0.157.1 (`codex exec`, `UserPromptSubmit` + `apply_patch`
      `PostToolUse`), Pi 0.87.1 (`pi --print` with the project extension, running on Muse Spark).
- [x] Screenshots: `diagram.png` (canvas, a monorepo caught up from code) and `docs/panel.png` (click to read more).
- [x] 67 unit and integration tests (`npm test`), no network.
- [x] Website with a live demo in `site/`, deployed by `.github/workflows/pages.yml` once Pages is
      set to GitHub Actions in the repository settings.

## Needs the owner

Blocking (from the 2026 requirements in [docs/research/competitors.md](docs/research/competitors.md)):

- [x] **LICENSE.** Apache-2.0 (`LICENSE` + `NOTICE`, copied into `plugins/smartypants/`), with
      `"license": "Apache-2.0"` in `package.json` and every plugin manifest. Apache-2.0 over MIT:
      same adoption, plus an explicit patent grant and a NOTICE file that forks and redistributions
      must carry (section 4(d)), so credit travels with the code.
- [ ] **Data disclosure.** README section "What leaves your machine" names every destination
      (Meta Model API, optionally Typesafe). The default `muse-spark-1.3-contributor` tier lets
      Meta train on that traffic; decide whether launch installs default to `muse-spark-1.3`
      (no training). Security scans flag undisclosed destinations.
- [ ] **Pin installs.** Tag a release (`v0.2.0`) and change `npm install github:logan-robbins/smartypants`
      to `…#v0.2.0` (or publish to npm and pin the version) — unpinned launchers are blocking.

Routes:

- [ ] **Claude Code** — submit from **claude.ai/directory/manage** (paid plan). The older
      `platform.claude.com/plugins/submit` form is no longer supported. Expect a human review
      because the hook runs a Node script from a repo subfolder and calls an outside API; the
      key is declared as a sensitive `userConfig` (stored in the OS credential store).
- [ ] **Grok Build** — PR to `xai-org/plugin-marketplace`: an entry in
      `.grok-plugin/marketplace.json` with a `url` source pinned to a full 40-character commit
      SHA; run `scripts/validate-catalog.py`. Grok reads the Claude plugin as is.
- [ ] **Codex** — the hook-driven plugin ships through this repo's marketplace
      (`codex plugin marketplace add logan-robbins/smartypants`). The OpenAI directory accepts
      skills-only or remote-MCP listings: verified identity, privacy policy URL, 5 positive and
      3 negative test cases; list the skill as the storefront.
- [ ] **Cursor** — open-source requirement plus manual review of name, description, logo, README.
- [ ] **Pi** — `npm publish`; the `pi-package` keyword lists it in the Pi gallery automatically.
- [ ] **skills.sh** — `npx skills add logan-robbins/smartypants` installs the skill; the
      leaderboard ranks by installs, no submission.

## Host notes for the listing

- **Codex** runs project hooks only after they are approved in the startup hooks review
  (automation can pass `--dangerously-bypass-hook-trust`). Its edit tool is `apply_patch`,
  which Smartypants parses.
- **Pi**: `pi install git:github.com/logan-robbins/smartypants` loads the extension and skill
  from the `pi` manifest. `npx smartypants init` also writes `.pi/extensions/smartypants/index.js`.
  Pi itself can run on Muse Spark through a `models.json` provider (see README).
