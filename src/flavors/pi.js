import os from "node:os";
import path from "node:path";
import { buildFlavorRequest } from "../prompts.js";
import { collectText, parseModelPayload } from "../parse.js";

const SDK = {
  package: "@earendil-works/pi-coding-agent",
  api: "createAgentSession",
};

export function buildRequest(input) {
  return buildFlavorRequest({
    ...input,
    flavor: "pi",
    sdk: SDK,
    model: input.model ?? input.config?.model ?? null,
  });
}

/**
 * Same directory Pi's getAgentDir() uses. DefaultResourceLoader always
 * resolvePath()s agentDir, and that throws when the value is missing.
 */
export function piAgentDir() {
  const override = process.env.PI_CODING_AGENT_DIR;
  if (typeof override === "string" && override.trim()) return path.resolve(override.trim());
  return path.join(os.homedir(), ".pi", "agent");
}

/**
 * The builder session must not discover `.pi/extensions`, or `session.prompt()`
 * re-enters this hook through the smartypants `input` listener.
 * Read is the only tool, so the session cannot write the project.
 */
export function piBuilderPlan(cwd) {
  const agentDir = piAgentDir();
  return {
    cwd,
    loader: {
      cwd,
      agentDir,
      noExtensions: true,
    },
    tools: ["read"],
  };
}

export async function invoke(request) {
  const { createAgentSession, DefaultResourceLoader, SessionManager } = await import(
    "@earendil-works/pi-coding-agent"
  );
  const plan = piBuilderPlan(request.cwd || process.cwd());
  const resourceLoader = new DefaultResourceLoader(plan.loader);
  if (typeof resourceLoader.reload === "function") await resourceLoader.reload();
  const { session } = await createAgentSession({
    cwd: plan.cwd,
    sessionManager: SessionManager.inMemory(),
    resourceLoader,
    tools: plan.tools,
  });
  let text = "";
  const unsubscribe = session.subscribe?.((event) => {
    if (event?.type === "message_end" && event.message?.role === "assistant") {
      text += collectText(event.message);
    }
  });
  try {
    const result = await session.prompt(`${request.instructions}\n\n${request.prompt}`);
    if (!text) text = collectText(result);
    return parseModelPayload(text);
  } finally {
    if (typeof unsubscribe === "function") unsubscribe();
    session.dispose?.();
  }
}
