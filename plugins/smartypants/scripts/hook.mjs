#!/usr/bin/env node
/**
 * Plugin hook: hand the host event to the project's installed Smartypants.
 * A silent no-op when the project has no smartypants.config.json, has not
 * installed the package, or already wires the hook in its own settings (so an
 * event never runs twice). Always exits 0 and never blocks the turn.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.env.SMARTPANTS_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = Buffer.concat(chunks);

function projectWiresHook() {
  for (const file of [".claude/settings.json", ".claude/settings.local.json"]) {
    try {
      if (fs.readFileSync(path.join(root, file), "utf8").includes("smartypants-hook")) return true;
    } catch {
      /* missing settings file */
    }
  }
  return false;
}

function installedHook() {
  const candidates = [
    process.env.SMARTYPANTS_HOME && path.join(process.env.SMARTYPANTS_HOME, "bin", "smartypants-hook.mjs"),
    path.join(root, "node_modules", "@logan-robbins", "smartypants", "bin", "smartypants-hook.mjs"),
  ].filter(Boolean);
  return candidates.find((file) => fs.existsSync(file)) || null;
}

const hook = fs.existsSync(path.join(root, "smartypants.config.json")) && !projectWiresHook() ? installedHook() : null;
if (hook) {
  await new Promise((resolve) => {
    const child = spawn(process.execPath, [hook], { cwd: root, env: { ...process.env, SMARTPANTS_ROOT: root }, stdio: ["pipe", "ignore", "inherit"] });
    child.on("error", resolve);
    child.on("exit", resolve);
    child.stdin.end(input);
  });
}
process.exit(0);
