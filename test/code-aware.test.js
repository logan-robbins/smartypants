import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadCatchup } from "../src/catchup.js";
import { installProject } from "../src/install.js";
import { applyDesign, emptyDesign, loadDesign, readableName, saveDesign } from "../src/model.js";
import { normalizePayload } from "../src/normalize.js";
import { handleHook } from "../src/pipeline.js";
import { boundaries, isInfraFile, renderScan, scanProject } from "../src/scan.js";
import { buildScene } from "../src/scene.js";
import { reviewTurn, turnChanges } from "../src/turnend.js";
import { tempProject } from "./helpers.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shop = path.join(packageRoot, "examples", "shop-monorepo");

function gitRepo(from) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sp-git-"));
  fs.cpSync(from, root, { recursive: true });
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init");
  return root;
}

function quiet(fn) {
  const original = console.error;
  console.error = () => {};
  return Promise.resolve().then(fn).finally(() => { console.error = original; });
}

test("the scanner maps units, dependencies, and compose, k8s, Helm, and Terraform boundaries", () => {
  const scan = scanProject(shop);
  const api = scan.units.find((unit) => unit.path === "services/api");
  assert.deepEqual(api.tags.slice(0, 4), ["http api", "sql database", "redis", "kafka"]);
  assert.deepEqual(api.routes, ["GET /products", "POST /orders"]);
  assert.deepEqual(api.tables, ["products", "orders"]);
  assert.deepEqual(api.topics, ["orders.placed"]);
  assert.equal(scan.units.find((unit) => unit.path === "services/fulfillment").tags.includes("object storage"), true);
  assert.equal(scan.infra.compose[0].services.find((svc) => svc.name === "db").networks[0], "data");
  assert.equal(scan.infra.k8s.some((o) => o.kind === "Ingress" && o.backends.includes("/api->orders-api")), true);
  assert.equal(scan.infra.helm[0].values.ingress.enabled, true);
  assert.equal(scan.infra.terraform[0].resources.some((r) => r.type === "aws_db_instance"), true);
  const lines = boundaries(scan);
  assert.equal(lines.some((line) => line.startsWith("public entry: Ingress shop")), true);
  assert.equal(lines.some((line) => line.startsWith("network policy api-from-ingress")), true);
  assert.equal(lines.some((line) => line.includes("aws_subnet.private")), true);
  const text = renderScan(scan);
  assert.ok(text.length < 14000);
  assert.equal(isInfraFile("deploy/helm/shop/values.yaml"), true);
  assert.equal(isInfraFile("services/api/src/server.js"), false);
});

test("Stop and agent_end payloads become turn-end events", () => {
  assert.deepEqual(normalizePayload({ hook_event_name: "Stop", session_id: "s1", stop_hook_active: false }), { type: "turn-end", session: "s1" });
  assert.deepEqual(normalizePayload({ type: "turn-end" }), { type: "turn-end" });
  const root = tempProject();
  installProject(root, { flavor: "meta", seed: false });
  const claude = JSON.parse(fs.readFileSync(path.join(root, ".claude/settings.json"), "utf8"));
  const codex = JSON.parse(fs.readFileSync(path.join(root, ".codex/hooks.json"), "utf8"));
  assert.equal(claude.hooks.Stop[0].hooks[0].command.includes("smartypants-hook"), true);
  assert.equal(codex.hooks.Stop[0].hooks[0].command.includes("smartypants-hook"), true);
  const config = JSON.parse(fs.readFileSync(path.join(root, "smartypants.config.json"), "utf8"));
  assert.equal(config.review, "turn");
  const plugin = JSON.parse(fs.readFileSync(path.join(packageRoot, "plugins/smartypants/hooks/hooks.json"), "utf8"));
  assert.equal(Boolean(plugin.hooks.Stop), true);
});

test("init on an existing codebase turns on seeding for catch-up", () => {
  const root = gitRepo(shop);
  fs.rmSync(path.join(root, "smartypants.config.json"), { force: true });
  // Eight source files is the threshold; the sample has three, so add a few.
  for (let i = 0; i < 6; i += 1) fs.writeFileSync(path.join(root, `services/api/src/extra${i}.js`), `export const n = ${i};\n`);
  const result = installProject(root, { flavor: "meta" });
  assert.equal(result.existing, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "smartypants.config.json"), "utf8")).seed, true);
  const empty = tempProject();
  assert.equal(installProject(empty, { flavor: "meta" }).existing, false);
});

test("turn-end reviews only what changed since the last review, batched in one selector call", async () => {
  const root = gitRepo(shop);
  fs.writeFileSync(path.join(root, "smartypants.config.json"), JSON.stringify({ flavor: "meta", review: "turn" }));
  const design = applyDesign(emptyDesign(), {
    isDesign: true,
    nodes: [
      { id: "shop", name: "Shop", kind: "system", grain: "system", parentId: "", what: "Sells products", why: "Revenue" },
      { id: "web", name: "Shop Web", kind: "component", grain: "component", parentId: "shop", tier: "frontend", what: "Renders the storefront", why: "Shoppers need pages" },
      { id: "api", name: "Orders API", kind: "component", grain: "component", parentId: "shop", tier: "api", what: "Serves products and orders", why: "One door to the data" },
    ],
    connections: [{ id: "w-a", fromId: "web", toId: "api", kind: "data", label: "fetch products" }],
  }, "component").design;
  saveDesign(root, design);
  assert.deepEqual(turnChanges(root).files, []);
  fs.writeFileSync(path.join(root, "web/app/page.tsx"), "import { Pool } from 'pg';\nexport default async () => new Pool().query('SELECT * FROM products');\n");
  fs.writeFileSync(path.join(root, "web/app/page.test.tsx"), "test('x', () => {});\n");
  fs.writeFileSync(path.join(root, "deploy/k8s/extra.yaml"), "apiVersion: v1\nkind: Service\nmetadata: { name: extra }\n");
  const calls = [];
  const chooser = {
    via: "scripted",
    async choose(state, questions) {
      calls.push(Object.keys(questions));
      return { via: "scripted", answers: Object.fromEntries(Object.keys(questions).map((id) => [id, { value: "diverges", confidence: 0.9 }])) };
    },
  };
  const review = await reviewTurn({ root, design, intent: { atoms: [] }, chooser });
  assert.deepEqual(review.changes.files.map((c) => c.path).sort(), ["deploy/k8s/extra.yaml", "web/app/page.test.tsx", "web/app/page.tsx"]);
  assert.deepEqual(review.reviewed.map((c) => c.path), ["web/app/page.tsx"]);
  assert.deepEqual(calls, [["f0"]]);
  assert.deepEqual(review.drift.map((c) => c.path), ["web/app/page.tsx"]);
  assert.deepEqual(review.infra.map((c) => c.path), ["deploy/k8s/extra.yaml"]);
  assert.equal(review.sync, true);
  assert.equal(review.reviewed[0].diff.includes("SELECT * FROM products"), true);

  // The pipeline records the review; a second turn with no new edits reviews nothing.
  process.env.META_BASE_URL = "http://127.0.0.1:9";
  const first = await quiet(() => handleHook({ cwd: root, event: { type: "turn-end" }, chooser, timeoutMs: 1500 }));
  assert.equal(first.review.files, 3);
  assert.equal(Boolean(first.error), true);
  const retry = await quiet(() => handleHook({ cwd: root, event: { type: "turn-end" }, chooser, timeoutMs: 1500 }));
  assert.equal(retry.review.files, 3, "a failed review is retried next turn");
});

test("with review=turn, single edits wait for the end of the turn", async () => {
  const root = tempProject({ flavor: "meta", review: "turn" });
  saveDesign(root, applyDesign(emptyDesign(), { isDesign: true, nodes: [{ id: "s", name: "S", kind: "system", grain: "system", parentId: "", what: "a", why: "b" }], connections: [] }, "system").design);
  const result = await handleHook({ cwd: root, event: { type: "edit", path: "src/a.js", contents: "export const a = cache.get(x) + db.query(y);" } });
  assert.equal(result.inert, true);
});

function mockMeta(respond) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const parsed = JSON.parse(body);
      requests.push(parsed);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ model: parsed.model, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(respond(parsed)) } }], usage: { prompt_tokens: 500, completion_tokens: 100 } }));
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, requests, url: `http://127.0.0.1:${server.address().port}/v1` })));
}

test("catch-up reads each code unit, then draws the baseline with tiers and zones", async () => {
  const meta = await mockMeta((body) => {
    if (body.response_format.json_schema.name === "smartypants_design") {
      return {
        isDesign: true,
        nodes: [
          { id: "shop", name: "Shop", blurb: "Online store", tier: "service", zone: "", kind: "system", grain: "system", parentId: "", shape: "service", what: "Sells products online", why: "Revenue", notes: [] },
          { id: "api", name: "Orders API (Express)", blurb: "Serves products and orders", tier: "api", zone: "k8s ns shop", kind: "component", grain: "component", parentId: "shop", shape: "service", what: "Serves catalog and orders", why: "One door to the data", notes: [] },
          { id: "db", name: "Orders Database (Postgres)", blurb: "Stores products and orders", tier: "database", zone: "Data subnet", kind: "component", grain: "component", parentId: "shop", shape: "store", what: "Keeps orders", why: "System of record", notes: [] },
        ],
        connections: [{ id: "a-d", fromId: "api", toId: "db", kind: "data", label: "write orders" }],
        removeNodeIds: [], removeConnectionIds: [], intent: ["D db postgres"],
      };
    }
    return { name: "Orders API (Express)", blurb: "Serves products", what: "HTTP API", why: "Clients need it", tier: "api", zone: "k8s ns shop", exposes: ["GET /products"], calls: [{ target: "Postgres", payload: "orders", kind: "data" }], intent: ["N products.cache.ttl 60s"] };
  });
  const previous = process.env.META_BASE_URL;
  process.env.META_BASE_URL = meta.url;
  process.env.META_API_KEY ||= "test";
  const root = gitRepo(shop);
  fs.writeFileSync(path.join(root, "smartypants.config.json"), JSON.stringify({ flavor: "meta", depth: "auto", seed: true }));
  try {
    const result = await quiet(() => handleHook({ cwd: root, event: { type: "catchup" }, timeoutMs: 20000 }));
    assert.equal(result.designChanged, true);
    const units = meta.requests.filter((r) => r.response_format.json_schema.name !== "smartypants_design");
    assert.equal(units.length, 3);
    assert.equal(units.some((r) => r.messages[1].content.includes("app.post(\"/orders\"")), true);
    const synth = meta.requests.find((r) => r.response_format.json_schema.name === "smartypants_design");
    assert.equal(synth.messages[1].content.includes("public entry: Ingress shop"), true);
    assert.equal(synth.reasoning_effort, "medium");
    const design = loadDesign(root);
    assert.equal(design.seeded, true);
    assert.equal(design.nodes.find((n) => n.id === "db").zone, "Data subnet");
    assert.equal(design.nodes.find((n) => n.id === "api").tier, "api");
    const state = loadCatchup(root);
    assert.equal(state.state, "done");
    assert.equal(state.calls, 4);
  } finally {
    meta.server.close();
    if (previous === undefined) delete process.env.META_BASE_URL;
    else process.env.META_BASE_URL = previous;
  }
});

test("the tiered layout puts callers on top, data at the bottom, and third parties at the right", () => {
  const design = applyDesign(emptyDesign(), {
    isDesign: true,
    nodes: [
      { id: "sys", name: "Shop", kind: "system", grain: "system", parentId: "", what: "a", why: "b" },
      { id: "s3", name: "Invoices (S3)", tier: "storage", kind: "component", grain: "component", parentId: "sys", shape: "store", what: "Keeps PDFs", why: "Audit" },
      { id: "db", name: "Orders DB", tier: "database", kind: "component", grain: "component", parentId: "sys", shape: "store", what: "Keeps orders", why: "Record" },
      { id: "cache", name: "Cache", tier: "cache", kind: "component", grain: "component", parentId: "sys", shape: "cache", what: "Hot reads", why: "Speed" },
      { id: "api", name: "Orders API", tier: "api", zone: "App", kind: "component", grain: "component", parentId: "sys", what: "Serves orders", why: "One door" },
      { id: "stripe", name: "Stripe", tier: "external", kind: "component", grain: "component", parentId: "sys", shape: "external", what: "Charges cards", why: "Payments" },
      { id: "svc", name: "Pricing Service", tier: "service", zone: "App", kind: "component", grain: "component", parentId: "sys", what: "Prices carts", why: "Totals" },
      { id: "cdn", name: "CDN", tier: "edge", kind: "component", grain: "component", parentId: "sys", shape: "gateway", what: "Edge cache", why: "Latency" },
      { id: "user", name: "Shopper", tier: "client", kind: "component", grain: "component", parentId: "sys", shape: "client", what: "Buys things", why: "Customer" },
    ],
    connections: [
      { id: "1", fromId: "user", toId: "cdn", kind: "data", label: "requests" },
      { id: "2", fromId: "cdn", toId: "api", kind: "data", label: "forward" },
      { id: "3", fromId: "api", toId: "svc", kind: "data", label: "price" },
      { id: "4", fromId: "svc", toId: "stripe", kind: "data", label: "charge" },
      { id: "5", fromId: "api", toId: "db", kind: "data", label: "write" },
      { id: "6", fromId: "db", toId: "api", kind: "data", label: "rows" },
    ],
  }, "component").design;
  const scene = buildScene(design);
  const at = Object.fromEntries(scene.nodes.map((n) => [n.id, n]));
  assert.equal(scene.mode, "tiers");
  assert.ok(at.user.y < at.cdn.y && at.cdn.y < at.api.y && at.api.y < at.svc.y && at.svc.y < at.db.y && at.db.y < at.s3.y);
  assert.ok(Math.abs(at.cache.y + at.cache.h / 2 - (at.db.y + at.db.h / 2)) < 2, "cache sits beside the database");
  assert.ok(at.cache.x < at.db.x, "cache is left of the database it fronts");
  assert.ok(at.stripe.x > Math.max(...scene.nodes.filter((n) => n.id !== "stripe" && n.kind !== "system").map((n) => n.x + n.w)), "third parties at the right edge");
  assert.equal(scene.zones.length, 1);
  assert.deepEqual(scene.zones[0].members.sort(), ["api", "svc"]);
  const down = scene.edges.find((e) => e.label === "write");
  const up = scene.edges.find((e) => e.label === "rows");
  assert.equal(down.y1, at.api.y + at.api.h);
  assert.equal(down.y2, at.db.y);
  assert.equal(up.y2, at.api.y + at.api.h);
  assert.notEqual(down.x1, up.x2, "request and reply use separate ports");
  assert.ok(at.api.blurb.length > 0 && at.api.blurb.split(" ").length <= 9);
  assert.equal(readableName("orders-svc"), "Orders Service");
  assert.equal(readableName("topkAPI"), "Topk API");
  for (const product of ["LiteLLM", "OpenAI", "FastAPI", "PostgreSQL", "GitHub"]) assert.equal(readableName(product), product);
});

test("a part with no parent joins the only system; with two systems it is not guessed", () => {
  const sys = (id, name) => ({ id, name, kind: "system", parentId: "", what: `${name} runs`, why: `${name} is needed` });
  const part = (id, name, parentId) => ({ id, name, kind: "component", parentId, what: `${name} works`, why: `${name} is used` });
  const one = applyDesign(emptyDesign("component"), { isDesign: true, nodes: [sys("shop", "Shop"), part("users", "Shoppers", ""), part("pay", "Stripe", null)] }, "component").design;
  assert.deepEqual(one.nodes.map((n) => [n.name, n.parentId]), [["Shop", null], ["Shoppers", "shop"], ["Stripe", "shop"]]);
  // A later turn that names no system still lands under the one already drawn.
  const later = applyDesign(one, { isDesign: true, nodes: [part("mail", "Email Provider", "")] }, "component").design;
  assert.equal(later.nodes.find((n) => n.name === "Email Provider").parentId, "shop");
  const two = applyDesign(emptyDesign("component"), { isDesign: true, nodes: [sys("a", "Alpha"), sys("b", "Beta"), part("x", "Loose", "")] }, "component").design;
  assert.equal(two.nodes.some((n) => n.name === "Loose"), false);
});
