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
          parentId: { type: "string", description: "Containing node id. Empty for the system." },
          shape: {
            type: "string",
            enum: ["service", "store", "cache", "queue", "client", "gateway", "worker", "external"],
            description: "How the box is drawn. store/cache persist data, queue carries async messages, client is the caller outside the system.",
          },
          what: { type: "string" },
          why: { type: "string" },
          notes: {
            type: "array",
            items: { type: "string" },
            description: "Deep-dive facts for this node only when going deeper: data model, algorithm, scaling, failure handling. Terse, no prose. Empty otherwise.",
          },
        },
        required: ["id", "name", "kind", "grain", "parentId", "shape", "what", "why", "notes"],
      },
    },
    connections: {
      type: "array",
      description: "Directed messages between architecture boxes. A request and its reply or write-back are two connections. The way back points at the caller, toId is who receives that payload. parentId is containment, not an arrow.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          fromId: { type: "string" },
          toId: { type: "string" },
          kind: { type: "string", enum: ["data", "control", "dependency"] },
          label: { type: "string" },
        },
        required: ["id", "fromId", "toId", "kind", "label"],
      },
    },
    removeNodeIds: {
      type: "array",
      items: { type: "string" },
      description: "Ids of existing nodes the user removed or replaced. Empty unless the user changed the design.",
    },
    removeConnectionIds: {
      type: "array",
      items: { type: "string" },
      description: "Ids of existing connections that no longer hold.",
    },
    intent: {
      type: "array",
      items: { type: "string" },
      description: "IntentCode atoms learned this turn: '<K> <subject>[.<facet>] <value>' with K in G F N D X E Q. No grammar. Empty when nothing new.",
    },
  },
  required: ["isDesign", "nodes", "connections", "removeNodeIds", "removeConnectionIds", "intent"],
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
        required: ["nodeId", "intent", "difference"],
      },
    },
  },
  required: ["diverges", "nodeId", "intent", "difference", "flags"],
};
