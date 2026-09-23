import * as claude from "./claude.js";
import * as codex from "./codex.js";
import * as grok from "./grok.js";
import * as muse from "./muse.js";
import * as pi from "./pi.js";
import { FLAVOR_IDS } from "./ids.js";

const ADAPTERS = { claude, codex, grok, muse, pi };

export function adapterFor(flavor) {
  if (!Object.prototype.hasOwnProperty.call(ADAPTERS, flavor)) return null;
  return ADAPTERS[flavor];
}

export { FLAVOR_IDS };
