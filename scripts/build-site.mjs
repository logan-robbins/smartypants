#!/usr/bin/env node
/**
 * Build the website into site/: the landing page is committed; this copies the
 * live canvas (web/) and the example diagrams into site/demo/ so the demo is
 * always the same code the app runs. GitHub Pages publishes site/.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toMermaid } from "../src/mermaid.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = path.join(root, "site");
const demo = path.join(site, "demo");
fs.rmSync(demo, { recursive: true, force: true });
fs.mkdirSync(path.join(demo, "examples"), { recursive: true });
for (const file of ["app.js", "app.css", "scene.cjs"]) fs.copyFileSync(path.join(root, "web", file), path.join(demo, file));
const examples = [];
for (const file of fs.readdirSync(path.join(root, "examples")).filter((f) => f.endsWith(".design.json")).sort()) {
  const name = file.replace(".design.json", "");
  const design = JSON.parse(fs.readFileSync(path.join(root, "examples", file), "utf8"));
  fs.writeFileSync(path.join(demo, "examples", `${name}.json`), JSON.stringify(design));
  fs.writeFileSync(path.join(demo, "examples", `${name}.mmd`), toMermaid(design));
  const intent = path.join(root, "examples", `${name}.intent.json`);
  if (fs.existsSync(intent)) {
    const atoms = JSON.parse(fs.readFileSync(intent, "utf8"));
    const { renderIntent, intentTokens } = await import("../src/intent.js");
    fs.writeFileSync(path.join(demo, "examples", `${name}.intent.json`), JSON.stringify({ atoms: atoms.atoms, text: renderIntent(atoms), tokens: intentTokens(atoms) }));
  }
  const system = design.nodes.find((node) => node.kind === "system");
  examples.push({ name, title: system?.name || name, parts: design.nodes.length, flows: design.connections.length });
}
fs.writeFileSync(path.join(demo, "examples.json"), JSON.stringify(examples, null, 1));
fs.copyFileSync(path.join(site, "demo.html"), path.join(demo, "index.html"));
console.log(`site/demo: canvas + ${examples.length} examples`);
