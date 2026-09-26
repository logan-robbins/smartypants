/**
 * The design as Mermaid flowchart source, so a diagram can be pasted into a
 * doc, a PR, or mermaid.live. Components with modules become subgraphs.
 */

const SHAPES = {
  service: ["(", ")"],
  store: ["[(", ")]"],
  cache: ["[(", ")]"],
  queue: ["{{", "}}"],
  client: ["([", "])"],
  gateway: ["[/", "\\]"],
  worker: ["[[", "]]"],
  external: ["[/", "/]"],
};

function id(value) {
  return String(value || "node").replace(/[^A-Za-z0-9_]/g, "_");
}

function text(value) {
  return String(value || "").replace(/"/g, "#quot;").replace(/[\r\n]+/g, " ");
}

function box(node) {
  const [open, close] = SHAPES[node.shape] || SHAPES.service;
  return `${id(node.id)}${open}"${text(node.name)}"${close}`;
}

export function toMermaid(design, { direction = "LR" } = {}) {
  const nodes = design?.nodes || [];
  const lines = [`flowchart ${direction}`];
  const system = nodes.find((node) => node.kind === "system");
  const children = (parent) => nodes.filter((node) => node.parentId === parent);
  const indent = (depth) => "  ".repeat(depth);

  function emit(node, depth) {
    const kids = children(node.id);
    if (kids.length && node.kind !== "system") {
      lines.push(`${indent(depth)}subgraph ${id(node.id)}_group["${text(node.name)}"]`);
      lines.push(`${indent(depth + 1)}${box(node)}`);
      for (const kid of kids) emit(kid, depth + 1);
      lines.push(`${indent(depth)}end`);
      return;
    }
    lines.push(`${indent(depth)}${box(node)}`);
  }

  if (system) {
    lines.push(`  subgraph ${id(system.id)}_sys["${text(system.name)}"]`);
    for (const node of children(system.id)) emit(node, 2);
    lines.push("  end");
  }
  for (const node of nodes) {
    if (node.kind === "system" || nodes.some((other) => other.id === node.parentId)) continue;
    emit(node, 1);
  }
  for (const flow of design?.connections || []) {
    const arrow = flow.kind === "control" ? "-.->" : flow.kind === "dependency" ? "==>" : "-->";
    lines.push(`  ${id(flow.fromId)} ${arrow}|"${text(flow.label)}"| ${id(flow.toId)}`);
  }
  const drifted = nodes.filter((node) => node.flags?.length).map((node) => id(node.id));
  lines.push("  classDef drift fill:#fff0f0,stroke:#d33,stroke-width:2px");
  if (drifted.length) lines.push(`  class ${drifted.join(",")} drift`);
  for (const node of nodes) {
    if (node.kind === "system") continue;
    lines.push(`  click ${id(node.id)} callback "${text(node.what)}"`);
  }
  return `${lines.join("\n")}\n`;
}
