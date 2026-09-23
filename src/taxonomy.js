/**
 * Depth ladder for a smartypants diagram.
 *
 * system — the whole application a person would name when asked what is being built.
 * component — a major part of that system that owns one job other parts can depend on
 *   without its internals. A component is not a file or a function.
 * module — a cohesive slice inside exactly one component that does one part of that
 *   component's job. A module stays above individual types and functions.
 *
 * Floors:
 *   system    — the system only
 *   component — the system and its components
 *   module    — system, then component, then module (the default)
 *
 * A file, class, function, or endpoint is not a node at any of these floors.
 */

export const SYSTEM_DEFINITION =
  "System: the whole application a person would name when asked what is being built.";

export const COMPONENT_DEFINITION =
  "Component: a major part of that system that owns one job other parts can depend on without its internals (not a file or function).";

export const MODULE_DEFINITION =
  "Module: a cohesive slice inside exactly one component that does one part of that component's job, still above individual types and functions.";

export const TAXONOMY = [SYSTEM_DEFINITION, COMPONENT_DEFINITION, MODULE_DEFINITION].join("\n");

export const FLOORS = ["system", "component", "module"];

export const DEFAULT_FLOOR = "module";

export const FINE_GRAINS = ["file", "class", "function", "endpoint", "type"];

const RANK = { system: 1, component: 2, module: 3 };

const FILE_NAME =
  /(?:^|\/)[^/]+\.(?:tsx?|jsx?|mjs|cjs|py|go|rs|java|kt|kts|rb|php|cs|vue|svelte|css|scss|html|json|ya?ml|toml|md|sql|sh)$/i;

export function floorRank(floor) {
  return RANK[floor] || 0;
}

export function normalizeFloor(value) {
  if (value == null || value === "") return DEFAULT_FLOOR;
  return FLOORS.includes(value) ? value : null;
}

function explicitGrain(node) {
  const raw = node.grain ?? node.represents ?? node.unit;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  return raw.trim().toLowerCase();
}

function grainFromName(name) {
  const text = String(name || "").trim();
  if (!text) return null;
  if (FILE_NAME.test(text)) return "file";
  if (/^(?:function|fn|def)\s+\S+/i.test(text) || /^[A-Za-z_][\w]*\s*\([^)]*\)\s*$/.test(text)) {
    return "function";
  }
  if (/^class\s+\S+/i.test(text)) return "class";
  if (/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\//i.test(text)) return "endpoint";
  return null;
}

export function grainOf(node) {
  if (!node || typeof node !== "object") return "type";
  const declared = explicitGrain(node);
  if (declared && (FINE_GRAINS.includes(declared) || RANK[declared])) return declared;
  const kind = String(node.kind || "").trim().toLowerCase();
  if (FINE_GRAINS.includes(kind)) return kind;
  const fromName = grainFromName(node.name);
  if (fromName) return fromName;
  if (RANK[kind]) return kind;
  return kind || "type";
}

export function hasDistinctWhatWhy(node) {
  const what = typeof node?.what === "string" ? node.what.trim() : "";
  const why = typeof node?.why === "string" ? node.why.trim() : "";
  if (!what || !why) return false;
  return what.toLowerCase() !== why.toLowerCase();
}

/**
 * True when this node is allowed at `floor`.
 * Fine grains are refused even when the caller labeled them as a module.
 */
export function isStorableNode(node, floor = DEFAULT_FLOOR) {
  if (!node || typeof node !== "object") return false;
  const kind = String(node.kind || "").trim().toLowerCase();
  if (!RANK[kind]) return false;
  const grain = grainOf(node);
  if (FINE_GRAINS.includes(grain)) return false;
  if (RANK[grain] && grain !== kind) return false;
  const active = RANK[floor] ? floor : DEFAULT_FLOOR;
  return RANK[kind] <= RANK[active];
}

export function slug(name) {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "node";
}
