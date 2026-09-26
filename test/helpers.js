import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function tempProject(config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "smartypants-"));
  if (config) {
    fs.writeFileSync(path.join(root, "smartypants.config.json"), `${JSON.stringify(config, null, 2)}\n`);
  }
  return root;
}

export function designFile(root) {
  return path.join(root, ".smartypants", "design.json");
}

export function readBytes(file) {
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

// Tests never call a provider: the selector falls back to local heuristics.
process.env.SMARTYPANTS_DECIDER ??= "heuristic";
// A live Meta key in the environment must not turn tests into paid calls.
process.env.META_BASE_URL ??= "http://127.0.0.1:9";
