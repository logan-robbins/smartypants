/**
 * IntentCode: the user's architectural intent as keyed atoms, not prose.
 *
 *   <K> <subject>[.<facet>] <value>
 *
 *   G  goal / purpose            G sys shorten-urls track-clicks
 *   F  functional requirement    F redirect 301 to long-url
 *   N  non-functional constraint N redirect.latency p99<50ms
 *   D  decision (chosen>rejected) D cache redis>memcached
 *   X  excluded / forbidden      X redirect sync-db-write
 *   E  flow                      E redirect>cache get-url
 *   Q  open question             Q feed.ranking ml-or-chrono
 *   !  drift (intent vs code)    ! redirect intent:async-clicks code:sync-insert
 *
 * `K subject` (plus facet) is the key. A later atom with the same key
 * supersedes the value; the same value again only reinforces it. A user turn
 * that changes a decision is intent evolution (the old value becomes an X
 * atom); code that contradicts an atom is drift. The store is evicted by
 * value per token, so it holds the most information the budget allows.
 */
import fs from "node:fs";
import path from "node:path";
import { estimateTokens } from "./ledger.js";
import { DESIGN_DIR } from "./model.js";
import { slug } from "./taxonomy.js";

export const INTENT_FILE = "intent.json";
export const INTENT_TOKEN_BUDGET = 1200;
export const KINDS = { G: 6, N: 5, D: 5, X: 4, "!": 4, F: 3, E: 2, Q: 1 };
const LINE = /^\s*([GFNDXEQ!])\s+([A-Za-z0-9_.:/>-]+)\s+(.+?)\s*$/;

export function intentPath(root) {
  return path.join(root, DESIGN_DIR, INTENT_FILE);
}

export function emptyIntent() {
  return { version: 2, turn: 0, atoms: [] };
}

const FILLER = new Set("a an the and of to for with that this is are be it its as by on in at from which will would should can could".split(" "));

/** No grammar: drop filler words, keep operators like < > = and units. */
function compactValue(value) {
  const kept = [];
  for (const word of String(value || "").replace(/[`"'“”]/g, "").replace(/[^\p{L}\p{N}+/#.<>=:%-]+/gu, " ").split(/\s+/)) {
    if (!word || FILLER.has(word.toLowerCase())) continue;
    if (kept.at(-1)?.toLowerCase() === word.toLowerCase()) continue;
    kept.push(word);
    if (kept.length >= 14) break;
  }
  return kept.join(" ").slice(0, 96);
}

function compactSubject(subject) {
  const [head, ...facet] = String(subject || "").split(".");
  const base = head.includes(">") ? head.split(">").map(slug).join(">") : slug(head);
  return [base, ...facet.map(slug)].filter(Boolean).join(".");
}

/** Parse one IntentCode line. Prose, or a line without a kind, is rejected. */
export function parseAtom(line) {
  const match = String(line || "").match(LINE);
  if (!match) return null;
  const k = match[1];
  const s = compactSubject(match[2]);
  const v = compactValue(match[3]);
  if (!s || !v) return null;
  return { k, s, v };
}

export function atomKey(atom) {
  return `${atom.k} ${atom.s}`;
}

export function formatAtom(atom) {
  return `${atom.k} ${atom.s} ${atom.v}`;
}

export function loadIntent(root) {
  try {
    const parsed = JSON.parse(fs.readFileSync(intentPath(root), "utf8"));
    if (parsed?.version !== 2 || !Array.isArray(parsed.atoms)) return emptyIntent();
    const atoms = parsed.atoms
      .map((a) => ({ ...parseAtom(`${a.k} ${a.s} ${a.v}`), n: Math.max(1, a.n | 0), t: a.t | 0, u: a.u | 0, src: a.src === "code" ? "code" : "user" }))
      .filter((a) => a.k);
    return { version: 2, turn: parsed.turn | 0, atoms };
  } catch {
    return emptyIntent();
  }
}

export function saveIntent(root, intent) {
  const file = intentPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = `${JSON.stringify({ version: 2, turn: intent.turn, tokens: intentTokens(intent), atoms: intent.atoms })}\n`;
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, body);
  fs.renameSync(temp, file);
}

export function intentTokens(intent) {
  return estimateTokens(renderIntent(intent));
}

function value(atom, turn) {
  return (KINDS[atom.k] || 1) * (1 + Math.log2(atom.n || 1)) * Math.pow(0.97, Math.max(0, turn - (atom.u || 0)));
}

/**
 * Merge atoms from one turn. Returns the information gain: atoms whose key is
 * new or whose value changed. Reinforcement alone is not gain.
 */
export function rememberAtoms(intent, lines, { source = "user", budget = INTENT_TOKEN_BUDGET } = {}) {
  const current = intent?.atoms ? intent : emptyIntent();
  const turn = current.turn + 1;
  const atoms = current.atoms.map((a) => ({ ...a }));
  const gained = [];
  const superseded = [];
  let parsed = 0;
  for (const line of lines || []) {
    const atom = typeof line === "string" ? parseAtom(line) : parseAtom(formatAtom(line));
    if (!atom) continue;
    parsed += 1;
    const existing = atoms.find((a) => atomKey(a) === atomKey(atom));
    if (!existing) {
      atoms.push({ ...atom, n: 1, t: turn, u: turn, src: source });
      gained.push(formatAtom(atom));
      continue;
    }
    existing.u = turn;
    if (existing.v === atom.v) {
      existing.n += 1;
      continue;
    }
    // A user changing their mind is evolution: keep the old choice as excluded.
    if (source === "user" && atom.k === "D") {
      const old = existing.v.split(">")[0];
      const exclude = { k: "X", s: atom.s, v: old };
      if (!atoms.some((a) => atomKey(a) === atomKey(exclude) && a.v === old)) {
        atoms.push({ ...exclude, n: 1, t: turn, u: turn, src: source });
      }
    }
    superseded.push(`${formatAtom(existing)} => ${atom.v}`);
    existing.v = atom.v;
    existing.n = 1;
    existing.src = source;
    gained.push(formatAtom(atom));
  }
  const next = evict({ version: 2, turn, atoms }, budget);
  return { intent: next, gained, superseded, changed: parsed > 0 };
}

/** Drop the lowest value-per-token atoms until the rendering fits. */
export function evict(intent, budget = INTENT_TOKEN_BUDGET) {
  const limit = Number.isFinite(budget) && budget > 0 ? budget : INTENT_TOKEN_BUDGET;
  const atoms = [...intent.atoms];
  while (atoms.length > 1 && estimateTokens(renderIntent({ atoms })) > limit) {
    let worst = 0;
    let worstScore = Infinity;
    atoms.forEach((atom, index) => {
      const score = value(atom, intent.turn) / Math.max(1, estimateTokens(formatAtom(atom)));
      if (score < worstScore) {
        worstScore = score;
        worst = index;
      }
    });
    atoms.splice(worst, 1);
  }
  return { ...intent, atoms };
}

const ORDER = ["G", "N", "D", "X", "F", "E", "!", "Q"];

/**
 * Prompt rendering: grouped by subject so a subject is spelled once.
 *   redirect|N latency p99<50ms|D cache redis>memcached|E >cache get-url
 */
export function renderIntent(intent, { subjects } = {}) {
  const groups = new Map();
  for (const atom of intent?.atoms || []) {
    const [head, ...facet] = atom.s.split(".");
    if (subjects && !subjects.some((s) => head === s || head.startsWith(`${s}>`) || head.endsWith(`>${s}`))) continue;
    if (!groups.has(head)) groups.set(head, []);
    groups.get(head).push(atom);
  }
  const lines = [];
  for (const [head, list] of [...groups.entries()].sort((a, b) => (a[0] === "sys" ? -1 : b[0] === "sys" ? 1 : a[0].localeCompare(b[0])))) {
    list.sort((a, b) => ORDER.indexOf(a.k) - ORDER.indexOf(b.k));
    const parts = list.map((a) => {
      const facet = a.s.slice(head.length + 1);
      return `${a.k}${facet ? ` ${facet}` : ""} ${a.v}`;
    });
    lines.push(`${head}|${parts.join("|")}`);
  }
  return lines.join("\n");
}

const UNIT = /(\d+(?:\.\d+)?)\s*(k|m|b|bn|ms|milliseconds?|s|secs?|seconds?|mins?|minutes?|h|hours?|qps|rps|tps|tb|gb|pb|%|x)?(?![a-z])\s*([a-z]+(?: [a-z]+)?)?/gi;
const TIME = { ms: "ms", millisecond: "ms", milliseconds: "ms", s: "s", sec: "s", secs: "s", second: "s", seconds: "s", min: "min", mins: "min", minute: "min", minutes: "min", h: "h", hour: "h", hours: "h" };
const LOAD_NOUNS = /^(?:qps|rps|tps|requests?|writes?|reads?|events?|views?|clicks?|messages?|posts?|links?|redirects?|uploads?|queries|calls?|orders?|rides?|trips?)$/i;
const USER_NOUNS = /^(?:users?|drivers?|riders?|customers?|devices?|followers?|friends?|subscribers?|dau|mau)$/i;
const GUARANTEES = /\b(at[- ]least[- ]once|at[- ]most[- ]once|exactly[- ]once|in[- ]order|ordered delivery|strongly consistent|strong consistency|eventual(?:ly)? consisten(?:t|cy)|read[- ]your[- ]writes|idempotent|durable|no data loss|highly available|multi[- ]region|end[- ]to[- ]end encrypt(?:ed|ion))\b/gi;

function facetOf(unit, noun, sentence) {
  const u = String(unit || "").toLowerCase();
  const n = String(noun || "").toLowerCase().trim();
  if (TIME[u]) return /p\d{2}|latenc|under|within|less than|<|respond|return|load/i.test(sentence) ? "latency" : "interval";
  if (USER_NOUNS.test(n)) return "users";
  if (["qps", "rps", "tps"].includes(u) || LOAD_NOUNS.test(n)) return "load";
  if (["tb", "gb", "pb"].includes(u)) return "storage";
  if (u === "%") return /avail|uptime|nines/i.test(sentence) ? "availability" : "ratio";
  if (["k", "m", "b", "bn"].includes(u) && n) return "scale";
  return null;
}

/**
 * Local extraction when no model wrote atoms: numeric constraints and explicit
 * choices only. It never stores sentences.
 */
export function heuristicAtoms(text, design = { nodes: [] }) {
  const out = [];
  const nodes = design.nodes || [];
  for (const sentence of String(text || "").split(/(?<=[.!?;\n])\s+/)) {
    const lower = sentence.toLowerCase();
    const node = nodes.find((n) => n.name && lower.includes(String(n.name).toLowerCase()));
    const subject = node ? node.id : "sys";
    for (const m of sentence.matchAll(UNIT)) {
      const words = String(m[3] || "").toLowerCase().split(" ").filter(Boolean);
      const noun = words.find((w) => USER_NOUNS.test(w) || LOAD_NOUNS.test(w)) || (m[2] ? "" : null);
      if (noun === null || (!m[2] && !noun)) continue;
      const facet = facetOf(m[2], noun, sentence);
      if (!facet) continue;
      const unit = TIME[String(m[2] || "").toLowerCase()] || m[2] || "";
      const timed = facet === "latency" || facet === "interval";
      const tail = sentence.slice(m.index, m.index + m[0].length + 24);
      const per = /per (second|day|month|minute|hour)|\/(s|day)|an? (day|month|second|hour)/i.exec(tail);
      const period = per ? (per[1] || per[2] || per[3]).toLowerCase().replace("second", "s") : "";
      const clauseStart = Math.max(sentence.lastIndexOf(",", m.index), sentence.lastIndexOf(";", m.index)) + 1;
      const clauseEnd = sentence.slice(m.index).search(/[,;]/);
      const clause = sentence.slice(clauseStart, clauseEnd === -1 ? undefined : m.index + clauseEnd);
      const peak = /\bpeak/i.test(clause) ? "peak" : "";
      const key = [facet, timed || !noun ? "" : slug(noun), period, peak].filter(Boolean).join("-");
      const pct = facet === "latency" ? (sentence.match(/p\d{2}/i)?.[0] || "") : "";
      out.push(`N ${subject}.${key} ${pct ? `${pct}<` : facet === "latency" ? "<" : ""}${m[1]}${unit}${!timed && noun ? ` ${noun}` : ""}${period ? `/${period}` : ""}`);
    }
    for (const g of sentence.matchAll(GUARANTEES)) out.push(`N ${subject}.${slug(g[1])} required`);
    const choice = sentence.match(/\b(?:use|using|with)\s+([A-Za-z0-9-]+)(?:\s+(?:instead of|rather than|over|not)\s+([A-Za-z0-9-]+))?/i);
    if (choice && /\b(use|using|instead of|rather than)\b/i.test(sentence)) {
      out.push(`D ${subject}.tech ${choice[1]}${choice[2] ? `>${choice[2]}` : ""}`);
    }
    const never = sentence.match(/\b(?:never|must not|don'?t|do not|avoid)\s+(.{3,60}?)(?:[.!?]|$)/i);
    if (never) out.push(`X ${subject} ${never[1]}`);
  }
  return out;
}
