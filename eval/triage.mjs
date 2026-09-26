#!/usr/bin/env node
/**
 * Triage-only benchmark on held-out turns and edits: no builder calls.
 * Compares the free local stage alone ("heuristic") with the Jev-protocol
 * selector on Muse Spark ("meta") and, when TYPESAFE_API_KEY is set, real Jev.
 *
 *   node eval/triage.mjs [--deciders heuristic,meta,jev] [--out results/<dir>]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emptyIntent, rememberAtoms } from "../src/intent.js";
import { createChooser } from "../src/jev.js";
import { triageEdit, triageTurn } from "../src/triage.js";

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const deciders = opt("deciders", "heuristic,meta,jev").split(",");
const out = path.resolve(pkg, opt("out", `results/${new Date().toISOString().slice(0, 10)}-meta-jev`));
const holdout = JSON.parse(fs.readFileSync(path.join(pkg, "examples/triage-holdout.json"), "utf8"));

function context(name) {
  const design = JSON.parse(fs.readFileSync(path.join(pkg, "examples", `${name}.design.json`), "utf8"));
  const file = path.join(pkg, "examples", `${name}.intent.json`);
  const intent = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : emptyIntent();
  return { design, intent: intent.atoms ? intent : rememberAtoms(emptyIntent(), []).intent };
}

const norm = (action) => (action === "design" ? "build" : action === "drift" ? "diverges" : action === "skip" ? "skip" : action);
const rows = [];
const detail = [];
for (const decider of deciders) {
  if (decider === "jev" && !process.env.TYPESAFE_API_KEY) {
    console.log("skip decider jev: TYPESAFE_API_KEY is not set");
    continue;
  }
  const usage = [];
  const chooser = createChooser({ decider }, { env: { ...process.env, SMARTYPANTS_DECIDER: decider }, record: (u) => usage.push(u) });
  const row = { decider, turns: 0, exact: 0, keepOk: 0, falseSkip: 0, falseKeep: 0, edits: 0, editOk: 0, missedDrift: 0, builderAvoided: 0, selectorCalls: 0, cost: 0, ms: 0 };
  const quiet = console.error;
  console.error = () => {};
  const tasks = holdout.turns.map(async (turn) => {
    const { design, intent } = context(turn.context);
    const started = Date.now();
    const decision = await triageTurn({ text: turn.text, design, intent, chooser, auto: true });
    return { turn, got: norm(decision.action), via: decision.via, reason: decision.reason, ms: Date.now() - started };
  });
  const edits = holdout.edits.map(async (edit) => {
    const { design, intent } = context(edit.context);
    const started = Date.now();
    const decision = await triageEdit({ event: { type: "edit", path: edit.path, contents: edit.contents, diff: null }, design, intent, chooser });
    return { edit, got: decision.action === "skip" ? "conforms" : "diverges", via: decision.via, reason: decision.reason, ms: Date.now() - started };
  });
  const turnResults = await Promise.all(tasks);
  const editResults = await Promise.all(edits);
  console.error = quiet;
  for (const r of turnResults) {
    row.turns += 1;
    row.ms += r.ms;
    const keepWant = r.turn.expect !== "skip";
    const keepGot = r.got !== "skip";
    if (r.got === r.turn.expect) row.exact += 1;
    if (keepWant === keepGot) row.keepOk += 1;
    if (keepWant && !keepGot) row.falseSkip += 1;
    if (!keepWant && keepGot) row.falseKeep += 1;
    detail.push({ decider, kind: "turn", text: r.turn.text, expect: r.turn.expect, got: r.got, via: r.via, reason: r.reason });
  }
  for (const r of editResults) {
    row.edits += 1;
    if (r.got === r.edit.expect) row.editOk += 1;
    if (r.edit.expect === "diverges" && r.got === "conforms") row.missedDrift += 1;
    if (r.got === "conforms") row.builderAvoided += 1;
    detail.push({ decider, kind: "edit", path: r.edit.path, expect: r.edit.expect, got: r.got, via: r.via, reason: r.reason });
  }
  row.selectorCalls = usage.length;
  row.cost = usage.reduce((sum, u) => sum + (u.cost || 0), 0);
  rows.push(row);
  console.log(`${decider}: turns exact ${row.exact}/${row.turns}, keep/skip ${row.keepOk}/${row.turns}, edits ${row.editOk}/${row.edits}, $${row.cost.toFixed(4)}`);
}

const lines = [
  "| decider | 4-way triage | keep vs skip | false skips (lost info) | false keeps | drift verdicts | missed drift | builder calls avoided on edits | selector calls | selector cost |",
  "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ...rows.map((r) => `| ${r.decider} | ${r.exact}/${r.turns} | ${r.keepOk}/${r.turns} | ${r.falseSkip} | ${r.falseKeep} | ${r.editOk}/${r.edits} | ${r.missedDrift} | ${r.builderAvoided} | ${r.selectorCalls} | $${r.cost.toFixed(4)} |`),
];
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "triage-holdout.md"), `${lines.join("\n")}\n`);
fs.writeFileSync(path.join(out, "triage-holdout.json"), `${JSON.stringify({ rows, detail }, null, 1)}\n`);
console.log(`\n${lines.join("\n")}`);
