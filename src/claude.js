/**
 * Claude through the host's own Claude Code CLI, in headless mode.
 *
 * Smartypants does not ship its own Claude connection. It runs the `claude`
 * binary the harness already uses (`CLAUDE_CODE_EXECPATH` inside a Claude Code
 * hook, else `claude` on PATH), so a call signs in exactly the way the user's
 * Claude Code does: ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN, an apiKeyHelper,
 * Bedrock / Vertex / Foundry through their CLAUDE_CODE_USE_* switches, a
 * gateway on ANTHROPIC_BASE_URL, or the stored `claude` login.
 *
 * Every call is one structured answer with no settings, no MCP, no skills, and
 * no saved session, so it cannot fire this project's hooks again. It has no
 * tools, except that going deeper on existing code may Read, Grep, and Glob;
 * nothing can write to the project.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** The only tools a call may get: reading the project, never changing it. */
export const READ_ONLY_TOOLS = ["Read", "Grep", "Glob"];
/** Enough turns to search, open a dozen files, and answer. */
export const EXPLORE_TURNS = 40;

/** Effort levels the Claude Code CLI accepts. */
export const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"];

/** Inside a hook these mark the parent session; the child is its own one-shot session. */
const PARENT_SESSION_VARS = ["CLAUDECODE", "CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_ENTRYPOINT"];

export function claudeBin(env = process.env) {
  if (env.SMARTYPANTS_CLAUDE_BIN) return env.SMARTYPANTS_CLAUDE_BIN;
  if (env.CLAUDE_CODE_EXECPATH && fs.existsSync(env.CLAUDE_CODE_EXECPATH)) return env.CLAUDE_CODE_EXECPATH;
  return "claude";
}

export function claudeEffort(value) {
  if (CLAUDE_EFFORTS.includes(value)) return value;
  if (value === "none" || value === "minimal") return "low";
  return null;
}

/** CLI flags for one isolated, structured, tool-less answer. */
export function claudeArgs({ schema, systemFile, model, effort, tools = [] }) {
  const allowed = tools.filter((tool) => READ_ONLY_TOOLS.includes(tool));
  const args = [
    "-p",
    "--output-format", "json",
    "--json-schema", JSON.stringify(schema),
    "--system-prompt-file", systemFile,
    "--tools", allowed.join(","),
    "--setting-sources", "",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--no-session-persistence",
    "--permission-mode", "dontAsk",
    // Structured output is returned through a tool round trip, so one answer is two turns.
    "--max-turns", allowed.length ? String(EXPLORE_TURNS) : "2",
  ];
  if (allowed.length) args.push("--allowedTools", allowed.join(","));
  if (model) args.push("--model", model);
  const level = claudeEffort(effort);
  if (level) args.push("--effort", level);
  return args;
}

export function claudeEnv(env = process.env) {
  const child = { ...env };
  for (const name of PARENT_SESSION_VARS) delete child[name];
  return child;
}

/** Read the CLI's JSON result; a failed sign-in or refusal becomes an error with its message. */
export function readClaudeResult(stdout) {
  const text = String(stdout || "").trim();
  let payload;
  try {
    payload = JSON.parse(text.slice(text.indexOf("{")));
  } catch {
    throw new Error(`Claude returned no JSON: ${text.slice(0, 200) || "empty output"}`);
  }
  if (payload.is_error || payload.subtype !== "success") {
    throw new Error(`Claude ${payload.subtype || "error"}: ${String(payload.result || payload.api_error_status || "").slice(0, 300)}`);
  }
  const json = payload.structured_output ?? JSON.parse(String(payload.result || "").slice(String(payload.result || "").indexOf("{")));
  const usage = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedTokens: 0, calls: 1 };
  const u = payload.usage || {};
  usage.inputTokens = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  usage.cachedTokens = u.cache_read_input_tokens || 0;
  usage.outputTokens = u.output_tokens || 0;
  usage.reasoningTokens = u.output_tokens_details?.thinking_tokens || 0;
  const model = Object.keys(payload.modelUsage || {})[0] || "claude";
  return { json, model, usage, cost: Number(payload.total_cost_usd) || 0 };
}

/**
 * One structured completion from Claude. The prompt goes on stdin and the
 * system prompt through a temporary file, so neither hits argument-length limits.
 */
export async function claudeJson({
  system,
  user,
  schema,
  model = null,
  effort = null,
  cwd = process.cwd(),
  env = process.env,
  timeoutMs = 120000,
  tools = [],
  spawnCall = spawn,
}) {
  const started = Date.now();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smartypants-claude-"));
  const systemFile = path.join(dir, "system.txt");
  fs.writeFileSync(systemFile, system);
  try {
    const stdout = await new Promise((resolve, reject) => {
      const child = spawnCall(claudeBin(env), claudeArgs({ schema, systemFile, model, effort, tools }), {
        cwd,
        env: claudeEnv(env),
        stdio: ["pipe", "pipe", "pipe"],
      });
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error("Claude timed out"));
      }, timeoutMs);
      child.stdout.on("data", (chunk) => (out += chunk));
      child.stderr.on("data", (chunk) => (err += chunk));
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(
          error.code === "ENOENT"
            ? new Error("Claude Code CLI not found: install Claude Code, or set SMARTYPANTS_CLAUDE_BIN to the claude binary")
            : error,
        );
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        // A non-zero exit still prints a JSON result when the API refused the call.
        if (out.trim()) resolve(out);
        else reject(new Error(`Claude exited ${code}: ${err.trim().slice(0, 300) || "no output"}`));
      });
      child.stdin.end(user);
    });
    return { ...readClaudeResult(stdout), elapsedMs: Date.now() - started };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
