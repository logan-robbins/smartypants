import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { claudeArgs, claudeBin, claudeEnv, claudeJson, readClaudeResult } from "../src/claude.js";
import * as claudeFlavor from "../src/flavors/claude.js";
import { createChooser } from "../src/jev.js";
import { readConfig } from "../src/config.js";
import { installProject } from "../src/install.js";
import { recordTurn, loadStats } from "../src/stats.js";
import { tempProject } from "./helpers.js";

/**
 * A stand-in for the Claude Code CLI. It records its argv, stdin, and env,
 * and answers every schema property with the first enum value it allows.
 */
function fakeClaude({ fail = null, delayMs = 0 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smartypants-fake-claude-"));
  const bin = path.join(dir, "claude");
  const log = path.join(dir, "calls.jsonl");
  fs.writeFileSync(
    bin,
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => setTimeout(() => {
  const at = (flag) => args[args.indexOf(flag) + 1];
  const schema = JSON.parse(at("--json-schema"));
  fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args, input, system: fs.readFileSync(at("--system-prompt-file"), "utf8"), claudecode: process.env.CLAUDECODE ?? null, key: process.env.ANTHROPIC_API_KEY ?? null }) + "\\n");
  ${fail ? `process.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: true, result: ${JSON.stringify(fail)} })); process.exit(1);` : ""}
  const answer = (s) => s.enum ? s.enum[0] : s.type === "number" ? 0.9 : s.type === "boolean" ? false : s.type === "array" ? [] : s.type === "object" ? Object.fromEntries(Object.entries(s.properties || {}).map(([k, v]) => [k, answer(v)])) : "x";
  process.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "", structured_output: answer(schema), total_cost_usd: 0.001, usage: { input_tokens: 10, cache_read_input_tokens: 5, output_tokens: 3 }, modelUsage: { "claude-test": {} } }));
}, ${delayMs}));
`,
  );
  fs.chmodSync(bin, 0o755);
  const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line)) : []);
  return { bin, calls };
}

test("the claude CLI is the host's own: override, then the running Claude Code, then PATH", () => {
  assert.equal(claudeBin({ SMARTYPANTS_CLAUDE_BIN: "/x/claude", CLAUDE_CODE_EXECPATH: process.execPath }), "/x/claude");
  assert.equal(claudeBin({ CLAUDE_CODE_EXECPATH: process.execPath }), process.execPath);
  assert.equal(claudeBin({ CLAUDE_CODE_EXECPATH: "/missing/claude" }), "claude");
  assert.equal(claudeBin({}), "claude");
});

test("claude calls are isolated: no tools, settings, MCP, skills, saved session, or prompts", () => {
  const args = claudeArgs({ schema: { type: "object" }, systemFile: "/tmp/s.txt", model: null, effort: "minimal" });
  const value = (flag) => args[args.indexOf(flag) + 1];
  assert.equal(args[0], "-p");
  assert.equal(value("--output-format"), "json");
  assert.equal(value("--tools"), "");
  assert.equal(value("--setting-sources"), "");
  assert.equal(value("--permission-mode"), "dontAsk");
  assert.equal(value("--effort"), "low");
  for (const flag of ["--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence"]) assert.ok(args.includes(flag));
  assert.equal(args.includes("--model"), false, "no model means Claude Code's default for this sign-in");
  assert.equal(JSON.stringify(args).includes("bypassPermissions"), false);
  assert.equal(JSON.stringify(args).includes("dangerously"), false);
  assert.deepEqual(claudeArgs({ schema: {}, systemFile: "s", model: "claude-opus-5-5", effort: "high" }).slice(-4), ["--model", "claude-opus-5-5", "--effort", "high"]);
});

test("the child keeps the sign-in env but is not the parent session", () => {
  const env = claudeEnv({ CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "s", ANTHROPIC_API_KEY: "k", CLAUDE_CODE_USE_BEDROCK: "1", PATH: "/bin" });
  assert.deepEqual(env, { ANTHROPIC_API_KEY: "k", CLAUDE_CODE_USE_BEDROCK: "1", PATH: "/bin" });
});

test("a failed sign-in surfaces Claude's own message", () => {
  assert.throws(() => readClaudeResult(JSON.stringify({ type: "result", subtype: "success", is_error: true, result: "Not logged in · Please run /login" })), /Not logged in/);
  assert.throws(() => readClaudeResult("garbage"), /no JSON/);
  const ok = readClaudeResult(JSON.stringify({ subtype: "success", structured_output: { a: 1 }, total_cost_usd: 0.002, usage: { input_tokens: 1, cache_creation_input_tokens: 2, cache_read_input_tokens: 3, output_tokens: 4 }, modelUsage: { "claude-opus-5-5": {} } }));
  assert.deepEqual([ok.json, ok.model, ok.cost, ok.usage.inputTokens, ok.usage.cachedTokens, ok.usage.outputTokens], [{ a: 1 }, "claude-opus-5-5", 0.002, 6, 3, 4]);
});

test("claudeJson sends the prompt on stdin and the system prompt in a file", async () => {
  const fake = fakeClaude();
  const result = await claudeJson({
    system: "SYSTEM TEXT",
    user: "USER TEXT",
    schema: { type: "object", properties: { shape: { type: "string", enum: ["cache", "store"] } } },
    env: { ...process.env, SMARTYPANTS_CLAUDE_BIN: fake.bin, CLAUDECODE: "1", ANTHROPIC_API_KEY: "sk-test" },
  });
  assert.deepEqual(result.json, { shape: "cache" });
  assert.equal(result.model, "claude-test");
  const [call] = fake.calls();
  assert.equal(call.input, "USER TEXT");
  assert.equal(call.system, "SYSTEM TEXT");
  assert.equal(call.claudecode, null);
  assert.equal(call.key, "sk-test");
});

test("a missing Claude Code CLI is a clear error", async () => {
  await assert.rejects(
    claudeJson({ system: "s", user: "u", schema: {}, env: { SMARTYPANTS_CLAUDE_BIN: path.join(os.tmpdir(), "no-such-claude") } }),
    /Claude Code CLI not found/,
  );
});

test("the claude builder writes through the host CLI and reports usage", async () => {
  const fake = fakeClaude();
  const previous = process.env.SMARTYPANTS_CLAUDE_BIN;
  process.env.SMARTYPANTS_CLAUDE_BIN = fake.bin;
  try {
    const request = { kind: "drift", instructions: "write drift", prompt: "evidence", schema: { type: "object", properties: { drift: { type: "boolean" } } }, model: null };
    const parsed = await claudeFlavor.invoke(request);
    assert.ok(parsed);
    assert.equal(request.usage.model, "claude-test");
    assert.equal(request.usage.cost, 0.001);
    const [call] = fake.calls();
    assert.equal(call.args[call.args.indexOf("--effort") + 1], "low");
    assert.equal(call.args.includes("--model"), false);
  } finally {
    if (previous === undefined) delete process.env.SMARTYPANTS_CLAUDE_BIN;
    else process.env.SMARTYPANTS_CLAUDE_BIN = previous;
  }
});

test("claude flavor: Sonnet 5.5 at high effort decides by default; Jev is the opt-in alternative", async () => {
  const fake = fakeClaude();
  const questions = {
    signal: { question: "q", options: [{ value: "noise" }, { value: "arch" }] },
    impact: { question: "q", options: [{ value: "none" }, { value: "extend" }] },
  };
  const jevUp = async () => new Response(JSON.stringify({ model: "jev-1.13.0", answers: { signal: { choice: "c1", confidence: 0.97 }, impact: { choice: "c1", confidence: 0.8 } } }));
  const env = { ...process.env, SMARTYPANTS_DECIDER: "", SMARTYPANTS_CLAUDE_BIN: fake.bin, TYPESAFE_API_KEY: "t", META_API_KEY: "m" };

  const byDefault = await createChooser({ decider: "auto", flavor: "claude" }, { env, fetchCall: jevUp }).choose({}, questions);
  assert.equal(byDefault.via, "claude", "a Jev key alone does not switch the default");
  const [call] = fake.calls();
  assert.deepEqual([call.args[call.args.indexOf("--model") + 1], call.args[call.args.indexOf("--effort") + 1]], ["claude-sonnet-5-5", "high"]);
  const pinned = await createChooser({ decider: "auto", flavor: "claude", deciderModel: "claude-opus-5-5", deciderEffort: "xhigh" }, { env }).choose({}, questions);
  assert.equal(pinned.via, "claude");
  const last = fake.calls().at(-1);
  assert.deepEqual([last.args[last.args.indexOf("--model") + 1], last.args[last.args.indexOf("--effort") + 1]], ["claude-opus-5-5", "xhigh"]);

  const calls = fake.calls().length;
  const withJev = await createChooser({ decider: "jev", flavor: "claude" }, { env, fetchCall: jevUp }).choose({}, questions);
  assert.equal(withJev.via, "jev");
  assert.equal(fake.calls().length, calls, "Jev answered, so Claude was not asked");

  const original = console.error;
  console.error = () => {};
  try {
    const down = async () => new Response("down", { status: 503 });
    const failover = await createChooser({ decider: "jev", flavor: "claude" }, { env, fetchCall: down }).choose({}, questions);
    assert.equal(failover.via, "claude", "Jev down: Claude answers, not Muse Spark");
    assert.equal(failover.answers.signal.value, "noise");
  } finally {
    console.error = original;
  }

  const noJev = createChooser({ decider: "jev", flavor: "claude" }, { env: { ...env, TYPESAFE_API_KEY: "" } });
  assert.equal(noJev.via, "claude", "decider jev without a key still decides with Claude");
  const broken = createChooser({ decider: "auto", flavor: "claude" }, { env: { ...env, TYPESAFE_API_KEY: "", SMARTYPANTS_CLAUDE_BIN: path.join(os.tmpdir(), "no-such-claude") } });
  console.error = () => {};
  try {
    assert.equal((await broken.choose({}, questions)).via, "heuristic", "no Claude CLI falls through to local rules");
  } finally {
    console.error = original;
  }
});

test("init defaults to the claude builder", () => {
  const root = tempProject();
  installProject(root);
  const { config } = readConfig(root);
  assert.equal(config.flavor, "claude");
  assert.equal(config.decider, "auto");
  assert.equal(config.deciderModel, "claude-sonnet-5-5");
  assert.equal(config.deciderEffort, "high");
  const bad = tempProject({ flavor: "claude", deciderEffort: "turbo" });
  assert.equal(readConfig(bad).reason, "invalid-decider-effort");
});

test("a builder deadline stops the claude child instead of leaving it running", async () => {
  const fake = fakeClaude({ delayMs: 5000 });
  const started = Date.now();
  await assert.rejects(
    claudeJson({ system: "s", user: "u", schema: { type: "object" }, env: { ...process.env, SMARTYPANTS_CLAUDE_BIN: fake.bin }, timeoutMs: 300 }),
    /timed out/,
  );
  assert.ok(Date.now() - started < 3000);
  const previous = process.env.SMARTYPANTS_CLAUDE_BIN;
  process.env.SMARTYPANTS_CLAUDE_BIN = fake.bin;
  try {
    await assert.rejects(claudeFlavor.invoke({ kind: "design", instructions: "i", prompt: "p", schema: { type: "object" }, timeoutMs: 300 }), /timed out/);
  } finally {
    if (previous === undefined) delete process.env.SMARTYPANTS_CLAUDE_BIN;
    else process.env.SMARTYPANTS_CLAUDE_BIN = previous;
  }
});

test("hooks give a foreground Claude turn room to finish", () => {
  const root = tempProject();
  installProject(root);
  const settings = JSON.parse(fs.readFileSync(path.join(root, ".claude/settings.json"), "utf8"));
  for (const event of ["UserPromptSubmit", "PostToolUse", "Stop"]) assert.equal(settings.hooks[event][0].hooks[0].timeout, 120);
  const plugin = JSON.parse(fs.readFileSync(new URL("../plugins/smartypants/hooks/hooks.json", import.meta.url), "utf8"));
  for (const event of Object.values(plugin.hooks)) assert.equal(event[0].hooks[0].timeout, 120);
});

test("a catch-up records every builder call and its tokens", () => {
  const root = tempProject();
  recordTurn(root, { kind: "catchup", action: "catchup", reason: "code", via: "local", selector: [], builder: { inputTokens: 900, outputTokens: 80, reasoningTokens: 0, cost: 1.02 }, builderCalls: 11 });
  const stats = loadStats(root);
  assert.deepEqual([stats.calls.builder, stats.tokens.input, stats.tokens.output, stats.cost], [11, 900, 80, 1.02]);
});
