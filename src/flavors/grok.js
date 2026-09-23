import { buildFlavorRequest } from "../prompts.js";
import { parseModelPayload } from "../parse.js";

const SDK = {
  package: "openai",
  api: "chat.completions",
  baseURL: "https://api.x.ai/v1",
  model: "grok-4.7",
};

export function buildRequest(input) {
  const model = input.model ?? input.config?.model ?? SDK.model;
  return buildFlavorRequest({
    ...input,
    flavor: "grok",
    sdk: { ...SDK, model },
    model,
  });
}

export async function invoke(request) {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: "https://api.x.ai/v1",
  });
  const completion = await client.chat.completions.create({
    model: request.model || "grok-4.7",
    messages: [
      { role: "system", content: request.instructions },
      { role: "user", content: request.prompt },
    ],
    response_format: { type: "json_object" },
  });
  const content = completion?.choices?.[0]?.message?.content;
  return parseModelPayload(content);
}
