/**
 * Background mode. The hook appends the event and returns at once; one worker
 * per project drains the queue in order, so the coding agent never waits on
 * the selector or the builder and two turns never race on design.json.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DESIGN_DIR } from "./model.js";

const STALE_LOCK_MS = 5 * 60 * 1000;

export function queuePath(root) {
  return path.join(root, DESIGN_DIR, "queue.jsonl");
}

function lockPath(root) {
  return path.join(root, DESIGN_DIR, "worker.lock");
}

export function enqueue(root, event) {
  fs.mkdirSync(path.join(root, DESIGN_DIR), { recursive: true });
  fs.appendFileSync(queuePath(root), `${JSON.stringify({ at: Date.now(), event })}\n`);
}

/** Take every queued event, leaving an empty queue. */
export function takeQueue(root) {
  const file = queuePath(root);
  const claimed = `${file}.${process.pid}.work`;
  try {
    fs.renameSync(file, claimed);
  } catch {
    return [];
  }
  const lines = fs.readFileSync(claimed, "utf8").split("\n").filter(Boolean);
  fs.rmSync(claimed, { force: true });
  return lines.flatMap((line) => {
    try {
      return [JSON.parse(line).event];
    } catch {
      return [];
    }
  });
}

export function acquireLock(root) {
  const file = lockPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    try {
      if (Date.now() - fs.statSync(file).mtimeMs > STALE_LOCK_MS) {
        fs.rmSync(file, { force: true });
        fs.writeFileSync(file, String(process.pid), { flag: "wx" });
        return true;
      }
    } catch {
      /* Another worker won the race. */
    }
    return false;
  }
}

export function releaseLock(root) {
  fs.rmSync(lockPath(root), { force: true });
}

export function spawnWorker(root) {
  const worker = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "smartypants-worker.mjs");
  const child = spawn(process.execPath, [worker], {
    cwd: root,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, SMARTPANTS_ROOT: root },
  });
  child.unref();
}

/** Drain until the queue stays empty. `handle(event)` runs one event. */
export async function drain(root, handle) {
  if (!acquireLock(root)) return 0;
  let handled = 0;
  try {
    for (;;) {
      const events = takeQueue(root);
      if (!events.length) break;
      for (const event of events) {
        try {
          await handle(event);
        } catch (error) {
          console.error(`smartypants worker: ${error instanceof Error ? error.message : String(error)}`);
        }
        handled += 1;
      }
    }
  } finally {
    releaseLock(root);
  }
  // An event appended between the last take and the release needs a worker.
  if (fs.existsSync(queuePath(root))) return handled + (await drain(root, handle));
  return handled;
}
