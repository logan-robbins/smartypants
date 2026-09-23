import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { applyDrift } from "../src/drift.js";
import { applyDesign, canvasModel, emptyDesign } from "../src/model.js";
import { buildScene } from "../src/scene.js";
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
