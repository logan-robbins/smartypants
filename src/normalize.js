const EDIT_TOOLS = new Set([
  "write",
  "edit",
  "multiedit",
  "search_replace",
  "apply_patch",
  "notebookedit",
]);

function canonicalEvent(name) {
  const key = String(name || "")
    .replace(/[_-]/g, "")
    .toLowerCase();
  if (key === "userpromptsubmit" || key === "beforesubmitprompt") return "user";
  if (key === "posttooluse" || key === "afterfileedit") return "edit";
  return null;
}

function userText(payload) {
  if (typeof payload.prompt === "string") return payload.prompt;
  if (typeof payload.user_prompt === "string") return payload.user_prompt;
  if (typeof payload.userPrompt === "string") return payload.userPrompt;
  if (typeof payload.text === "string") return payload.text;
  if (typeof payload.message === "string") return payload.message;
  if (payload.message && typeof payload.message.content === "string") return payload.message.content;
  return "";
}

export function extractDelivered(input, toolName = "") {
  const source = input && typeof input === "object" ? input : {};
  const filePath = source.file_path || source.filePath || source.path || "";
  let contents = "";
  if (typeof source.content === "string") contents = source.content;
  else if (typeof source.contents === "string") contents = source.contents;
  else if (typeof source.new_string === "string") contents = source.new_string;
  else if (typeof source.newString === "string") contents = source.newString;
  else if (typeof source.newText === "string") contents = source.newText;

  let diff = null;
  const before = source.old_string ?? source.oldString ?? source.oldText;
  const after = source.new_string ?? source.newString ?? source.newText;
  if (typeof before === "string" && typeof after === "string") {
    diff = `--- ${filePath}\n+++ ${filePath}\n- ${before}\n+ ${after}`;
    if (!contents) contents = after;
  }
  if (Array.isArray(source.edits) && source.edits.length > 0) {
    const parts = source.edits.map((edit) => {
      const oldText = edit?.old_string ?? edit?.oldString ?? edit?.oldText ?? "";
      const newText = edit?.new_string ?? edit?.newString ?? edit?.newText ?? "";
      return `--- ${filePath}\n+++ ${filePath}\n- ${oldText}\n+ ${newText}`;
    });
    diff = parts.join("\n");
    if (!contents) {
      contents = source.edits
        .map((edit) => edit?.new_string ?? edit?.newString ?? edit?.newText ?? "")
        .join("\n");
    }
  }
  if (typeof source.diff === "string" && source.diff.trim()) diff = source.diff;
  return {
    type: "edit",
    path: String(filePath || ""),
    contents: String(contents || ""),
    diff: diff,
    toolName: String(toolName || ""),
  };
}

export function isEditTool(toolName) {
  return EDIT_TOOLS.has(String(toolName || "").toLowerCase());
}

export function normalizePayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.type === "user" && typeof payload.text === "string" && !payload.hook_event_name && !payload.hookEventName) {
    return { type: "user", text: payload.text };
  }
  if (payload.type === "edit" && !payload.hook_event_name && !payload.hookEventName) {
    return extractDelivered(payload, payload.toolName || payload.tool_name || "");
  }

  const kind = canonicalEvent(payload.hook_event_name || payload.hookEventName || payload.event || payload.type);
  if (kind === "user") return { type: "user", text: userText(payload) };
  if (kind === "edit") {
    const toolName = payload.tool_name || payload.toolName || payload.tool || "";
    if (toolName && !isEditTool(toolName)) return null;
    const delivered = extractDelivered(payload.tool_input || payload.toolInput || payload.input || {}, toolName);
    if (!delivered.path && !delivered.contents && !delivered.diff) return null;
    return delivered;
  }
  return null;
}

export function normalizeStdin(stdin) {
  if (stdin == null) return null;
  const text = String(stdin).replace(/^\uFEFF/, "").trim();
  if (!text) return null;
  try {
    return normalizePayload(JSON.parse(text));
  } catch {
    return null;
  }
}
