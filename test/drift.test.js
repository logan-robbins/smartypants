import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { applyDrift } from "../src/drift.js";
import { applyDesign, emptyDesign, loadDesign, saveDesign } from "../src/model.js";
import { handleHook } from "../src/pipeline.js";
import { ledgerResult, weeklyDrift } from "./fixture.js";
import { designFile, tempProject } from "./helpers.js";

function silence(fn) {
  const original = console.error;
  console.error = () => {};
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.error = original;
    });
}

test("drift flags the named node once, ignores a match, and keeps an unmapped divergence", () => {
  const design = applyDesign(emptyDesign(), ledgerResult, "module").design;
  const flagged = applyDrift(design, weeklyDrift);
  assert.equal(flagged.changed, true);
  const capture = flagged.design.nodes.find((node) => node.id === "capture");
  assert.equal(capture.flags.length, 1);
  assert.equal(capture.flags[0].intent, weeklyDrift.intent);
  assert.equal(capture.flags[0].difference, weeklyDrift.difference);
  const ledger = flagged.design.nodes.find((node) => node.id === "ledger");
  assert.equal(ledger.flags.length, 0);

  const again = applyDrift(flagged.design, weeklyDrift);
  assert.equal(again.changed, false);
  assert.equal(again.design, flagged.design);
  assert.equal(again.design.nodes.find((node) => node.id === "capture").flags.length, 1);

  const matched = applyDrift(flagged.design, { diverges: false, nodeId: "capture", intent: "", difference: "" });
  assert.equal(matched.changed, false);
  assert.equal(matched.design.nodes.find((node) => node.id === "capture").flags.length, 1);

  const unmapped = applyDrift(flagged.design, {
    diverges: true,
    nodeId: null,
    intent: "Receipts should stay on the device",
    difference: "The code uploads every receipt to a third-party bucket",
  });
  assert.equal(unmapped.changed, true);
  assert.equal(unmapped.design.unmappedFlags.length, 1);
  assert.equal(unmapped.design.unmappedFlags[0].intent, "Receipts should stay on the device");
  assert.equal(
    unmapped.design.unmappedFlags[0].difference,
    "The code uploads every receipt to a third-party bucket",
  );
  const unknown = applyDrift(unmapped.design, {
    diverges: true,
    nodeId: "does-not-exist",
    intent: "Tips stay with the server",
    difference: "The code drops the tip on the floor",
  });
  assert.equal(unknown.design.unmappedFlags.length, 2);
  const repeat = applyDrift(unknown.design, {
    diverges: true,
    nodeId: null,
    intent: "Receipts should stay on the device",
    difference: "The code uploads every receipt to a third-party bucket",
  });
  assert.equal(repeat.changed, false);
  assert.equal(repeat.design.unmappedFlags.length, 2);
});

test("the post-edit hook hands path and delivered contents to the configured flavor", async () => {
  const root = tempProject({ flavor: "codex", depth: "module" });
  const seeded = applyDesign(emptyDesign(), ledgerResult, "module");
  saveDesign(root, seeded.design);
  const before = fs.readFileSync(designFile(root));
  const payload = {
    hook_event_name: "PostToolUse",
    tool_name: "Write",
    tool_input: {
      file_path: "src/capture/receipts.ts",
      content: "export function saveReceipt() { return schedule(7); }\n",
    },
  };
  const result = await silence(() =>
    handleHook({
      cwd: root,
      timeoutMs: 800,
      stdin: JSON.stringify(payload),
    }),
  );
  assert.equal(result.adapterInvoked, true);
  assert.equal(result.request.flavor, "codex");
  assert.equal(result.request.kind, "drift");
  assert.equal(result.request.sdk.package, "@openai/agents");
  assert.notEqual(result.request.sdk.package, "@anthropic-ai/claude-agent-sdk");
  assert.equal(result.request.delivered.path, "src/capture/receipts.ts");
  assert.equal(result.request.delivered.contents.includes("saveReceipt"), true);
  assert.equal(result.request.prompt.includes("src/capture/receipts.ts"), true);
  assert.equal(result.request.prompt.includes("schedule(7)"), true);
  assert.equal(result.designChanged, false);
  assert.deepEqual(fs.readFileSync(designFile(root)), before);
  assert.equal(loadDesign(root).nodes.find((node) => node.id === "capture").flags.length, 0);

  const edit = await silence(() =>
    handleHook({
      cwd: root,
      timeoutMs: 800,
      stdin: JSON.stringify({
        hook_event_name: "PostToolUse",
        tool_name: "search_replace",
        tool_input: {
          path: "src/capture/receipts.ts",
          old_string: "schedule(30)",
          new_string: "schedule(7)",
        },
      }),
    }),
  );
  assert.equal(edit.request.delivered.path, "src/capture/receipts.ts");
  assert.equal(edit.request.delivered.diff.includes("schedule(30)"), true);
  assert.equal(edit.request.delivered.diff.includes("schedule(7)"), true);
  assert.equal(edit.request.flavor, "codex");
});

test("recording drift keeps the diagram's flows", async () => {
  const { applyDesign: apply, emptyDesign: empty } = await import("../src/model.js");
  const withFlows = {
    ...ledgerResult,
    connections: [{ id: "purchase-flow", fromId: "receipts", toId: "capture", kind: "data", label: "purchase record" }],
  };
  const design = apply(empty(), withFlows, "module").design;
  const drifted = applyDrift(design, weeklyDrift);
  assert.equal(drifted.changed, true);
  assert.deepEqual(drifted.design.connections, design.connections);
});

test("a reworded repeat of a divergence does not stack a second flag", () => {
  const design = applyDesign(emptyDesign(), ledgerResult, "module").design;
  const first = applyDrift(design, { diverges: true, nodeId: "capture", intent: "Owns 1:1 threads, groups, members, roles - Gates who can send", difference: "no membership/role check before store.append and deliver; anyone can send to any conversation" });
  const again = applyDrift(first.design, { diverges: true, nodeId: "capture", intent: "Owns 1:1 threads, groups, members, roles - Gates who can send", difference: "code sends without checking membership or roles before store.append; anyone can send to any conversation" });
  assert.equal(again.changed, false);
  const other = applyDrift(first.design, { diverges: true, nodeId: "capture", intent: "Purchases are recorded the day they happen", difference: "The code writes the purchase a week later" });
  assert.equal(other.changed, true);
});
