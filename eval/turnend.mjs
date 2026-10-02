#!/usr/bin/env node
/**
 * Turn-end review benchmark: labeled changes to the shop-monorepo example,
 * each in a fresh git copy, reviewed the way the Stop hook reviews a turn.
 *
 *   node eval/turnend.mjs [--deciders heuristic,meta,jev] [--reps 2] [--out results/<dir>]
 *     selector only: git changes -> one batched selector call, no writer.
 *   node eval/turnend.mjs --e2e [--deciders heuristic,claude,jev] [--writer claude|meta] [--reps 2]
 *     the whole Stop hook: the selector picks which files to check, then the
 *     writer (Claude by default) writes the drift note; scored on the flags
 *     that actually land.
 *
 * Labels: diverges (breaks a recorded decision, constraint, or boundary),
 * conforms, not-architectural, new-boundary. The drift flag is what the user
 * sees; `flag ok` scores that, `exact` scores the four-way verdict.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createChooser } from "../src/jev.js";
import { saveIntent } from "../src/intent.js";
import { loadDesign, saveDesign } from "../src/model.js";
import { handleHook } from "../src/pipeline.js";
import { reviewTurn } from "../src/turnend.js";

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const deciders = opt("deciders", "heuristic,meta,jev").split(",");
const reps = Number(opt("reps", "2"));
const writer = opt("writer", "claude");
const WRITER_NAME = { claude: "Claude", meta: "Muse Spark" }[writer] || writer;
const out = path.resolve(pkg, opt("out", `results/${new Date().toISOString().slice(0, 10)}-jev`));
const source = path.join(pkg, "examples/shop-monorepo");
const design = JSON.parse(fs.readFileSync(path.join(pkg, "examples/shop-monorepo.design.json"), "utf8"));
const intent = JSON.parse(fs.readFileSync(path.join(pkg, "examples/shop-monorepo.intent.json"), "utf8"));

const API = "services/api/src/server.js";
const WEB = "web/app/page.tsx";
const WORKER = "services/fulfillment/app/worker.py";
const edit = (file, from, to) => ({ file, from, to });

const SCENARIOS = [
  {
    name: "web queries Postgres directly",
    expect: { [WEB]: "diverges" },
    edits: [edit(WEB, /^[\s\S]*$/, `import { Pool } from "pg";\nconst db = new Pool({ connectionString: process.env.DATABASE_URL });\n\nexport default async function Home() {\n  const { rows: products } = await db.query("SELECT id, name FROM products");\n  return <main>{products.map((p: { id: string; name: string }) => <a key={p.id} href={\`/p/\${p.id}\`}>{p.name}</a>)}</main>;\n}\n`)],
  },
  {
    name: "order is published before the card is charged",
    expect: { [API]: "diverges" },
    edits: [edit(API, /app\.post\("\/orders"[\s\S]*?\n\}\);/, `app.post("/orders", async (req, res) => {\n  const { rows } = await db.query("INSERT INTO orders(customer_id, total) VALUES ($1,$2) RETURNING id", [req.body.customerId, req.body.total]);\n  await producer.send({ topic: "orders.placed", messages: [{ value: JSON.stringify({ orderId: rows[0].id }) }] });\n  stripe.paymentIntents.create({ amount: req.body.total, currency: "usd" }).catch(() => {});\n  res.status(201).json({ id: rows[0].id });\n});`)],
  },
  {
    name: "products skip the cache",
    expect: { [API]: "diverges" },
    edits: [edit(API, /app\.get\("\/products"[\s\S]*?\n\}\);/, `app.get("/products", async (_req, res) => {\n  const { rows } = await db.query("SELECT id, name, price FROM products");\n  res.json(rows);\n});`)],
  },
  {
    name: "cache TTL raised to 10 minutes",
    expect: { [API]: "diverges" },
    edits: [edit(API, `"EX", 60)`, `"EX", 600)`)],
  },
  {
    name: "invoices written to local disk instead of S3",
    expect: { [WORKER]: "diverges" },
    edits: [edit(WORKER, `    s3.put_object(Bucket=os.environ["INVOICE_BUCKET"], Key=f"invoices/{order['orderId']}.pdf", Body=b"...")`, `    with open(f"/tmp/invoices/{order['orderId']}.pdf", "wb") as fh:\n        fh.write(b"...")`)],
  },
  {
    name: "order lookup endpoint through the API and Postgres",
    expect: { [API]: "conforms" },
    edits: [edit(API, `app.listen(8080);`, `app.get("/orders/:id", async (req, res) => {\n  const { rows } = await db.query("SELECT id, status, total FROM orders WHERE id = $1", [req.params.id]);\n  if (!rows.length) return res.sendStatus(404);\n  res.json(rows[0]);\n});\n\napp.listen(8080);`)],
  },
  {
    name: "request logging middleware",
    expect: { [API]: "not-architectural" },
    edits: [edit(API, `app.use(express.json());`, `app.use(express.json());\napp.use((req, _res, next) => {\n  console.log(new Date().toISOString(), req.method, req.path);\n  next();\n});`)],
  },
  {
    name: "rename a loop variable in the worker",
    expect: { [WORKER]: "not-architectural" },
    edits: [edit(WORKER, /\border\b/g, "placed")],
  },
  {
    name: "SMS to the shopper through Twilio",
    expect: { [API]: "new-boundary" },
    edits: [
      edit(API, `import Stripe from "stripe";`, `import Stripe from "stripe";\nimport twilio from "twilio";\nconst sms = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);`),
      edit(API, `  res.status(201).json({ id: rows[0].id });`, `  await sms.messages.create({ to: req.body.phone, from: process.env.TWILIO_FROM, body: \`Order \${rows[0].id} placed\` });\n  res.status(201).json({ id: rows[0].id });`),
    ],
  },
  {
    name: "product list shows prices",
    expect: { [WEB]: "not-architectural" },
    edits: [edit(WEB, `{p.name}</a>`, `{p.name} · \${(p as { price?: number }).price ?? ""}</a>`)],
  },
  {
    name: "one turn, three files: bypass, log line, and SMS",
    expect: { [WEB]: "diverges", [WORKER]: "not-architectural", [API]: "new-boundary" },
    edits: [],
    combine: ["web queries Postgres directly", "rename a loop variable in the worker", "SMS to the shopper through Twilio"],
  },
];
for (const s of SCENARIOS) if (s.combine) s.edits = s.combine.flatMap((name) => SCENARIOS.find((x) => x.name === name).edits);

function git(cwd, argv) {
  return execFileSync("git", argv, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function fresh(scenario) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sp-turnend-"));
  fs.cpSync(source, root, { recursive: true });
  git(root, ["init", "-q"]);
  git(root, ["-c", "user.email=eval@local", "-c", "user.name=eval", "add", "-A"]);
  git(root, ["-c", "user.email=eval@local", "-c", "user.name=eval", "commit", "-qm", "base"]);
  for (const e of scenario.edits) {
    const file = path.join(root, e.file);
    const before = fs.readFileSync(file, "utf8");
    const after = before.replace(e.from, e.to);
    if (after === before) throw new Error(`scenario "${scenario.name}" did not change ${e.file}`);
    fs.writeFileSync(file, after);
  }
  return root;
}

const flagTotal = (d) => d.nodes.reduce((sum, n) => sum + (n.flags?.length || 0), 0) + (d.unmappedFlags?.length || 0);

// One Stop hook end to end, in its own process (the builder guard is per process).
if (args[0] === "--child") {
  const [, decider, index, flavor = "claude"] = args;
  const scenario = SCENARIOS[Number(index)];
  const root = fresh(scenario);
  saveDesign(root, design);
  saveIntent(root, intent);
  fs.writeFileSync(path.join(root, "smartypants.config.json"), JSON.stringify({ flavor, depth: "auto", decider, review: "turn", timeoutMs: 120000 }));
  process.env.SMARTYPANTS_DECIDER = decider;
  console.error = () => {};
  const before = flagTotal(loadDesign(root));
  const started = Date.now();
  const result = await handleHook({ cwd: root, event: { type: "turn-end" }, timeoutMs: 120000 });
  const after = loadDesign(root);
  const flags = [...after.nodes.flatMap((n) => (n.flags || []).map((f) => ({ node: n.id, ...f }))), ...(after.unmappedFlags || [])].slice(before);
  fs.rmSync(root, { recursive: true, force: true });
  process.stdout.write(JSON.stringify({ flagged: flagTotal(after) > before, flags, ms: Date.now() - started, error: result.error || null }));
  process.exit(0);
}

if (args.includes("--e2e")) {
  const self = fileURLToPath(import.meta.url);
  const runChild = (decider, index) => new Promise((resolve) => {
    const child = spawn(process.execPath, [self, "--child", decider, String(index), writer], { env: process.env, stdio: ["ignore", "pipe", "ignore"] });
    let text = "";
    child.stdout.on("data", (d) => { text += d; });
    child.on("close", () => { try { resolve(JSON.parse(text)); } catch { resolve({ flagged: false, flags: [], ms: 0, error: "child failed" }); } });
  });
  const rows = [];
  const detail = [];
  for (const decider of deciders) {
    if (decider === "jev" && !process.env.TYPESAFE_API_KEY) { console.log("skip decider jev: TYPESAFE_API_KEY is not set"); continue; }
    const row = { decider, turns: 0, ok: 0, missed: 0, falseFlags: 0, errors: 0, ms: [] };
    for (let rep = 0; rep < reps; rep += 1) {
      const results = await Promise.all(SCENARIOS.map((_, i) => runChild(decider, i)));
      results.forEach((r, i) => {
        const want = Object.values(SCENARIOS[i].expect).includes("diverges");
        row.turns += 1;
        row.ms.push(r.ms);
        if (r.error) row.errors += 1;
        if (want === r.flagged) row.ok += 1;
        if (want && !r.flagged) row.missed += 1;
        if (!want && r.flagged) row.falseFlags += 1;
        detail.push({ decider, rep, scenario: SCENARIOS[i].name, want, got: r.flagged, flags: r.flags, ms: r.ms, error: r.error });
      });
    }
    row.ms.sort((a, b) => a - b);
    row.p50 = row.ms[row.ms.length >> 1];
    delete row.ms;
    rows.push(row);
    console.log(`${decider}: drift flag right on ${row.ok}/${row.turns} turns, missed ${row.missed}, false flags ${row.falseFlags}, p50 ${row.p50}ms, errors ${row.errors}`);
  }
  const table = [
    `End-to-end Stop hook on ${SCENARIOS.length} labeled turns of the shop-monorepo example (${reps} reps): the selector picks which changed files to check, ${WRITER_NAME} writes the drift note, and a turn counts as flagged only if a flag lands on the diagram.`,
    "",
    `| selector (writer: ${WRITER_NAME}) | drift flag right | missed drift | false flags | p50 hook time | errors |`,
    "|---|---:|---:|---:|---:|---:|",
    ...rows.map((r) => `| ${r.decider} | ${r.ok}/${r.turns} | ${r.missed} | ${r.falseFlags} | ${(r.p50 / 1000).toFixed(1)} s | ${r.errors} |`),
  ].join("\n");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "turnend-e2e.md"), `${table}\n`);
  fs.writeFileSync(path.join(out, "turnend-e2e.json"), JSON.stringify({ rows, detail }, null, 2));
  console.log(`\n${table}\nwrote ${path.relative(pkg, out)}/turnend-e2e.{md,json}`);
  process.exit(0);
}

const flagged = (verdict) => verdict && (verdict.value === "diverges" || ((verdict.value === "conforms" || verdict.value === "not-architectural") && verdict.confidence < 0.5));
const rows = [];
const detail = [];
for (const decider of deciders) {
  if (decider === "jev" && !process.env.TYPESAFE_API_KEY) {
    console.log("skip decider jev: TYPESAFE_API_KEY is not set");
    continue;
  }
  const usage = [];
  const chooser = createChooser({ decider }, { env: { ...process.env, SMARTYPANTS_DECIDER: decider }, record: (u) => usage.push(u) });
  const row = { decider, files: 0, exact: 0, flagOk: 0, missed: 0, falseFlags: 0, turns: 0, calls: 0, cost: 0, ms: [] };
  const quiet = console.error;
  console.error = () => {};
  for (let rep = 0; rep < reps; rep += 1) {
    const results = await Promise.all(SCENARIOS.map(async (scenario) => {
      const root = fresh(scenario);
      const started = Date.now();
      try {
        const review = await reviewTurn({ root, design, intent, chooser });
        return { scenario, review, ms: Date.now() - started };
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }));
    for (const { scenario, review, ms } of results) {
      row.turns += 1;
      row.ms.push(ms);
      for (const [file, expect] of Object.entries(scenario.expect)) {
        const verdict = review.verdicts[file];
        const got = verdict?.value || "unreviewed";
        const wantFlag = expect === "diverges";
        const gotFlag = Boolean(flagged(verdict));
        row.files += 1;
        if (got === expect) row.exact += 1;
        if (wantFlag === gotFlag) row.flagOk += 1;
        if (wantFlag && !gotFlag) row.missed += 1;
        if (!wantFlag && gotFlag) row.falseFlags += 1;
        detail.push({ decider, rep, scenario: scenario.name, file, expect, got, confidence: verdict?.confidence ?? null, jev: verdict?.jev || null, flagged: gotFlag, ms });
      }
    }
  }
  console.error = quiet;
  row.calls = usage.length;
  row.cost = usage.reduce((sum, u) => sum + (u.cost || 0), 0);
  row.ms.sort((a, b) => a - b);
  row.p50 = row.ms[row.ms.length >> 1];
  delete row.ms;
  rows.push(row);
  console.log(`${decider}: exact ${row.exact}/${row.files}, drift flag ${row.flagOk}/${row.files}, missed ${row.missed}, false flags ${row.falseFlags}, p50 ${row.p50}ms, $${row.cost.toFixed(4)}`);
}

const table = [
  `Turn-end review on ${SCENARIOS.length} labeled turns of the shop-monorepo example (${reps} reps each; the last turn changes three files at once).`,
  "",
  "| decider | four-way verdict | drift flag correct | missed drift | false flags | p50 review latency | selector calls | selector cost |",
  "|---|---:|---:|---:|---:|---:|---:|---:|",
  ...rows.map((r) => `| ${r.decider} | ${r.exact}/${r.files} | ${r.flagOk}/${r.files} | ${r.missed} | ${r.falseFlags} | ${r.p50} ms | ${r.calls} | $${r.cost.toFixed(4)} |`),
].join("\n");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "turnend.md"), `${table}\n`);
fs.writeFileSync(path.join(out, "turnend.json"), JSON.stringify({ rows, detail }, null, 2));
console.log(`\n${table}\nwrote ${path.relative(pkg, out)}/turnend.{md,json}`);
