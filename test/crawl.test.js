/**
 * The existing-project crawler: scanner edge cases found by crawling real
 * repositories (monorepos, polyglot services, Helm, kustomize, C projects),
 * and catch-up failure, progress, and re-run behaviour. No network.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadCatchup, pickUnits, unitFiles } from "../src/catchup.js";
import { installProject, isExistingProject } from "../src/install.js";
import { applyDesign, emptyDesign, loadDesign, saveDesign } from "../src/model.js";
import { handleHook } from "../src/pipeline.js";
import { boundaries, listFiles, renderScan, scanProject } from "../src/scan.js";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

/**
 * A private copy of a fixture, optionally as a git work tree. JS and TS
 * sources are stored as `<file>.src` so `node --test` does not run them.
 */
function copy(name, { git = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `sp-crawl-${name}-`));
  fs.cpSync(path.join(fixtures, name), root, { recursive: true });
  for (const file of fs.readdirSync(root, { recursive: true })) {
    if (String(file).endsWith(".src")) fs.renameSync(path.join(root, file), path.join(root, String(file).slice(0, -4)));
  }
  if (git) {
    const run = (...args) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
    run("init", "-q");
    run("add", "-A");
    run("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init");
  }
  return root;
}

const byPath = (scan, p) => scan.units.find((unit) => unit.path === p);

function quiet(fn) {
  const original = console.error;
  console.error = () => {};
  return Promise.resolve().then(fn).finally(() => { console.error = original; });
}

test("monorepo workspaces: apps run, packages are libraries, tooling, docs, and tests are not parts", () => {
  const scan = scanProject(copy("turbo-monorepo", { git: true }));
  assert.deepEqual(scan.monorepo, ["turborepo"]);
  const roles = Object.fromEntries(scan.units.map((unit) => [unit.path, unit.role]));
  assert.deepEqual(roles, {
    ".": "workspace",
    "apps/api": "service",
    "apps/web": "frontend",
    "apps/worker": "worker",
    "packages/db": "library",
    "packages/ui": "library",
    "tooling/eslint-config": "tooling",
    docs: "docs",
    e2e: "test",
  });
  assert.deepEqual(byPath(scan, "apps/web").links.sort(), ["packages/db", "packages/ui", "tooling/eslint-config"]);
  assert.deepEqual(byPath(scan, "packages/db").usedBy.sort(), ["apps/api", "apps/web", "apps/worker"]);
  assert.deepEqual(byPath(scan, "packages/db").tables, ["Order", "Customer"]);
  assert.deepEqual(byPath(scan, "apps/worker").topics, ["emails"]);
  // The picked units are the running parts first, then libraries; never tooling, docs, or tests.
  assert.deepEqual(pickUnits(scan).map((unit) => unit.path), ["apps/api", "apps/web", "apps/worker", "packages/db", "packages/ui"]);
  const text = renderScan(scan);
  assert.match(text, /not runtime parts: .*tooling\/eslint-config \[tooling\]/);
  assert.doesNotMatch(text, /imports units[^\n]*tooling/);
  assert.match(text, /unit packages\/db \(@acme\/db\) \[library\][^\n]*\n\s+imported by apps\/api, apps\/web, apps\/worker/);
});

test("code facts ignore license and doc links, and model-free table rules stay in their languages", () => {
  const scan = scanProject(copy("turbo-monorepo"));
  const api = byPath(scan, "apps/api");
  assert.deepEqual(api.hosts, ["api.stripe.com"], "apache.org and stackoverflow.com in comments are not calls");
  assert.deepEqual(api.tables, [], "'model from {' in a JS comment is not a Prisma model");
  assert.deepEqual(api.routes, ["GET /health", "POST /orders"]);
  assert.deepEqual(api.env, ["DATABASE_URL", "REDIS_URL"]);
});

test("compose: the override merges into its base, variants stay apart, and credentials never reach the map", () => {
  const scan = scanProject(copy("turbo-monorepo"));
  const [main, variant] = scan.infra.compose;
  assert.deepEqual(main.files, ["docker-compose.yml", "docker-compose.override.yml"]);
  assert.deepEqual(main.services.find((svc) => svc.name === "api").ports, ["8080:8080", "9229:9229"]);
  assert.equal(main.services.some((svc) => svc.name === "mailhog"), true);
  assert.equal(variant.variant, "test");
  assert.equal(scan.infra.compose.some((project) => project.file.startsWith("examples/")), false, "example infra is not this system");
  const text = renderScan(scan);
  assert.match(text, /DATABASE_URL=postgres:\/\/db:5432\/shop/);
  assert.doesNotMatch(text, /hunter2/);
  const lines = boundaries(scan);
  assert.ok(lines.includes("public entry: compose web via traefik Host(shop.example.com)"));
  assert.ok(lines.includes("compose networks (docker-compose.yml): public, data(internal)"));
  // Compose services and k8s workloads land on the unit they run, including one that shares its image.
  assert.deepEqual(byPath(scan, "apps/api").deployedAs, ["compose api", "k8s Deployment api-server", "k8s Deployment order-jobs"]);
  assert.deepEqual(byPath(scan, "apps/web").deployedAs, ["compose web"]);
});

test("polyglot services: csproj, Dockerfile-only, Go modules, pyproject extras, Rails, Django, Flutter, Cargo", () => {
  const scan = scanProject(copy("polyglot"));
  assert.deepEqual(scan.units.map((unit) => unit.path).sort(), ["cli/shopctl", "mobile", "services/admin", "services/cart", "services/ledger", "services/pricing", "services/reviews", "services/search"]);
  const cart = byPath(scan, "services/cart");
  assert.equal(cart.manifest, "Cart.csproj");
  assert.deepEqual(cart.tags.sort(), ["grpc", "http api", "redis"]);
  assert.deepEqual(cart.routes, ["GET /cart/{id}"]);
  const pricing = byPath(scan, "services/pricing");
  assert.equal(pricing.manifest, "Dockerfile", "a service directory with only a Dockerfile and code is a unit");
  assert.equal(pricing.role, "service");
  const search = byPath(scan, "services/search");
  assert.equal(search.name, "search", "the /v2 suffix is not the module name");
  assert.deepEqual(search.tags, ["http api"], "indirect requirements are not the module's dependencies");
  assert.deepEqual(search.routes, ["GET /search", "POST /reindex"]);
  assert.deepEqual(search.entries, ["cmd/search/main.go"]);
  const ledger = byPath(scan, "services/ledger");
  assert.deepEqual(ledger.deps, ["fastapi", "uvicorn", "sqlalchemy", "requests"], "uvicorn[standard] does not end the list");
  assert.equal(ledger.tags.includes("job queue"), false, "requests is not rq");
  assert.deepEqual(ledger.tables, ["entries"]);
  assert.deepEqual(ledger.routes, ["POST /entries"]);
  const admin = byPath(scan, "services/admin");
  assert.deepEqual(admin.routes, ["GET /health", "RESOURCES /orders"]);
  assert.deepEqual(admin.tables, ["orders"]);
  assert.equal(admin.role, "service");
  const reviews = byPath(scan, "services/reviews");
  assert.deepEqual(reviews.routes, ["ANY /reviews/"]);
  assert.deepEqual(reviews.tables, ["Review"]);
  const mobile = byPath(scan, "mobile");
  assert.equal(mobile.role, "mobile");
  assert.deepEqual(mobile.manifests.sort(), ["Gemfile", "build.gradle", "pubspec.yaml"], "the android shell folds into the Flutter app");
  const cli = byPath(scan, "cli/shopctl");
  assert.equal(cli.role, "cli");
  assert.deepEqual(cli.deps, ["clap", "reqwest"], "[package] keys are not dependencies");
  assert.deepEqual(scan.infra.procfiles[0].processes.map((p) => p.name), ["web", "worker"]);
});

test("Helm templates, kustomize, broken multi-document YAML, and duplicate manifests", () => {
  const scan = scanProject(copy("k8s-helm"));
  const [chart] = scan.infra.helm;
  assert.equal(chart.name, "shop");
  assert.deepEqual(chart.kinds, ["Deployment", "Ingress"], "Go templates are read by line, not parsed");
  assert.deepEqual(chart.subcharts, ["postgresql"]);
  assert.deepEqual(chart.components, ["checkout(checkout)"]);
  assert.deepEqual(scan.infra.kustomize.map((k) => [k.dir, k.namespace]), [["k8s/base", "shop"], ["k8s/overlays/prod", "shop-prod"]]);
  const kinds = scan.infra.k8s.map((o) => `${o.kind}/${o.name}`).sort();
  assert.deepEqual(kinds, ["ConfigMap/orders-config", "Deployment/orders", "Ingress/public", "NetworkPolicy/orders-from-gateway", "Service/orders"], "the broken document is skipped; the rest of its file still counts");
  const orders = scan.infra.k8s.find((o) => o.kind === "Deployment");
  assert.equal(orders.copies, 2, "base/ and release/ copies are one object");
  assert.deepEqual(orders.env, ["PAYMENTS_URL=http://payments:9000", "DATABASE_URL=postgres://orders-db:5432/orders"]);
  const lines = boundaries(scan);
  for (const expected of [
    "k8s namespaces: shop, shop-prod",
    "exposed: Service orders type LoadBalancer ports 80",
    "network policy orders-from-gateway: app=orders <- app=gateway",
    "public entry: Ingress public (ns shop) hosts api.example.com routes /orders->orders",
    "public entry: helm shop ingress shop.example.com",
    "terraform network (infra/main.tf): aws_vpc.main aws_subnet.private",
  ]) assert.ok(lines.includes(expected), expected);
  assert.equal(scan.infra.terraform[0].modules[0].name, "eks");
  // An infrastructure-only repository is still an existing project.
  assert.equal(isExistingProject(copy("k8s-helm")), true);
});

test("a C project without a package manifest is the root unit, and its docs are not", () => {
  const scan = scanProject(copy("c-project", { git: true }));
  const root = byPath(scan, ".");
  assert.equal(root.manifest, "Makefile");
  assert.equal(root.role, "cli");
  assert.equal(root.files, 11);
  assert.equal(byPath(scan, "docs").role, "docs");
  assert.deepEqual(pickUnits(scan).map((unit) => unit.path), ["."]);
});

test("file listing: dependency and generated dirs, binaries, symlink loops, caps, submodules, non-git trees", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sp-crawl-big-"));
  const write = (file, text = "x") => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  write("package.json", JSON.stringify({ name: "big", scripts: { start: "node a.js" }, dependencies: { express: "4" } }));
  for (let i = 0; i < 400; i += 1) write(`src/mod${String(i).padStart(3, "0")}/file.js`, `export const n = ${i};\n`);
  write("zzz/service/package.json", JSON.stringify({ name: "late-service", dependencies: { fastify: "4" } }));
  write("zzz/service/server.js", "app.get('/late', h);\n");
  write("node_modules/dep/index.js");
  write("vendor/lib/x.go");
  write("assets/logo.png");
  write("public/app.min.js");
  write("api/demo.pb.go");
  fs.mkdirSync(path.join(root, "loop"));
  fs.symlinkSync(root, path.join(root, "loop", "back"));
  // Not a git tree: a bounded, symlink-safe walk.
  const started = Date.now();
  const walked = listFiles(root);
  assert.ok(Date.now() - started < 5000);
  assert.equal(walked.some((file) => /node_modules|vendor|\.png$|\.min\.js$|\.pb\.go$|loop\//.test(file)), false);
  // A cap keeps manifests first, so late directories still become units.
  const capped = listFiles(root, 50);
  assert.equal(capped.length, 50);
  assert.ok(capped.includes("zzz/service/package.json"));
  const scan = scanProject(root, { maxFiles: 50 });
  assert.ok(scan.units.some((unit) => unit.path === "zzz/service"));

  // Submodule files are listed with the superproject's.
  const sub = copy("c-project", { git: true });
  const main = copy("turbo-monorepo", { git: true });
  execFileSync("git", ["-c", "protocol.file.allow=always", "submodule", "add", "-q", sub, "vendored-tool"], { cwd: main, stdio: "ignore" });
  const files = listFiles(main);
  assert.ok(files.includes("vendored-tool/src/main.c"));
  assert.equal(files.includes("vendored-tool"), false);
});

test("the rendered map keeps boundaries when there are many units, and stays under budget", () => {
  const scan = scanProject(copy("turbo-monorepo"));
  for (let i = 0; i < 80; i += 1) {
    scan.units.push({ ...scan.units.find((unit) => unit.path === "apps/api"), path: `services/svc${i}`, name: `svc-${i}`, routes: Array.from({ length: 30 }, (_, r) => `GET /route/${r}`), deployedAs: [] });
  }
  const text = renderScan(scan, 6000);
  assert.ok(text.length <= 6000);
  assert.match(text, /boundaries:\n {2}k8s namespaces: shop/);
  assert.match(text, /public entry: compose web via traefik/);
  assert.match(text, /\(\+\d+ more/);
});

test("the unit reader gets entry points, routers, and schema first, and not the files of nested units", () => {
  const root = copy("turbo-monorepo");
  const scan = scanProject(root);
  const files = listFiles(root);
  const workspace = { ...byPath(scan, "."), entries: [] };
  const text = unitFiles(root, workspace, files, scan.units);
  assert.doesNotMatch(text, /apps\/api\/src\/server\.js/, "the workspace root does not read its packages' code");
  const api = unitFiles(root, byPath(scan, "apps/api"), files, scan.units);
  const order = [...api.matchAll(/^--- (\S+)/gm)].map((m) => m[1]);
  assert.deepEqual(order.slice(0, 4), ["layout:", "apps/api/package.json", "apps/api/src/server.js", "apps/api/Dockerfile"]);
});

function mockMeta(respond) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const parsed = JSON.parse(body);
      requests.push(parsed);
      const answer = respond(parsed, requests.length);
      if (answer?.status) {
        res.writeHead(answer.status, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: answer.error || "boom" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ model: parsed.model, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 400, completion_tokens: 80 } }));
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, requests, url: `http://127.0.0.1:${server.address().port}/v1` })));
}

const isSynthesis = (body) => body.response_format.json_schema.name === "smartypants_design";
const unitNote = (name) => ({ name, blurb: "Does a thing", what: "Serves requests", why: "Clients need one door; without it each app talks to the database", runs: "own process", tier: "api", zone: "compose net public", exposes: [], calls: [], intent: [] });
const node = (id, name, extra = {}) => ({ id, name, blurb: name, tier: "service", zone: "", kind: "component", grain: "component", parentId: "shop", shape: "service", what: `${name} does work`, why: `${name} exists for a reason`, notes: [], ...extra });
const system = { id: "shop", name: "Shop", blurb: "Store", tier: "service", zone: "", kind: "system", grain: "system", parentId: "", shape: "service", what: "Sells things", why: "Revenue", notes: [] };

async function withMeta(respond, fn) {
  const meta = await mockMeta(respond);
  const previous = process.env.META_BASE_URL;
  process.env.META_BASE_URL = meta.url;
  process.env.META_API_KEY ||= "test";
  try {
    return await fn(meta);
  } finally {
    meta.server.close();
    if (previous === undefined) delete process.env.META_BASE_URL;
    else process.env.META_BASE_URL = previous;
  }
}

function project() {
  const root = copy("turbo-monorepo", { git: true });
  fs.writeFileSync(path.join(root, "smartypants.config.json"), JSON.stringify({ flavor: "meta", depth: "auto", seed: true }));
  return root;
}

test("catch-up: a failed unit does not stop the run, and progress names each unit's outcome", async () => {
  const root = project();
  await withMeta((body) => {
    if (isSynthesis(body)) return { isDesign: true, nodes: [system, node("api", "Orders API"), node("web", "Shop Web", { tier: "frontend" })], connections: [{ id: "w-a", fromId: "web", toId: "api", kind: "data", label: "orders" }], removeNodeIds: [], removeConnectionIds: [], intent: [] };
    if (body.messages[1].content.includes('<unit path="apps/worker"')) return { status: 500, error: "worker read failed" };
    return unitNote("Orders API");
  }, async (meta) => {
    const result = await quiet(() => handleHook({ cwd: root, event: { type: "catchup" }, timeoutMs: 20000 }));
    assert.equal(result.designChanged, true);
    const units = meta.requests.filter((body) => !isSynthesis(body));
    assert.equal(units.length, 5, "api, web, worker, db, ui; not docs, tooling, e2e, or the workspace root");
    assert.equal(units.some((body) => body.messages[1].content.includes('role="library"') && body.messages[1].content.includes('imported_by="apps/api, apps/web, apps/worker"')), true);
    const synth = meta.requests.find(isSynthesis);
    assert.match(synth.messages[1].content, /unit apps\/worker \[worker\]: \(not read: Meta API 500/);
    assert.match(synth.messages[1].content, /Libraries, SDKs, shared packages/);
    const state = loadCatchup(root);
    assert.equal(state.state, "done");
    assert.equal(state.unread, 1);
    assert.equal(state.units.find((unit) => unit.path === "apps/worker").status, "failed");
    assert.equal(state.units.filter((unit) => unit.status === "read").length, 4);
    assert.match(state.message, /from 4 of 5 code units/);
    assert.deepEqual(state.nodeIds.sort(), ["api", "shop", "web"]);
    assert.equal(process.env.SMARTYPANTS_BUILDING, undefined, "parallel reads leave the builder guard off for the worker's next event");
  });
});

test("catch-up: a failed drawing leaves a clear failed state and the old diagram", async () => {
  const root = project();
  const before = applyDesign(emptyDesign(), { isDesign: true, nodes: [system, node("api", "Orders API")], connections: [] }, "component").design;
  saveDesign(root, before);
  await withMeta((body) => (isSynthesis(body) ? { status: 503, error: "overloaded" } : unitNote("Orders API")), async () => {
    const result = await quiet(() => handleHook({ cwd: root, event: { type: "catchup" }, timeoutMs: 20000 }));
    assert.match(result.error, /drawing failed after reading 5 of 5 units: Meta API 503/);
    const state = loadCatchup(root);
    assert.equal(state.state, "failed");
    assert.match(state.message, /^Catch-up failed: drawing failed after reading 5 of 5 units/);
    assert.equal(state.calls, 5);
    assert.deepEqual(loadDesign(root).nodes.map((n) => n.id).sort(), ["api", "shop"]);
  });
  // An empty drawing is a failure too, not "Drew 0 parts".
  await withMeta((body) => (isSynthesis(body) ? { isDesign: true, nodes: [], connections: [], removeNodeIds: [], removeConnectionIds: [], intent: [] } : unitNote("Orders API")), async () => {
    await quiet(() => handleHook({ cwd: root, event: { type: "catchup" }, timeoutMs: 20000 }));
    assert.match(loadCatchup(root).error, /the builder returned no diagram/);
  });
});

test("catch-up again updates the parts it drew instead of adding copies, and keeps parts people added", async () => {
  const root = project();
  const first = { isDesign: true, nodes: [system, node("api", "Orders API"), node("cache", "Cart Cache", { tier: "cache", shape: "cache" })], connections: [{ id: "a-c", fromId: "api", toId: "cache", kind: "data", label: "carts" }], removeNodeIds: [], removeConnectionIds: [], intent: [] };
  await withMeta((body) => (isSynthesis(body) ? first : unitNote("Orders API")), () => quiet(() => handleHook({ cwd: root, event: { type: "catchup" }, timeoutMs: 20000 })));
  // Someone drags a card and adds a planned part between runs.
  const design = loadDesign(root);
  design.nodes.find((n) => n.id === "api").x = 420;
  design.nodes.find((n) => n.id === "api").y = 99;
  saveDesign(root, applyDesign(design, { isDesign: true, nodes: [node("billing", "Billing Service")], connections: [] }, "component").design);
  // The second drawing renames the system, keeps the API by id, and no longer has the cache.
  const second = { isDesign: true, nodes: [{ ...system, id: "shop-platform", name: "Shop Platform" }, node("api", "Orders API", { parentId: "shop-platform", blurb: "Serves orders" }), node("db", "Orders DB", { parentId: "shop-platform", tier: "database", shape: "store" })], connections: [{ id: "a-d", fromId: "api", toId: "db", kind: "data", label: "orders" }], removeNodeIds: [], removeConnectionIds: [], intent: [] };
  await withMeta((body) => (isSynthesis(body) ? second : unitNote("Orders API")), async (meta) => {
    await quiet(() => handleHook({ cwd: root, event: { type: "catchup" }, timeoutMs: 20000 }));
    assert.match(meta.requests.find(isSynthesis).messages[1].content, /api\|component\|shop\|/, "the builder sees the current diagram so it can keep ids");
  });
  const after = loadDesign(root);
  assert.deepEqual(after.nodes.map((n) => n.id).sort(), ["api", "billing", "db", "shop-platform"]);
  const api = after.nodes.find((n) => n.id === "api");
  assert.equal(api.parentId, "shop-platform");
  assert.equal(api.x, 420, "a dragged card stays where it was put");
  assert.equal(after.nodes.find((n) => n.id === "billing").parentId, "shop-platform", "a part someone added moves under the new system");
  assert.deepEqual(after.connections.map((c) => c.id), ["a-d"]);
  const state = loadCatchup(root);
  assert.equal(state.runs, 2);
  assert.deepEqual(state.nodeIds.sort(), ["api", "db", "shop-platform"]);
});

test("init treats an infrastructure-only repository as existing, and a near-empty one as new", () => {
  const infra = copy("k8s-helm", { git: true });
  assert.equal(installProject(infra, { flavor: "meta" }).existing, true);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "sp-crawl-empty-"));
  fs.writeFileSync(path.join(empty, "index.js"), "console.log(1);\n");
  assert.equal(installProject(empty, { flavor: "meta" }).existing, false);
});
