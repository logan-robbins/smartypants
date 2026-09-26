import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { emptyIntent, heuristicAtoms, intentTokens, loadIntent, parseAtom, rememberAtoms, renderIntent } from "../src/intent.js";
import { createChooser, heuristicChooser, jevChooser, metaChooser } from "../src/jev.js";
import { toMermaid } from "../src/mermaid.js";
import { applyDesign, emptyDesign, loadDesign, saveDesign } from "../src/model.js";
import { handleHook } from "../src/pipeline.js";
import { compactGraph } from "../src/prompts.js";
import { drain, enqueue } from "../src/queue.js";
import { editFeatures, matchNode, parseDeeper, suggestLevel, turnFeatures } from "../src/salience.js";
import { loadStats } from "../src/stats.js";
import { triageEdit, triageTurn } from "../src/triage.js";
import { autoDeepenTarget } from "../src/deeper.js";
import { buildScene, collapse } from "../src/scene.js";
import { tempProject } from "./helpers.js";

const shortener = {
  isDesign: true,
  nodes: [
    { id: "shortener", name: "Shortener", kind: "system", grain: "system", parentId: "", shape: "service", what: "Turns long links into short ones", why: "People share short links", notes: [] },
    { id: "redirect", name: "Redirect", kind: "component", grain: "component", parentId: "shortener", shape: "service", what: "Sends a click to the long URL", why: "The short link has to go somewhere", notes: [] },
    { id: "link-store", name: "Link Store", kind: "component", grain: "component", parentId: "shortener", shape: "store", what: "Keeps code to URL", why: "Redirect needs the mapping", notes: [] },
    { id: "hot-cache", name: "Hot Cache", kind: "component", grain: "component", parentId: "shortener", shape: "cache", what: "Holds popular codes", why: "Redirect must be fast", notes: [] },
  ],
  connections: [
    { id: "r-get", fromId: "redirect", toId: "hot-cache", kind: "data", label: "get url" },
    { id: "r-read", fromId: "redirect", toId: "link-store", kind: "data", label: "read on miss" },
  ],
  removeNodeIds: [],
  removeConnectionIds: [],
  intent: [],
};

function scripted(answers) {
  const calls = [];
  return {
    calls,
    via: "scripted",
    async choose(state, questions) {
      calls.push({ state, questions });
      const out = {};
      for (const id of Object.keys(questions)) out[id] = answers[id] ?? { value: questions[id].options[0].value, confidence: 1 };
      return { answers: out, via: "scripted" };
    },
  };
}

test("go deeper commands parse and resolve to a node", () => {
  assert.equal(parseDeeper("go deeper on the aggregation workers"), "aggregation workers");
  assert.equal(parseDeeper("/smartypants:deeper Redirect"), null);
  assert.equal(turnFeatures("/smartypants:deeper Redirect").noise, true);
  assert.equal(parseDeeper("zoom into the cache"), "cache");
  assert.equal(parseDeeper("tell me more about the key range service"), "key range service");
  assert.equal(parseDeeper("design a cache"), null);
  const design = applyDesign(emptyDesign(), shortener, "component").design;
  assert.equal(matchNode(design.nodes, "hot cache").node.id, "hot-cache");
  assert.equal(matchNode(design.nodes, "redirect").node.id, "redirect");
});

test("local features stop noise for free and pick a starting level", () => {
  for (const text of ["thanks!", "run the tests", "sounds good, can you run the tests", "fix the lint errors", "commit that"]) {
    assert.equal(turnFeatures(text).noise, true, text);
  }
  assert.equal(turnFeatures("Design a URL shortener with a cache in front of the link table").noise, false);
  assert.equal(suggestLevel(turnFeatures("Design Instagram")), "system");
  assert.equal(suggestLevel(turnFeatures("High level design: an API gateway, a feed service, and a Redis cache")), "component");
  assert.equal(suggestLevel(turnFeatures("the shard key is user id and each partition keeps a count-min sketch plus a heap")), "module");
  assert.equal(editFeatures({ path: "pricing/surge_test.go", contents: "x".repeat(40) }).quiet, true);
  assert.equal(editFeatures({ path: "README.md", contents: "x".repeat(40) }).quiet, true);
  assert.deepEqual(editFeatures({ path: "src/redirect/handler.js", contents: "export const a = cache.get(code);" }, applyDesign(emptyDesign(), shortener, "component").design).owners, ["redirect"]);
});

test("IntentCode keeps keyed atoms, supersedes decisions, and never stores prose", () => {
  assert.equal(parseAtom("The user wants a fast redirect."), null);
  assert.deepEqual(parseAtom("N redirect.latency p99<50ms"), { k: "N", s: "redirect.latency", v: "p99<50ms" });
  let memory = rememberAtoms(emptyIntent(), ["G sys short links and click counts", "D link-store cassandra>mysql", "N redirect.latency p99<50ms"]);
  assert.equal(memory.gained.length, 3);
  memory = rememberAtoms(memory.intent, ["N redirect.latency p99<50ms", "D link-store dynamodb"]);
  assert.deepEqual(memory.gained, ["D link-store dynamodb"]);
  assert.equal(memory.superseded.length, 1);
  const atoms = memory.intent.atoms;
  assert.equal(atoms.find((a) => a.k === "N").n, 2);
  assert.equal(atoms.find((a) => a.k === "X" && a.s === "link-store").v, "cassandra");
  const text = renderIntent(memory.intent);
  assert.match(text, /^sys\|G /m);
  assert.match(text, /link-store\|D dynamodb\|X cassandra/);
  assert.equal(text.includes("The user"), false);

  let big = emptyIntent();
  for (let i = 0; i < 400; i += 1) big = rememberAtoms(big, [`Q part-${i} option-${i} or other-${i}`], { budget: 300 }).intent;
  big = rememberAtoms(big, ["G sys never evicted first"], { budget: 300 }).intent;
  assert.ok(intentTokens(big) <= 300);
  assert.equal(big.atoms.some((a) => a.k === "G"), true);
});

test("local constraint extraction keeps numbers and guarantees as distinct atoms", () => {
  const atoms = heuristicAtoms("500M DAU, each user has on average 300 friends; feed load p99 under 200ms. Messages are delivered at least once.");
  assert.deepEqual(atoms, ["N sys.users-dau 500M dau", "N sys.users-friends 300 friends", "N sys.latency p99<200ms", "N sys.at-least-once required"]);
  assert.deepEqual(heuristicAtoms("Use Cassandra instead of MySQL for links."), ["D sys.tech Cassandra>MySQL"]);
});

test("the Jev selector speaks the systemone protocol and rejects off-menu answers", async () => {
  let sent;
  const fetchCall = async (url, init) => {
    sent = { url, body: JSON.parse(init.body), auth: init.headers.authorization };
    return new Response(JSON.stringify({ model: "jev-1.13.0", answers: { signal: { choice: "c1", confidence: 0.91 } }, usage: { input_tokens: 40, output_tokens: 2 } }));
  };
  const jev = jevChooser({ env: { TYPESAFE_API_KEY: "k" }, fetchCall });
  const answers = await jev.choose({ turn: "x" }, { signal: { question: "kind?", options: [{ value: "noise", label: "nothing" }, { value: "arch", label: "architecture" }] } });
  assert.equal(sent.url, "https://api.typesafe.ai/v1/systemone");
  assert.equal(sent.body.model, "jev-latest");
  assert.deepEqual(sent.body.questions.signal, { type: "choice", instructions: "kind?", criteria: { c0: "nothing", c1: "architecture" } });
  assert.equal(sent.auth, "Bearer k");
  assert.deepEqual(answers.signal.value, "arch");
  assert.equal(answers.signal.confidence, 0.91);

  const bad = jevChooser({ env: { TYPESAFE_API_KEY: "k" }, fetchCall: async () => new Response(JSON.stringify({ model: "jev-1", answers: { signal: { choice: "c7" } } })) });
  await assert.rejects(() => bad.choose({}, { signal: { question: "q", options: [{ value: "a" }] } }), /outside the menu/);
});

test("the Meta selector escalates only unsure questions and the chain falls back", async () => {
  const efforts = [];
  const fetchCall = async (_url, init) => {
    const body = JSON.parse(init.body);
    efforts.push(body.reasoning_effort);
    assert.equal(body.model, "muse-spark-1.3-contributor");
    assert.equal(body.response_format.type, "json_schema");
    const unsure = body.reasoning_effort === "minimal";
    const content = unsure
      ? { signal: { choice: "c0", confidence: 0.3 }, impact: { choice: "c1", confidence: 0.9 } }
      : { signal: { choice: "c1", confidence: 0.8 } };
    return new Response(JSON.stringify({ model: body.model, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }));
  };
  const meta = metaChooser({ env: { META_API_KEY: "k", META_BASE_URL: "http://meta.test/v1" }, fetchCall });
  const questions = {
    signal: { question: "q", options: [{ value: "noise" }, { value: "arch" }] },
    impact: { question: "q", options: [{ value: "none" }, { value: "extend" }] },
  };
  const answers = await meta.choose({}, questions);
  assert.deepEqual(efforts, ["minimal", "low"]);
  assert.equal(answers.signal.value, "arch");
  assert.equal(answers.impact.value, "extend");

  const chain = createChooser({ decider: "meta" }, { env: { META_API_KEY: "k", META_BASE_URL: "http://127.0.0.1:9" } });
  const original = console.error;
  console.error = () => {};
  try {
    const fallback = await chain.choose({}, { signal: { question: "q", options: [{ value: "noise" }, { value: "arch" }], fallback: { value: "arch", confidence: 0.4 } } });
    assert.equal(fallback.via, "heuristic");
    assert.equal(fallback.answers.signal.value, "arch");
  } finally {
    console.error = original;
  }
  assert.equal((await heuristicChooser().choose({}, { a: { options: [{ value: "x" }] } })).a.value, "x");
});

test("triage answers: remember, build, deepen, drift, or skip", async () => {
  const design = applyDesign(emptyDesign(), shortener, "component").design;
  const intent = emptyIntent();
  const noise = scripted({});
  assert.equal((await triageTurn({ text: "thanks", design, intent, chooser: noise })).action, "skip");
  assert.equal(noise.calls.length, 0);

  const first = await triageTurn({ text: "Design a URL shortener with a redirect service, a link table, and a cache", design: emptyDesign(), intent, chooser: noise, auto: true });
  assert.equal(first.action, "design");
  assert.equal(first.level, "component");
  assert.equal(noise.calls.length, 0);

  const remember = await triageTurn({ text: "redirect p99 under 50ms, 10B redirects a month", design, intent, chooser: noise });
  assert.equal(remember.action, "remember");

  const deeper = await triageTurn({ text: "go deeper on the hot cache", design, intent, chooser: noise });
  assert.deepEqual([deeper.action, deeper.target], ["deepen", "hot-cache"]);

  const unsure = scripted({ signal: { value: "noise", confidence: 0.4 }, impact: { value: "none", confidence: 0.4 } });
  assert.equal((await triageTurn({ text: "maybe the redirect should do something else", design, intent, chooser: unsure })).action, "design");
  const sure = scripted({ signal: { value: "noise", confidence: 0.95 }, impact: { value: "none", confidence: 0.95 } });
  assert.equal((await triageTurn({ text: "how would you estimate storage for this?", design, intent, chooser: sure })).action, "skip");

  const quiet = await triageEdit({ event: { path: "test/redirect.test.js", contents: "x".repeat(50) }, design, intent, chooser: noise });
  assert.equal(quiet.action, "skip");
  const conforms = await triageEdit({ event: { path: "src/redirect/handler.js", contents: "const url = await cache.get(code) ?? await store.get(code);" }, design, intent, chooser: scripted({ verdict: { value: "conforms", confidence: 0.9 } }) });
  assert.equal(conforms.action, "skip");
  const drift = await triageEdit({ event: { path: "src/redirect/handler.js", contents: "await db.query('UPDATE links SET clicks = clicks + 1');" }, design, intent, chooser: scripted({ verdict: { value: "diverges", confidence: 0.9 } }) });
  assert.deepEqual([drift.action, drift.owners], ["drift", ["redirect"]]);
});

test("delta results remove nodes with their children and merge deep-dive notes", () => {
  let design = applyDesign(emptyDesign(), shortener, "module").design;
  design = applyDesign(design, {
    isDesign: true,
    nodes: [
      { id: "cache-eviction", name: "Eviction", kind: "module", grain: "module", parentId: "hot-cache", shape: "service", what: "Drops cold codes", why: "Memory is bounded", notes: ["LRU", "TTL 24h"] },
      { ...shortener.nodes[3], notes: ["write-through on create"] },
    ],
    connections: [],
    removeNodeIds: [],
    removeConnectionIds: [],
  }, "module").design;
  assert.deepEqual(design.nodes.find((n) => n.id === "hot-cache").notes, ["write-through on create"]);
  assert.equal(design.nodes.find((n) => n.id === "hot-cache").shape, "cache");
  const removed = applyDesign(design, { isDesign: true, nodes: [], connections: [], removeNodeIds: ["hot-cache"], removeConnectionIds: [] }, "module");
  assert.equal(removed.changed, true);
  assert.equal(removed.design.nodes.some((n) => n.id === "hot-cache" || n.id === "cache-eviction"), false);
  assert.equal(removed.design.connections.some((c) => c.toId === "hot-cache"), false);
});

test("compact graph, Mermaid export, collapse, and auto-deepen pressure", () => {
  const design = applyDesign(emptyDesign(), shortener, "component").design;
  const compact = compactGraph(design);
  assert.ok(compact.length < JSON.stringify({ nodes: design.nodes, connections: design.connections }).length / 2);
  assert.match(compact, /redirect>hot-cache\|data\|get url#r-get/);
  const mermaid = toMermaid(design);
  assert.match(mermaid, /^flowchart LR/);
  assert.match(mermaid, /link_store\[\("Link Store"\)\]/);
  assert.match(mermaid, /redirect -->\|"get url"\| hot_cache/);
  const withModule = applyDesign(design, { isDesign: true, nodes: [{ id: "evict", name: "Eviction", kind: "module", grain: "module", parentId: "hot-cache", shape: "service", what: "Drops cold codes", why: "Memory is bounded", notes: [] }], connections: [{ id: "e", fromId: "redirect", toId: "evict", kind: "data", label: "touch" }], removeNodeIds: [], removeConnectionIds: [] }, "module").design;
  const folded = collapse(withModule, ["hot-cache"]);
  assert.equal(folded.nodes.some((n) => n.id === "evict"), false);
  assert.equal(folded.nodes.find((n) => n.id === "hot-cache").hidden, 1);
  assert.equal(folded.connections.some((c) => c.fromId === "redirect" && c.toId === "hot-cache" && c.label === "touch"), true);
  assert.ok(buildScene(folded).groups.length === 0);
  assert.ok(buildScene(withModule).groups.some((g) => g.id === "hot-cache"));
  const intent = rememberAtoms(emptyIntent(), ["N redirect.latency p99<50ms", "D redirect status-301", "F redirect geo-routing", "X redirect sync-db-write"]).intent;
  assert.equal(autoDeepenTarget(design, intent, null, 3).id, "redirect");
  assert.equal(autoDeepenTarget(design, intent, null, 5), null);
});

test("the queue drains in order under one lock", async () => {
  const root = tempProject();
  enqueue(root, { n: 1 });
  enqueue(root, { n: 2 });
  const seen = [];
  const handled = await drain(root, async (event) => {
    seen.push(event.n);
    if (event.n === 1) enqueue(root, { n: 3 });
  });
  assert.deepEqual(seen, [1, 2, 3]);
  assert.equal(handled, 3);
});

function mockMeta(respond) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const parsed = JSON.parse(body);
      requests.push(parsed);
      const content = respond(parsed);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ model: parsed.model, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 1000, completion_tokens: 200, completion_tokens_details: { reasoning_tokens: 50 } } }));
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, requests, url: `http://127.0.0.1:${server.address().port}/v1` })));
}

test("the meta flavor runs triage, a delta build, intent, go deeper, and stats end to end", async () => {
  const meta = await mockMeta((body) => {
    if (body.response_format.json_schema.name === "system_one") {
      const props = Object.keys(body.response_format.json_schema.schema.properties);
      return Object.fromEntries(props.map((id) => [id, { choice: id === "signal" ? "c0" : id === "impact" ? "c2" : "c0", confidence: 0.9 }]));
    }
    const user = body.messages[1].content;
    if (user.includes("<deeper>")) {
      return { isDesign: true, nodes: [{ id: "hot-cache", name: "Hot Cache", kind: "component", grain: "component", parentId: "shortener", shape: "cache", what: "Holds popular codes", why: "Redirect must be fast", notes: [] }, { id: "evict", name: "Eviction", kind: "module", grain: "module", parentId: "hot-cache", shape: "service", what: "Drops cold codes", why: "Memory is bounded", notes: ["LRU"] }], connections: [], removeNodeIds: [], removeConnectionIds: [], intent: ["Q hot-cache.eviction lru-or-lfu"] };
    }
    return { ...shortener, intent: ["G sys short-links click-counts", "N redirect.latency p99<50ms"] };
  });
  const previous = process.env.META_BASE_URL;
  const previousKey = process.env.META_API_KEY;
  process.env.META_BASE_URL = meta.url;
  process.env.META_API_KEY = "test-key";
  const root = tempProject({ flavor: "meta", depth: "auto", decider: "meta", autoDeepen: false });
  const original = console.error;
  console.error = () => {};
  try {
    const first = await handleHook({ cwd: root, event: { type: "user", text: "Design a URL shortener: a redirect service reads a link store through a hot cache" } });
    assert.equal(first.designChanged, true);
    assert.equal(first.triage.action, "design");
    assert.equal(first.request.flavor, "meta");
    assert.equal(first.request.prompt.includes("<graph>"), true);
    assert.equal(meta.requests[0].model, "muse-spark-1.3-contributor");
    assert.equal(meta.requests[0].reasoning_effort, "low");
    const design = loadDesign(root);
    assert.equal(design.level, "component");
    assert.equal(design.nodes.find((n) => n.id === "link-store").shape, "store");
    assert.match(renderIntent(loadIntent(root)), /redirect\|N latency p99<50ms/);

    const skipped = await handleHook({ cwd: root, event: { type: "user", text: "thanks!" } });
    assert.equal(skipped.skipped, "noise-pattern");
    const before = meta.requests.length;
    const deeper = await handleHook({ cwd: root, event: { type: "deeper", target: "hot cache" } });
    assert.equal(deeper.triage.action, "deepen");
    assert.equal(deeper.request.kind, "deepen");
    assert.equal(deeper.request.floor, "module");
    assert.equal(meta.requests.length, before + 1);
    assert.deepEqual(loadDesign(root).nodes.find((n) => n.id === "evict").notes, ["LRU"]);
    const stats = loadStats(root);
    assert.equal(stats.turns, 3);
    assert.equal(stats.actions.skip, 1);
    assert.equal(stats.calls.builder, 2);
    assert.ok(stats.cost > 0);
    assert.equal(fs.existsSync(path.join(root, ".smartypants", "ledger.json")), false);
  } finally {
    console.error = original;
    meta.server.close();
    if (previous === undefined) delete process.env.META_BASE_URL;
    else process.env.META_BASE_URL = previous;
    if (previousKey === undefined) delete process.env.META_API_KEY;
    else process.env.META_API_KEY = previousKey;
  }
});

test("saved designs from an older version still load", () => {
  const root = tempProject();
  saveDesign(root, applyDesign(emptyDesign(), shortener, "component").design);
  const raw = JSON.parse(fs.readFileSync(path.join(root, ".smartypants", "design.json"), "utf8"));
  for (const node of raw.nodes) delete node.shape;
  fs.writeFileSync(path.join(root, ".smartypants", "design.json"), JSON.stringify(raw));
  assert.equal(loadDesign(root).nodes.length, 4);
});

test("payloads captured from real Claude Code, Codex, and Pi runs normalize", async () => {
  const { normalizePayload, extractDelivered } = await import("../src/normalize.js");
  const codexPrompt = { session_id: "s", turn_id: "t", cwd: "/p", hook_event_name: "UserPromptSubmit", model: "gpt-6-astra", permission_mode: "bypassPermissions", prompt: "Design a ride hailing app" };
  assert.deepEqual(normalizePayload(codexPrompt), { type: "user", text: "Design a ride hailing app" });
  const codexPatch = {
    hook_event_name: "PostToolUse",
    tool_name: "apply_patch",
    tool_input: { command: "*** Begin Patch\n*** Update File: /p/src/dispatch/match.js\n@@\n-  return null;\n+  return req.driver;\n*** End Patch" },
    tool_response: "Exit code: 0",
  };
  const edit = normalizePayload(codexPatch);
  assert.equal(edit.path, "/p/src/dispatch/match.js");
  assert.equal(edit.contents, "  return req.driver;");
  assert.equal(edit.diff.includes("-  return null;"), true);
  const claudeWrite = { hook_event_name: "PostToolUse", tool_name: "Write", tool_input: { file_path: "/p/src/a.js", content: "export const a = 1;\n" } };
  assert.equal(normalizePayload(claudeWrite).path, "/p/src/a.js");
  const piEdit = extractDelivered({ path: "src/orders/place.js", edits: [{ oldText: "return o;", newText: "return save(o);" }] }, "edit");
  assert.equal(piEdit.diff.includes("return save(o);"), true);
  assert.equal(parseDeeper("dig into the heap tracker please"), "heap tracker");
});
