import fs from "node:fs";
import path from "node:path";

/** Load an explicitly configured dotenv file without running shell text. */
export function loadEnvFile(projectRoot, file) {
  if (!file) return;
  const target = path.resolve(projectRoot, file);
  for (const raw of fs.readFileSync(target, "utf8").split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7).trimStart();
    const separator = line.indexOf("=");
    if (separator < 1) throw new Error(`invalid env entry in ${target}`);
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`invalid env key in ${target}`);
    let value = line.slice(separator + 1).trim();
    if (value.length >= 2 && ((value[0] === '"' && value.at(-1) === '"') || (value[0] === "'" && value.at(-1) === "'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
  if (!process.env.XAI_API_KEY && process.env.GROK_API_KEY) process.env.XAI_API_KEY = process.env.GROK_API_KEY;
  if (!process.env.ANTHROPIC_API_KEY && process.env.ANTRHOPIC_API_KEY) process.env.ANTHROPIC_API_KEY = process.env.ANTRHOPIC_API_KEY;
}
