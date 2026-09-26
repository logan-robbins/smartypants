import path from "node:path";
import { readConfig } from "./config.js";
import { autoDeepenTarget, deeperFloor, nextLevel } from "./deeper.js";
import { applyDrift } from "./drift.js";
import { loadEnvFile } from "./env.js";
import { adapterFor } from "./flavors/index.js";
import { heuristicAtoms, loadIntent, INTENT_TOKEN_BUDGET, rememberAtoms, renderIntent, saveIntent } from "./intent.js";
import { createChooser } from "./jev.js";
import { loadLedger, projectSketch, seedPending } from "./ledger.js";
import { applyDesign, canvasModel, loadDesign, markSeeded, saveDesign } from "./model.js";
import { normalizeStdin } from "./normalize.js";
import { matchNode } from "./salience.js";
import { recordTurn } from "./stats.js";
import { TAXONOMY, floorRank } from "./taxonomy.js";
import { triageEdit, triageTurn } from "./triage.js";

const DEFAULT_TIMEOUT_MS = 12000;

/** Set on the builder process so a hook it fires (Muse command, Pi extension) returns. */
export const BUILDER_GUARD = "SMARTYPANTS_BUILDING";

export function builderIsRunning(env = process.env) {
  return env[BUILDER_GUARD] === "1";
}

export async function withBuilderGuard(fn) {
  const previous = process.env[BUILDER_GUARD];
  process.env[BUILDER_GUARD] = "1";
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env[BUILDER_GUARD];
    else process.env[BUILDER_GUARD] = previous;
  }
}

function withTimeout(promise, ms) {
  const limit = Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_TIMEOUT_MS;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("smartypants builder timed out")), limit);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function inert(error = null) {
  return {
    exitCode: 0,
    inert: true,
    adapterInvoked: false,
    request: null,
    error,
    designChanged: false,
  };
}

function coarser(a, b) {
  return floorRank(a) <= floorRank(b) ? a : b;
}

/**
 * Which floor the builder works at. Fixed depth uses the config. Auto depth
 * starts at the triaged level and follows the design's current level.
 */
function floorFor(config, design, decision, target) {
  if (decision.action === "deepen" && target) return deeperFloor(target);
  if (!config.auto) return config.depth;
  if (!design.nodes.length) return decision.level || "component";
  // The diagram only gets finer: a turn that talks about parts lifts the level.
  const current = design.level || "component";
  const wanted = decision.level && floorRank(decision.level) > floorRank(current) ? decision.level : current;
  return coarser(wanted, config.depth);
}

async function runBuilder(adapter, request, timeoutMs) {
  return withBuilderGuard(() => {
    const pending = Promise.resolve().then(() => adapter.invoke(request));
    pending.catch(() => {});
    return withTimeout(pending, timeoutMs);
  });
}

/**
 * Shared hook entry. Always exits successfully. A missing config, an invalid
 * flavor, or a builder failure leaves the persisted design as it was.
 *
 * Each turn is triaged first (local features, then one Jev-protocol selector
 * call). Noise costs nothing, constraints are stored as IntentCode without a
 * builder call, and only design-changing turns reach the builder.
 */
export async function handleHook(options = {}) {
  const started = Date.now();
  const cwd = process.env.SMARTPANTS_ROOT || options.cwd || process.cwd();
  if (builderIsRunning()) return inert();
  const found = readConfig(cwd);
  if (!found.config) {
    if (found.present) console.error(`smartypants: config ignored (${found.reason})`);
    return inert();
  }
  const config = found.config;

  const event = options.event || normalizeStdin(options.stdin ?? "");
  if (!event) return inert();
  if (event.type === "edit" && path.isAbsolute(event.path || "")) {
    const relative = path.relative(cwd, event.path);
    if (!relative.startsWith("..")) event.path = relative.split(path.sep).join("/");
  }
  if (event.type === "user" && !String(event.text || "").trim()) return inert();
  if (event.type === "edit" && !event.path && !event.contents && !event.diff) return inert();
  if (event.type === "deeper" && !String(event.target || "").trim()) return inert();

  const adapter = adapterFor(config.flavor);
  if (!adapter) {
    console.error("smartypants: config ignored (invalid-flavor)");
    return inert();
  }

  try {
    loadEnvFile(cwd, config.envFile);
  } catch (error) {
    console.error(`smartypants: env file ignored (${error.message})`);
    return inert(error.message);
  }

  const timeoutMs = options.timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const selectorUsage = [];
  const chooser = options.chooser || createChooser(config, { record: (usage) => selectorUsage.push(usage) });
  const design = loadDesign(cwd);
  const intent = loadIntent(cwd);
  const seeding = seedPending(design, config);
  const kindOf = seeding ? "seed" : event.type === "edit" ? "drift" : event.type === "deeper" ? "deepen" : "design";

  let decision;
  try {
    if (seeding) decision = { action: "seed", reason: "baseline", via: "local" };
    else if (event.type === "deeper") {
      const match = matchNode(design.nodes, event.target);
      decision = match.node
        ? { action: "deepen", reason: "command", via: "local", target: match.node.id }
        : await triageTurn({ text: `go deeper on ${event.target}`, design, intent, chooser, auto: config.auto });
    } else if (event.type === "edit") decision = await triageEdit({ event, design, intent, chooser });
    else decision = await triageTurn({ text: event.text, design, intent, chooser, auto: config.auto });
  } catch (error) {
    decision = { action: kindOf === "drift" ? "drift" : "design", reason: "triage-failed", via: "none" };
    console.error(`smartypants: triage failed (${error instanceof Error ? error.message : String(error)})`);
  }
  const target = decision.target ? design.nodes.find((node) => node.id === decision.target) : null;
  const floor = floorFor(config, design, decision, target);
  const kind = decision.action === "deepen" ? "deepen" : kindOf;
  console.error(`smartypants flavor=${config.flavor} floor=${floor} kind=${kind} triage=${decision.action}:${decision.reason} via=${decision.via}`);

  const finish = (result, extra = {}) => {
    recordTurn(cwd, {
      kind,
      action: decision.action,
      reason: decision.reason,
      via: decision.via,
      selector: selectorUsage,
      builder: result.request?.usage || null,
      target: decision.target,
      gained: extra.gained || 0,
      ms: Date.now() - started,
    });
    return { exitCode: 0, inert: false, triage: decision, ...result };
  };

  if (decision.action === "skip") {
    return finish({ adapterInvoked: false, request: null, error: null, designChanged: false, skipped: decision.reason });
  }

  const budget = config.intentTokens || INTENT_TOKEN_BUDGET;
  if (decision.action === "remember") {
    const atoms = heuristicAtoms(event.text, design);
    if (atoms.length) {
      const remembered = rememberAtoms(intent, atoms, { source: "user", budget });
      if (remembered.changed) saveIntent(cwd, remembered.intent);
      return finish({ adapterInvoked: false, request: null, error: null, designChanged: false, remembered: remembered.gained }, { gained: remembered.gained.length });
    }
    decision.action = "design";
    decision.reason = `${decision.reason}+no-local-atoms`;
  }

  const sketch = seeding ? projectSketch(cwd) : "";
  const legacy = loadLedger(cwd).entries.map((entry) => entry.gist);
  const subjects = kind === "drift" && decision.owners?.length ? decision.owners : undefined;
  const request = adapter.buildRequest({
    config,
    event: kind === "deepen" ? { type: "deeper", text: event.text || `go deeper on ${target?.name || event.target}` } : event,
    design: canvasModel(design, config.depth),
    floor,
    taxonomy: TAXONOMY,
    cwd,
    seed: seeding,
    sketch,
    ledger: legacy,
    intent: renderIntent(intent, subjects ? { subjects: [...subjects, "sys"] } : {}),
    target,
    owners: decision.owners || [],
  });

  let parsed;
  try {
    parsed = await runBuilder(adapter, request, timeoutMs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`smartypants: ${message}`);
    return finish({ adapterInvoked: true, request, error: message, designChanged: false });
  }

  try {
    const fresh = loadDesign(cwd);
    let applied = request.kind === "drift" ? applyDrift(fresh, parsed) : applyDesign(fresh, parsed, floor);
    if (request.kind === "seed" && (parsed?.flags || parsed?.diverges === true)) {
      const drifted = applyDrift(applied.design, parsed);
      if (drifted.changed) applied = { design: drifted.design, changed: true };
    }
    if (seeding) {
      const marked = markSeeded(applied.design);
      applied = { design: marked.design, changed: applied.changed || marked.changed };
    }
    if (config.auto && applied.changed && request.kind !== "drift") {
      const base = applied.design.level || floor;
      const level = request.kind !== "deepen" && floorRank(floor) > floorRank(base) ? floor : base;
      const lifted = nextLevel({ ...applied.design, level });
      applied.design.level = lifted;
    }
    if (applied.changed) saveDesign(cwd, applied.design);

    // Intent: user turns evolve it, code only adds drift atoms.
    const lines = [];
    if (request.kind === "drift") {
      for (const flag of parsed?.flags?.length ? parsed.flags : parsed?.diverges ? [parsed] : []) {
        if (flag.intent && flag.difference) lines.push(`! ${flag.nodeId || "unmapped"} intent:${flag.intent} code:${flag.difference}`);
      }
    } else {
      lines.push(...(Array.isArray(parsed?.intent) ? parsed.intent : []));
      if (!lines.length && event.text) lines.push(...heuristicAtoms(event.text, applied.design));
    }
    let gained = 0;
    if (lines.length) {
      const remembered = rememberAtoms(loadIntent(cwd), lines, { source: request.kind === "drift" ? "code" : "user", budget });
      if (remembered.changed) saveIntent(cwd, remembered.intent);
      gained = remembered.gained.length;
    }

    const result = { adapterInvoked: true, request, error: null, designChanged: applied.changed };
    const remaining = timeoutMs - (Date.now() - started);
    if (
      config.autoDeepen &&
      request.kind === "design" &&
      applied.changed &&
      options.followup !== false &&
      remaining > Math.min(8000, timeoutMs / 2)
    ) {
      const next = autoDeepenTarget(applied.design, loadIntent(cwd), decision.features, config.autoDeepen);
      if (next) {
        console.error(`smartypants: auto-deepen ${next.id} (pressure ${next.score})`);
        const nested = await handleHook({ ...options, cwd, event: { type: "deeper", target: next.id }, timeoutMs: remaining, followup: false });
        result.deepened = next.id;
        result.designChanged = result.designChanged || nested.designChanged;
      }
    }
    return finish(result, { gained });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`smartypants: ${message}`);
    return finish({ adapterInvoked: true, request, error: message, designChanged: false });
  }
}
