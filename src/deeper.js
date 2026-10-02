/**
 * When to go deeper without being asked.
 *
 * A node earns expansion when the conversation keeps loading detail onto it:
 * intent atoms about it, turns that mention it together with internals, and
 * drift flags on it. A node that already has children (or notes, for a
 * module) is expanded and never auto-deepened again.
 */
import { slug } from "./taxonomy.js";

const ATOM_WEIGHT = { N: 1, D: 1, F: 1, X: 1, "!": 2, E: 0.5, Q: 0.5, G: 0 };

export function isExpanded(design, node) {
  if (node.kind === "module") return Boolean(node.notes?.length);
  return (design.nodes || []).some((child) => child.parentId === node.id);
}

export function pressure(design, intent, node, features = null) {
  let score = 0;
  const id = slug(node.id);
  for (const atom of intent?.atoms || []) {
    const head = atom.s.split(".")[0];
    if (head === id || head.split(">").includes(id)) score += ATOM_WEIGHT[atom.k] ?? 0;
  }
  score += 2 * (node.flags?.length || 0);
  if (features?.nodes?.includes(node.id) && (features.internals?.length || features.numbers?.length)) score += 2;
  return score;
}

/** The single node most in need of expansion, or null. One per turn keeps cost bounded. */
export function autoDeepenTarget(design, intent, features, threshold = 3) {
  if (!threshold) return null;
  let best = null;
  for (const node of design?.nodes || []) {
    if (node.kind === "system") continue;
    if (isExpanded(design, node)) continue;
    const score = pressure(design, intent, node, features);
    if (score >= threshold && (!best || score > best.score)) best = { id: node.id, score };
  }
  return best;
}

/** Floor a deepen call needs so the expansion is not filtered out. */
export function deeperFloor(node) {
  return node.kind === "system" ? "component" : "module";
}

const NEXT = { system: "component", component: "module", module: "module" };

/**
 * After a design turn in auto mode, lift the global level one step when most
 * boxes at the current level already carry detail.
 */
export function nextLevel(design) {
  const level = design.level || "component";
  const atLevel = (design.nodes || []).filter((node) => node.kind === level);
  if (!atLevel.length || level === "module") return level;
  const expanded = atLevel.filter((node) => isExpanded(design, node)).length;
  return expanded / atLevel.length >= 0.6 ? NEXT[level] : level;
}
