import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { applyDrift } from "../src/drift.js";
import { applyDesign, canvasModel, emptyDesign } from "../src/model.js";
import { buildScene, moveNode } from "../src/scene.js";
import { loadDesign, placeNode, saveDesign } from "../src/model.js";
import { ledgerResult, weeklyDrift } from "./fixture.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function designed() {
  const stored = applyDrift(applyDesign(emptyDesign(), ledgerResult, "module").design, weeklyDrift).design;
  return canvasModel(stored, "module");
}

test("the scene builder lays out containment, what, why, and drift", () => {
  const scene = buildScene(designed());
  assert.ok(scene.nodes.length >= 3);
  const labels = scene.nodes.map((node) => node.label).join("\n");
  assert.equal(labels.includes("Keeps the household books for this family"), true);
  assert.equal(labels.includes("So the family can see where money goes before they spend it"), true);
  assert.equal(labels.includes("Turns a photo of a receipt into a purchase record"), true);
  assert.equal(labels.includes(weeklyDrift.intent), true);
  assert.equal(labels.includes(weeklyDrift.difference), true);
  const system = scene.nodes.find((node) => node.kind === "system");
  const component = scene.nodes.find((node) => node.kind === "component");
  const moduleNode = scene.nodes.find((node) => node.kind === "module");
  assert.ok(component.y > system.y);
  assert.ok(moduleNode.y > component.y);
  assert.equal(component.flagged, true);
  assert.equal(
    scene.edges.some((edge) => edge.from === system.id && edge.to === component.id && edge.kind === "containment"),
    true,
  );
  assert.equal(
    scene.edges.some((edge) => edge.from === component.id && edge.to === moduleNode.id),
    true,
  );
  assert.ok(scene.bounds.w > 0 && scene.bounds.h > 0);
  for (let i = 0; i < scene.nodes.length; i += 1) {
    for (let j = i + 1; j < scene.nodes.length; j += 1) {
      const a = scene.nodes[i];
      const b = scene.nodes[j];
      const overlaps = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      assert.equal(overlaps, false, `${a.name} overlaps ${b.name}`);
    }
  }
});

test("a dragged card moves by itself and keeps its place", () => {
  const scene = buildScene(designed());
  const moduleNode = scene.nodes.find((node) => node.kind === "module");
  const before = scene.nodes.find((node) => node.kind === "system");
  const startX = moduleNode.x;
  const startY = moduleNode.y;
  const systemX = before.x;
  const moved = moveNode(scene, moduleNode.id, startX + 400, startY - 120);
  const afterModule = moved.nodes.find((node) => node.id === moduleNode.id);
  const afterSystem = moved.nodes.find((node) => node.id === before.id);
  assert.equal(afterModule.x, startX + 400);
  assert.equal(afterModule.y, startY - 120);
  assert.equal(afterSystem.x, systemX);
  assert.equal(afterSystem.y, before.y);
  const link = moved.edges.find((edge) => edge.to === moduleNode.id && edge.kind === "containment");
  assert.equal(link.x2, afterModule.x + afterModule.w / 2);
  assert.equal(link.y2, afterModule.y);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "smartypants-place-"));
  saveDesign(root, designed());
  const placed = placeNode(loadDesign(root), moduleNode.id, 40, 80);
  assert.equal(placed.changed, true);
  saveDesign(root, placed.design);
  const again = loadDesign(root);
  assert.equal(again.nodes.find((node) => node.id === moduleNode.id).x, 40);
  assert.equal(again.nodes.find((node) => node.id === moduleNode.id).y, 80);
  const pinned = buildScene(again);
  assert.equal(pinned.nodes.find((node) => node.id === moduleNode.id).x, 40);
  assert.equal(pinned.nodes.find((node) => node.id === moduleNode.id).y, 80);
});

test("the scene builder adds labeled directional flows over containment", () => {
  const source = {
    ...ledgerResult,
    connections: [
      { id: "receipt-record", fromId: "receipts", toId: "capture", kind: "data", label: "purchase record" },
    ],
  };
  const scene = buildScene(canvasModel(applyDesign(emptyDesign(), source, "module").design, "module"));
  assert.equal(scene.edges.some((edge) => edge.kind === "containment"), true);
  const flow = scene.edges.find((edge) => edge.kind === "data");
  assert.equal(flow.from, "receipts");
  assert.equal(flow.to, "capture");
  assert.equal(flow.label, "purchase record");
  assert.ok(Number.isFinite(flow.cx) && Number.isFinite(flow.cy));
});

test("a file: load shows how to serve the canvas", () => {
  const html = fs.readFileSync(path.join(packageRoot, "web/index.html"), "utf8");
  assert.equal(html.includes('location.protocol !== "file:"'), true);
  assert.equal(html.includes("node bin/smartypants-serve.mjs"), true);
  assert.equal(html.includes("http://127.0.0.1:4173"), true);

  const sandbox = {
    console,
    location: { protocol: "file:" },
    document: {
      body: { innerHTML: "<p id=\"boot\">Opening the design canvas…</p>" },
      getElementById() {
        return null;
      },
      addEventListener() {},
      readyState: "complete",
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    `${fs.readFileSync(path.join(packageRoot, "web/scene.cjs"), "utf8")}\n${fs.readFileSync(path.join(packageRoot, "web/app.js"), "utf8")}`,
    sandbox,
  );
  assert.equal(sandbox.document.body.innerHTML.includes("node bin/smartypants-serve.mjs"), true);
  assert.equal(sandbox.document.body.innerHTML.includes("http://127.0.0.1:4173"), true);
  assert.notEqual(sandbox.document.body.innerHTML.trim(), "");
  assert.equal(sandbox.document.body.innerHTML.includes("\"nodes\""), false);
});

test("page scripts load on a window global and the scene builder still draws the fixture", () => {
  const sandbox = {
    console,
    location: { protocol: "http:" },
    document: {
      body: { innerHTML: "" },
      getElementById() {
        return null;
      },
      addEventListener() {},
      readyState: "loading",
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(packageRoot, "web/scene.cjs"), "utf8"), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(packageRoot, "web/app.js"), "utf8"), sandbox);
  assert.equal(typeof sandbox.SmartypantsScene.buildScene, "function");
  const scene = sandbox.SmartypantsScene.buildScene(designed());
  assert.ok(scene.nodes.length >= 3);
  const labels = scene.nodes.map((node) => node.label).join("\n");
  assert.equal(labels.includes(weeklyDrift.difference), true);
  assert.equal(labels.includes("Receipt intake"), true);
});
