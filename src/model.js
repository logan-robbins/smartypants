import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_FLOOR,
  FLOORS,
  floorRank,
  hasDistinctWhatWhy,
  isStorableNode,
  slug,
} from "./taxonomy.js";

export const DESIGN_DIR = ".smartypants";
export const DESIGN_FILE = "design.json";

export function designPath(root) {
  return path.join(root, DESIGN_DIR, DESIGN_FILE);
}

export function emptyDesign(floor = DEFAULT_FLOOR) {
  return {
    version: 1,
    floor: FLOORS.includes(floor) ? floor : DEFAULT_FLOOR,
    nodes: [],
    connections: [],
    unmappedFlags: [],
  };
}

export function loadDesign(root) {
  const file = designPath(root);
  if (!fs.existsSync(file)) return emptyDesign();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.nodes)) return emptyDesign();
    return {
      version: 1,
      floor: FLOORS.includes(parsed.floor) ? parsed.floor : DEFAULT_FLOOR,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
      ...(parsed.seeded === true ? { seeded: true } : {}),
      ...(typeof parsed.seededAt === "string" ? { seededAt: parsed.seededAt } : {}),
      nodes: parsed.nodes.map(cloneNode),
      connections: Array.isArray(parsed.connections) ? parsed.connections.map(cloneConnection) : [],
      unmappedFlags: Array.isArray(parsed.unmappedFlags) ? parsed.unmappedFlags.map(cloneFlag) : [],
    };
  } catch {
    return emptyDesign();
  }
}

export function saveDesign(root, design) {
  const file = designPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = `${JSON.stringify(orderDesign(design), null, 2)}\n`;
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, body);
  fs.renameSync(temp, file);
}

function orderDesign(design) {
  const ordered = {
    version: 1,
    floor: design.floor || DEFAULT_FLOOR,
    nodes: (design.nodes || []).map(orderNode),
    connections: (design.connections || []).map(orderConnection),
    unmappedFlags: (design.unmappedFlags || []).map(orderFlag),
  };
  if (design.updatedAt) ordered.updatedAt = design.updatedAt;
  return {
    version: ordered.version,
    floor: ordered.floor,
    ...(ordered.updatedAt ? { updatedAt: ordered.updatedAt } : {}),
    ...(design.seeded === true ? { seeded: true } : {}),
    ...(typeof design.seededAt === "string" ? { seededAt: design.seededAt } : {}),
    nodes: ordered.nodes,
    connections: ordered.connections,
    unmappedFlags: ordered.unmappedFlags,
  };
}

export function carryDesignMeta(current, next) {
  if (current?.seeded === true) next.seeded = true;
  if (typeof current?.seededAt === "string") next.seededAt = current.seededAt;
  return next;
}

export function markSeeded(design, at = new Date().toISOString()) {
  const current = design && Array.isArray(design.nodes) ? design : emptyDesign();
  if (current.seeded === true) return { design: current, changed: false };
  return {
    design: { ...current, seeded: true, seededAt: at },
    changed: true,
  };
}

function positionOf(node) {
  const x = Number(node?.x);
  const y = Number(node?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function orderNode(node) {
  const position = positionOf(node);
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    parentId: node.parentId ?? null,
    what: node.what,
    why: node.why,
    ...(position || {}),
    flags: (node.flags || []).map(orderFlag),
  };
}

function orderFlag(flag) {
  return {
    intent: flag.intent,
    difference: flag.difference,
    ...(flag.nodeId ? { nodeId: flag.nodeId } : {}),
  };
}

function orderConnection(connection) {
  return {
    id: connection.id,
    fromId: connection.fromId,
    toId: connection.toId,
    kind: connection.kind,
    label: connection.label,
  };
}

function cloneConnection(connection) {
  if (!connection || typeof connection !== "object") return { id: "", fromId: "", toId: "", kind: "data", label: "" };
  return {
    id: String(connection.id || ""),
    fromId: String(connection.fromId || ""),
    toId: String(connection.toId || ""),
    kind: String(connection.kind || "data"),
    label: String(connection.label || ""),
  };
}

function cloneFlag(flag) {
  if (!flag || typeof flag !== "object") return { intent: "", difference: "" };
  return {
    intent: String(flag.intent || ""),
    difference: String(flag.difference || ""),
    ...(flag.nodeId ? { nodeId: String(flag.nodeId) } : {}),
  };
}

function cloneNode(node) {
  const position = positionOf(node);
  return {
    id: String(node.id || ""),
    name: String(node.name || ""),
    kind: String(node.kind || ""),
    parentId: node.parentId ? String(node.parentId) : null,
    what: String(node.what || ""),
    why: String(node.why || ""),
    ...(position || {}),
    flags: Array.isArray(node.flags) ? node.flags.map(cloneFlag) : [],
  };
}

/** Keep a card where the person dragged it. Other cards stay put. */
export function placeNode(design, id, x, y) {
  const current = design && Array.isArray(design.nodes) ? design : emptyDesign();
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { design: current, changed: false };
  const nodes = current.nodes.map(cloneNode);
  const node = nodes.find((item) => item.id === id);
  if (!node) return { design: current, changed: false };
  if (node.x === x && node.y === y) return { design: current, changed: false };
  node.x = x;
  node.y = y;
  return {
    design: carryDesignMeta(current, {
      version: 1,
      floor: current.floor,
      ...(current.updatedAt ? { updatedAt: current.updatedAt } : {}),
      nodes,
      connections: (current.connections || []).map(cloneConnection),
      unmappedFlags: (current.unmappedFlags || []).map(cloneFlag),
    }),
    changed: true,
  };
}

function identity(node) {
  return `${node.kind}:${node.parentId || ""}:${slug(node.name)}`;
}

function linksTo(parentId, parents) {
  if (!parentId) return false;
  const want = String(parentId);
  const wantSlug = slug(want);
  return parents.some(
    (parent) => parent.id === want || parent.id === wantSlug || slug(parent.name) === wantSlug,
  );
}

function findMatch(nodes, node) {
  const key = identity(node);
  const byIdentity = nodes.find((item) => identity(item) === key);
  if (byIdentity) return byIdentity;
  if (node.id) return nodes.find((item) => item.id === node.id) || null;
  return null;
}

function mintId(node, nodes) {
  const used = new Set(nodes.map((item) => item.id).filter(Boolean));
  const base = node.id || `${node.parentId ? `${slug(node.parentId)}-` : ""}${slug(node.name)}`;
  let id = base || "node";
  let n = 2;
  while (used.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}

function cleanNode(raw) {
  const kind = String(raw.kind || "").trim().toLowerCase();
  return {
    id: typeof raw.id === "string" ? raw.id.trim() : "",
    name: String(raw.name || "").trim(),
    kind,
    parentId: kind === "system" || raw.parentId == null || raw.parentId === "" ? null : String(raw.parentId),
    what: String(raw.what).trim(),
    why: String(raw.why).trim(),
    flags: [],
  };
}

function snapshot(design) {
  return JSON.stringify({
    floor: design.floor,
    nodes: (design.nodes || []).map((node) => ({
      id: node.id,
      name: node.name,
      kind: node.kind,
      parentId: node.parentId,
      what: node.what,
      why: node.why,
      flags: (node.flags || []).map((flag) => ({
        intent: flag.intent,
        difference: flag.difference,
        nodeId: flag.nodeId || null,
      })),
    })),
    connections: (design.connections || []).map(cloneConnection),
    unmappedFlags: (design.unmappedFlags || []).map((flag) => ({
      intent: flag.intent,
      difference: flag.difference,
      nodeId: flag.nodeId || null,
    })),
  });
}

/**
 * Merge a builder result into the design.
 * The same result applied twice does not add a second copy of a node.
 * Nodes finer than `floor`, and files, classes, functions, endpoints, and types, are left out.
 * A non-design result leaves the model unchanged.
 */
export function applyDesign(design, result, floor = DEFAULT_FLOOR) {
  const current = design && Array.isArray(design.nodes) ? design : emptyDesign(floor);
  if (!result || result.isDesign !== true || !Array.isArray(result.nodes)) {
    return { design: current, changed: false };
  }
  const activeFloor = FLOORS.includes(floor) ? floor : DEFAULT_FLOOR;
  const existing = current.nodes.map(cloneNode);
  const incoming = [];
  const seen = new Set();
  for (const raw of result.nodes) {
    if (!raw || typeof raw.name !== "string" || !raw.name.trim()) continue;
    if (!hasDistinctWhatWhy(raw) || !isStorableNode(raw, activeFloor)) continue;
    const node = cleanNode(raw);
    const key = identity(node);
    if (seen.has(key)) continue;
    seen.add(key);
    incoming.push(node);
  }

  const systems = incoming.filter((node) => node.kind === "system");
  const knownSystems = [...existing.filter((node) => node.kind === "system"), ...systems];
  const components = incoming.filter(
    (node) => node.kind === "component" && linksTo(node.parentId, knownSystems),
  );
  const knownComponents = [
    ...existing.filter((node) => node.kind === "component" && linksTo(node.parentId, knownSystems)),
    ...components,
  ];
  const modules = incoming.filter(
    (node) => node.kind === "module" && linksTo(node.parentId, knownComponents),
  );
  const kept = [...systems, ...components, ...modules];
  if (kept.length === 0) return { design: current, changed: false };

  const nodes = existing;
  for (const node of kept) {
    const match = findMatch(nodes, node);
    if (match) {
      match.name = node.name;
      match.kind = node.kind;
      match.parentId = node.parentId;
      match.what = node.what;
      match.why = node.why;
      continue;
    }
    node.id = mintId(node, nodes);
    nodes.push(node);
  }

  const connections = (current.connections || []).map(cloneConnection);
  const knownIds = new Set(nodes.map((node) => node.id));
  for (const raw of Array.isArray(result.connections) ? result.connections : []) {
    const connection = cloneConnection(raw);
    if (!connection.fromId || !connection.toId || connection.fromId === connection.toId) continue;
    if (!knownIds.has(connection.fromId) || !knownIds.has(connection.toId)) continue;
    if (!["data", "control", "dependency"].includes(connection.kind)) continue;
    if (!connection.label.trim()) continue;
    connection.id = connection.id || `flow-${slug(`${connection.fromId}-${connection.toId}-${connection.kind}-${connection.label}`)}`;
    const match = connections.find((item) => item.id === connection.id);
    if (match) Object.assign(match, connection);
    else connections.push(connection);
  }

  const next = carryDesignMeta(current, {
    version: 1,
    floor: activeFloor,
    updatedAt: current.updatedAt,
    nodes,
    connections,
    unmappedFlags: (current.unmappedFlags || []).map(cloneFlag),
  });
  if (snapshot(next) === snapshot(current)) return { design: current, changed: false };
  next.updatedAt = new Date().toISOString();
  return { design: next, changed: true };
}

/**
 * What the canvas draws at `floor`. Finer nodes are omitted, and a module
 * whose component was omitted goes with it.
 */
export function canvasModel(design, floor) {
  const source = design && Array.isArray(design.nodes) ? design : emptyDesign();
  const active = FLOORS.includes(floor)
    ? floor
    : FLOORS.includes(source.floor)
      ? source.floor
      : DEFAULT_FLOOR;
  const limit = floorRank(active);
  const ranked = source.nodes.filter((node) => floorRank(node.kind) > 0 && floorRank(node.kind) <= limit);
  const systems = ranked.filter((node) => node.kind === "system");
  const components = ranked.filter((node) => node.kind === "component" && linksTo(node.parentId, systems));
  const modules = ranked.filter((node) => node.kind === "module" && linksTo(node.parentId, components));
  return {
    version: 1,
    floor: active,
    updatedAt: source.updatedAt,
    nodes: [...systems, ...components, ...modules].map(cloneNode),
    connections: (source.connections || []).map(cloneConnection).filter((connection) =>
      systems.concat(components, modules).some((node) => node.id === connection.fromId) &&
      systems.concat(components, modules).some((node) => node.id === connection.toId),
    ),
    unmappedFlags: (source.unmappedFlags || []).map(cloneFlag),
  };
}
