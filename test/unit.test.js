import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { lookupConfig, readConfig } from "../src/config.js";
import { FLAVOR_IDS } from "../src/flavors/ids.js";
import { handleHook } from "../src/pipeline.js";
import { normalizeStdin } from "../src/normalize.js";
import { MODULE_DEFINITION, SYSTEM_DEFINITION } from "../src/taxonomy.js";
import { designFile, readBytes, tempProject } from "./helpers.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PACKAGES = {
  meta: "meta-model-api",
  claude: "@anthropic-ai/claude-agent-sdk",
  codex: "@openai/agents",
  grok: "openai",
  muse: "@muse-code/sdk",
  pi: "@earendil-works/pi-coding-agent",
};

const APIS = {
  meta: "meta.chat.completions",
  claude: "query",
  codex: "run",
  grok: "chat.completions",
  muse: "MuseClient.spawn",
  pi: "createAgentSession",
};

function silence(fn) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args.join(" "));
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.error = original;
    })
    .then((value) => ({ value, lines }));
}

test("absent config leaves the design untouched and invokes no flavor", async () => {
  const root = tempProject();
  const file = designFile(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{"version":1,"nodes":[{"id":"keep"}]}\n');
  const before = fs.readFileSync(file);
  const { value, lines } = await silence(() =>
    handleHook({
      cwd: root,
      stdin: JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        prompt: "Design a household ledger with a capture component",
      }),
    }),
  );
  assert.equal(value.exitCode, 0);
  assert.equal(value.inert, true);
  assert.equal(value.adapterInvoked, false);
  assert.equal(value.request, null);
  assert.deepEqual(fs.readFileSync(file), before);
  assert.equal(lines.some((line) => line.includes("flavor=")), false);
});

test("omitted depth selects the module floor and each flavor builds only its own request", async () => {
  for (const flavor of FLAVOR_IDS) {
    const root = tempProject({ flavor });
    assert.equal(lookupConfig(root).depth, "module");
    assert.equal(lookupConfig(root).flavor, flavor);
    const { value } = await silence(() =>
      handleHook({
        cwd: root,
        timeoutMs: 800,
        stdin: JSON.stringify({
          hook_event_name: "UserPromptSubmit",
          prompt: "Design the household ledger and the parts it needs",
        }),
      }),
    );
    assert.equal(value.adapterInvoked, true);
    assert.equal(value.request.flavor, flavor);
    assert.equal(value.request.sdk.flavor, flavor);
    assert.equal(value.request.sdk.package, PACKAGES[flavor]);
    assert.equal(value.request.sdk.api, APIS[flavor]);
    assert.equal(value.request.floor, "module");
    assert.equal(value.request.instructions.includes(SYSTEM_DEFINITION), true);
    assert.equal(value.request.instructions.includes(MODULE_DEFINITION), true);
    assert.equal(value.request.instructions.includes("Depth floor for this request: module."), true);
    for (const other of FLAVOR_IDS) {
      if (other === flavor) continue;
      assert.notEqual(value.request.flavor, other);
      assert.notEqual(value.request.sdk.flavor, other);
      assert.notEqual(value.request.sdk.package, PACKAGES[other]);
      assert.notEqual(value.request.sdk.api, APIS[other]);
    }
    if (flavor === "grok") {
      assert.equal(value.request.sdk.baseURL, "https://api.x.ai/v1");
      assert.equal(value.request.model, "grok-4.7");
    }
    assert.equal(readBytes(designFile(root)), null);
  }
});

test("a configured depth is the floor on the request, and an invalid depth stays inert", async () => {
  const componentRoot = tempProject({ flavor: "muse", depth: "component" });
  const { value } = await silence(() =>
    handleHook({
      cwd: componentRoot,
      timeoutMs: 800,
      stdin: JSON.stringify({ hookEventName: "UserPromptSubmit", prompt: "Design the ledger" }),
    }),
  );
  assert.equal(value.request.floor, "component");
  assert.equal(value.request.flavor, "muse");
  assert.equal(value.request.instructions.includes("Depth floor for this request: component."), true);

  const broken = tempProject({ flavor: "claude", depth: "function" });
  const { value: skipped } = await silence(() =>
    handleHook({
      cwd: broken,
      stdin: JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "Design the ledger" }),
    }),
  );
  assert.equal(skipped.adapterInvoked, false);
  assert.equal(skipped.request, null);
  assert.equal(readBytes(designFile(broken)), null);
});

test("Codex configuration passes model and reasoning effort to its agent request", async () => {
  const root = tempProject({
    flavor: "codex",
    model: "gpt-6-luna",
    reasoningEffort: "high",
  });
  const found = readConfig(root);
  assert.equal(found.config.model, "gpt-6-luna");
  assert.equal(found.config.reasoningEffort, "high");
  const { value } = await silence(() =>
    handleHook({
      cwd: root,
      timeoutMs: 800,
      stdin: JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "Design the ledger" }),
    }),
  );
  assert.equal(value.request.model, "gpt-6-luna");
  assert.equal(value.request.reasoningEffort, "high");
});

test("an unsupported reasoning effort leaves Smartypants inert", () => {
  const root = tempProject({ flavor: "codex", reasoningEffort: "ultra" });
  const found = readConfig(root);
  assert.equal(found.config, null);
  assert.equal(found.reason, "invalid-reasoning-effort");
});

test("an invalid flavor invokes none and does not fall through", async () => {
  const root = tempProject({ flavor: "gpt" });
  const found = readConfig(root);
  assert.equal(found.config, null);
  assert.equal(found.reason, "invalid-flavor");
  const { value } = await silence(() =>
    handleHook({
      cwd: root,
      stdin: JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "Design a system" }),
    }),
  );
  assert.equal(value.adapterInvoked, false);
  assert.equal(value.request, null);
  assert.equal(value.exitCode, 0);
  assert.equal(readBytes(designFile(root)), null);
});

test("host payloads normalize into user text or a delivered edit", () => {
  const claude = normalizeStdin(
    JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "Design the ledger" }),
  );
  assert.equal(claude.type, "user");
  assert.equal(claude.text, "Design the ledger");

  const codex = normalizeStdin(
    JSON.stringify({ event: "user_prompt_submit", prompt: "Design the ledger in Codex" }),
  );
  assert.equal(codex.text, "Design the ledger in Codex");

  const grok = normalizeStdin(
    JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "Design the ledger in Grok" }),
  );
  assert.equal(grok.text, "Design the ledger in Grok");

  const muse = normalizeStdin(
    JSON.stringify({ hookEventName: "UserPromptSubmit", prompt: "Design the ledger in Muse" }),
  );
  assert.equal(muse.text, "Design the ledger in Muse");

  const edit = normalizeStdin(
    JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Edit",
      tool_input: {
        file_path: "src/capture/receipts.ts",
        old_string: "chargeMonthly",
        new_string: "chargeWeekly",
      },
    }),
  );
  assert.equal(edit.type, "edit");
  assert.equal(edit.path, "src/capture/receipts.ts");
  assert.equal(edit.contents, "chargeWeekly");
  assert.equal(edit.diff.includes("chargeMonthly"), true);
  assert.equal(edit.diff.includes("chargeWeekly"), true);

  const read = normalizeStdin(
    JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_input: { file_path: "src/a.ts" },
    }),
  );
  assert.equal(read, null);
});

test("command hooks and the Pi extension point at the shared pipeline", () => {
  const manifests = [
    ".claude/settings.json",
    ".codex/hooks.json",
    ".grok/hooks/smartypants.json",
    ".muse/hooks.json",
  ];
  for (const relative of manifests) {
    const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, relative), "utf8"));
    const prompt = manifest.hooks.UserPromptSubmit[0].hooks[0];
    const edit = manifest.hooks.PostToolUse[0];
    assert.equal(prompt.type, "command");
    assert.equal(prompt.command.includes("bin/smartypants-hook.mjs"), true);
    assert.equal(edit.matcher.includes("Write"), true);
    assert.equal(edit.matcher.includes("Edit"), true);
    assert.equal(edit.hooks[0].command.includes("bin/smartypants-hook.mjs"), true);
  }
  const extension = fs.readFileSync(path.join(rootDir, "src/pi-extension.js"), "utf8");
  const entry = fs.readFileSync(path.join(rootDir, ".pi/extensions/smartypants/index.js"), "utf8");
  assert.equal(entry.includes('from "../../../src/pi-extension.js"'), true);
  assert.equal(extension.includes('from "./dispatch.js"'), true);
  assert.equal(fs.readFileSync(path.join(rootDir, "src/dispatch.js"), "utf8").includes('from "./pipeline.js"'), true);
  assert.equal(extension.includes('pi.on("input"'), true);
  assert.equal(extension.includes('pi.on("tool_result"'), true);
  assert.equal(extension.includes("isEditTool"), true);
  assert.equal(extension.includes('action: "continue"'), true);
  assert.equal(extension.includes("transform"), false);
});
