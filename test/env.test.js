import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadEnvFile } from "../src/env.js";
import { readConfig } from "../src/config.js";

test("configured env file loads missing keys and keeps explicit process values", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "smartypants-env-"));
  fs.writeFileSync(path.join(root, "smartypants.config.json"), JSON.stringify({ flavor: "codex", envFile: ".env" }));
  fs.writeFileSync(path.join(root, ".env"), "OPENAI_API_KEY=file-key\nGROK_API_KEY=grok-key\n");
  const previous = Object.fromEntries(["OPENAI_API_KEY", "GROK_API_KEY", "XAI_API_KEY"].map((key) => [key, process.env[key]]));
  try {
    process.env.OPENAI_API_KEY = "explicit-key";
    delete process.env.GROK_API_KEY;
    delete process.env.XAI_API_KEY;
    const config = readConfig(root).config;
    assert.equal(config.envFile, ".env");
    loadEnvFile(root, config.envFile);
    assert.equal(process.env.OPENAI_API_KEY, "explicit-key");
    assert.equal(process.env.XAI_API_KEY, "grok-key");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
