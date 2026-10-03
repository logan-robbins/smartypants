import { claudeJson } from "../claude.js";
import { buildFlavorRequest } from "../prompts.js";
import { parseModelPayload } from "../parse.js";

const SDK = {
  package: "claude-code-cli",
  api: "claude -p",
};

/** Reasoning is a dial: spend it where a wrong answer costs a redraw. */
export const EFFORT_BY_KIND = { design: "medium", deepen: "medium", drift: "low", seed: "medium" };

export function buildRequest(input) {
  return buildFlavorRequest({
    ...input,
    flavor: "claude",
    sdk: SDK,
    // No model pins Claude Code's default for this sign-in; config.model overrides it.
    model: input.model ?? input.config?.model ?? null,
    reasoningEffort: input.reasoningEffort ?? input.config?.reasoningEffort ?? null,
  });
}

export async function invoke(request) {
  const result = await claudeJson({
    system: request.instructions,
    user: request.prompt,
    schema: request.schema,
    model: request.model || process.env.SMARTYPANTS_CLAUDE_MODEL || null,
    effort: request.reasoningEffort || EFFORT_BY_KIND[request.kind] || (request.kind?.startsWith("catchup") ? "medium" : "low"),
    cwd: request.cwd || process.cwd(),
  });
  request.usage = { ...result.usage, cost: result.cost, elapsedMs: result.elapsedMs, model: result.model };
  return parseModelPayload(result.json);
}
