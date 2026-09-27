import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("every copy of the skill is the same file", () => {
  assert.equal(read(".grok/skills/smartypants/SKILL.md"), read("plugins/smartypants/skills/smartypants/SKILL.md"));
});

test("plugin and marketplace manifests agree on the version", () => {
  const version = JSON.parse(read("package.json")).version;
  for (const file of ["plugins/smartypants/.claude-plugin/plugin.json", "plugins/smartypants/.codex-plugin/plugin.json", "plugins/smartypants/plugin.json"]) {
    assert.equal(JSON.parse(read(file)).version, version, file);
  }
  for (const file of [".claude-plugin/marketplace.json", ".cursor-plugin/marketplace.json", ".grok-plugin/marketplace.json"]) {
    for (const plugin of JSON.parse(read(file)).plugins || []) if (plugin.version) assert.equal(plugin.version, version, file);
  }
});

test("the plugin keeps API keys in sensitive user settings", () => {
  const manifest = JSON.parse(read("plugins/smartypants/.claude-plugin/plugin.json"));
  assert.equal(manifest.userConfig.meta_api_key.sensitive, true);
  assert.equal(read("plugins/smartypants/scripts/hook.mjs").includes("CLAUDE_PLUGIN_OPTION_META_API_KEY"), true);
});
