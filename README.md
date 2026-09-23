# Smartypants

Smartypants watches a coding agent while it designs a system, keeps a diagram of that design, and flags the places where the code that landed does not match what was asked for.

The diagram stops at three levels:

- **System.** The whole application a person would name when asked what is being built.
- **Component.** A major part of that system that owns one job other parts can depend on without its internals. A component is not a file or a function.
- **Module.** A cohesive slice inside exactly one component that does one part of that component's job, still above individual types and functions.

`system` draws only the system. `component` draws the system and its components. `module` draws system, then component, then module. `module` is the default. A file, class, function, or endpoint is never a node.

Each node carries a short **what** (what it does) and a short **why** (why it exists here), in the words of the project. When delivered code diverges from that intent, the node gets one drift flag stating the intent and how the code differs. The same divergence is recorded once. A divergence that fits no node is still kept.

## Turn it on

The hook is inert until the project root contains `smartypants.config.json`. Copy the starter and set the flavor you want the builder to call:

```sh
cp smartypants.config.example.json smartypants.config.json
```

```json
{
  "flavor": "claude",
  "depth": "module",
  "seed": false
}
```

`flavor` is exactly one of `claude`, `codex`, `grok`, `muse`, or `pi`. A missing or unknown flavor does not fall through to another SDK. `depth` may be omitted; it then defaults to `module`.

`seed` is `true` or `false`. Omit it and it stays `false`. Set `seed` to `true` when you add the hook to a project that already has code. The first turn draws the system that is already in the tree, using file names rather than file contents, and marks that diagram as the baseline. Later turns record only the delta: new intent, and drift between that intent and the code that landed. The baseline is drawn once.

Smartypants keeps that history in `.smartypants/ledger.json`. Each entry is a gist, a few dozen valuable words, never the transcript of the turn. When the ledger passes about 10,000 tokens, older gists are folded into one shorter gist so the file stays inside that budget.

| Flavor | Builder |
| --- | --- |
| `claude` | Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`), key `ANTHROPIC_API_KEY` |
| `codex` | OpenAI Agents SDK (`@openai/agents`), key `OPENAI_API_KEY` |
| `grok` | Official xAI API through its OpenAI-compatible client (`openai` pointed at `https://api.x.ai/v1`), key `XAI_API_KEY`, model `grok-4.7` |
| `muse` | `@muse-code/sdk` with a `muse` binary on `PATH` |
| `pi` | Pi coding-agent SDK (`@earendil-works/pi-coding-agent`) |

The hook returns immediately on a missing SDK, a missing key, or a timeout. The previous design stays on disk, and the user's prompt and tool call proceed unchanged. While a builder turn is in flight, a hook that turn fires returns immediately too, so Muse and Pi do not start a second builder. The Claude call uses `dontAsk` with an empty tool list, and the Pi session is opened with `noExtensions`.

## Hooks

Registration is project-local. This repo ships the four command-hook manifests and the Pi extension. They all call the same pipeline (`bin/smartypants-hook.mjs`, or the Pi extension's import of `src/pipeline.js`).

| Host | File | Events |
| --- | --- | --- |
| Claude Code | `.claude/settings.json` | `UserPromptSubmit`, `PostToolUse` on `Write` / `Edit` |
| Codex | `.codex/hooks.json` | same shape. Codex hooks are experimental (`codex_hooks`) and are not available on Windows |
| Grok Build | `.grok/hooks/smartypants.json` | same Claude-compatible shape. Grok also loads `.claude/settings.json`, so both may fire; applying the same result twice does not duplicate nodes |
| Muse Code | `.muse/hooks.json` | `UserPromptSubmit`, `PostToolUse` on write / edit |
| Pi | `.pi/extensions/smartypants/index.js` | `input`, and `tool_result` for write / edit |

Pi has no command-hook JSON. Enable the extension with `pi -e .pi/extensions/smartypants/index.js`, or leave it in `.pi/extensions/` so Pi discovers it. The extension passes the turn through unchanged.

From another project, point the hook command at this repo and keep `smartypants.config.json` in that project's root. The hook reads the config from its working directory.

## Canvas

The design is stored at `.smartypants/design.json`. The page is an infinite canvas: drag to pan, scroll to zoom, containment edges from system to component to module, and drift drawn in amber.

```sh
node bin/smartypants-serve.mjs
```

Open `http://127.0.0.1:4173`. Opening `web/index.html` as a `file:` URL shows these serve instructions instead of a blank page. Reload the served page to see the same persisted design.

## Tests

```sh
npm test
```
