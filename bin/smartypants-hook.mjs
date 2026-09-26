#!/usr/bin/env node
import { dispatchEvent } from "../src/dispatch.js";
import { normalizeStdin } from "../src/normalize.js";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const stdin = Buffer.concat(chunks).toString("utf8");

try {
  await dispatchEvent({ cwd: process.cwd(), event: normalizeStdin(stdin), stdin });
} catch (error) {
  console.error(`smartypants: ${error instanceof Error ? error.message : String(error)}`);
}
process.exit(0);
