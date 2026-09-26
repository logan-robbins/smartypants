/**
 * Zero-cost local signals. Every turn passes through here before any model
 * call; obvious noise stops here, and the rest become features for the
 * selector (Jev, Meta, or the heuristic fallback).
 */
import { slug } from "./taxonomy.js";

const ARCH_TERMS = `service services server api gateway proxy load balancer lb cdn edge cache caches redis memcached
  queue queues kafka pubsub pub/sub stream streams topic broker sqs kinesis flink spark worker workers cron scheduler
  database db store storage table tables index indexes sql nosql cassandra dynamo dynamodb postgres mysql mongo s3 blob
  bucket shard shards sharding partition partitions replica replicas replication consistency consistent eventual quorum
  leader follower consensus raft paxos lock idempotent idempotency retry retries backpressure rate limiter limit throttle
  fanout fan-out push pull poll polling websocket websockets sse grpc rest graphql rpc webhook
  component components module modules system boundary layer tier microservice monolith backend frontend client mobile
  auth authentication authorization session token tokens oauth search ranking feed timeline notification notifications
  aggregator aggregation counter counters presence heartbeat subscribe subscriber publish publisher producer consumer registry router routing top-k topk heavy hitters sketch count-min hyperloglog bloom trie geohash quadtree
  h3 matching dispatch location tracking pipeline etl batch realtime real-time ingestion analytics metrics logging
  latency throughput qps rps tps p99 p95 sla slo availability durability scale scalability dau mau traffic storage
  read write reads writes hot path cold path flow flows data model schema`
  .split(/\s+/)
  .filter(Boolean);
const ARCH = new Set(ARCH_TERMS);

const INTERNALS = /\b(schema|table|column|primary key|shard key|partition key|index(?:es)?|ttl|eviction|lru|heap|min-heap|count-min|hyperloglog|bloom|algorithm|data structure|consistent hash(?:ing)?|geohash|quadtree|h3|window(?:ing)?|watermark|compaction|write-ahead|wal|b-tree|lsm|internals?|deep dive|in detail|detailed)\b/gi;
const OVERVIEW = /\b(high[- ]level|overview|big picture|hld|end[- ]to[- ]end|architecture of|components?)\b/i;
const SYSTEM_ONLY = /\b(one[- ]liner|elevator pitch|just the system|at a glance)\b/i;
const NUMBER_UNIT = /\b\d+(?:\.\d+)?\s*(?:k|m|b|bn|ms|s|sec|min|qps|rps|tps|tb|gb|pb|mb|%|x|dau|mau|users|requests|events|writes|reads|per second|\/s)\b/gi;
const DECISION = /\b(use|using|choose|chose|pick|prefer|instead of|rather than|replace|switch(?:ed)? to|drop|remove|add|move)\b/i;
const REQUIREMENT = /\b(must|should|never|always|need(?:s)? to|require[sd]?|guarantee)\b/i;
const METRIC = new Set("latency throughput qps rps tps p99 p95 sla slo availability durability scale scalability dau mau traffic storage read write reads writes realtime real-time".split(" "));
const DESIGN_VERB = /\b(design|build|architect|sketch|whiteboard)\b/i;
const DRIFT_REPORT = /\b(drift(?:ed)?|diverge[sd]?|not what (?:i|we) (?:asked|wanted|meant)|strayed|went off|that's wrong|doesn't match|violat(?:es|ed))\b/i;

const NOISE = [
  /^(?:hi|hey|hello|yo|thanks?|thank you|thx|ok(?:ay)?|k|cool|nice|great|lgtm|sgtm|yes|yep|no|nope|sure|done|continue|go on|go ahead|proceed|keep going|next|retry|try again|stop|wait)[\s.!?]*$/i,
  /^(?:run|rerun|re-run|execute) (?:the )?(?:tests?|lint(?:er)?|build|suite|formatter)\b/i,
  /^(?:fix|resolve) (?:the )?(?:lint|typo|typos|formatting|tests?|build|ci|imports?)\b/i,
  /^(?:commit|push|rebase|merge|format|prettier|git )\b/i,
  /\bnpx smartypants\b/i,
];

const ACK_START = /^(?:hi|hey|hello|yo|thanks?|thank you|thx|ok(?:ay)?|cool|nice|great|perfect|awesome|sounds good|looks (?:good|right|great)|lgtm|sgtm|yes|yep|yeah|sure|got it|makes sense|alright|right)\b/i;

const DEEPER = /^(?:(?:please\s+)?(?:go|dig|drill|zoom)\s+(?:deeper|down|in)\s+(?:on|into|in)\s+|(?:please\s+)?(?:zoom|dig|drill)\s+(?:into|in on)\s+|(?:please\s+)?(?:deep[- ]dive|expand|explode)\s+(?:on|into)?\s*|(?:let'?s\s+)?go deeper on\s+|tell me more about\s+|more detail on\s+)(.+?)[\s.!?]*$/i;

/** Parse "go deeper on ___" and friends. Returns the target phrase or null. */
export function parseDeeper(text) {
  const value = String(text || "").trim();
  const match = value.match(DEEPER);
  if (!match) return null;
  const target = match[1].replace(/^(?:the|a|an)\s+/i, "").replace(/\s+(?:please|pls|now|for me)$/i, "").replace(/["'`]/g, "").trim();
  return target || null;
}

/** Best node for a free-text target. Score in [0,1]; ambiguity when two score alike. */
export function matchNode(nodes, phrase) {
  const want = slug(phrase);
  const wantWords = new Set(want.split("-").filter((w) => w.length > 1));
  const scored = (nodes || []).map((node) => {
    const id = slug(node.id);
    const name = slug(node.name);
    if (want === id || want === name) return { node, score: 1 };
    const words = new Set([...name.split("-"), ...id.split("-")].filter((w) => w.length > 1));
    let overlap = 0;
    for (const word of wantWords) if (words.has(word) || words.has(word.replace(/s$/, ""))) overlap += 1;
    const score = wantWords.size ? overlap / Math.max(wantWords.size, words.size) : 0;
    const contains = name.includes(want) || want.includes(name) ? 0.6 : 0;
    return { node, score: Math.max(score, contains) };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 0.34) return { node: null, score: 0, ambiguous: false, ranked: scored };
  const ambiguous = scored.length > 1 && scored[1].score >= best.score - 0.05 && best.score < 1;
  return { node: best.node, score: best.score, ambiguous, ranked: scored };
}

function words(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9/+\-\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Features of a user turn. `score` counts architecture evidence; 0 with a
 * noise pattern means nothing durable to remember.
 */
export function turnFeatures(text, design = { nodes: [] }) {
  const value = String(text || "").trim();
  const tokens = words(value);
  const archHits = new Set(tokens.map((t) => (ARCH.has(t) ? t : ARCH.has(t.replace(/e?s$/, "")) ? t.replace(/e?s$/, "") : null)).filter(Boolean));
  const nodeHits = (design.nodes || []).filter((node) => {
    const name = String(node.name || "").toLowerCase();
    return name.length > 2 && value.toLowerCase().includes(name);
  });
  const numbers = value.match(NUMBER_UNIT) || [];
  const internals = new Set((value.match(INTERNALS) || []).map((m) => m.toLowerCase()));
  const deeper = parseDeeper(value);
  const pleasantry = ACK_START.test(value) && tokens.length <= 12 && ![...archHits].some((t) => !["test", "tests"].includes(t)) && !(value.match(NUMBER_UNIT) || []).length;
  const noise = !deeper && (NOISE.some((re) => re.test(value)) || pleasantry);
  const slash = value.startsWith("/") && !deeper;
  const score =
    archHits.size + nodeHits.length * 2 + numbers.length * 2 + internals.size + (DECISION.test(value) || REQUIREMENT.test(value) ? 1 : 0);
  return {
    length: tokens.length,
    arch: [...archHits],
    nodes: nodeHits.map((node) => node.id),
    numbers,
    internals: [...internals],
    decision: DECISION.test(value),
    requirement: REQUIREMENT.test(value),
    structural: [...archHits].filter((t) => !METRIC.has(t)).length,
    designVerb: DESIGN_VERB.test(value),
    driftReport: DRIFT_REPORT.test(value),
    overview: OVERVIEW.test(value),
    systemOnly: SYSTEM_ONLY.test(value),
    deeper,
    noise: noise || slash || tokens.length === 0,
    score,
  };
}

/** Starting level for an empty diagram, from what the user actually said. */
export function suggestLevel(features) {
  if (features.systemOnly) return "system";
  if (features.internals.length >= 2) return "module";
  if (features.overview || features.arch.length >= 3 || features.numbers.length > 0) return "component";
  if (features.arch.length === 0 && features.length < 12) return "system";
  return "component";
}

const QUIET_PATH = /(?:^|\/)(?:test|tests|__tests__|spec|specs|docs?|examples?|fixtures?|\.smartypants|\.github|node_modules|dist|build|coverage)(?:\/|$)|\.(?:test|spec)\.[a-z]+$|_test\.[a-z]+$|(?:^|\/)test_[^/]+\.py$|(?:^|\/)(?:readme|changelog|license|contributing)[^/]*$|\.(?:md|txt|lock|snap|png|jpe?g|gif|svg|ico)$|(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.gitignore|\.prettierrc.*|\.eslintrc.*|tsconfig.*\.json)$/i;

/** Features of a delivered edit. `quiet` edits cannot move architecture. */
export function editFeatures(event, design = { nodes: [] }) {
  const file = String(event?.path || "").replace(/\\/g, "/");
  const changed = String(event?.diff || event?.contents || "");
  const meaningful = changed.replace(/\s+/g, "").length;
  const pathWords = new Set(slug(file.replace(/\.[a-z0-9]+$/i, "")).split("-").filter((w) => w.length > 2));
  const owners = (design.nodes || [])
    .map((node) => {
      const nameWords = slug(node.name).split("-").filter((w) => w.length > 2);
      const hits = nameWords.filter((w) => pathWords.has(w) || pathWords.has(`${w}s`) || pathWords.has(w.replace(/s$/, ""))).length;
      return { id: node.id, hits };
    })
    .filter((item) => item.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map((item) => item.id);
  const archHits = words(changed).filter((t) => ARCH.has(t));
  return {
    path: file,
    quiet: QUIET_PATH.test(file) || meaningful < 12,
    owners,
    arch: [...new Set(archHits)].slice(0, 12),
    size: meaningful,
  };
}
