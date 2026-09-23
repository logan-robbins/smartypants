import { readConfig } from "./config.js";
import { applyDrift } from "./drift.js";
import { adapterFor } from "./flavors/index.js";
import { LEDGER_TOKEN_BUDGET, loadLedger, projectSketch, rememberTurn, saveLedger, seedPending } from "./ledger.js";
import { applyDesign, canvasModel, loadDesign, markSeeded, saveDesign } from "./model.js";
import { normalizeStdin } from "./normalize.js";
import { TAXONOMY } from "./taxonomy.js";

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

function memoryForTurn({ seeding, request, event, parsed, sketch }) {
  if (seeding) return [sketch, event?.text, event?.path].filter(Boolean).join(" ");
  if (request.kind === "drift") return [parsed?.intent, parsed?.difference].filter(Boolean).join(" ");
  return event?.text || event?.path || "";
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

/**
 * Shared hook entry. Always exits successfully. A missing config, an invalid
 * flavor, or a builder failure leaves the persisted design as it was.
 */
export async function handleHook(options = {}) {
  const cwd = options.cwd || process.cwd();
  if (builderIsRunning()) return inert();
  const found = readConfig(cwd);
  if (!found.config) {
    if (found.present) console.error(`smartypants: config ignored (${found.reason})`);
    return inert();
  }

  const event = options.event || normalizeStdin(options.stdin ?? "");
  if (!event) return inert();
  if (event.type === "user" && !String(event.text || "").trim()) return inert();
  if (event.type === "edit" && !event.path && !event.contents && !event.diff) return inert();

  const adapter = adapterFor(found.config.flavor);
  if (!adapter) {
    console.error("smartypants: config ignored (invalid-flavor)");
    return inert();
  }

  const design = loadDesign(cwd);
  const seeding = seedPending(design, found.config);
  const ledger = loadLedger(cwd);
  const sketch = seeding ? projectSketch(cwd) : "";
  const request = adapter.buildRequest({
    config: found.config,
    event,
    design: canvasModel(design, found.config.depth),
    floor: found.config.depth,
    taxonomy: TAXONOMY,
    cwd,
    seed: seeding,
    sketch,
    ledger: ledger.entries.map((entry) => entry.gist),
  });
  console.error(`smartypants flavor=${request.flavor} floor=${request.floor} kind=${request.kind}`);

  const timeoutMs = options.timeoutMs ?? found.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let parsed;
  try {
    parsed = await withBuilderGuard(() => {
      const pending = Promise.resolve().then(() => adapter.invoke(request));
      pending.catch(() => {});
      return withTimeout(pending, timeoutMs);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`smartypants: ${message}`);
    return {
      exitCode: 0,
      inert: false,
      adapterInvoked: true,
      request,
      error: message,
      designChanged: false,
    };
  }

  try {
    const fresh = loadDesign(cwd);
    let applied =
      request.kind === "drift"
        ? applyDrift(fresh, parsed)
        : applyDesign(fresh, parsed, found.config.depth);
    if (request.kind === "seed" && (parsed?.flags || parsed?.diverges === true)) {
      const drifted = applyDrift(applied.design, parsed);
      if (drifted.changed) applied = { design: drifted.design, changed: true };
    }
    if (seeding) {
      const marked = markSeeded(applied.design);
      applied = { design: marked.design, changed: applied.changed || marked.changed };
    }
    if (applied.changed) {
      saveDesign(cwd, applied.design);
      const memoryText = memoryForTurn({ seeding, request, event, parsed, sketch });
      const remembered = rememberTurn(
        loadLedger(cwd),
        { kind: seeding ? "seed" : request.kind, text: memoryText },
        found.config.ledgerTokens || LEDGER_TOKEN_BUDGET,
      );
      if (remembered.changed) saveLedger(cwd, remembered.ledger);
    }
    return {
      exitCode: 0,
      inert: false,
      adapterInvoked: true,
      request,
      error: null,
      designChanged: applied.changed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`smartypants: ${message}`);
    return {
      exitCode: 0,
      inert: false,
      adapterInvoked: true,
      request,
      error: message,
      designChanged: false,
    };
  }
}
