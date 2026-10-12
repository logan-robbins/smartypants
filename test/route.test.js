import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const Route = require("../web/route.cjs");

function runs(points) {
  const out = [];
  for (let k = 0; k + 1 < points.length; k += 1) out.push([points[k], points[k + 1]]);
  return out;
}

function orthogonalOnly(points) {
  return runs(points).every(([a, b]) => Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01);
}

function cuts(points, rect) {
  return runs(points).some(([a, b]) =>
    Math.max(a.x, b.x) > rect.x && Math.min(a.x, b.x) < rect.x + rect.w && Math.max(a.y, b.y) > rect.y && Math.min(a.y, b.y) < rect.y + rect.h);
}

test("a clear line is one straight run from port to port", () => {
  const path = Route.orthogonal([], { x: 0, y: 100, dir: 1 }, { x: 400, y: 100, dir: 1 });
  assert.deepEqual(path, [{ x: 0, y: 100 }, { x: 400, y: 100 }]);
});

test("a wall between the ports is gone around, never through", () => {
  const wall = { x: 180, y: 0, w: 40, h: 200 };
  const path = Route.orthogonal([wall], { x: 0, y: 100, dir: 1 }, { x: 400, y: 100, dir: 1 });
  assert.ok(path.length > 2);
  assert.equal(orthogonalOnly(path), true);
  assert.equal(cuts(path, wall), false);
  assert.deepEqual([path[0], path[path.length - 1]], [{ x: 0, y: 100 }, { x: 400, y: 100 }]);
});

test("the path keeps the obstacle margin on every side", () => {
  const block = { x: 180, y: 60, w: 40, h: 80 };
  const path = Route.orthogonal([block], { x: 0, y: 100, dir: 1 }, { x: 400, y: 100, dir: 1 }, { margin: 20 });
  const fat = { x: block.x - 19, y: block.y - 19, w: block.w + 38, h: block.h + 38 };
  assert.equal(cuts(path, fat), false);
});

test("the path leaves and arrives along the port's direction for a stub", () => {
  const block = { x: 180, y: 60, w: 40, h: 80 };
  const path = Route.orthogonal([block], { x: 0, y: 100, dir: 1 }, { x: 400, y: 100, dir: 1 });
  const first = path[1];
  const last = path[path.length - 2];
  assert.equal(first.y, 100);
  assert.ok(first.x >= Route.STUB);
  assert.equal(last.y, 100);
  assert.ok(last.x <= 400 - Route.STUB);
});

test("a return arrow, arriving leftwards, comes in from the right", () => {
  const path = Route.orthogonal([], { x: 400, y: 100, dir: -1 }, { x: 0, y: 100, dir: -1 });
  assert.equal(path[0].x, 400);
  assert.equal(path[path.length - 1].x, 0);
  assert.equal(orthogonalOnly(path), true);
});

test("a port boxed in on every side has no path", () => {
  const box = [
    { x: -200, y: -100, w: 400, h: 60 },
    { x: -200, y: 40, w: 400, h: 60 },
    { x: -200, y: -100, w: 60, h: 200 },
    { x: 140, y: -100, w: 60, h: 200 },
  ];
  assert.equal(Route.orthogonal(box, { x: 0, y: 0, dir: 1 }, { x: 600, y: 0, dir: 1 }), null);
});

test("simplify drops repeated points and the middle of a straight run", () => {
  const out = Route.simplify([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }]);
  assert.deepEqual(out, [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }]);
});

test("spread moves overlapping runs onto separate tracks and keeps the ports", () => {
  const make = (y0, y1) => [{ x: 0, y: y0 }, { x: 20, y: y0 }, { x: 20, y: 150 }, { x: 300, y: 150 }, { x: 300, y: y1 }, { x: 320, y: y1 }];
  const paths = [make(100, 100), make(110, 110), make(120, 120)];
  Route.spread(paths, [], { track: 12 });
  const ys = paths.map((p) => p[2].y).concat(paths.map((p) => p[3].y));
  const lanes = paths.map((p) => p[2].y);
  assert.equal(new Set(lanes).size, 3);
  assert.equal(ys.length, 6);
  const sorted = [...lanes].sort((a, b) => a - b);
  assert.ok(sorted[1] - sorted[0] >= 4 && sorted[2] - sorted[1] >= 4);
  paths.forEach((p) => {
    assert.equal(p[2].y, p[3].y);
    assert.equal(p[0].x, 0);
    assert.equal(p[p.length - 1].x, 320);
  });
});

test("spread leaves runs that never overlap where they are", () => {
  const a = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 90 }, { x: 120, y: 90 }];
  const b = [{ x: 0, y: 200 }, { x: 20, y: 200 }, { x: 20, y: 300 }, { x: 100, y: 300 }, { x: 100, y: 340 }, { x: 120, y: 340 }];
  const before = JSON.stringify([a, b]);
  Route.spread([a, b], [], {});
  assert.equal(JSON.stringify([a, b]), before);
});
