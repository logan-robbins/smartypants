import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { lookupConfig, readConfig } from "../src/config.js";
import {
  LEDGER_TOKEN_BUDGET,
  emptyLedger,
  gist,
  ledgerPath,
  loadLedger,
  projectSketch,
  rememberTurn,
  saveLedger,
  tokenCount,
} from "../src/ledger.js";
import { emptyDesign, markSeeded, saveDesign } from "../src/model.js";
import { handleHook } from "../src/pipeline.js";
import { designFile, readBytes, tempProject } from "./helpers.js";

function silence(fn) {
  const original = console.error;
  console.error = () => {};
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.error = original;
    });
}

test("seed defaults off, accepts booleans, and rejects other values", () => {
  assert.equal(LEDGER_TOKEN_BUDGET, 10000);
  assert.equal(lookupConfig(tempProject({ flavor: "claude" })).seed, false);
  assert.equal(lookupConfig(tempProject({ flavor: "grok", seed: true })).seed, true);
  assert.equal(lookupConfig(tempProject({ flavor: "pi", seed: false })).seed, false);
  const broken = readConfig(tempProject({ flavor: "claude", seed: "yes" }));
  assert.equal(broken.config, null);
  assert.equal(broken.reason, "invalid-seed");
});

test("a gist keeps project words and drops the transcript", () => {
  const transcript = [
    "please just actually um basically really",
    "hello thanks I want you to",
    "make Capture record a purchase the moment someone pays",
    "so the household ledger can explain spending",
    "FULL_TRANSCRIPT_DUMP ".repeat(40),
  ].join(" ");
  const cleaned = gist(transcript);
  assert.equal(cleaned.includes("please"), false);
  assert.equal(cleaned.includes("actually"), false);
  assert.equal(cleaned.includes("FULL_TRANSCRIPT_DUMP"), false);
  assert.equal(cleaned.includes("Capture"), true);
  assert.equal(cleaned.includes("purchase"), true);
  assert.equal(cleaned.includes("ledger"), true);
  assert.ok(cleaned.split(/\s+/).length <= 48);
  assert.ok(cleaned.length < transcript.length / 5);
});

test("the ledger compacts to the token budget and never stores the original text", () => {
  let ledger = emptyLedger();
  for (let index = 0; index < 40; index += 1) {
    const text = `please just actually um capture step ${index} records purchase ${index} in the household ledger`;
    ledger = rememberTurn(ledger, { kind: "intent", text, at: `t${index}` }, 100).ledger;
  }
  assert.ok(ledger.tokens <= 100);
  assert.equal(ledger.tokens, tokenCount(ledger.entries));
  assert.ok(ledger.entries.length < 40);
  assert.equal(ledger.entries.some((entry) => entry.kind === "compact"), true);
  assert.equal(ledger.entries.at(-1).gist.includes("39"), true);
  assert.equal(ledger.entries.every((entry) => !("text" in entry)), true);
  const raw = JSON.stringify(ledger);
  assert.equal(raw.includes("please just actually"), false);
  assert.equal(raw.includes("FULL_TRANSCRIPT"), false);

  const root = tempProject();
  saveLedger(root, ledger);
  const onDisk = fs.readFileSync(ledgerPath(root), "utf8");
  assert.equal(onDisk.includes("please just actually"), false);
  assert.equal(onDisk.includes('"text"'), false);
  const loaded = loadLedger(root);
  assert.equal(loaded.entries.at(-1).gist, ledger.entries.at(-1).gist);
});

test("loading the ledger drops a stored transcript", () => {
  const root = tempProject();
  fs.mkdirSync(path.dirname(ledgerPath(root)), { recursive: true });
  fs.writeFileSync(
    ledgerPath(root),
    `${JSON.stringify({
      version: 1,
      entries: [
        { kind: "note", text: "FULL_TRANSCRIPT please just actually um the whole conversation" },
        { kind: "intent", gist: "capture records purchases", text: "FULL_TRANSCRIPT extra dump" },
      ],
    })}\n`,
  );
  const loaded = loadLedger(root);
  assert.equal(loaded.entries.length, 1);
  assert.equal(loaded.entries[0].gist, "capture records purchases");
  assert.equal(JSON.stringify(loaded).includes("FULL_TRANSCRIPT"), false);
});

test("seed draws a path sketch of the existing project and then tracks deltas", async () => {
  const root = tempProject({ flavor: "claude", depth: "module", seed: true });
  fs.mkdirSync(path.join(root, "src", "capture"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "capture", "receipts.js"),
    "export const body = 'FULL_TRANSCRIPT_DUMP please just actually um the entire file';\n",
  );
  const prompt = "please just actually um add a note that Capture records a purchase when someone pays";
  const first = await silence(() =>
    handleHook({
      cwd: root,
      timeoutMs: 800,
      stdin: JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt }),
    }),
  );
  assert.equal(first.adapterInvoked, true);
  assert.equal(first.request.seed, true);
  assert.equal(first.request.kind, "seed");
  assert.equal(first.request.sketch.includes("src/capture/receipts.js"), true);
  assert.equal(first.request.sketch.includes("FULL_TRANSCRIPT_DUMP"), false);
  assert.equal(first.request.prompt.includes("src/capture/receipts.js"), true);
  assert.equal(first.request.prompt.includes("FULL_TRANSCRIPT_DUMP"), false);
  assert.equal(first.designChanged, false);
  assert.equal(readBytes(designFile(root)), null);
  assert.equal(fs.existsSync(ledgerPath(root)), false);

  const seeded = markSeeded(emptyDesign()).design;
  saveDesign(root, seeded);
  saveLedger(root, {
    version: 1,
    tokens: 1,
    entries: [{ kind: "seed", gist: "capture records purchases", at: "t0" }],
  });
  const later = await silence(() =>
    handleHook({
      cwd: root,
      timeoutMs: 800,
      stdin: JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt }),
    }),
  );
  assert.equal(later.request.seed, false);
  assert.equal(later.request.kind, "design");
  assert.deepEqual(later.request.ledger, ["capture records purchases"]);
  assert.equal(later.request.prompt.includes("capture records purchases"), true);
  assert.equal(later.request.prompt.includes("FULL_TRANSCRIPT_DUMP"), false);
  const still = loadLedger(root);
  assert.equal(JSON.stringify(still).includes("please just actually"), false);
  assert.equal(still.entries.length, 1);
});

test("seed false does not sketch the tree", async () => {
  const root = tempProject({ flavor: "codex", seed: false });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "app.js"), "FULL_TRANSCRIPT_DUMP\n");
  const result = await silence(() =>
    handleHook({
      cwd: root,
      timeoutMs: 800,
      stdin: JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "Design the ledger" }),
    }),
  );
  assert.equal(result.request.seed, false);
  assert.equal(result.request.kind, "design");
  assert.equal(result.request.sketch, "");
  assert.equal(projectSketch(root).includes("FULL_TRANSCRIPT_DUMP"), false);
  assert.equal(projectSketch(root).includes("src/app.js"), true);
});
