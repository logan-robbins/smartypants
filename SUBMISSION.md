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
- [x] Components: 1 skill (`smartypants`), 6 commands (`deeper`, `intent`, `drift`, `diagram`,
      `mermaid`, `reset-graph`), 2 hooks (`UserPromptSubmit`, `PostToolUse`). About 340 always-on
      tokens per session (`claude plugin details smartypants`).
- [x] Plugin eval suite `plugins/smartypants/evals` (3 cases): with plugin 9/9 runs pass,
      without plugin 0/9; mean Δ +1.00 (`claude plugin eval plugins/smartypants --runs 3`).
- [x] Hooks are inert unless the project has `smartypants.config.json` and the package is
      installed; a project that wires its own hook is not run twice; hooks always exit 0 and, in
      background mode, return immediately.
- [x] End-to-end runs with the real CLIs: Claude Code 2.1.283 (`claude -p`, project hook and
      plugin hook), Codex CLI 0.157.1 (`codex exec`, `UserPromptSubmit` + `apply_patch`
      `PostToolUse`), Pi 0.87.1 (`pi --print` with the project extension, running on Muse Spark).
- [x] Screenshots: `diagram.png` (canvas, YouTube Top-K) and `docs/panel.png` (click to read more).
- [x] 60 unit and integration tests (`npm test`), no network.

## Needs the owner

- [ ] **License.** The repository has no LICENSE file. Choose one before submitting; catalog
      reviewers and `npm` both expect it. Add `"license"` to `package.json` and the plugin
      manifests to match.
- [ ] **Data disclosure** for the listing. With the default `meta` flavor, design turns, file
      paths, and edited file contents are sent to the Meta Model API. The default model,
      `muse-spark-1.3-contributor`, is Meta's Contributor tier, which is discounted in exchange
      for Meta's right to train on that traffic. Projects that cannot share code should set
      `"model": "muse-spark-1.3"` or another flavor. With `TYPESAFE_API_KEY`, turn text and part
      names also go to Typesafe (Jev). Nothing is sent without `smartypants.config.json`.
- [ ] **npm publish** (optional). The plugin tells users to `npm install
      github:logan-robbins/smartypants`. Publishing `@logan-robbins/smartypants` would let
      users install from the registry and let Pi use `pi install npm:@logan-robbins/smartypants`.
- [ ] **Submit** at https://platform.claude.com/plugins/submit (Anthropic community catalog)
      and https://platform.openai.com/plugins (OpenAI directory for Codex). Both need a
      signed-in owner.


## Host notes for the listing

- **Codex** runs project hooks only after they are approved in the startup hooks review
  (automation can pass `--dangerously-bypass-hook-trust`). Its edit tool is `apply_patch`,
  which Smartypants parses.
- **Pi**: `pi install git:github.com/logan-robbins/smartypants` loads the extension and skill
  from the `pi` manifest. `npx smartypants init` also writes `.pi/extensions/smartypants/index.js`.
  Pi itself can run on Muse Spark through a `models.json` provider (see README).
