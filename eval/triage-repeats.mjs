#!/usr/bin/env node
/**
 * Repeated held-out triage for one decider, recording every answer's confidence:
 * run-to-run variance and whether low confidence predicts a wrong answer (the
 * basis for the Jev -> Muse Spark escalation floor).
 *
 *   node eval/triage-repeats.mjs <jev|meta|auto|heuristic> [reps] [--out results/<dir>]
 */
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { createChooser } = await import(pkg + "/src/jev.js");
const { triageTurn, triageEdit } = await import(pkg + "/src/triage.js");
const { emptyIntent } = await import(pkg + "/src/intent.js");
const holdout = JSON.parse(fs.readFileSync(pkg + "/examples/triage-holdout.json", "utf8"));
const ctx = (n) => { const design = JSON.parse(fs.readFileSync(`${pkg}/examples/${n}.design.json`)); const f = `${pkg}/examples/${n}.intent.json`; return { design, intent: fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : emptyIntent() }; };
const norm = (a) => (a === "design" ? "build" : a === "drift" ? "diverges" : a);
const decider = process.argv[2] || "jev"; const reps = Number(/^\d+$/.test(process.argv[3] || "") ? process.argv[3] : 3);
console.error = () => {};
const out = [];
for (let rep = 0; rep < reps; rep++) {
  const base = createChooser({ decider }, { env: { ...process.env, SMARTYPANTS_DECIDER: decider } });
  const tasks = holdout.turns.map(async (t, i) => {
    let seen = null; const chooser = { via: base.via, choose: async (s, q) => { const r = await base.choose(s, q); seen = Object.fromEntries(Object.entries(r.answers).map(([k, v]) => [k, [v.value, v.confidence]])); return r; } };
    const t0 = Date.now(); const d = await triageTurn({ text: t.text, ...ctx(t.context), chooser, auto: true });
    return { rep, kind: "turn", i, expect: t.expect, got: norm(d.action), answers: seen, ms: Date.now() - t0 };
  });
  const edits = holdout.edits.map(async (e, i) => {
    let seen = null; const chooser = { via: base.via, choose: async (s, q) => { const r = await base.choose(s, q); seen = Object.fromEntries(Object.entries(r.answers).map(([k, v]) => [k, [v.value, v.confidence]])); return r; } };
    const t0 = Date.now(); const d = await triageEdit({ event: { type: "edit", path: e.path, contents: e.contents, diff: null }, ...ctx(e.context), chooser });
    return { rep, kind: "edit", i, expect: e.expect, got: d.action === "skip" ? "conforms" : "diverges", answers: seen, ms: Date.now() - t0 };
  });
  out.push(...(await Promise.all(tasks)), ...(await Promise.all(edits)));
}
const oi = process.argv.indexOf("--out");
const dir = path.resolve(pkg, oi === -1 ? `results/${new Date().toISOString().slice(0, 10)}-jev` : process.argv[oi + 1]);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `repeats-${decider}.json`), JSON.stringify(out));
for (let rep = 0; rep < reps; rep++) { const r = out.filter((x) => x.rep === rep); const t = r.filter((x) => x.kind === "turn"), e = r.filter((x) => x.kind === "edit");
  console.log(`${decider} rep${rep}: turns ${t.filter((x) => x.got === x.expect).length}/${t.length} keep ${t.filter((x) => (x.got !== "skip") === (x.expect !== "skip")).length}/${t.length} edits ${e.filter((x) => x.got === x.expect).length}/${e.length} p50ms ${r.map((x) => x.ms).sort((a, b) => a - b)[r.length >> 1]}`); }
const ok = [], bad = []; for (const x of out) { const confs = Object.values(x.answers || {}).map((a) => a[1]); const m = confs.length ? Math.min(...confs) : null; (x.got === x.expect ? ok : bad).push(m); }
const q = (a, f) => a.filter((v) => v != null && v < f).length;
for (const f of [0.6, 0.7, 0.8, 0.9]) console.log(`min-conf < ${f}: correct ${q(ok, f)}/${ok.length}, wrong ${q(bad, f)}/${bad.length}`);
