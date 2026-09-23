import fs from "node:fs";
import path from "node:path";
import { DESIGN_DIR } from "./model.js";

export const LEDGER_FILE = "ledger.json";
export const LEDGER_TOKEN_BUDGET = 10000;
const GIST_WORD_CAP = 48;

const STOP = new Set(
  `a an the and or but if then so to of in on for with at by from as is are was were be been being
   it this that these those i we you they me my our your
   please just actually really um uh like very hey hello hi thanks thank basically literally kinda
   yeah yes ok okay wanna gonna sort`.split(/\s+/),
);

export function ledgerPath(root) {
  return path.join(root, DESIGN_DIR, LEDGER_FILE);
}

export function estimateTokens(text) {
  const value = String(text || "");
  if (!value) return 0;
  return Math.ceil(value.length / 4);
}

/**
 * Valuable words only. Filler and the original wording are dropped, and the
 * result is capped so a transcript cannot land in the ledger.
 */
export function gist(text, maxWords = GIST_WORD_CAP) {
  const words = String(text || "")
    .replace(/[`"'“”]/g, "")
    .replace(/[^\p{L}\p{N}+/#.-]+/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => !STOP.has(word.toLowerCase()));
  const kept = [];
  const seen = new Set();
  for (const word of words) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(word);
    if (kept.length >= maxWords) break;
  }
  return kept.join(" ");
}

export function emptyLedger() {
  return { version: 1, tokens: 0, entries: [] };
}

export function loadLedger(root) {
  const file = ledgerPath(root);
  if (!fs.existsSync(file)) return emptyLedger();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) return emptyLedger();
    const entries = parsed.entries
      .map((entry) => ({
        kind: String(entry.kind || "note"),
        gist: gist(entry.gist || ""),
        at: typeof entry.at === "string" ? entry.at : "",
      }))
      .filter((entry) => entry.gist);
    return { version: 1, tokens: tokenCount(entries), entries };
  } catch {
    return emptyLedger();
  }
}

export function saveLedger(root, ledger) {
  const file = ledgerPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = `${JSON.stringify(
    {
      version: 1,
      tokens: tokenCount(ledger.entries || []),
      entries: (ledger.entries || []).map((entry) => ({
        kind: entry.kind,
        gist: entry.gist,
        ...(entry.at ? { at: entry.at } : {}),
      })),
    },
    null,
    2,
  )}\n`;
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, body);
  fs.renameSync(temp, file);
}

export function tokenCount(entries) {
  return (entries || []).reduce((sum, entry) => sum + estimateTokens(entry.gist), 0);
}

function fitGist(text, budget) {
  let value = gist(text, 80);
  while (value && estimateTokens(value) > budget) {
    const words = value.split(" ");
    if (words.length <= 1) return words[0].slice(0, Math.max(1, budget * 4));
    value = words.slice(0, -1).join(" ");
  }
  return value;
}

/**
 * Fold older gists until the ledger fits in `budget` tokens.
 * Entries only ever contain gists, never a stored transcript.
 */
export function compactLedger(ledger, budget = LEDGER_TOKEN_BUDGET) {
  const source = ledger && Array.isArray(ledger.entries) ? ledger.entries : [];
  const limit = Number.isFinite(budget) && budget > 0 ? budget : LEDGER_TOKEN_BUDGET;
  if (tokenCount(source) <= limit) {
    return { version: 1, tokens: tokenCount(source), entries: source.map(cloneEntry) };
  }

  const tailBudget = Math.max(1, Math.floor(limit * 0.6));
  const tail = [];
  let tailTokens = 0;
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const entry = cloneEntry(source[index]);
    const cost = estimateTokens(entry.gist);
    if (cost > tailBudget) break;
    if (tail.length > 0 && tailTokens + cost > tailBudget) break;
    tail.unshift(entry);
    tailTokens += cost;
  }
  const older = source.slice(0, source.length - tail.length).map(cloneEntry);
  const entries = [];
  if (older.length > 0) {
    const compactBudget = Math.max(1, limit - tailTokens);
    const folded = fitGist(
      [...older].reverse().map((entry) => entry.gist).join(" "),
      compactBudget,
    );
    if (folded) entries.push({ kind: "compact", gist: folded, at: older[older.length - 1].at || "" });
  }
  entries.push(...tail);
  if (entries[0]?.kind === "compact" && tokenCount(entries) > limit) {
    const overflow = tokenCount(entries) - limit;
    const room = Math.max(1, estimateTokens(entries[0].gist) - overflow);
    const shrunk = fitGist(entries[0].gist, room);
    if (shrunk) entries[0] = { ...entries[0], gist: shrunk };
    else entries.shift();
  }
  return { version: 1, tokens: tokenCount(entries), entries };
}

function cloneEntry(entry) {
  return {
    kind: entry.kind,
    gist: entry.gist,
    ...(entry.at ? { at: entry.at } : {}),
  };
}

/**
 * Record one turn as a gist. The original text is not stored.
 * When the ledger crosses the token budget, older gists are compacted.
 */
export function rememberTurn(ledger, { kind, text, at }, budget = LEDGER_TOKEN_BUDGET) {
  const cleaned = gist(text);
  if (!cleaned) return { ledger: ledger && Array.isArray(ledger.entries) ? ledger : emptyLedger(), changed: false };
  const current = ledger && Array.isArray(ledger.entries) ? ledger : emptyLedger();
  const entries = [
    ...current.entries.map(cloneEntry),
    { kind: kind || "note", gist: cleaned, ...(at ? { at } : { at: new Date().toISOString() }) },
  ];
  const next = compactLedger({ version: 1, tokens: tokenCount(entries), entries }, budget);
  return { ledger: next, changed: true };
}

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".smartypants",
  ".git",
  ".next",
  "vendor",
]);

/**
 * Names of project files only. File contents are never read.
 */
export function projectSketch(root, maxPaths = 60) {
  const found = [];
  function walk(dir, depth) {
    if (found.length >= maxPaths || depth > 4) return;
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (name.startsWith(".") || SKIP_DIRS.has(name)) continue;
      const full = path.join(dir, name);
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) walk(full, depth + 1);
      else if (stat.isFile()) found.push(path.relative(root, full).split(path.sep).join("/"));
      if (found.length >= maxPaths) return;
    }
  }
  walk(root, 0);
  return gist(found.join(" "), 80);
}

export function seedPending(design, config) {
  return Boolean(config?.seed) && !design?.seeded;
}
