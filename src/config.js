import fs from "node:fs";
import path from "node:path";
import { FLAVOR_IDS } from "./flavors/ids.js";
import { FLOORS, normalizeFloor } from "./taxonomy.js";

export const CONFIG_FILENAME = "smartypants.config.json";

const TIMEOUT_CAP_MS = 20000;
const REASONING_EFFORTS = ["none", "low", "medium", "high", "xhigh", "max"];

function readTimeout(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.floor(n), TIMEOUT_CAP_MS);
}

export function configPath(root) {
  return path.join(root, CONFIG_FILENAME);
}

/**
 * The root smartypants.config.json is the only on-switch.
 * A missing file, broken JSON, unknown flavor, or unknown depth stays off.
 * An omitted depth uses the module floor. An invalid flavor does not fall through.
 */
export function readConfig(root) {
  const file = configPath(root);
  if (!fs.existsSync(file)) return { present: false, config: null, reason: "missing" };
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { present: true, config: null, reason: "invalid-json" };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { present: true, config: null, reason: "invalid-json" };
  }
  if (typeof raw.flavor !== "string" || !FLAVOR_IDS.includes(raw.flavor)) {
    return { present: true, config: null, reason: "invalid-flavor" };
  }
  if (raw.depth != null && raw.depth !== "" && !FLOORS.includes(raw.depth)) {
    return { present: true, config: null, reason: "invalid-depth" };
  }
  const seed = readSeed(raw.seed);
  if (seed == null) return { present: true, config: null, reason: "invalid-seed" };
  if (raw.reasoningEffort != null && !REASONING_EFFORTS.includes(raw.reasoningEffort)) {
    return { present: true, config: null, reason: "invalid-reasoning-effort" };
  }
  if (raw.envFile != null && (typeof raw.envFile !== "string" || !raw.envFile.trim())) {
    return { present: true, config: null, reason: "invalid-env-file" };
  }
  if (raw.watch != null && (
    !raw.watch || typeof raw.watch !== "object" || Array.isArray(raw.watch) ||
    !["claude", "codex"].includes(raw.watch.host) ||
    (raw.watch.home == null) === (raw.watch.session == null) ||
    (raw.watch.home != null && (typeof raw.watch.home !== "string" || !path.isAbsolute(raw.watch.home))) ||
    (raw.watch.session != null && (typeof raw.watch.session !== "string" || !path.isAbsolute(raw.watch.session)))
  )) return { present: true, config: null, reason: "invalid-watch" };
  return {
    present: true,
    reason: null,
    config: {
      flavor: raw.flavor,
      depth: normalizeFloor(raw.depth),
      seed,
      model: typeof raw.model === "string" && raw.model.trim() ? raw.model.trim() : null,
      reasoningEffort: raw.reasoningEffort ?? null,
      envFile: raw.envFile?.trim() || null,
      watch: raw.watch ? { host: raw.watch.host, ...(raw.watch.home ? { home: path.resolve(raw.watch.home) } : { session: path.resolve(raw.watch.session) }) } : null,
      timeoutMs: readTimeout(raw.timeoutMs),
      path: file,
    },
  };
}

function readSeed(value) {
  if (value == null || value === "") return false;
  if (value === true || value === false) return value;
  return null;
}

export function lookupConfig(root) {
  return readConfig(root).config;
}
