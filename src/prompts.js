import { DRIFT_SCHEMA, DESIGN_SCHEMA } from "./schema.js";
import { TAXONOMY } from "./taxonomy.js";

function floorRules(floor) {
  return [
    `Depth floor for this request: ${floor}.`,
    "system shows only the system.",
    "component shows the system and its components.",
    "module shows system, then component, then module.",
    "Do not emit a node finer than the floor.",
    "A file, a class, a function, or an endpoint is not a node.",
    "A type is not a node.",
  ].join(" ");
}

export function designInstructions(floor, taxonomy = TAXONOMY) {
  return [
    "You are the smartypants design builder.",
    "Decide whether the user is talking about the design of a system or application.",
    "When they are not, return isDesign false and an empty nodes array.",
    "When they are, describe the design at the depth floor below.",
    taxonomy,
    floorRules(floor),
    "Each node needs a short what and a short why, in simple words this project would actually use.",
    "what says what that part does. why says why that part exists here. They are both required, and they are not the same sentence.",
    "A component belongs to one system. A module belongs to exactly one component.",
    "Set grain to the same value as kind for a real node. If you notice something is only a file, class, function, endpoint, or type, set grain to that and it will be dropped.",
    "Keep ids stable across turns. Return JSON only, matching the schema.",
  ].join("\n");
}

export function seedInstructions(floor, taxonomy = TAXONOMY) {
  return [
    "You are the smartypants design builder, seeding a diagram for a project that already exists.",
    "The path sketch names files that are already in the tree. Draw the system those paths add up to.",
    "This is the baseline. The user message, when it has one, is a delta on top of that baseline.",
    "When they are not changing the design, still return the baseline with isDesign true.",
    taxonomy,
    floorRules(floor),
    "Each node needs a short what and a short why, in simple words this project would actually use.",
    "what says what that part does. why says why that part exists here. They are both required, and they are not the same sentence.",
    "A component belongs to one system. A module belongs to exactly one component.",
    "Set grain to the same value as kind for a real node. If you notice something is only a file, class, function, endpoint, or type, set grain to that and it will be dropped.",
    "Keep ids stable across turns. Return JSON only, matching the schema.",
  ].join("\n");
}

export function driftInstructions(floor, taxonomy = TAXONOMY) {
  return [
    "You are the smartypants drift checker.",
    "Compare the delivered code with the recorded intent of the design nodes.",
    "Intent lives in each node's what and why.",
    taxonomy,
    floorRules(floor),
    "When the code does what the node says, return diverges false and leave intent and difference empty.",
    "When the code diverges, set diverges true. Name the node in nodeId. intent restates what the user wanted, in this project's words. difference says how the delivered code departs from that.",
    "When the code diverges and no node owns it, still set diverges true, leave nodeId empty, and fill intent and difference. Do not drop an unmapped divergence.",
    "Repeat flags are fine; the recorder keeps one copy.",
    "Return JSON only, matching the schema.",
  ].join("\n");
}

export function buildFlavorRequest({
  flavor,
  sdk,
  floor,
  taxonomy,
  event,
  design,
  model,
  cwd,
  seed = false,
  sketch = "",
  ledger = [],
}) {
  const kind = seed ? "seed" : event.type === "edit" ? "drift" : "design";
  const instructions =
    kind === "drift"
      ? driftInstructions(floor, taxonomy)
      : kind === "seed"
        ? seedInstructions(floor, taxonomy)
        : designInstructions(floor, taxonomy);
  const current = JSON.stringify(design ?? { nodes: [] });
  const memory = Array.isArray(ledger) && ledger.length > 0 ? ledger.filter(Boolean).join("\n") : "";
  const prompt = [
    instructions,
    "",
    "Current design JSON:",
    current,
    "",
    memory ? `Memory gists:\n${memory}` : "Memory gists:",
    "",
    kind === "seed" ? `Path sketch:\n${sketch || ""}` : "",
    kind === "seed" && event.type === "edit" ? `Delivered file path:\n${event.path || ""}` : "",
    kind === "seed" && event.type === "edit" ? `Delivered contents:\n${event.contents || ""}` : "",
    kind === "drift" ? `Delivered file path:\n${event.path || ""}` : "",
    kind === "drift" ? `Delivered contents:\n${event.contents || ""}` : "",
    kind === "drift" ? `Delivered diff:\n${event.diff || ""}` : "",
    kind === "seed" ? `User message:\n${event.text || ""}` : "",
    kind === "design" ? `User message:\n${event.text || ""}` : "",
  ]
    .filter((part) => part !== "")
    .join("\n");

  return {
    flavor,
    kind,
    seed: Boolean(seed),
    floor,
    taxonomy,
    instructions,
    prompt,
    sketch: sketch || "",
    ledger: Array.isArray(ledger) ? ledger.filter(Boolean) : [],
    schema: kind === "drift" ? DRIFT_SCHEMA : DESIGN_SCHEMA,
    model: model || null,
    cwd: cwd || null,
    delivered:
      kind === "drift"
        ? {
            path: event.path || "",
            contents: event.contents || "",
            diff: event.diff || null,
          }
        : null,
    sdk: { ...sdk, flavor },
  };
}
