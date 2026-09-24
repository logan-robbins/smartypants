#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupConfig } from "../src/config.js";
import { canvasModel, loadDesign, placeNode, saveDesign } from "../src/model.js";
import { handleHook } from "../src/pipeline.js";
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

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  if (url.startsWith("/design.json")) {
    const design = loadDesign(projectRoot);
    const config = lookupConfig(projectRoot);
    const model = canvasModel(design, config?.depth || design.floor);
    send(res, 200, JSON.stringify(model), "application/json; charset=utf-8");
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
    let queue = Promise.resolve();
    startWatcher(projectRoot, watch, (text) => {
      queue = queue.then(() => handleHook({ cwd: projectRoot, event: { type: "user", text } }))
        .catch((error) => console.error(`smartypants watch: ${error.message}`));
    });
    console.log(`Watching ${watch.host} ${watch.home ? "session home" : "session"}: ${watch.home || watch.session}`);
  }
});
