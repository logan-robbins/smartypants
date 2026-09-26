import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const scene = require("../web/scene.cjs");

export const buildScene = scene.buildScene;
export const moveNode = scene.moveNode;
export const collapse = scene.collapse;
