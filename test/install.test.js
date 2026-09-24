import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { hookCommand, installProject, resetGraph } from "../src/install.js";
import { emptyDesign, saveDesign } from "../src/model.js";
import { emptyLedger, saveLedger } from "../src/ledger.js";
import { tempProject } from "./helpers.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("init writes a config and host hooks that call the installed hook", () => {
  const root = tempProject();
  fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".claude/settings.json"),
    `${JSON.stringify({
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo keep-me" }] }],
      },
    })}\n`,
  );
  const first = installProject(root, { flavor: "grok", seed: true });
  assert.equal(first.wrote.includes("smartypants.config.json"), true);
  const config = JSON.parse(fs.readFileSync(path.join(root, "smartypants.config.json"), "utf8"));
  assert.equal(config.flavor, "grok");
  assert.equal(config.seed, true);
  assert.equal(config.depth, "module");

  const claude = JSON.parse(fs.readFileSync(path.join(root, ".claude/settings.json"), "utf8"));
  assert.equal(claude.hooks.PreToolUse[0].hooks[0].command, "echo keep-me");
  assert.equal(claude.hooks.UserPromptSubmit[0].hooks[0].command, hookCommand());
  assert.equal(claude.hooks.PostToolUse[0].matcher.includes("Write"), true);
  assert.equal(fs.existsSync(hookCommand().slice(6, -1).replaceAll("'\\''", "'")), true);

  const pi = fs.readFileSync(path.join(root, ".pi/extensions/smartypants/index.js"), "utf8");
  assert.equal(pi.includes('from "@logan-robbins/smartypants/pi"'), true);

  const second = installProject(root, { flavor: "claude" });
  assert.equal(second.wrote.includes("smartypants.config.json"), false);
  assert.equal(second.skipped.includes("smartypants.config.json"), true);
  const still = JSON.parse(fs.readFileSync(path.join(root, "smartypants.config.json"), "utf8"));
  assert.equal(still.flavor, "grok");
  const again = JSON.parse(fs.readFileSync(path.join(root, ".claude/settings.json"), "utf8"));
  assert.equal(again.hooks.UserPromptSubmit.length, 1);
});

test("reset clears the diagram and the ledger and keeps the config", () => {
  const root = tempProject({ flavor: "claude", depth: "module" });
  saveDesign(root, emptyDesign());
  saveLedger(root, emptyLedger());
  const result = resetGraph(root);
  assert.equal(result.removed.length, 2);
  assert.equal(fs.existsSync(path.join(root, ".smartypants", "design.json")), false);
  assert.equal(fs.existsSync(path.join(root, ".smartypants", "ledger.json")), false);
  assert.equal(fs.existsSync(path.join(root, "smartypants.config.json")), true);

  const proc = spawnSync(process.execPath, [path.join(packageRoot, "bin/smartypants.mjs"), "reset"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(proc.status, 0);
  assert.equal(proc.stdout.includes("graph already empty"), true);
  assert.equal(proc.stdout.includes("config kept"), true);
});

test("the smartypants command initializes a project", () => {
  const root = tempProject();
  const proc = spawnSync(process.execPath, [path.join(packageRoot, "bin/smartypants.mjs"), "init", "--flavor", "muse"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(proc.status, 0);
  assert.equal(proc.stdout.includes("wrote smartypants.config.json"), true);
  assert.equal(proc.stdout.includes("smartypants-hook.mjs"), true);
  const muse = JSON.parse(fs.readFileSync(path.join(root, ".muse/hooks.json"), "utf8"));
  assert.equal(muse.hooks.UserPromptSubmit[0].hooks[0].command.includes("smartypants-hook.mjs"), true);
});

test("the published package ships the command, the canvas, and not the tests", () => {
  const proc = spawnSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: packageRoot,
    encoding: "utf8",
  });
  assert.equal(proc.status, 0);
  const packed = JSON.parse(proc.stdout);
  const names = packed[0].files.map((file) => file.path);
  assert.equal(names.includes("bin/smartypants.mjs"), true);
  assert.equal(names.includes("bin/smartypants-hook.mjs"), true);
  assert.equal(names.includes("web/index.html"), true);
  assert.equal(names.includes("src/install.js"), true);
  assert.equal(names.includes("smartypants.config.example.json"), true);
  assert.equal(names.some((name) => name.startsWith("test/")), false);
});
