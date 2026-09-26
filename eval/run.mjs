#!/usr/bin/env node
/**
 * Live eval: replay the labeled interview transcripts through the real
 * pipeline with the Meta Model API and score triage, recall, drift, and cost.
 *
 *   node eval/run.mjs [--arms jev-meta,always] [--only youtube-top-k] [--out results/<dir>]
 *
 * Arms:
 *   jev-meta  Jev-protocol selector on Muse Spark (minimal effort) gates the builder.
 *   jev       real Jev selector (needs TYPESAFE_API_KEY).
 *   always    no model selector: every non-trivial turn goes to the builder.
 * Every arm builds with Muse Spark 1.3 Contributor. Paid calls: a few cents per run.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadIntent, intentTokens, renderIntent } from "../src/intent.js";
import { loadDesign } from "../src/model.js";
import { handleHook } from "../src/pipeline.js";
import { compactGraph } from "../src/prompts.js";
import { loadStats } from "../src/stats.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, "..");
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const arms = opt("arms", "jev-meta,always").split(",");
const only = opt("only", null);
const out = path.resolve(pkg, opt("out", `results/${new Date().toISOString().slice(0, 10)}-meta-jev`));
const saveExamples = args.includes("--save-examples");

const DECIDER = { "jev-meta": "meta", jev: "jev", always: "heuristic" };
const { examples } = JSON.parse(fs.readFileSync(path.join(pkg, "examples/transcripts.json"), "utf8"));

function predicted(result) {
  const action = result.triage?.action || (result.adapterInvoked ? "design" : "skip");
  return action === "design" || action === "seed" ? "build" : action;
}

function recall(design, golden) {
  const text = design.nodes.map((n) => `${n.name} ${n.what} ${(n.notes || []).join(" ")}`.toLowerCase());
  const hits = golden.filter((group) => group.some((word) => text.some((t) => t.includes(word))));
  return { hit: hits.length, of: golden.length };
}

function flagCount(design) {
  return design.nodes.reduce((sum, n) => sum + (n.flags?.length || 0), 0) + (design.unmappedFlags?.length || 0);
}

async function runExample(arm, example) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `sp-eval-${arm}-${example.name}-`));
  fs.writeFileSync(path.join(root, "smartypants.config.json"), JSON.stringify({ flavor: "meta", depth: "auto", decider: DECIDER[arm], timeoutMs: 120000 }));
  const turns = [];
  const quiet = console.error;
  console.error = () => {};
  try {
    for (const turn of example.turns) {
      const started = Date.now();
      const result = await handleHook({ cwd: root, event: { type: "user", text: turn.text }, timeoutMs: 120000 });
      turns.push({ text: turn.text, expect: turn.expect, got: predicted(result), reason: result.triage?.reason, via: result.triage?.via, changed: result.designChanged, deepened: result.deepened || null, error: result.error || null, ms: Date.now() - started });
    }
    const edits = [];
    for (const edit of example.edits) {
      const before = flagCount(loadDesign(root));
      const started = Date.now();
      const result = await handleHook({ cwd: root, event: { type: "edit", path: edit.path, contents: edit.contents, diff: null }, timeoutMs: 120000 });
      const flagged = flagCount(loadDesign(root)) > before;
      edits.push({ path: edit.path, expect: edit.expect, got: flagged ? "diverges" : "conforms", triage: `${result.triage?.action}:${result.triage?.reason}`, error: result.error || null, ms: Date.now() - started });
    }
    const design = loadDesign(root);
    const intent = loadIntent(root);
    const stats = loadStats(root);
    return {
      arm,
      name: example.name,
      root,
      turns,
      edits,
      recall: recall(design, example.golden),
      nodes: design.nodes.length,
      flows: design.connections.length,
      level: design.level || null,
      intent: { atoms: intent.atoms.length, tokens: intentTokens(intent), text: renderIntent(intent) },
      intentJson: intent,
      context: { jsonChars: JSON.stringify({ nodes: design.nodes, connections: design.connections }).length, compactChars: compactGraph(design).length },
      stats: { calls: stats.calls, tokens: stats.tokens, cost: stats.cost, selectorCost: stats.selectorCost, builderCost: stats.builderCost },
      design,
    };
  } finally {
    console.error = quiet;
  }
}

function summarize(runs) {
  const rows = {};
  for (const run of runs) {
    const r = (rows[run.arm] ||= { arm: run.arm, turns: 0, triageOk: 0, skipped: 0, falseSkips: 0, builderCalls: 0, selectorCalls: 0, recallHit: 0, recallOf: 0, editsOk: 0, edits: 0, cost: 0, inTok: 0, outTok: 0, ms: 0, atoms: 0, intentTokens: 0, jsonChars: 0, compactChars: 0, errors: 0 });
    for (const t of run.turns) {
      r.turns += 1;
      r.ms += t.ms;
      if (t.got === t.expect) r.triageOk += 1;
      if (t.got === "skip") r.skipped += 1;
      if (t.got === "skip" && t.expect !== "skip") r.falseSkips += 1;
      if (t.error) r.errors += 1;
    }
    for (const e of run.edits) {
      r.edits += 1;
      if (e.got === e.expect) r.editsOk += 1;
      if (e.error) r.errors += 1;
    }
    r.builderCalls += run.stats.calls.builder;
    r.selectorCalls += run.stats.calls.selector;
    r.recallHit += run.recall.hit;
    r.recallOf += run.recall.of;
    r.cost += run.stats.cost;
    r.inTok += run.stats.tokens.input;
    r.outTok += run.stats.tokens.output;
    r.atoms += run.intent.atoms;
    r.intentTokens += run.intent.tokens;
    r.jsonChars += run.context.jsonChars;
    r.compactChars += run.context.compactChars;
  }
  return Object.values(rows);
}

function table(rows) {
  const lines = [
    "| arm | triage accuracy | skipped free | false skips | builder calls | node recall | drift accuracy | intent atoms (tokens) | total tokens in/out | cost | mean turn latency | errors |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const r of rows) {
    lines.push(`| ${r.arm} | ${r.triageOk}/${r.turns} | ${r.skipped} | ${r.falseSkips} | ${r.builderCalls} | ${r.recallHit}/${r.recallOf} | ${r.editsOk}/${r.edits} | ${r.atoms} (${r.intentTokens}) | ${r.inTok}/${r.outTok} | $${r.cost.toFixed(4)} | ${(r.ms / r.turns / 1000).toFixed(1)}s | ${r.errors} |`);
  }
  return lines.join("\n");
}

// One process per example: the builder guard is process-wide, so in-process
// parallel runs would see each other's guard and go inert.
function runChild(arm, example) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--child", arm, example.name], { stdio: ["ignore", "pipe", "inherit"] });
    let text = "";
    child.stdout.on("data", (chunk) => { text += chunk; });
    child.on("exit", (code) => {
      if (code !== 0) return reject(new Error(`${arm}/${example.name} exited ${code}`));
      resolve(JSON.parse(text));
    });
  });
}

const childAt = args.indexOf("--child");
if (childAt !== -1) {
  const example = examples.find((e) => e.name === args[childAt + 2]);
  process.stdout.write(JSON.stringify(await runExample(args[childAt + 1], example)));
  process.exit(0);
}

const selected = examples.filter((e) => !only || only.split(",").includes(e.name));
const runs = [];
for (const arm of arms) {
  if (arm === "jev" && !process.env.TYPESAFE_API_KEY) {
    console.log("skip arm jev: TYPESAFE_API_KEY is not set");
    continue;
  }
  console.log(`arm ${arm}: ${selected.length} examples in parallel`);
  const done = await Promise.all(selected.map((example) => runChild(arm, example).then((run) => {
    console.log(`  ${arm}/${example.name}: triage ${run.turns.filter((t) => t.got === t.expect).length}/${run.turns.length}, recall ${run.recall.hit}/${run.recall.of}, drift ${run.edits.filter((e) => e.got === e.expect).length}/${run.edits.length}, $${run.stats.cost.toFixed(4)}`);
    return run;
  })));
  runs.push(...done);
}

const rows = summarize(runs);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "runs.json"), `${JSON.stringify(runs.map(({ design, root, intentJson, ...rest }) => rest), null, 1)}\n`);
fs.writeFileSync(path.join(out, "summary.json"), `${JSON.stringify(rows, null, 1)}\n`);
fs.writeFileSync(path.join(out, "summary.md"), `${table(rows)}\n`);
if (saveExamples) {
  for (const run of runs.filter((r) => r.arm === arms[0])) {
    fs.writeFileSync(path.join(pkg, "examples", `${run.name}.design.json`), `${JSON.stringify(run.design, null, 2)}\n`);
    fs.writeFileSync(path.join(pkg, "examples", `${run.name}.intent.txt`), `${run.intent.text}\n`);
    fs.writeFileSync(path.join(pkg, "examples", `${run.name}.intent.json`), `${JSON.stringify(run.intentJson)}\n`);
  }
}
console.log(`\n${table(rows)}\n\nwrote ${path.relative(pkg, out)}`);
