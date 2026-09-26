#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupConfig } from "../src/config.js";
import { canvasModel, loadDesign, placeNode, saveDesign } from "../src/model.js";
import { loadIntent, renderIntent, intentTokens } from "../src/intent.js";
import { toMermaid } from "../src/mermaid.js";
import { handleHook } from "../src/pipeline.js";
import { drain, enqueue } from "../src/queue.js";
import { loadStats } from "../src/stats.js";
import { startWatcher } from "../src/watch.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(packageRoot, "web");
const projectRoot = process.env.SMARTPANTS_ROOT
  ? path.resolve(process.env.SMARTPANTS_ROOT)
  : process.cwd();
const port = Number(process.env.SMARTPANTS_PORT || 4173);
const host = "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res, status, body, type) {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function safeFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const file = path.resolve(webRoot, relative);
  if (file !== webRoot && !file.startsWith(`${webRoot}${path.sep}`)) return null;
  return file;
}

/** Every write goes through the project queue, so the server and hook workers never race. */
function submit(event) {
  enqueue(projectRoot, event);
  return drain(projectRoot, (next) => handleHook({ cwd: projectRoot, event: next, timeoutMs: 120000 }));
}

function currentModel() {
  const design = loadDesign(projectRoot);
  const config = lookupConfig(projectRoot);
  return { ...canvasModel(design, config?.depth || design.floor), ...(design.level ? { level: design.level } : {}) };
}

const JSON_TYPE = "application/json; charset=utf-8";
let pending = 0;

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  if (url.startsWith("/design.json")) {
    send(res, 200, JSON.stringify({ ...currentModel(), busy: pending > 0 }), JSON_TYPE);
    return;
  }
  if (url.startsWith("/design.mmd")) {
    send(res, 200, toMermaid(currentModel()), "text/plain; charset=utf-8");
    return;
  }
  if (url.startsWith("/intent.json")) {
    const intent = loadIntent(projectRoot);
    send(res, 200, JSON.stringify({ text: renderIntent(intent), atoms: intent.atoms, tokens: intentTokens(intent) }), JSON_TYPE);
    return;
  }
  if (url.startsWith("/stats.json")) {
    send(res, 200, JSON.stringify(loadStats(projectRoot)), JSON_TYPE);
    return;
  }
  if (req.method === "POST" && url.startsWith("/deeper")) {
    readBody(req)
      .then((raw) => {
        const body = JSON.parse(raw || "{}");
        const target = String(body.id || body.target || "").trim();
        if (!target) throw new Error("missing target");
        pending += 1;
        submit({ type: "deeper", target })
          .catch((error) => console.error(`smartypants: ${error.message}`))
          .finally(() => { pending -= 1; });
        send(res, 202, JSON.stringify({ ok: true, target }), JSON_TYPE);
      })
      .catch(() => send(res, 400, "Bad deeper request", "text/plain; charset=utf-8"));
    return;
  }
  if (req.method === "POST" && url.startsWith("/positions")) {
    readBody(req)
      .then((raw) => {
        const body = JSON.parse(raw || "{}");
        const moved = placeNode(loadDesign(projectRoot), body.id, Number(body.x), Number(body.y));
        if (moved.changed) saveDesign(projectRoot, moved.design);
        send(res, 200, JSON.stringify({ ok: true, changed: moved.changed }), "application/json; charset=utf-8");
      })
      .catch(() => send(res, 400, "Bad position", "text/plain; charset=utf-8"));
    return;
  }
  const file = safeFile(url);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
    return;
  }
  const ext = path.extname(file);
  send(res, 200, fs.readFileSync(file), TYPES[ext] || "application/octet-stream");
});

server.listen(port, host, () => {
  console.log(`Smartypants canvas at http://${host}:${port}`);
  console.log(`Design root: ${projectRoot}`);
  const watch = lookupConfig(projectRoot)?.watch;
  if (watch) {
    startWatcher(projectRoot, watch, (text) => submit({ type: "user", text }));
    console.log(`Watching ${watch.host} ${watch.home ? "session home" : "session"}: ${watch.home || watch.session}`);
  }
});
