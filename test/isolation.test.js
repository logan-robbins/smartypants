import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { claudeQueryOptions } from "../src/flavors/claude.js";
import { piAgentDir, piBuilderPlan } from "../src/flavors/pi.js";
import { BUILDER_GUARD, handleHook, withBuilderGuard } from "../src/pipeline.js";
import { designFile, readBytes, tempProject } from "./helpers.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hookPath = path.join(packageRoot, "bin/smartypants-hook.mjs");
const designPrompt = {
  hook_event_name: "UserPromptSubmit",
  prompt: "Design a household ledger and the capture component that records each purchase",
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

test("claude query options deny prompts and ship no tools", () => {
  const schema = { type: "object", properties: { isDesign: { type: "boolean" } } };
  const options = claudeQueryOptions(schema);
  assert.equal(options.permissionMode, "dontAsk");
  assert.equal(options.allowDangerouslySkipPermissions, undefined);
  assert.equal(Object.hasOwn(options, "allowedTools"), false);
  assert.equal(Object.hasOwn(options, "allowDangerouslySkipPermissions"), false);
  assert.deepEqual(options.tools, []);
  assert.deepEqual(options.settingSources, []);
  assert.equal(options.maxTurns, 1);
  assert.equal(options.outputFormat.type, "json_schema");
  assert.equal(options.outputFormat.schema, schema);
  assert.equal(JSON.stringify(options).includes("bypassPermissions"), false);
});

test("the pi builder loader does not discover project extensions", () => {
  const cwd = path.join(packageRoot, "ledger-workspace");
  const plan = piBuilderPlan(cwd);
  const override = process.env.PI_CODING_AGENT_DIR;
  const expectedAgentDir =
    typeof override === "string" && override.trim()
      ? path.resolve(override.trim())
      : path.join(os.homedir(), ".pi", "agent");
  assert.equal(plan.cwd, cwd);
  assert.equal(plan.loader.cwd, cwd);
  assert.equal(plan.loader.noExtensions, true);
  assert.equal(typeof plan.loader.agentDir, "string");
  assert.ok(plan.loader.agentDir.length > 0);
  assert.equal(path.isAbsolute(plan.loader.agentDir), true);
  assert.equal(plan.loader.agentDir, expectedAgentDir);
  assert.equal(plan.loader.agentDir, piAgentDir());
  assert.equal(plan.loader.agentDir.startsWith("/"), true);
  assert.deepEqual(plan.tools, ["read"]);
  assert.equal(plan.tools.includes("write"), false);
  assert.equal(plan.tools.includes("edit"), false);
  assert.equal(plan.tools.includes("bash"), false);
});

test("a hook fired while the builder is running returns before any flavor", async () => {
  const root = tempProject({ flavor: "muse", depth: "module" });
  const stdin = JSON.stringify(designPrompt);
  const open = await silence(() => handleHook({ cwd: root, timeoutMs: 800, stdin }));
  assert.equal(open.value.adapterInvoked, true);
  assert.equal(open.value.request.flavor, "muse");

  const nested = await withBuilderGuard(() => silence(() => handleHook({ cwd: root, timeoutMs: 800, stdin })));
  assert.equal(nested.value.exitCode, 0);
  assert.equal(nested.value.adapterInvoked, false);
  assert.equal(nested.value.request, null);
  assert.equal(nested.value.designChanged, false);
  assert.equal(nested.lines.some((line) => line.includes("flavor=")), false);
  assert.equal(readBytes(designFile(root)), null);

  const after = await silence(() => handleHook({ cwd: root, timeoutMs: 800, stdin }));
  assert.equal(after.value.adapterInvoked, true);
  assert.equal(after.value.request.flavor, "muse");
  assert.equal(process.env[BUILDER_GUARD], undefined);
});

test("a child hook process sees the builder guard and does not start another builder", () => {
  for (const flavor of ["muse", "pi"]) {
    const root = tempProject({ flavor, depth: "module" });
    const proc = spawnSync(process.execPath, [hookPath], {
      cwd: root,
      env: { ...process.env, [BUILDER_GUARD]: "1" },
      input: JSON.stringify(designPrompt),
      encoding: "utf8",
    });
    assert.equal(proc.status, 0);
    assert.equal(proc.stdout, "");
    assert.equal(proc.stderr.includes("flavor="), false);
    assert.equal(proc.stderr.includes("Cannot find package"), false);
    assert.equal(readBytes(designFile(root)), null);
  }
});
