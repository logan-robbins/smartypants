import { buildFlavorRequest } from "../prompts.js";
import { parseModelPayload } from "../parse.js";

const SDK = {
  package: "@anthropic-ai/claude-agent-sdk",
  api: "query",
};

export function buildRequest(input) {
  return buildFlavorRequest({
    ...input,
    flavor: "claude",
    sdk: SDK,
    model: input.model ?? input.config?.model ?? null,
  });
}

/**
 * One structured answer, no tools, and no permission prompt.
 * `dontAsk` denies anything that would otherwise ask. `tools: []` is the tool
 * list, so a nested turn cannot fall through to the Claude Code tool preset.
 * `bypassPermissions` is intentionally absent: that mode exits unless
 * `allowDangerouslySkipPermissions` is set, and an empty allow-list does not
 * constrain it.
 */
export function claudeQueryOptions(schema) {
  return {
    maxTurns: 1,
    tools: [],
    permissionMode: "dontAsk",
    settingSources: [],
    outputFormat: {
      type: "json_schema",
      schema,
    },
  };
}

export async function invoke(request) {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  let structured = null;
  let text = "";
  for await (const message of query({
    prompt: request.prompt,
    options: claudeQueryOptions(request.schema),
  })) {
    if (message && message.type === "result") {
      if (message.structured_output) structured = message.structured_output;
      if (typeof message.result === "string") text = message.result;
    }
  }
  return parseModelPayload(structured ?? text);
}
