"use strict";

(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SmartypantsSpace = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // ---- Clearance ---------------------------------------------------------------
  //
  // The canvas is infinite, so every component keeps a minimum clear gap to every
  // other component on each axis. Two parts that sit in different boundaries keep
  // a larger one, so boundary outlines never touch a neighbour.
  var GAP = { x: 64, y: 56 };
  var ZONE_GAP = { x: 96, y: 80 };

  /** True when two rectangles are closer than `gap` on both axes (overlap included). */
  function clash(a, b, gap) {
    return a.x < b.x + b.w + gap.x && b.x < a.x + a.w + gap.x && a.y < b.y + b.h + gap.y && b.y < a.y + a.h + gap.y;
  }

  function union(rects) {
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    rects.forEach(function (r) {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    });
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  function inflate(r, by) {
    return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
  }

  /**
   * The smallest translation of `box` that satisfies `legal(dx, dy)`.
   * Candidates line the box's edges up with each obstacle's clearance line, so
   * the answer is the nearest free spot, not just the nearest grid step.
   * obstacles: [{ x, y, w, h, gap }] (only used to propose candidates).
   * Returns { dx, dy }, or null when no candidate is legal.
   */
  function nearest(box, obstacles, legal) {
    var xs = { 0: 0 };
    var ys = { 0: 0 };
    obstacles.forEach(function (o) {
      var gap = o.gap || GAP;
      xs[Math.floor(o.x - gap.x - (box.x + box.w))] = 0;
      xs[Math.ceil(o.x + o.w + gap.x - box.x)] = 0;
      ys[Math.floor(o.y - gap.y - (box.y + box.h))] = 0;
      ys[Math.ceil(o.y + o.h + gap.y - box.y)] = 0;
    });
    var cands = [];
    Object.keys(xs).forEach(function (sx) {
      Object.keys(ys).forEach(function (sy) {
        var dx = Number(sx);
        var dy = Number(sy);
        cands.push({ dx: dx, dy: dy, d: dx * dx + dy * dy });
      });
    });
    cands.sort(function (a, b) { return a.d - b.d; });
    for (var i = 0; i < cands.length; i += 1) {
      if (legal(cands[i].dx, cands[i].dy)) return { dx: cands[i].dx, dy: cands[i].dy };
    }
    return null;
  }

  return { GAP: GAP, ZONE_GAP: ZONE_GAP, clash: clash, union: union, inflate: inflate, nearest: nearest };
});
