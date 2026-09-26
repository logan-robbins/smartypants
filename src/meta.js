/**
 * Meta Model API client (OpenAI-compatible chat completions).
 *
 * Smartypants runs Muse Spark 1.3 in Contributor mode by default: the
 * `muse-spark-1.3-contributor` tier costs $0.10/M input and $0.20/M output
 * tokens in exchange for Meta training rights on the traffic. Use
 * `muse-spark-1.3` in config.model when the project cannot share its prompts.
 */

export const META_BASE_URL = "https://api.meta.ai/v1";
export const META_MODEL = "muse-spark-1.3-contributor";
export const META_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"];

/** USD per million tokens. Contributor rates trade a discount for training rights. */
export const META_PRICES = {
  "muse-spark-1.3-contributor": { input: 0.1, cached: 0.01, output: 0.2 },
  "muse-spark-1.3": { input: 1.25, cached: 0.125, output: 4.25 },
  "muse-spark-1.2-contributor": { input: 0.1, cached: 0.01, output: 0.2 },
};

export function metaKey(env = process.env) {
  return env.META_API_KEY || env.MODEL_API_KEY || "";
}

export function metaCost(model, usage) {
  const price = META_PRICES[model] || META_PRICES[META_MODEL];
  const cached = usage.cachedTokens || 0;
  const fresh = Math.max(0, (usage.inputTokens || 0) - cached);
  return (fresh * price.input + cached * price.cached + (usage.outputTokens || 0) * price.output) / 1e6;
}

/**
 * One structured completion. Reasoning tokens count against
 * max_completion_tokens, so a `length` stop with no content retries once with
 * twice the budget before failing.
 */
export async function metaJson({
  system,
  user,
  schema,
  name = "smartypants",
  model = META_MODEL,
  effort = "minimal",
  maxTokens = 4000,
  signal,
  env = process.env,
  fetchCall = globalThis.fetch,
  baseUrl = env.META_BASE_URL || META_BASE_URL,
}) {
  const key = metaKey(env);
  if (!key) throw new Error("META_API_KEY is not set");
  let budget = maxTokens;
  const started = Date.now();
  const usage = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedTokens: 0, calls: 0 };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const body = {
      model,
      reasoning_effort: META_EFFORTS.includes(effort) ? effort : "minimal",
      max_completion_tokens: budget,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name, strict: true, schema },
      },
    };
    const response = await fetchCall(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Meta API ${response.status}: ${text.slice(0, 300)}`);
    const payload = JSON.parse(text);
    const u = payload.usage || {};
    usage.calls += 1;
    usage.inputTokens += u.prompt_tokens || 0;
    usage.outputTokens += u.completion_tokens || 0;
    usage.reasoningTokens += u.completion_tokens_details?.reasoning_tokens || 0;
    usage.cachedTokens += u.prompt_tokens_details?.cached_tokens || 0;
    const choice = payload.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content === "string" && content.trim()) {
      const json = JSON.parse(content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1));
      const served = payload.model || model;
      return { json, model: served, usage, cost: metaCost(served, usage), elapsedMs: Date.now() - started };
    }
    if (choice?.finish_reason !== "length") break;
    budget *= 2;
  }
  throw new Error("Meta API returned no content");
}
