import path from "node:path";
import { readConfig } from "./config.js";
import { autoDeepenTarget, deeperFloor, nextLevel } from "./deeper.js";
import { catchupOwnsSeed, runCatchup, saveCatchup } from "./catchup.js";
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
import { driftEvidence, recordReviewed, reviewTurn, syncEvidence } from "./turnend.js";

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

  if (event.type === "catchup") return runCatchupEvent({ cwd, config, adapter, started, timeoutMs });
  if (event.type === "turn-end") return runTurnEnd({ cwd, config, adapter, chooser, selectorUsage, started, timeoutMs, options });
  // With turn-end review, single edits wait for the end of the turn.
  if (event.type === "edit" && config.review === "turn") return inert();

  const design = loadDesign(cwd);
  const intent = loadIntent(cwd);
  const seeding = seedPending(design, config) && !catchupOwnsSeed(cwd);
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

async function runCatchupEvent({ cwd, config, adapter, started, timeoutMs }) {
  console.error(`smartypants flavor=${config.flavor} kind=catchup`);
  try {
    const result = await runCatchup({ root: cwd, config, adapter, withGuard: withBuilderGuard, timeoutMs: Math.max(timeoutMs, 120000) });
    recordTurn(cwd, { kind: "catchup", action: "catchup", reason: "code", via: "local", selector: [], builder: { cost: result.state.cost || 0 }, ms: Date.now() - started });
    return { exitCode: 0, inert: false, adapterInvoked: true, request: null, error: null, designChanged: true, catchup: result.state };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    saveCatchup(cwd, { state: "failed", error: message, message: `Catch-up failed: ${message}` });
    console.error(`smartypants: catch-up failed (${message})`);
    return { exitCode: 0, inert: false, adapterInvoked: true, request: null, error: message, designChanged: false };
  }
}

/**
 * End of an agent turn: review what the turn changed in the working tree.
 * One batched verdict call, then at most one drift check and one design sync.
 */
async function runTurnEnd({ cwd, config, adapter, chooser, selectorUsage, started, timeoutMs }) {
  const design = loadDesign(cwd);
  const intent = loadIntent(cwd);
  let review;
  try {
    review = await reviewTurn({ root: cwd, design, intent, chooser });
  } catch (error) {
    console.error(`smartypants: turn review failed (${error instanceof Error ? error.message : String(error)})`);
    return inert();
  }
  const changed = review.changes.files.length;
  console.error(`smartypants flavor=${config.flavor} kind=turn-end files=${changed} reviewed=${review.reviewed.length} drift=${review.drift.length} infra=${review.infra.length} sync=${review.sync}`);
  const builderUsage = [];
  let designChanged = false;
  const errors = [];
  const budget = config.intentTokens || INTENT_TOKEN_BUDGET;

  if (review.drift.length && design.nodes.length) {
    const owners = [...new Set(review.drift.flatMap((change) => change.owners || []))];
    const request = adapter.buildRequest({
      config,
      event: { type: "edit", path: review.drift.map((c) => c.path).join(", "), contents: "", diff: driftEvidence(review) },
      design: canvasModel(design, config.depth),
      floor: config.depth,
      taxonomy: TAXONOMY,
      cwd,
      intent: renderIntent(intent, owners.length ? { subjects: [...owners, "sys"] } : {}),
      owners,
    });
    try {
      const parsed = await runBuilder(adapter, request, timeoutMs);
      if (request.usage) builderUsage.push(request.usage);
      const applied = applyDrift(loadDesign(cwd), parsed);
      if (applied.changed) {
        saveDesign(cwd, applied.design);
        designChanged = true;
      }
      const lines = [];
      for (const flag of parsed?.flags?.length ? parsed.flags : parsed?.diverges ? [parsed] : []) {
        if (flag.intent && flag.difference) lines.push(`! ${flag.nodeId || "unmapped"} intent:${flag.intent} code:${flag.difference}`);
      }
      if (lines.length) saveIntent(cwd, rememberAtoms(loadIntent(cwd), lines, { source: "code", budget }).intent);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (review.sync) {
    const evidence = syncEvidence(cwd, review);
    const floor = config.auto ? loadDesign(cwd).level || "component" : config.depth;
    const request = adapter.buildRequest({
      config,
      event: { type: "user", text: evidence.text },
      design: canvasModel(loadDesign(cwd), config.depth),
      floor,
      taxonomy: TAXONOMY,
      cwd,
      intent: renderIntent(loadIntent(cwd)),
    });
    try {
      const parsed = await runBuilder(adapter, request, timeoutMs);
      if (request.usage) builderUsage.push(request.usage);
      const applied = applyDesign(loadDesign(cwd), parsed, floor);
      if (applied.changed) {
        saveDesign(cwd, applied.design);
        designChanged = true;
      }
      if (Array.isArray(parsed?.intent) && parsed.intent.length) {
        saveIntent(cwd, rememberAtoms(loadIntent(cwd), parsed.intent, { source: "code", budget }).intent);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (!errors.length) recordReviewed(cwd, review.changes);
  const cost = builderUsage.reduce((sum, u) => sum + (u.cost || 0), 0);
  recordTurn(cwd, {
    kind: "turn-end",
    action: review.drift.length || review.sync ? "review" : "skip",
    reason: changed ? `${review.reviewed.length} reviewed, ${review.drift.length} drift, ${review.infra.length} infra` : "no changes",
    via: selectorUsage.length ? "selector" : "local",
    selector: selectorUsage,
    builder: builderUsage.length ? { cost, inputTokens: builderUsage.reduce((s, u) => s + (u.inputTokens || 0), 0), outputTokens: builderUsage.reduce((s, u) => s + (u.outputTokens || 0), 0) } : null,
    ms: Date.now() - started,
  });
  if (errors.length) console.error(`smartypants: ${errors.join("; ")}`);
  return {
    exitCode: 0,
    inert: false,
    adapterInvoked: builderUsage.length > 0,
    request: null,
    error: errors[0] || null,
    designChanged,
    review: { files: changed, reviewed: review.reviewed.map((c) => c.path), drift: review.drift.map((c) => c.path), infra: review.infra.map((c) => c.path), verdicts: review.verdicts, sync: review.sync },
  };
}
