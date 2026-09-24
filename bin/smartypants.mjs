#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FLAVOR_IDS } from "../src/flavors/ids.js";
import { installProject, resetGraph } from "../src/install.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [command, ...args] = process.argv.slice(2);

if (command === "init") {
  const flavor = flag(args, "flavor") || "claude";
  const seed = args.includes("--seed");
  if (!FLAVOR_IDS.includes(flavor)) {
    console.error(`smartypants: flavor must be one of ${FLAVOR_IDS.join(", ")}`);
    process.exit(1);
  }
  const result = installProject(process.cwd(), { flavor, seed });
  for (const file of result.wrote) console.log(`wrote ${file}`);
  for (const file of result.skipped) console.log(`kept ${file}`);
  console.log(`hook ${result.command}`);
  process.exit(0);
}

if (command === "reset") {
  const result = resetGraph(process.cwd());
  if (result.removed.length === 0) console.log("graph already empty");
  else {
    for (const file of result.removed) console.log(`removed ${path.relative(process.cwd(), file)}`);
  }
  console.log("config kept");
  process.exit(0);
}

if (command === "serve" || command == null) {
  const child = spawn(process.execPath, [path.join(packageRoot, "bin", "smartypants-serve.mjs")], {
    stdio: "inherit",
  });
  child.on("exit", (code) => process.exit(code ?? 0));
} else if (command === "hook") {
  const child = spawn(process.execPath, [path.join(packageRoot, "bin", "smartypants-hook.mjs")], {
    stdio: "inherit",
  });
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  console.log(`smartypants init [--flavor claude|codex|grok|muse|pi] [--seed]
smartypants reset
smartypants serve
smartypants hook`);
  process.exit(command === "help" || command === "--help" ? 0 : 1);
}

function flag(list, name) {
  const index = list.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return list[index + 1];
}
