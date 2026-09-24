import { handleHook } from "./pipeline.js";
import { extractDelivered, isEditTool } from "./normalize.js";

/**
 * Pi watches user input through the extension `input` event, and write/edit
 * results through `tool_result`. Both go through the shared smartypants pipeline.
 * The extension never rewrites or swallows the turn.
 */
export default function smartypants(pi) {
  pi.on("input", async (event, ctx) => {
    try {
      await handleHook({
        cwd: ctx && ctx.cwd ? ctx.cwd : process.cwd(),
        event: { type: "user", text: event && typeof event.text === "string" ? event.text : "" },
      });
    } catch (error) {
      console.error(`smartypants: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { action: "continue" };
  });

  pi.on("tool_result", async (event, ctx) => {
    const toolName = event && event.toolName ? event.toolName : "";
    if (!isEditTool(toolName)) return;
    try {
      await handleHook({
        cwd: ctx && ctx.cwd ? ctx.cwd : process.cwd(),
        event: extractDelivered((event && event.input) || {}, toolName),
      });
    } catch (error) {
      console.error(`smartypants: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}
