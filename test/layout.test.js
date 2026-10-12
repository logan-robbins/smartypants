import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { applyDesign, canvasModel, emptyDesign } from "../src/model.js";
import { blocked, buildScene, moveNode, settle } from "../src/scene.js";

const require = createRequire(import.meta.url);
const Space = require("../web/space.cjs");

const MODES = ["tiers", "LR", "TB"];

const PARTS = {
  edge: ["gateway", "limiter", "router"],
  api: ["auth", "orders", "billing", "search"],
  core: ["planner", "runner", "audit"],
  store: ["writer", "index", "archive", "cache"],
};

const TIERS = { edge: "edge", api: "api", core: "service", store: "database" };
const ZONES = { edge: "Public internet" };

function wide() {
  const nodes = [{ id: "app", name: "App", kind: "system", parentId: null, what: "Runs the shop", why: "People need to buy things" }];
  for (const [part, modules] of Object.entries(PARTS)) {
    nodes.push({
      id: part, name: part, kind: "component", parentId: "app", tier: TIERS[part], zone: ZONES[part] || "Private network",
      what: `The ${part} tier`, why: `The shop needs a ${part} tier`,
    });
    for (const name of modules) {
      nodes.push({ id: `${part}-${name}`, name: `${part} ${name}`, kind: "module", parentId: part, what: `Does ${name} for ${part}`, why: `${part} cannot work without ${name}` });
    }
  }
  const flow = (from, to, label) => ({ id: `${from}>${to}`, fromId: from, toId: to, kind: "data", label });
  const connections = [
    flow("edge-gateway", "edge-limiter", "raw request"),
    flow("edge-limiter", "edge-router", "admitted request"),
    flow("edge-router", "api-auth", "routed request"),
    flow("api-auth", "api-orders", "verified caller"),
    flow("api-auth", "api-search", "verified caller"),
    flow("api-orders", "api-billing", "order total"),
    flow("api-orders", "core-planner", "order to plan"),
    flow("core-planner", "core-runner", "steps"),
    flow("core-runner", "core-audit", "outcome"),
    flow("core-runner", "store-writer", "result record"),
    flow("api-billing", "store-writer", "charge record"),
    flow("store-writer", "store-index", "indexed row"),
    flow("store-writer", "store-archive", "cold row"),
    flow("api-search", "store-cache", "hot query"),
    flow("store-index", "store-cache", "fresh entry"),
    flow("edge-gateway", "api-search", "search call"),
    flow("edge-router", "api-orders", "order call"),
    flow("edge-router", "api-billing", "billing call"),
    flow("api-orders", "store-writer", "order record"),
    flow("api-search", "store-index", "search lookup"),
    flow("api-auth", "store-cache", "session lookup"),
    flow("api-billing", "store-archive", "ledger copy"),
    flow("core-planner", "store-index", "plan lookup"),
    flow("core-audit", "store-archive", "audit trail"),
  ];
  return canvasModel(applyDesign(emptyDesign(), { isDesign: true, nodes, connections }, "module").design, "module");
}

function sceneFor(mode, pins = {}) {
  const design = wide();
  design.direction = mode;
  design.nodes.forEach((node) => {
    if (pins[node.id]) Object.assign(node, pins[node.id]);
  });
  return buildScene(design);
}

function parts(scene) {
  return scene.nodes.filter((node) => node.kind !== "system" && node.kind !== "unmapped" && !node.header);
}

function gapBetween(a, b) {
  return {
    x: Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)),
    y: Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)),
  };
}

function tooClose(scene, a, b) {
  if (a.parentId === b.id || b.parentId === a.id) return false;
  const gap = gapBetween(a, b);
  const need = scene.mode === "tiers" && (a.zone || "") !== (b.zone || "") ? Space.ZONE_GAP : Space.GAP;
  return !(gap.x >= need.x || gap.y >= need.y);
}

function crowded(scene) {
  const found = [];
  const list = scene.nodes.filter((node) => node.kind !== "unmapped");
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      if (tooClose(scene, list[i], list[j])) found.push(`${list[i].id} ~ ${list[j].id}`);
    }
  }
  return found;
}

function throughNodes(scene) {
  const found = [];
  for (const edge of scene.edges || []) {
    const points = edge.points || [];
    for (let k = 0; k + 1 < points.length; k += 1) {
      const [p, q] = [points[k], points[k + 1]];
      for (const node of parts(scene)) {
        if (node.id === edge.from || node.id === edge.to) continue;
        if (Math.max(p.x, q.x) > node.x && Math.min(p.x, q.x) < node.x + node.w && Math.max(p.y, q.y) > node.y && Math.min(p.y, q.y) < node.y + node.h) {
          found.push(`${edge.from}>${edge.to} through ${node.id}`);
        }
      }
    }
  }
  return [...new Set(found)];
}

function where(scene) {
  const at = {};
  scene.nodes.forEach((node) => {
    at[node.id] = [Math.round(node.x), Math.round(node.y)];
  });
  return at;
}

for (const mode of MODES) {
  test(`${mode}: every card keeps the minimum clear gap to every other card`, () => {
    const scene = sceneFor(mode);
    assert.ok(parts(scene).length >= 14);
    assert.deepEqual(crowded(scene), []);
  });
}

for (const mode of ["LR", "TB"]) {
  test(`${mode}: no arrow runs through a card it does not touch`, () => {
    assert.deepEqual(throughNodes(sceneFor(mode)), []);
  });
}

test("LR: each step of a flow sits right of the step before it, with room for its label", () => {
  const scene = sceneFor("LR");
  const byId = Object.fromEntries(scene.nodes.map((node) => [node.id, node]));
  const labelled = scene.edges.filter((edge) => edge.text);
  assert.ok(labelled.length >= 10);
  for (const edge of labelled) {
    const from = byId[edge.from];
    const to = byId[edge.to];
    assert.ok(to.x >= from.x + from.w, `${edge.from} -> ${edge.to} should read left to right`);
    const room = to.x - (from.x + from.w);
    assert.ok(room >= Space.GAP.x, `${edge.from} -> ${edge.to} room ${Math.round(room)}`);
  }
});

for (const mode of MODES) {
  test(`${mode}: pinning one card moves no other card`, () => {
    const base = sceneFor(mode);
    const baseAt = where(base);
    const pinAt = { x: Math.round(base.bounds.x + base.bounds.w + 400) };
    for (const card of parts(base)) {
      const pinned = sceneFor(mode, { [card.id]: { x: pinAt.x, y: Math.round(card.y) } });
      const at = where(pinned);
      const shifted = Object.keys(baseAt).filter((id) => id !== card.id && (!at[id] || at[id][0] !== baseAt[id][0] || at[id][1] !== baseAt[id][1]));
      assert.deepEqual(shifted, [], `pinning ${card.id} moved ${shifted.join(", ")}`);
    }
  });

  test(`${mode}: a card pinned somewhere clear stays exactly there`, () => {
    const base = sceneFor(mode);
    const card = base.nodes.find((node) => node.id === "store-archive");
    const spot = { x: Math.round(base.bounds.x + base.bounds.w + 400), y: Math.round(card.y) };
    const pinned = sceneFor(mode, { "store-archive": spot }).nodes.find((node) => node.id === "store-archive");
    assert.deepEqual([Math.round(pinned.x), Math.round(pinned.y)], [spot.x, spot.y]);
    assert.deepEqual(crowded(sceneFor(mode, { "store-archive": spot })), []);
  });
}

for (const mode of MODES) {
  test(`${mode}: a card dropped on another settles to the nearest clear spot`, () => {
    const scene = sceneFor(mode);
    const [a, b] = ["api-orders", "api-search"].map((id) => scene.nodes.find((node) => node.id === id));
    moveNode(scene, a.id, b.x, b.y, true);
    assert.equal(blocked(scene, [a.id]), true);
    const moved = settle(scene, [a.id]);
    assert.ok(moved.length > 0);
    assert.equal(blocked(scene, [a.id]), false);
    assert.deepEqual(crowded(scene), []);
  });

  test(`${mode}: a card dropped in open space does not settle anywhere else`, () => {
    const scene = sceneFor(mode);
    const card = scene.nodes.find((node) => node.id === "store-cache");
    const spot = { x: Math.round(scene.bounds.x + scene.bounds.w + 600), y: Math.round(card.y) };
    moveNode(scene, card.id, spot.x, spot.y, true);
    assert.equal(blocked(scene, [card.id]), false);
    assert.deepEqual(settle(scene, [card.id]), []);
    const after = scene.nodes.find((node) => node.id === card.id);
    assert.deepEqual([after.x, after.y], [spot.x, spot.y]);
  });
}
