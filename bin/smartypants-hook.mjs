#!/usr/bin/env node
import { handleHook } from "../src/pipeline.js";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const stdin = Buffer.concat(chunks).toString("utf8");

try {
  await handleHook({ stdin, cwd: process.cwd() });
} catch (error) {
  console.error(`smartypants: ${error instanceof Error ? error.message : String(error)}`);
}
process.exit(0);
