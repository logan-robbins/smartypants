export function parseModelPayload(value) {
  if (value == null) {
    throw new Error("smartypants builder returned nothing");
  }
  if (typeof value === "object") {
    if (Array.isArray(value)) {
      const text = value.map((item) => collectText(item)).join("");
      if (text.trim()) return parseModelPayload(text);
    } else {
      if (value.structured_output) return parseModelPayload(value.structured_output);
      if (value.isDesign != null || value.diverges != null || value.verdict != null || Array.isArray(value.nodes) || Array.isArray(value.flags)) {
        return value;
      }
      if (value.finalOutput != null) return parseModelPayload(value.finalOutput);
      if (typeof value.output_text === "string") return parseModelPayload(value.output_text);
      if (typeof value.result === "string") return parseModelPayload(value.result);
      if (typeof value.content === "string") return parseModelPayload(value.content);
      if (Array.isArray(value.content)) return parseModelPayload(value.content.map((item) => collectText(item)).join(""));
      if (typeof value.text === "string") return parseModelPayload(value.text);
    }
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fenced ? fenced[1] : trimmed;
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));
  }
  throw new Error("smartypants builder returned no structured design");
}

export function collectText(item) {
  if (item == null) return "";
  if (typeof item === "string") return item;
  if (typeof item.text === "string") return item.text;
  if (typeof item.content === "string") return item.content;
  if (Array.isArray(item.content)) return item.content.map((part) => collectText(part)).join("");
  if (Array.isArray(item)) return item.map((part) => collectText(part)).join("");
  return "";
}
