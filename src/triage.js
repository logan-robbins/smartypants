/**
 * Triage: decide, as cheaply as possible, what a turn is worth.
 *
 *   stage 0  local features (free): commands, obvious noise, quiet edits
 *   stage 1  one Jev-protocol selector call with every question batched
 *   stage 2  the builder, only when stage 1 says the design changes
 *
 * Answers the four questions the pipeline needs:
 *   - is this worth remembering (architecture signal vs noise)?
 *   - does it change the design (none, annotate, extend, restructure)?
 *   - at what level should an empty diagram start?
 *   - for an edit: does the code conform to intent or drift from it?
 */
import { heuristicAtoms, renderIntent } from "./intent.js";
import { editFeatures, matchNode, suggestLevel, turnFeatures } from "./salience.js";

export const SKIP_CONFIDENCE = 0.6;

const SIGNAL = [
  { value: "arch", label: "introduces or changes a durable part, store, boundary, or flow of the system" },
  { value: "constraint", label: "states a requirement or constraint: scale, latency, consistency, cost, availability, a technology choice" },
  { value: "detail", label: "adds internals of an existing part: data model, algorithm, partitioning, failure handling" },
  { value: "drift", label: "says the implementation departed from what the user intended" },
  { value: "noise", label: "nothing durable: chit-chat, task logistics, tooling, tests, formatting, run or fix commands" },
];

const IMPACT = [
  { value: "none", label: "diagram and recorded intent stay exactly the same" },
  { value: "annotate", label: "records a constraint or decision; no box or arrow changes" },
  { value: "extend", label: "adds boxes, arrows, or detail to the diagram" },
  { value: "restructure", label: "replaces, removes, or moves existing boxes, or reverses an earlier decision" },
];

const LEVEL = [
  { value: "system", label: "only a product name or one-line idea; nothing about its parts" },
  { value: "component", label: "names major parts, requirements, or scale; a high-level design" },
  { value: "module", label: "already discusses internals: schemas, algorithms, partitioning inside parts" },
];

const VERDICT = [
  { value: "conforms", label: "the code does what the intended design says, or is plumbing inside one part" },
  { value: "diverges", label: "the code contradicts a recorded decision, constraint, flow, or node purpose" },
  { value: "new-boundary", label: "the code creates a durable part, store, or flow the design does not have" },
  { value: "not-architectural", label: "tests, docs, config, formatting, or small internals with no architectural effect" },
];

/**
 * Selector state is deliberately small: the turn, the part names, and the head
 * of the intent memory. A choice among five labels does not need the graph.
 */
function state(text, design, intent, extra = {}) {
  return {
    turn: String(text || "").slice(0, 3000),
    parts: (design?.nodes || []).map((node) => `${node.id}:${node.name}`).join(", ").slice(0, 1500),
    intent: renderIntent(intent).slice(0, 600),
    ...extra,
  };
}

function signalFallback(f) {
  if (f.noise || f.score === 0) return { value: "noise", confidence: f.noise ? 0.9 : 0.4 };
  if (f.driftReport) return { value: "drift", confidence: 0.5 };
  if (f.internals.length && f.nodes.length) return { value: "detail", confidence: 0.5 };
  if (f.numbers.length && f.arch.length < 2) return { value: "constraint", confidence: 0.5 };
  return { value: "arch", confidence: f.score >= 3 ? 0.6 : 0.3 };
}

function impactFallback(f, signal) {
  if (signal === "noise") return { value: "none", confidence: 0.4 };
  if (signal === "constraint") return { value: "annotate", confidence: 0.4 };
  return { value: "extend", confidence: 0.4 };
}

/** Triage a user turn. Returns { action, reason, via, level, target, features, answers }. */
export async function triageTurn({ text, design, intent, chooser, auto = false }) {
  const f = turnFeatures(text, design);
  const nodes = design?.nodes || [];
  const base = { features: f, via: "local", answers: {} };

  if (f.deeper && nodes.length) {
    const match = matchNode(nodes, f.deeper);
    if (match.node && !match.ambiguous) return { ...base, action: "deepen", reason: "command", target: match.node.id };
    const candidates = (match.ranked || []).slice(0, 40).map((item) => item.node);
    const options = [...candidates.map((node) => ({ value: node.id, label: `${node.name}: ${node.what}` })), { value: "__none__", label: "none of these; a part not yet on the diagram" }];
    const { answers, via } = await chooser.choose(state(text, design, intent), {
      target: { question: `Which diagram part does "${f.deeper}" refer to?`, options, fallback: { value: match.node?.id || "__none__", confidence: match.score } },
    });
    if (answers.target.value !== "__none__") return { ...base, via, answers, action: "deepen", reason: "command", target: answers.target.value };
    // A part not drawn yet: expand its most likely owner, focused on the phrase.
    const owner = match.node || nodes.find((node) => node.kind === "system") || nodes[0];
    return { ...base, via, answers, action: "deepen", reason: "deeper-on-new-part", target: owner.id };
  }

  if (f.noise) return { ...base, action: "skip", reason: "noise-pattern" };

  // Decisive local evidence needs no selector call.
  if (!nodes.length && !f.driftReport && (f.score >= 3 || (f.designVerb && f.score >= 1))) {
    return { ...base, action: "design", reason: "first-design", level: auto ? suggestLevel(f) : null };
  }
  if (nodes.length && f.structural >= 3 && f.score >= 6 && !f.driftReport) {
    return { ...base, action: "design", reason: "strong-arch", level: auto ? suggestLevel(f) : null };
  }
  const localAtoms = nodes.length && f.structural <= 2 && !f.internals.length && !f.decision ? heuristicAtoms(text, design) : [];
  if (localAtoms.some((atom) => atom.startsWith("N "))) {
    return { ...base, action: "remember", reason: "numeric-constraint", level: null };
  }

  const questions = {
    signal: { question: "What kind of information does this turn carry for the system's architecture?", options: SIGNAL, fallback: signalFallback(f) },
    impact: { question: "If applied, how would this turn change the architecture diagram and its recorded intent?", options: IMPACT, fallback: impactFallback(f, signalFallback(f).value) },
  };
  if (!nodes.length) {
    questions.level = { question: "How much has the user said about the system so far? Pick the level a first diagram should start at.", options: LEVEL, fallback: { value: suggestLevel(f), confidence: 0.5 } };
  }
  const { answers, via } = await chooser.choose(state(text, design, intent), questions);
  const signal = answers.signal;
  const impact = answers.impact;
  const level = auto ? (!nodes.length ? answers.level?.value || suggestLevel(f) : suggestLevel(f)) : null;
  const decided = { ...base, via, answers, level };

  // Only skip when the selector is sure; an unsure "noise" still gets built.
  const sure = (a) => via !== "heuristic" ? a.confidence >= SKIP_CONFIDENCE : a.confidence >= 0.85;
  if (signal.value === "noise" && sure(signal)) return { ...decided, action: "skip", reason: "noise" };
  // "No impact" alone never skips a turn with clear local architecture signal,
  // and nothing skips the first design turn.
  if (impact.value === "none" && sure(impact) && nodes.length && f.score < 2) return { ...decided, action: "skip", reason: "no-impact" };
  if (via === "heuristic" && signal.value === "noise" && f.score === 0 && f.length < 6 && nodes.length) {
    return { ...decided, action: "skip", reason: "no-signal" };
  }
  if (impact.value === "annotate" && nodes.length) return { ...decided, action: "remember", reason: signal.value };
  return { ...decided, action: "design", reason: `${signal.value}/${impact.value}` };
}

/** Triage a delivered edit. Returns { action: skip|drift, reason, owners, via }. */
export async function triageEdit({ event, design, intent, chooser }) {
  const nodes = design?.nodes || [];
  if (!nodes.length) return { action: "skip", reason: "no-design", owners: [], via: "local" };
  const f = editFeatures(event, design);
  if (f.quiet) return { action: "skip", reason: "quiet-path", owners: f.owners, via: "local", features: f };
  const fallback = f.owners.length || f.arch.length
    ? { value: "diverges", confidence: 0.3 }
    : { value: "not-architectural", confidence: 0.5 };
  const owned = new Set(f.owners);
  const { answers, via } = await chooser.choose(
    state(`${f.path}\n${String(event.diff || event.contents || "").slice(0, 6000)}`, design, intent, {
      owners: (design.nodes || []).filter((node) => owned.has(node.id)).map((node) => `${node.name}: ${node.what} / ${node.why}`),
      intent: renderIntent(intent).slice(0, 1500),
    }),
    { verdict: { question: "Compared with the recorded design and intent, what does this delivered code do?", options: VERDICT, fallback } },
  );
  const verdict = answers.verdict;
  const quietVerdict = verdict.value === "conforms" || verdict.value === "not-architectural";
  if (quietVerdict && (via !== "heuristic" ? verdict.confidence >= SKIP_CONFIDENCE : verdict.confidence >= 0.5)) {
    return { action: "skip", reason: verdict.value, owners: f.owners, via, answers, features: f };
  }
  return { action: "drift", reason: verdict.value, owners: f.owners, via, answers, features: f };
}
