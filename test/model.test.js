import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { applyDesign, canvasModel, designPath, emptyDesign, loadDesign, placeNode, releaseNode, saveDesign } from "../src/model.js";
import {
  COMPONENT_DEFINITION,
  DEFAULT_FLOOR,
  MODULE_DEFINITION,
  SYSTEM_DEFINITION,
  TAXONOMY,
} from "../src/taxonomy.js";
import { ledgerResult } from "./fixture.js";
import { tempProject } from "./helpers.js";

test("taxonomy states the system, component, and module ladder", () => {
  assert.equal(
    SYSTEM_DEFINITION,
    "System: the whole application a person would name when asked what is being built.",
  );
  assert.equal(
    COMPONENT_DEFINITION,
    "Component: a major part of that system that owns one job other parts can depend on without its internals (not a file or function).",
  );
  assert.equal(
    MODULE_DEFINITION,
    "Module: a cohesive slice inside exactly one component that does one part of that component's job, still above individual types and functions.",
  );
  assert.equal(TAXONOMY.includes(SYSTEM_DEFINITION), true);
  assert.equal(TAXONOMY.includes(COMPONENT_DEFINITION), true);
  assert.equal(TAXONOMY.includes(MODULE_DEFINITION), true);
  assert.equal(DEFAULT_FLOOR, "module");
});

test("a design result at the module floor keeps project wording and drops fine nodes", () => {
  const applied = applyDesign(emptyDesign(), ledgerResult, "module");
  assert.equal(applied.changed, true);
  const names = applied.design.nodes.map((node) => node.name);
  assert.deepEqual(names, ["Ledger", "Capture", "Receipt intake"]);
  assert.equal(applied.design.nodes.filter((node) => node.kind === "system").length, 1);
  assert.equal(applied.design.nodes.some((node) => node.kind === "component"), true);
  assert.equal(applied.design.nodes.some((node) => node.kind === "module"), true);
  assert.equal(names.includes("parseReceipt()"), false);
  assert.equal(names.includes("invoice.ts"), false);
  assert.equal(names.includes("class Charge"), false);
  assert.equal(names.includes("POST /charges"), false);
  assert.equal(names.includes("Echo"), false);

  const capture = applied.design.nodes.find((node) => node.name === "Capture");
  const intake = applied.design.nodes.find((node) => node.name === "Receipt intake");
  assert.equal(capture.what, "Records a purchase the moment someone pays");
  assert.equal(
    capture.why,
    "Nothing else in Ledger can explain spending if the purchase was never written down",
  );
  assert.notEqual(capture.what, capture.why);
  assert.equal(intake.what, "Turns a photo of a receipt into a purchase record");
  assert.notEqual(intake.what.trim().toLowerCase(), intake.why.trim().toLowerCase());
  assert.equal(intake.parentId, "capture");
  assert.equal(capture.parentId, "ledger");
});

test("the same result applied twice does not duplicate nodes", () => {
  const root = tempProject();
  const first = applyDesign(emptyDesign(), ledgerResult, "module");
  saveDesign(root, first.design);
  const before = fs.readFileSync(designPath(root));
  const loaded = loadDesign(root);
  assert.equal(loaded.nodes.find((node) => node.name === "Receipt intake").what, ledgerResult.nodes[2].what);
  const second = applyDesign(loaded, ledgerResult, "module");
  assert.equal(second.changed, false);
  assert.equal(second.design, loaded);
  if (second.changed) saveDesign(root, second.design);
  assert.deepEqual(fs.readFileSync(designPath(root)), before);
  assert.equal(loadDesign(root).nodes.length, 3);
  const ids = new Set(loadDesign(root).nodes.map((node) => node.id));
  assert.equal(ids.size, 3);
});

test("architecture connections round-trip, merge idempotently, and stay on visible nodes", () => {
  const withFlows = {
    ...ledgerResult,
    connections: [
      { id: "purchase-flow", fromId: "receipts", toId: "capture", kind: "data", label: "purchase record" },
      { id: "bad-ref", fromId: "receipts", toId: "missing", kind: "data", label: "ignored" },
    ],
  };
  const root = tempProject();
  const first = applyDesign(emptyDesign(), withFlows, "module");
  assert.deepEqual(first.design.connections, [withFlows.connections[0]]);
  saveDesign(root, first.design);
  const loaded = loadDesign(root);
  assert.deepEqual(loaded.connections, first.design.connections);
  const second = applyDesign(loaded, withFlows, "module");
  assert.equal(second.changed, false);
  assert.deepEqual(canvasModel(loaded, "component").connections, []);
  const revised = applyDesign(loaded, {
    ...withFlows,
    connections: [{ ...withFlows.connections[0], label: "normalized purchase record" }],
  }, "module");
  assert.equal(revised.changed, true);
  assert.equal(revised.design.connections[0].label, "normalized purchase record");
});

test("a non-design result leaves the model unchanged", () => {
  const existing = applyDesign(emptyDesign(), ledgerResult, "module").design;
  const next = applyDesign(existing, {
    isDesign: false,
    nodes: ledgerResult.nodes,
  });
  assert.equal(next.changed, false);
  assert.equal(next.design, existing);
});

test("a coarser floor omits finer nodes from the canvas model", () => {
  const stored = applyDesign(emptyDesign(), ledgerResult, "module").design;
  const components = canvasModel(stored, "component");
  assert.equal(components.floor, "component");
  assert.equal(components.nodes.some((node) => node.kind === "system"), true);
  assert.equal(components.nodes.some((node) => node.kind === "component"), true);
  assert.equal(components.nodes.some((node) => node.kind === "module"), false);
  const systemOnly = canvasModel(stored, "system");
  assert.equal(systemOnly.nodes.length, 1);
  assert.equal(systemOnly.nodes[0].kind, "system");
  const written = applyDesign(emptyDesign(), ledgerResult, "system");
  assert.deepEqual(
    written.design.nodes.map((node) => node.kind),
    ["system"],
  );
});

test("releasing a dragged card forgets its spot and survives a save", () => {
  const root = tempProject();
  const base = applyDesign(emptyDesign(), ledgerResult, "module").design;
  const placed = placeNode(base, "capture", 320, 640);
  assert.equal(placed.changed, true);
  const unplaced = releaseNode(placed.design, "capture");
  assert.equal(unplaced.changed, true);
  saveDesign(root, unplaced.design);
  const card = loadDesign(root).nodes.find((node) => node.id === "capture");
  assert.equal(card.x, undefined);
  assert.equal(card.y, undefined);
  assert.equal(card.what, "Records a purchase the moment someone pays");
  assert.equal(releaseNode(unplaced.design, "capture").changed, false);
  assert.equal(releaseNode(unplaced.design, "no-such-card").changed, false);
});

test("releasing leaves every other dragged card where it is", () => {
  const base = applyDesign(emptyDesign(), ledgerResult, "module").design;
  const both = placeNode(placeNode(base, "capture", 1, 2).design, "receipts", 3, 4).design;
  const next = releaseNode(both, "capture").design;
  const echo = next.nodes.find((node) => node.id === "receipts");
  assert.equal(echo.x, 3);
  assert.equal(echo.y, 4);
  assert.equal(both.nodes.find((node) => node.id === "capture").x, 1);
});

test("releasing an unmapped card removes only its saved spot", () => {
  const base = applyDesign(emptyDesign(), ledgerResult, "module").design;
  const placed = placeNode(placeNode(base, "unmapped-a", 5, 6).design, "unmapped-b", 7, 8).design;
  const released = releaseNode(placed, "unmapped-a");
  assert.equal(released.changed, true);
  assert.deepEqual(released.design.unmappedPositions, [{ id: "unmapped-b", x: 7, y: 8 }]);
  assert.equal(releaseNode(released.design, "unmapped-a").changed, false);
});
