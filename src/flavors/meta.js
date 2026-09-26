import { META_MODEL, metaJson } from "../meta.js";
import { buildFlavorRequest } from "../prompts.js";
import { parseModelPayload } from "../parse.js";

const SDK = {
  package: "meta-model-api",
  api: "meta.chat.completions",
  baseURL: "https://api.meta.ai/v1",
  model: META_MODEL,
};

/** Reasoning is a dial: spend it where a wrong answer costs a redraw. */
export const EFFORT_BY_KIND = { design: "low", deepen: "low", drift: "minimal", seed: "medium" };

export function buildRequest(input) {
  const model = input.model ?? input.config?.model ?? META_MODEL;
  return buildFlavorRequest({
    ...input,
    flavor: "meta",
    sdk: { ...SDK, model },
    model,
    reasoningEffort: input.reasoningEffort ?? input.config?.reasoningEffort ?? null,
  });
}

export async function invoke(request) {
  const result = await metaJson({
    system: request.instructions,
    user: request.prompt,
    schema: request.schema,
    name: request.kind === "drift" ? "smartypants_drift" : "smartypants_design",
    model: request.model || META_MODEL,
    effort: request.reasoningEffort || EFFORT_BY_KIND[request.kind] || "low",
    maxTokens: 12000,
  });
  request.usage = { ...result.usage, cost: result.cost, elapsedMs: result.elapsedMs, model: result.model };
  return parseModelPayload(result.json);
}
