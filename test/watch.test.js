import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readConfig } from "../src/config.js";
import { startWatcher, textFromRecord } from "../src/watch.js";

test("watch config selects an absolute Claude or Codex home", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "smartypants-watch-config-"));
  try {
    const file = path.join(root, "smartypants.config.json");
    fs.writeFileSync(file, JSON.stringify({ flavor: "codex", watch: { host: "claude", home: root } }));
    assert.deepEqual(readConfig(root).config.watch, { host: "claude", home: root });
    fs.writeFileSync(file, JSON.stringify({ flavor: "codex", watch: { host: "codex", session: path.join(root, "session.jsonl") } }));
    assert.deepEqual(readConfig(root).config.watch, { host: "codex", session: path.join(root, "session.jsonl") });
    fs.writeFileSync(file, JSON.stringify({ flavor: "codex", watch: { host: "claude", home: "relative" } }));
    assert.equal(readConfig(root).reason, "invalid-watch");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Claude watcher follows new human and peer turns without tool or system payloads", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "smartypants-watch-"));
  const home = path.join(root, "claude-home");
  const projectDir = path.join(home, "projects", "-project");
  fs.mkdirSync(projectDir, { recursive: true });
  const transcript = path.join(projectDir, "session.jsonl");
  const line = (record) => `${JSON.stringify(record)}\n`;
  fs.writeFileSync(transcript, line({ type: "user", message: { content: "older turn" } }));
  const received = [];
  let watcher;
  try {
    watcher = startWatcher(root, { host: "claude", home }, (text) => received.push(text));
    assert.deepEqual(received, []);
    fs.appendFileSync(transcript, [
      line({ type: "user", message: { content: "draw a short link" } }),
      line({ type: "user", isMeta: true, origin: { kind: "peer" }, message: { content: "Another Claude session sent a message:\ntrack clicks\n\nThis came from another Claude session — not typed by your user" } }),
      line({ type: "user", isMeta: true, message: { content: "system injected text" } }),
      line({ type: "user", message: { content: [{ type: "tool_result", content: "file data" }] } }),
    ].join(""));
    watcher.scan();
    assert.deepEqual(received, ["draw a short link", "track clicks"]);
    watcher.close();
    watcher = startWatcher(root, { host: "claude", home }, (text) => received.push(text));
    watcher.scan();
    assert.deepEqual(received, ["draw a short link", "track clicks"]);
    fs.appendFileSync(transcript, line({ type: "user", message: { content: "new turn" } }));
    watcher.scan();
    assert.equal(received.at(-1), "new turn");
  } finally {
    watcher?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Codex watcher reads user_message events", () => {
  assert.equal(textFromRecord("codex", { type: "event_msg", payload: { type: "user_message", message: "build a redirect" } }), "build a redirect");
  assert.equal(textFromRecord("codex", { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "build a redirect" }] } }), "build a redirect");
  assert.equal(textFromRecord("codex", { type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "reply" }] } }), null);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "smartypants-codex-watch-"));
  const home = path.join(root, "codex-home");
  const sessions = path.join(home, "sessions", "2026", "09", "24");
  fs.mkdirSync(sessions, { recursive: true });
  const received = [];
  const watcher = startWatcher(root, { host: "codex", home }, (text) => received.push(text));
  try {
    fs.writeFileSync(path.join(sessions, "rollout.jsonl"), [
      { timestamp: "2026-09-24T10:00:00.000Z", type: "event_msg", payload: { type: "user_message", message: "build a redirect" } },
      { timestamp: "2026-09-24T10:00:00.100Z", type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "build a redirect" }] } },
    ].map((record) => `${JSON.stringify(record)}\n`).join(""));
    watcher.scan();
    assert.deepEqual(received, ["build a redirect"]);
  } finally {
    watcher.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
