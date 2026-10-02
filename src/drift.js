import { carryDesignMeta, emptyDesign } from "./model.js";
import { slug } from "./taxonomy.js";

function cloneFlag(flag) {
  return {
    intent: flag.intent,
    difference: flag.difference,
    ...(flag.nodeId ? { nodeId: flag.nodeId } : {}),
  };
}

function cloneNode(node) {
  return {
    ...node,
    parentId: node.parentId ?? null,
    flags: (node.flags || []).map(cloneFlag),
  };
}

function flagIdentity(target, intent, difference) {
  return `${target || "unmapped"}\n${intent.trim().toLowerCase()}\n${difference.trim().toLowerCase()}`;
}

function words(text) {
  return new Set(String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 2));
}

function similar(a, b) {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return false;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared += 1;
  return shared / (x.size + y.size - shared) >= 0.4;
}

/** The same divergence reworded is not a new flag: same intent and a similar difference. */
function sameFlag(a, b) {
  return similar(a.intent, b.intent) && similar(a.difference, b.difference);
}

function findNode(nodes, nodeId) {
  if (nodeId == null || nodeId === "") return null;
  const want = String(nodeId);
  const wantSlug = slug(want);
  return (
    nodes.find((node) => node.id === want || node.name === want || slug(node.name) === wantSlug) || null
  );
}

function collectIncoming(result) {
  if (!result || typeof result !== "object") return [];
  if (result.diverges === false || result.matches === true || result.verdict === "match") return [];
  if (Array.isArray(result.flags) && result.flags.length > 0) return result.flags;
  if (result.diverges === true || result.unmapped === true) return [result];
  return [];
}

function readFlag(raw) {
  const intent = typeof raw?.intent === "string" ? raw.intent.trim() : "";
  const difference = typeof raw?.difference === "string" ? raw.difference.trim() : "";
  if (!intent || !difference) return null;
  const nodeId = raw.nodeId == null || raw.nodeId === "" ? null : String(raw.nodeId);
  return { nodeId, intent, difference };
}

/**
 * Record intent drift from a builder result.
 * A match adds nothing. The same divergence does not stack a second flag.
 * A divergence that names no stored node is kept on the design as unmapped.
 */
export function applyDrift(design, result) {
  const current = design && Array.isArray(design.nodes) ? design : emptyDesign();
  const incoming = collectIncoming(result).map(readFlag).filter(Boolean);
  if (incoming.length === 0) return { design: current, changed: false };

  const nodes = current.nodes.map(cloneNode);
  const unmappedFlags = (current.unmappedFlags || []).map(cloneFlag);
  let changed = false;

  for (const flag of incoming) {
    const node = findNode(nodes, flag.nodeId);
    if (node) {
      const key = flagIdentity(node.id, flag.intent, flag.difference);
      const already = (node.flags || []).some(
        (existing) => flagIdentity(node.id, existing.intent, existing.difference) === key || sameFlag(existing, flag),
      );
      if (already) continue;
      node.flags = [...(node.flags || []), { intent: flag.intent, difference: flag.difference }];
      changed = true;
      continue;
    }
    const key = flagIdentity(flag.nodeId, flag.intent, flag.difference);
    const already = unmappedFlags.some(
      (existing) => flagIdentity(existing.nodeId || flag.nodeId, existing.intent, existing.difference) === key,
    );
    if (already) continue;
    unmappedFlags.push({
      intent: flag.intent,
      difference: flag.difference,
      ...(flag.nodeId ? { nodeId: flag.nodeId } : {}),
    });
    changed = true;
  }

  if (!changed) return { design: current, changed: false };
  return {
    design: carryDesignMeta(current, {
      version: 1,
      floor: current.floor,
      updatedAt: new Date().toISOString(),
      nodes,
      connections: (current.connections || []).map((connection) => ({ ...connection })),
      unmappedFlags,
    }),
    changed: true,
  };
}
