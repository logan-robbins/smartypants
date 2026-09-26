#!/usr/bin/env node
import { handleHook } from "../src/pipeline.js";
import { drain } from "../src/queue.js";

const root = process.env.SMARTPANTS_ROOT || process.cwd();
await drain(root, (event) => handleHook({ cwd: root, event, timeoutMs: 90000 }));
process.exit(0);
