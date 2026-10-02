/**
 * Turn-end review. When the coding agent finishes a turn (Claude Code and
 * Codex `Stop`, Pi `agent_end`), look at what the turn actually changed in the
 * working tree — git status, new commits, untracked files — and review it once:
 *
 *   - quiet files (tests, docs, lockfiles) and unchanged files cost nothing;
 *   - one batched Jev-protocol call gives a verdict per changed file;
 *   - files that diverge go to one drift check together;
 *   - new boundaries and infrastructure changes (Helm, k8s, compose,
 *     Terraform, Dockerfiles) go to one design sync with a fresh infra map.
 *
 * `.smartypants/turn-state.json` keeps the content hash of every file already
 * reviewed, so each change is reviewed exactly once.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DESIGN_DIR } from "./model.js";
import { renderIntent } from "./intent.js";
import { editFeatures } from "./salience.js";
import { boundaries, isInfraFile, renderScan, scanProject } from "./scan.js";

export const TURN_STATE = "turn-state.json";
const MAX_FILES = 16;
const DIFF_CHARS = 3000;

function git(root, args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 * 1024 * 1024 });
  } catch {
    return null;
  }
}

function statePath(root) {
  return path.join(root, DESIGN_DIR, TURN_STATE);
}

export function loadTurnState(root) {
  try {
    return JSON.parse(fs.readFileSync(statePath(root), "utf8"));
  } catch {
    return { head: null, files: {} };
  }
}

function saveTurnState(root, state) {
  fs.mkdirSync(path.join(root, DESIGN_DIR), { recursive: true });
  fs.writeFileSync(statePath(root), `${JSON.stringify(state)}\n`);
}

function hashFile(root, file) {
  try {
    return crypto.createHash("sha1").update(fs.readFileSync(path.join(root, file))).digest("hex").slice(0, 16);
  } catch {
    return "deleted";
  }
}

/**
 * Files this turn touched: dirty or untracked now, or changed by commits made
 * since the last review, whose content differs from what was last reviewed.
 */
export function turnChanges(root) {
  const status = git(root, ["status", "--porcelain=v1", "-uall", "--no-renames"]);
  if (status == null) return { git: false, files: [], head: null };
  const head = (git(root, ["rev-parse", "HEAD"]) || "").trim() || null;
  const state = loadTurnState(root);
  const candidates = new Set(
    status.split("\n").filter(Boolean).map((line) => line.slice(3).trim().replace(/^"|"$/g, "")),
  );
  if (state.head && head && state.head !== head) {
    for (const file of (git(root, ["diff", "--name-only", `${state.head}..${head}`]) || "").split("\n").filter(Boolean)) candidates.add(file);
  }
  for (const file of Object.keys(state.files || {})) candidates.add(file);
  const files = [];
  const hashes = {};
  for (const file of candidates) {
    if (file.startsWith(`${DESIGN_DIR}/`) || file === "smartypants.config.json") continue;
    const hash = hashFile(root, file);
    hashes[file] = hash;
    if (state.files?.[file] === hash) continue;
    if (!state.files?.[file] && hash === "deleted") continue;
    files.push({ path: file, hash, status: hash === "deleted" ? "deleted" : state.files?.[file] ? "changed" : "new" });
  }
  return { git: true, files, head, hashes, previousHead: state.head };
}

export function recordReviewed(root, changes) {
  const state = loadTurnState(root);
  const files = { ...(state.files || {}) };
  for (const [file, hash] of Object.entries(changes.hashes || {})) {
    if (hash === "deleted") delete files[file];
    else files[file] = hash;
  }
  // Clean files drop out of the ledger once committed and unchanged.
  const dirty = new Set((git(root, ["status", "--porcelain=v1", "-uall", "--no-renames"]) || "").split("\n").filter(Boolean).map((l) => l.slice(3).trim()));
  for (const file of Object.keys(files)) if (!dirty.has(file)) delete files[file];
  saveTurnState(root, { head: changes.head, files, at: new Date().toISOString() });
}

export function fileDiff(root, change, previousHead) {
  if (change.status === "deleted") return `deleted ${change.path}`;
  let diff = git(root, ["diff", "--no-color", "-U2", "HEAD", "--", change.path]) || "";
  if (!diff && previousHead) diff = git(root, ["diff", "--no-color", "-U2", previousHead, "--", change.path]) || "";
  if (!diff) {
    try {
      diff = fs.readFileSync(path.join(root, change.path), "utf8");
    } catch {
      diff = "";
    }
  }
  return diff.slice(0, DIFF_CHARS);
}

const VERDICT = [
  { value: "conforms", label: "does what the recorded design and intent say, or is plumbing inside one part" },
  { value: "diverges", label: "contradicts a recorded decision, constraint, flow, boundary, or node purpose" },
  { value: "new-boundary", label: "adds or removes a durable part, store, flow, or network boundary the design does not show" },
  { value: "not-architectural", label: "tests, docs, formatting, or small internals with no architectural effect" },
];

/**
 * Review one turn. Returns { reviewed, verdicts, drift: [changes], sync: bool, infra: [files] }.
 * The pipeline runs the builder calls this decides on.
 */
export async function reviewTurn({ root, design, intent, chooser }) {
  const changes = turnChanges(root);
  if (!changes.git) return { reviewed: [], verdicts: {}, drift: [], sync: false, infra: [], changes, reason: "not-a-git-repo" };
  const loud = [];
  const infra = [];
  for (const change of changes.files) {
    if (isInfraFile(change.path)) infra.push(change);
    else if (!editFeatures({ path: change.path, contents: "x".repeat(40) }, design).quiet) loud.push(change);
  }
  const reviewed = loud.slice(0, MAX_FILES);
  const verdicts = {};
  if (reviewed.length && design.nodes.length) {
    const questions = {};
    reviewed.forEach((change, i) => {
      change.diff = fileDiff(root, change, changes.previousHead);
      const f = editFeatures({ path: change.path, contents: change.diff }, design);
      change.owners = f.owners;
      questions[`f${i}`] = {
        question: `Compared with the recorded design and intent, what does the change to ${change.path} do?`,
        options: VERDICT,
        fallback: f.owners.length || f.arch.length ? { value: "diverges", confidence: 0.3 } : { value: "not-architectural", confidence: 0.5 },
      };
    });
    const state = {
      parts: design.nodes.map((node) => `${node.id}:${node.name}`).join(", ").slice(0, 1500),
      intent: renderIntent(intent).slice(0, 1500),
      files: reviewed.map((change, i) => `f${i} ${change.status} ${change.path}\n${change.diff.slice(0, 1500)}`).join("\n\n").slice(0, 60000),
    };
    const { answers } = await chooser.choose(state, questions);
    reviewed.forEach((change, i) => { verdicts[change.path] = answers[`f${i}`]; });
  }
  const drift = reviewed.filter((change) => {
    const verdict = verdicts[change.path];
    if (!verdict) return false;
    if (verdict.value === "diverges") return true;
    return (verdict.value === "conforms" || verdict.value === "not-architectural") && verdict.confidence < 0.5;
  });
  const grown = reviewed.filter((change) => verdicts[change.path]?.value === "new-boundary");
  return {
    reviewed,
    verdicts,
    drift,
    grown,
    infra,
    sync: infra.length > 0 || grown.length > 0 || (!design.nodes.length && reviewed.length > 0),
    changes,
  };
}

/** Evidence for a design sync: the infra map plus the new-boundary diffs. */
export function syncEvidence(root, review) {
  const scan = scanProject(root);
  const lines = [
    `Code changed this turn: ${review.changes.files.map((c) => `${c.status} ${c.path}`).join(", ")}`,
    "Update the architecture only where the code or infrastructure adds, removes, or re-bounds a durable part or flow.",
    "",
    renderScan(scan, 9000),
  ];
  for (const change of review.grown || []) lines.push("", `--- ${change.path}`, change.diff || "");
  return { text: lines.join("\n"), boundaries: boundaries(scan) };
}

/** One combined delivered diff for the drift checker. */
export function driftEvidence(review) {
  return review.drift.map((change) => `--- ${change.path} (${change.status})\n${change.diff || ""}`).join("\n\n").slice(0, 24000);
}
