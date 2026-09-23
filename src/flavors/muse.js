import { buildFlavorRequest } from "../prompts.js";
import { collectText, parseModelPayload } from "../parse.js";

const SDK = {
  package: "@muse-code/sdk",
  api: "MuseClient.spawn",
};

export function buildRequest(input) {
  return buildFlavorRequest({
    ...input,
    flavor: "muse",
    sdk: SDK,
    model: input.model ?? input.config?.model ?? null,
  });
}

export async function invoke(request) {
  const { MuseClient } = await import("@muse-code/sdk");
  const client = await MuseClient.spawn({
    museBin: process.env.MUSE_BIN || "muse",
    args: ["serve"],
    clientInfo: { name: "smartypants", version: "0.1.0" },
  });
  try {
    const session = await client.startSession({
      workspaceRoot: request.cwd || process.cwd(),
    });
    // This turn runs in the same workspace, so Muse fires UserPromptSubmit again.
    // The pipeline sets SMARTYPANTS_BUILDING first; that child hook returns
    // before it can spawn another muse serve.
    const turn = await session.sendUserTurn({
      input: [{ type: "text", text: `${request.instructions}\n\n${request.prompt}` }],
    });
    let text = "";
    for await (const item of turn.items()) text += collectText(item);
    await turn.completed;
    return parseModelPayload(text);
  } finally {
    await client.close();
  }
}
