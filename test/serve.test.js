import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { applyDrift } from "../src/drift.js";
import { applyDesign, emptyDesign, saveDesign } from "../src/model.js";
import { ledgerResult, weeklyDrift } from "./fixture.js";
import { tempProject } from "./helpers.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

test("the canvas server returns the persisted design and the page", async () => {
  const root = tempProject({ flavor: "claude", depth: "module" });
  const design = applyDrift(applyDesign(emptyDesign(), ledgerResult, "module").design, weeklyDrift).design;
  saveDesign(root, design);
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(packageRoot, "bin/smartypants-serve.mjs")], {
    env: { ...process.env, SMARTPANTS_ROOT: root, SMARTPANTS_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("server did not start")), 5000);
      child.stdout.on("data", (chunk) => {
        if (String(chunk).includes("Smartypants canvas")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`server exited ${code}`));
      });
    });
    const page = await fetch(`http://127.0.0.1:${port}/`);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.equal(html.includes("scene.cjs"), true);
    assert.equal(html.includes("app.js"), true);
    assert.equal(html.includes('location.protocol !== "file:"'), true);
    assert.equal(html.includes("node bin/smartypants-serve.mjs"), true);
    const modelResponse = await fetch(`http://127.0.0.1:${port}/design.json`);
    const model = await modelResponse.json();
    assert.equal(model.floor, "module");
    const capture = model.nodes.find((node) => node.id === "capture");
    assert.equal(capture.what, "Records a purchase the moment someone pays");
    assert.equal(capture.flags[0].difference, weeklyDrift.difference);
    assert.equal(model.nodes.some((node) => node.kind === "module"), true);
  } finally {
    child.kill("SIGTERM");
  }
});
