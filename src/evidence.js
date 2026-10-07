/**
 * Code evidence for going deeper on a project that already has code.
 *
 * The phrase ("how the MCP credentials are managed") and the target part's
 * name become search terms. Files are ranked by how many of those terms
 * their path and contents carry, then the top files are outlined (module
 * docstring plus class, function, and type lines) inside a fixed budget,
 * so the builder starts from the real code instead of a textbook design.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { isScannable, isTestFile, listFiles } from "./scan.js";

const SOURCE = /\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|rb|php|cs|scala|ex|exs|swift|dart|c|cc|cpp|h|hpp|sql|prisma|proto|graphql|ya?ml|toml|tf)$/i;
const STOP = new Set(
  "a an and are as at be by can deeper do does done drill explain for from go goes going handle handled handles how in into is it its let look managed manage manages management me more of on or our please show tell that the their them then there these this through to up us use used uses using want we what when where which who why will with work works you your part parts piece side box diagram".split(" "),
);
/** A few architecture words that code spells several ways. */
const RELATED = {
  credential: ["token", "secret", "oauth", "auth"],
  auth: ["token", "oauth", "credential"],
  secret: ["credential", "vault", "encrypt"],
  token: ["oauth", "refresh", "credential"],
  cache: ["redis", "ttl"],
  queue: ["kafka", "consumer", "producer"],
  billing: ["spend", "budget", "cost"],
  rate: ["limit", "throttle"],
  key: ["api_key", "virtual_key"],
};
export const EVIDENCE_CHARS = 24000;
const LISTED = 40;
const OUTLINED = 10;
const OUTLINE_LINES = 60;
const DECLARATION = /^\s*(?:export\s+)?(?:default\s+)?(?:pub(?:\(crate\))?\s+)?(?:async\s+)?(?:def|class|function|interface|type|enum|struct|trait|impl|func|fn|module|model|table|resource|message|service|const\s+[A-Z][A-Z0-9_]+\s*=)\b/;

function stem(word) {
  return word.replace(/(?:ies)$/, "y").replace(/(?:ses|xes)$/, (m) => m.slice(0, -2)).replace(/s$/, "");
}

/** Search terms: the phrase's own words first, then the target's name, then related spellings. */
export function searchTerms(phrase, targetName = "") {
  const words = (text) =>
    String(text || "")
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .split(/[^a-z0-9_]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w))
      .map(stem);
  const primary = [...new Set(words(phrase))];
  const named = [...new Set(words(targetName))].filter((w) => !primary.includes(w));
  const related = [...new Set(primary.flatMap((w) => RELATED[w] || []))].filter((w) => !primary.includes(w) && !named.includes(w));
  return { primary, named, related };
}

function grepFiles(root, term) {
  try {
    const out = execFileSync("git", ["-C", root, "grep", "-l", "-i", "-I", "-F", "-e", term, "--", "."], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    return new Set(out.split("\n").filter(Boolean));
  } catch (error) {
    // Exit 1 means no match; anything else (not a repo) falls back to reading files.
    return error?.status === 1 ? new Set() : null;
  }
}

function contentHits(root, files, terms) {
  const hits = new Map(files.map((file) => [file, new Set()]));
  const viaGit = terms.map((term) => [term, grepFiles(root, term)]);
  if (viaGit.every(([, found]) => found)) {
    for (const [term, found] of viaGit) for (const file of found) hits.get(file)?.add(term);
    return hits;
  }
  for (const file of files.slice(0, 6000)) {
    let text = "";
    try {
      text = fs.readFileSync(path.join(root, file), "utf8").slice(0, 200000).toLowerCase();
    } catch {
      continue;
    }
    for (const term of terms) if (text.includes(term)) hits.get(file).add(term);
  }
  return hits;
}

/** Files ranked by how much of the request they cover, path matches first, tests last. */
export function rankFiles(root, terms, files = listFiles(root)) {
  const all = [...terms.primary, ...terms.named, ...terms.related];
  if (!terms.primary.length && !terms.named.length) return [];
  const sources = files.filter((file) => isScannable(file) && SOURCE.test(file));
  const inContent = contentHits(root, sources, all);
  const ranked = [];
  for (const file of sources) {
    const lower = file.toLowerCase();
    const inPath = new Set(all.filter((term) => lower.includes(term)));
    const found = new Set([...inPath, ...(inContent.get(file) || [])]);
    const primary = terms.primary.filter((t) => found.has(t)).length;
    if (!primary && !terms.named.some((t) => inPath.has(t))) continue;
    const score =
      primary * 10 +
      terms.named.filter((t) => found.has(t)).length * 3 +
      terms.related.filter((t) => found.has(t)).length * 2 +
      [...inPath].reduce((sum, t) => sum + (terms.primary.includes(t) ? 6 : 2), 0);
    ranked.push({ file, score: isTestFile(file) ? score * 0.3 : score, matched: [...found] });
  }
  return ranked.sort((a, b) => b.score - a.score || a.file.length - b.file.length || a.file.localeCompare(b.file));
}

/** The module docstring and declaration lines of one file, with line numbers. */
export function outline(root, file, maxLines = OUTLINE_LINES) {
  let lines;
  try {
    lines = fs.readFileSync(path.join(root, file), "utf8").split("\n");
  } catch {
    return "";
  }
  const head = [];
  for (let i = 0; i < Math.min(lines.length, 30); i += 1) {
    const line = lines[i];
    if (/^\s*(?:import|from|use|require|package|#include)\b/.test(line)) break;
    if (line.trim()) head.push(`${i + 1}: ${line.slice(0, 160)}`);
  }
  const decls = [];
  for (let i = 0; i < lines.length && decls.length < maxLines; i += 1) {
    if (DECLARATION.test(lines[i])) decls.push(`${i + 1}: ${lines[i].trimEnd().slice(0, 160)}`);
  }
  return [...head.slice(0, 12), ...decls].join("\n");
}

/**
 * Evidence block for the deepen prompt, or "" when nothing in the code matches.
 * Returns { text, files } so the caller can report what was read.
 */
export function codeEvidence(root, { phrase, target = null, budget = EVIDENCE_CHARS, files } = {}) {
  const terms = searchTerms(phrase, target?.name);
  const ranked = rankFiles(root, terms, files);
  if (!ranked.length) return { text: "", files: [], terms };
  const listed = ranked.slice(0, LISTED);
  const parts = [
    `search terms: ${[...terms.primary, ...terms.named].join(", ")}${terms.related.length ? ` (also ${terms.related.join(", ")})` : ""}`,
    `${ranked.length} matching files; the ${listed.length} that cover the most terms:`,
    ...listed.map((item) => `- ${item.file} [${item.matched.join(", ")}]`),
  ];
  let used = parts.join("\n").length;
  const outlined = [];
  for (const item of listed.slice(0, OUTLINED)) {
    const body = outline(root, item.file);
    if (!body) continue;
    const block = `\n--- ${item.file}\n${body}`;
    if (used + block.length > budget) break;
    parts.push(block);
    used += block.length;
    outlined.push(item.file);
  }
  return { text: parts.join("\n"), files: listed.map((item) => item.file), outlined, terms };
}
