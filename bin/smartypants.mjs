#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupConfig } from "../src/config.js";
import { FLAVOR_IDS } from "../src/flavors/ids.js";
import { installProject, resetGraph } from "../src/install.js";
import { loadIntent, renderIntent, intentTokens } from "../src/intent.js";
import { toMermaid } from "../src/mermaid.js";
import { canvasModel, loadDesign, saveDesign } from "../src/model.js";
import { handleHook } from "../src/pipeline.js";
import { enqueue, spawnWorker } from "../src/queue.js";
import { loadStats } from "../src/stats.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [command, ...args] = process.argv.slice(2);
const root = process.env.SMARTPANTS_ROOT || process.cwd();

function flag(list, name) {
  const index = list.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return list[index + 1];
}

function runBin(name, extra = []) {
  const child = spawn(process.execPath, [path.join(packageRoot, "bin", name), ...extra], { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
}

const COMMANDS = {
  init() {
    const flavor = flag(args, "flavor") || "claude";
    const seed = args.includes("--seed");
    if (!FLAVOR_IDS.includes(flavor)) {
      console.error(`smartypants: flavor must be one of ${FLAVOR_IDS.join(", ")}`);
      process.exit(1);
    }
    const result = installProject(root, { flavor, seed: seed || undefined });
    for (const file of result.wrote) console.log(`wrote ${file}`);
    for (const file of result.skipped) console.log(`kept ${file}`);
    console.log(`hook ${result.command}`);
    if (flavor === "claude") {
      console.log("model: Claude, through this machine's Claude Code (the same sign-in: ANTHROPIC_API_KEY, Bedrock/Vertex/Foundry, or `claude` login).");
      console.log("       Set \"model\" in smartypants.config.json to pin one; otherwise Claude Code's default is used.");
    }
    if (flavor === "claude") {
      console.log("decisions: Claude Sonnet 5.5 at high effort answers the per-turn questions (deciderModel, deciderEffort).");
      console.log("           Alternative: Typesafe Jev. Create a key at https://console.typesafe.ai/keys, export TYPESAFE_API_KEY,");
      console.log('           and set "decider": "jev" (~0.2 s per decision; Claude answers if Jev is unreachable).');
    }
    if (flavor === "meta") {
      console.log("data: design turns, changed files, and (on catch-up) key source files go to api.meta.ai.");
      console.log("      The default model muse-spark-1.3-contributor is discounted because Meta may train on that traffic;");
      console.log('      set "model": "muse-spark-1.3" in smartypants.config.json to opt out. Nothing is sent from projects without the config.');
    }
    if (result.existing && !args.includes("--no-catchup") && result.wrote.includes("smartypants.config.json")) {
      enqueue(root, { type: "catchup" });
      spawnWorker(root);
      console.log("existing code found: catching up from the code in the background (npx smartypants serve to watch)");
    }
    process.exit(0);
  },
  reset() {
    const result = resetGraph(root);
    if (result.removed.length === 0) console.log("graph already empty");
    else for (const file of result.removed) console.log(`removed ${path.relative(root, file)}`);
    console.log("config kept");
    process.exit(0);
  },
  async catchup() {
    if (args.includes("--foreground")) {
      const result = await handleHook({ cwd: root, event: { type: "catchup" }, timeoutMs: 300000 });
      console.log(result.inert ? "smartypants is off here (no smartypants.config.json)" : result.error ? `catch-up failed: ${result.error}` : result.catchup?.message || "caught up");
      process.exit(0);
    }
    enqueue(root, { type: "catchup" });
    spawnWorker(root);
    console.log("catching up from the code in the background; progress shows on the canvas and in .smartypants/catchup.json");
    process.exit(0);
  },
  async review() {
    const result = await handleHook({ cwd: root, event: { type: "turn-end" }, timeoutMs: 120000 });
    if (result.inert) console.log("nothing to review");
    else console.log(JSON.stringify(result.review || {}, null, 2));
    process.exit(0);
  },
  async deeper() {
    const target = args.join(" ").trim();
    if (!target) {
      console.error("usage: smartypants deeper <part of the diagram>");
      process.exit(1);
    }
    const result = await handleHook({ cwd: root, event: { type: "deeper", target }, timeoutMs: 120000 });
    if (result.inert) console.log("smartypants is off here (no smartypants.config.json)");
    else if (result.error) console.log(`could not go deeper: ${result.error}`);
    else {
      console.log(result.designChanged ? `went deeper on ${result.triage?.target || target}` : "nothing new to add");
      if (result.codeFiles?.length) console.log(`read the code: ${result.codeFiles.length} matching files, starting at ${result.codeFiles[0]}`);
      if (result.corrections?.length) {
        console.log("the diagram disagreed with the code; corrected:");
        for (const line of result.corrections) console.log(`  - ${line}`);
      } else if (result.codeFiles?.length) console.log("the diagram matched the code");
    }
    process.exit(0);
  },
  mermaid() {
    const config = lookupConfig(root);
    process.stdout.write(toMermaid(canvasModel(loadDesign(root), config?.depth)));
    process.exit(0);
  },
  intent() {
    const intent = loadIntent(root);
    console.log(renderIntent(intent) || "(no intent recorded)");
    console.error(`${intent.atoms.length} atoms, ~${intentTokens(intent)} tokens`);
    process.exit(0);
  },
  drift() {
    const design = loadDesign(root);
    const flags = [
      ...design.nodes.flatMap((node) => (node.flags || []).map((flag) => ({ ...flag, node: node.name }))),
      ...(design.unmappedFlags || []).map((flag) => ({ ...flag, node: "(unmapped)" })),
    ];
    if (!flags.length) console.log("no drift recorded");
    for (const flag of flags) console.log(`${flag.node}\n  intent: ${flag.intent}\n  code:   ${flag.difference}`);
    process.exit(0);
  },
  stats() {
    const stats = loadStats(root);
    const skipped = stats.actions.skip || 0;
    const local = stats.actions.remember || 0;
    console.log(`${stats.turns} turns: ${skipped} skipped, ${local} remembered without a builder, ${stats.calls.builder} builder calls, ${stats.calls.selector} selector calls`);
    console.log(`tokens in ${stats.tokens.input} out ${stats.tokens.output} (reasoning ${stats.tokens.reasoning}); cost $${stats.cost.toFixed(5)}`);
    process.exit(0);
  },
  demo() {
    const name = args[0];
    const dir = path.join(packageRoot, "examples");
    const available = fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith(".design.json")).map((file) => file.replace(".design.json", "")) : [];
    if (!name || !available.includes(name)) {
      console.log(`smartypants demo <${available.join("|")}>`);
      process.exit(name ? 1 : 0);
    }
    const design = JSON.parse(fs.readFileSync(path.join(dir, `${name}.design.json`), "utf8"));
    saveDesign(root, design);
    console.log(`loaded ${name} into .smartypants/design.json; run smartypants serve`);
    process.exit(0);
  },
  serve: () => runBin("smartypants-serve.mjs", args),
  hook: () => runBin("smartypants-hook.mjs"),
  worker: () => runBin("smartypants-worker.mjs"),
};

const run = COMMANDS[command ?? "serve"];
if (run) await run();
else {
  console.log(`smartypants init [--flavor ${FLAVOR_IDS.join("|")}] [--seed] [--no-catchup]
smartypants serve [--port N]      open the canvas (next free port if 4173 is taken)
smartypants catchup [--foreground] build the diagram from the existing code (background)
smartypants review                review what changed in the working tree now
smartypants deeper <part>         go one level deeper on a part of the diagram
smartypants mermaid               print the diagram as Mermaid
smartypants intent                print the compact IntentCode memory
smartypants drift                 list where the code left the intent
smartypants stats                 turns skipped, calls made, tokens, cost
smartypants demo <example>        load an interview example
smartypants reset                 clear the diagram and memory
smartypants hook                  run the host hook on stdin`);
  process.exit(command === "help" || command === "--help" ? 0 : 1);
}
