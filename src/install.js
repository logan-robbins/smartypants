import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FLAVOR_IDS } from "./flavors/ids.js";
import { ledgerPath } from "./ledger.js";
import { designPath } from "./model.js";

const PACKAGE_NAME = "@logan-robbins/smartypants";

export function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function hookCommand() {
  return `node ${shellQuote(path.join(packageRoot(), "bin", "smartypants-hook.mjs"))}`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

const HOSTS = [
  { id: "claude", file: ".claude/settings.json", matcher: "Write|Edit|MultiEdit" },
  { id: "codex", file: ".codex/hooks.json", matcher: "Write|Edit|MultiEdit|apply_patch" },
  { id: "grok", file: ".grok/hooks/smartypants.json", matcher: "Write|Edit|MultiEdit|search_replace" },
  { id: "muse", file: ".muse/hooks.json", matcher: "Write|Edit|MultiEdit" },
];

function readJson(file) {
  if (!fs.existsSync(file)) return { doc: {}, existed: false, broken: false };
  try {
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { doc: null, existed: true, broken: true };
    return { doc, existed: true, broken: false };
  } catch {
    return { doc: null, existed: true, broken: true };
  }
}

function hasSmartypantsHook(doc) {
  return JSON.stringify(doc?.hooks || {}).includes("smartypants-hook");
}

function addHook(doc, event, command, matcher) {
  doc.hooks ||= {};
  doc.hooks[event] ||= [];
  if (event === "PostToolUse") {
    doc.hooks[event].push({
      matcher,
      hooks: [{ type: "command", command, timeout: 20 }],
    });
    return;
  }
  doc.hooks[event].push({
    hooks: [{ type: "command", command, timeout: 20 }],
  });
}

function writeJson(file, doc) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
}

function starterConfig({ flavor, seed }) {
  return {
    flavor,
    depth: "module",
    seed: Boolean(seed),
    model: null,
    reasoningEffort: null,
  };
}

/**
 * Wire a project to the installed package.
 * Leaves an existing config and any unrelated hooks in place.
 */
export function installProject(root, options = {}) {
  const flavor = options.flavor || "claude";
  if (!FLAVOR_IDS.includes(flavor)) {
    throw new Error(`smartypants: unknown flavor ${flavor}`);
  }
  const command = hookCommand();
  const wrote = [];
  const skipped = [];
  const configFile = path.join(root, "smartypants.config.json");
  if (fs.existsSync(configFile)) skipped.push("smartypants.config.json");
  else {
    writeJson(configFile, starterConfig({ flavor, seed: options.seed }));
    wrote.push("smartypants.config.json");
  }

  for (const host of HOSTS) {
    const file = path.join(root, host.file);
    const current = readJson(file);
    if (current.broken) {
      skipped.push(`${host.file} (invalid JSON left untouched)`);
      continue;
    }
    if (hasSmartypantsHook(current.doc)) {
      skipped.push(host.file);
      continue;
    }
    addHook(current.doc, "UserPromptSubmit", command, host.matcher);
    addHook(current.doc, "PostToolUse", command, host.matcher);
    writeJson(file, current.doc);
    wrote.push(host.file);
  }

  const piFile = path.join(root, ".pi", "extensions", "smartypants", "index.js");
  const piSource = `import smartypants from ${JSON.stringify(`${PACKAGE_NAME}/pi`)};\n\nexport default smartypants;\n`;
  if (fs.existsSync(piFile) && fs.readFileSync(piFile, "utf8") === piSource) skipped.push(".pi/extensions/smartypants/index.js");
  else {
    fs.mkdirSync(path.dirname(piFile), { recursive: true });
    fs.writeFileSync(piFile, piSource);
    wrote.push(".pi/extensions/smartypants/index.js");
  }

  return { command, wrote, skipped };
}

/** Drop the diagram and its gist ledger. The project config stays. */
export function resetGraph(root) {
  const removed = [];
  for (const file of [designPath(root), ledgerPath(root)]) {
    if (!fs.existsSync(file)) continue;
    fs.rmSync(file);
    removed.push(file);
  }
  return { removed };
}
