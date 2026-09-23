export const DESIGN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    isDesign: {
      type: "boolean",
      description: "False when the user is not talking about system or application design.",
    },
    nodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          kind: { type: "string", enum: ["system", "component", "module"] },
          grain: {
            type: "string",
            enum: ["system", "component", "module", "file", "class", "function", "endpoint", "type"],
          },
          parentId: { type: "string" },
          what: { type: "string" },
          why: { type: "string" },
        },
        required: ["id", "name", "kind", "grain", "what", "why"],
      },
    },
  },
  required: ["isDesign", "nodes"],
};

export const DRIFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    diverges: { type: "boolean" },
    nodeId: { type: "string", description: "Id of the node the code belongs to. Empty when unmapped." },
    intent: { type: "string" },
    difference: { type: "string" },
    flags: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          nodeId: { type: "string" },
          intent: { type: "string" },
          difference: { type: "string" },
        },
        required: ["intent", "difference"],
      },
    },
  },
  required: ["diverges", "intent", "difference"],
};
