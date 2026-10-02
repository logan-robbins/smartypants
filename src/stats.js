/**
 * Per-project efficiency counters: how many turns were skipped for free,
 * how many needed only the selector, and what the builder cost.
 */
import fs from "node:fs";
import path from "node:path";
import { DESIGN_DIR } from "./model.js";

export const STATS_FILE = "stats.json";
const RECENT = 40;

export function statsPath(root) {
  return path.join(root, DESIGN_DIR, STATS_FILE);
}

export function emptyStats() {
  return { version: 1, turns: 0, actions: {}, reasons: {}, calls: { selector: 0, builder: 0 }, tokens: { input: 0, output: 0, reasoning: 0 }, cost: 0, selectorCost: 0, builderCost: 0, recent: [] };
}

export function loadStats(root) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statsPath(root), "utf8"));
    return parsed?.version === 1 ? { ...emptyStats(), ...parsed } : emptyStats();
  } catch {
    return emptyStats();
  }
}

/** entry: { kind, action, reason, via, selector: [usage], builder: usage|null, gained: n, ms } */
export function recordTurn(root, entry) {
  const stats = loadStats(root);
  stats.turns += 1;
  stats.actions[entry.action] = (stats.actions[entry.action] || 0) + 1;
  const reasonKey = `${entry.action}:${entry.reason}`;
  stats.reasons[reasonKey] = (stats.reasons[reasonKey] || 0) + 1;
  for (const usage of [...(entry.selector || []), ...(entry.builder ? [entry.builder] : [])]) {
    stats.tokens.input += usage.inputTokens || 0;
    stats.tokens.output += usage.outputTokens || 0;
    stats.tokens.reasoning += usage.reasoningTokens || 0;
    stats.cost += usage.cost || 0;
  }
  for (const usage of entry.selector || []) stats.selectorCost += usage.cost || 0;
  if (entry.builder) stats.builderCost += entry.builder.cost || 0;
  stats.calls.selector += (entry.selector || []).length;
  stats.calls.builder += entry.builder ? 1 : 0;
  stats.recent = [...stats.recent, {
    at: new Date().toISOString(),
    kind: entry.kind,
    action: entry.action,
    reason: entry.reason,
    via: entry.via,
    gained: entry.gained || 0,
    ms: entry.ms || 0,
    ...(entry.target ? { target: entry.target } : {}),
  }].slice(-RECENT);
  try {
    fs.mkdirSync(path.dirname(statsPath(root)), { recursive: true });
    fs.writeFileSync(statsPath(root), `${JSON.stringify(stats, null, 1)}\n`);
  } catch {
    /* Stats never block a hook. */
  }
  return stats;
}
