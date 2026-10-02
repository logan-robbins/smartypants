import { readConfig } from "./config.js";
import { builderIsRunning, handleHook } from "./pipeline.js";
import { enqueue, spawnWorker } from "./queue.js";

/**
 * One entry for every host. Background mode queues the event for the project
 * worker and returns at once, so the coding agent never waits on a model.
 */
export async function dispatchEvent({ cwd, event, stdin }) {
  const root = process.env.SMARTPANTS_ROOT || cwd || process.cwd();
  if (builderIsRunning()) return { queued: false, inert: true };
  const config = readConfig(root).config;
  if (config?.background && event) {
    enqueue(root, event);
    spawnWorker(root);
    return { queued: true };
  }
  return handleHook({ cwd: root, event, stdin });
}
