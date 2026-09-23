import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import factory from "../.pi/extensions/smartypants/index.js";
import { designFile, readBytes, tempProject } from "./helpers.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hookPath = path.join(packageRoot, "bin/smartypants-hook.mjs");

const designPrompt =
  "Design a household ledger system. It needs a capture component that records purchases, and a receipt intake module inside capture that turns receipt photos into purchase records so nobody retypes the slip.";

function runHook(root, payload) {
  return spawnSync(process.execPath, [hookPath], {
    cwd: root,
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
}

test("hook launches stay inert without config and name the configured flavor with it", async () => {
  const bare = tempProject();
  const claudePayload = { hook_event_name: "UserPromptSubmit", prompt: designPrompt, session_id: "claude-1" };
  const first = runHook(bare, claudePayload);
  const second = runHook(bare, claudePayload);
  const codex = runHook(bare, { event: "user_prompt_submit", prompt: designPrompt, session_id: "codex-1" });
  const grok = runHook(bare, { hook_event_name: "UserPromptSubmit", prompt: designPrompt, source: "grok" });
  const muse = runHook(bare, { hookEventName: "UserPromptSubmit", prompt: designPrompt, source: "muse" });
  for (const run of [first, second, codex, grok, muse]) {
    assert.equal(run.status, 0);
    assert.equal(run.stdout, "");
    assert.equal(run.stderr.includes("flavor="), false);
  }
  assert.equal(readBytes(designFile(bare)), null);

  const handlers = {};
  factory({
    on(name, fn) {
      handlers[name] = fn;
    },
  });
  const continued = await handlers.input({ text: designPrompt, source: "interactive" }, { cwd: bare });
  assert.deepEqual(continued, { action: "continue" });
  assert.equal(readBytes(designFile(bare)), null);

  for (const flavor of ["claude", "codex", "grok", "muse"]) {
    const root = tempProject({ flavor, depth: "module", timeoutMs: 4000 });
    const payload =
      flavor === "codex"
        ? { event: "user_prompt_submit", prompt: designPrompt }
        : flavor === "muse"
          ? { hookEventName: "UserPromptSubmit", prompt: designPrompt }
          : { hook_event_name: "UserPromptSubmit", prompt: designPrompt, source: flavor };
    const runs = flavor === "claude" ? [runHook(root, payload), runHook(root, payload)] : [runHook(root, payload)];
    const snapshots = [];
    for (const run of runs) {
      assert.equal(run.status, 0);
      assert.equal(run.stdout, "");
      assert.equal(run.stderr.includes(`flavor=${flavor}`), true);
      assert.equal(run.stderr.includes("kind=design"), true);
      snapshots.push(readBytes(designFile(root)));
    }
    assert.deepEqual(snapshots[0], snapshots[snapshots.length - 1]);
  }

  const piRoot = tempProject({ flavor: "pi", timeoutMs: 4000 });
  const piHandlers = {};
  factory({
    on(name, fn) {
      piHandlers[name] = fn;
    },
  });
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args.join(" "));
  try {
    const action = await piHandlers.input({ text: designPrompt, source: "interactive" }, { cwd: piRoot });
    assert.deepEqual(action, { action: "continue" });
    await piHandlers.tool_result({ toolName: "read", input: { path: "README.md" } }, { cwd: piRoot });
    await piHandlers.tool_result(
      { toolName: "write", input: { path: "src/capture/receipts.ts", content: "export const later = 7;\n" } },
      { cwd: piRoot },
    );
  } finally {
    console.error = original;
  }
  const joined = lines.join("\n");
  assert.equal(joined.includes("flavor=pi"), true);
  assert.equal(joined.includes("kind=design"), true);
  assert.equal(joined.includes("kind=drift"), true);
  assert.equal(readBytes(designFile(piRoot)), null);
});
