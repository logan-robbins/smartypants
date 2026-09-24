import fs from "node:fs";
import path from "node:path";

const MAX_READ = 1024 * 1024;

function jsonlFiles(watch) {
  if (watch.session) return fs.existsSync(watch.session) ? [watch.session] : [];
  const root = path.join(watch.home, watch.host === "claude" ? "projects" : "sessions");
  const files = [];
  function visit(dir, depth) {
    if (depth > 5) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file, depth + 1);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(file);
    }
  }
  visit(root, 0);
  return files;
}

function claudeText(record) {
  if (record?.type !== "user") return null;
  const content = record.message?.content;
  let text = typeof content === "string" ? content :
    Array.isArray(content) ? content.filter((part) => part?.type === "text").map((part) => part.text || "").join("\n") : "";
  if (record.isMeta) {
    const prefix = "Another Claude session sent a message:\n";
    if (record.origin?.kind !== "peer" || !text.startsWith(prefix)) return null;
    text = text.slice(prefix.length).split("\n\nThis came from another Claude session")[0];
  }
  return text.trim() || null;
}

function codexText(record) {
  const payload = record?.payload;
  let text = null;
  if (record?.type === "event_msg" && payload?.type === "user_message") text = payload.message;
  if (record?.type === "response_item" && payload?.type === "message" && payload?.role === "user") {
    text = Array.isArray(payload.content) ? payload.content
      .filter((part) => part?.type === "input_text")
      .map((part) => part.text || "").join("\n") : null;
  }
  return typeof text === "string" ? text.trim() || null : null;
}

export function textFromRecord(host, record) {
  return host === "claude" ? claudeText(record) : host === "codex" ? codexText(record) : null;
}

/** Watch a selected Claude/Codex home. Existing transcripts begin at EOF on first use. */
export function startWatcher(projectRoot, watch, onPrompt, options = {}) {
  const source = `${watch.host}:${watch.home || watch.session}`;
  const stateFile = path.join(projectRoot, ".smartypants", "watch-state.json");
  let saved = {};
  try {
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (state.source === source && state.offsets && typeof state.offsets === "object") saved = state.offsets;
  } catch { /* First run begins with new prompts. */ }
  const offsets = new Map(Object.entries(saved));
  const lastUser = new Map();
  let initialized = Object.keys(saved).length > 0;
  let scanning = false;

  function scan() {
    if (scanning) return;
    scanning = true;
    try {
      const files = jsonlFiles(watch);
      for (const file of files) {
        let size;
        try { size = fs.statSync(file).size; } catch { continue; }
        if (!offsets.has(file)) offsets.set(file, initialized ? 0 : size);
        let offset = offsets.get(file);
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > size) offset = 0;
        if (size === offset) { offsets.set(file, offset); continue; }
        const length = Math.min(size - offset, MAX_READ);
        const buffer = Buffer.alloc(length);
        let read = 0;
        let fd;
        try {
          fd = fs.openSync(file, "r");
          read = fs.readSync(fd, buffer, 0, length, offset);
        } catch { continue; }
        finally { if (fd !== undefined) fs.closeSync(fd); }
        const chunk = buffer.subarray(0, read).toString("utf8");
        const lastNewline = chunk.lastIndexOf("\n");
        if (lastNewline < 0) continue;
        for (const line of chunk.slice(0, lastNewline).split("\n")) {
          if (!line) continue;
          try {
            const record = JSON.parse(line);
            const text = textFromRecord(watch.host, record);
            if (text) {
              const last = lastUser.get(file);
              const at = Date.parse(record.timestamp || "");
              const duplicate = watch.host === "codex" && last?.text === text &&
                last.type !== record.type && Number.isFinite(at) &&
                Math.abs(at - last.at) < 2000;
              lastUser.set(file, { text, type: record.type, at });
              if (!duplicate) onPrompt(text);
            }
          } catch { /* Ignore partial or malformed transcript records. */ }
        }
        offsets.set(file, offset + Buffer.byteLength(chunk.slice(0, lastNewline + 1)));
      }
      initialized = true;
      fs.mkdirSync(path.dirname(stateFile), { recursive: true });
      fs.writeFileSync(stateFile, `${JSON.stringify({ source, offsets: Object.fromEntries(offsets) })}\n`);
    } finally { scanning = false; }
  }

  scan();
  const timer = setInterval(scan, options.intervalMs ?? 2000);
  timer.unref?.();
  return { scan, close: () => clearInterval(timer) };
}
