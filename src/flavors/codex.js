import { buildFlavorRequest } from "../prompts.js";
import { parseModelPayload } from "../parse.js";

const SDK = {
  package: "@openai/agents",
  api: "run",
};

export function buildRequest(input) {
  return buildFlavorRequest({
    ...input,
    flavor: "codex",
    sdk: SDK,
    model: input.model ?? input.config?.model ?? null,
  });
}

export async function invoke(request) {
  const { Agent, run } = await import("@openai/agents");
  const agent = new Agent({
    name: "Smartypants",
    instructions: request.instructions,
    model: request.model || "gpt-4.1",
  });
  const result = await run(agent, request.prompt, { maxTurns: 1 });
  return parseModelPayload(result?.finalOutput ?? result);
}
