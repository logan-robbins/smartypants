"use strict";

(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SmartypantsRoute = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // ---- Orthogonal arrow routing ------------------------------------------------
  //
  // Pure geometry: no nodes, edges or scenes. `orthogonal` finds the cheapest
  // right-angle path between two ports that keeps clear of every obstacle;
  // `spread` then moves runs that share a line onto parallel tracks.
  var MARGIN = 18; // how close a run may come to an obstacle
  var STUB = 26; // straight run out of (and into) a port before the first turn
  var BEND = 48; // cost of a turn, in px of extra length
  var TRACK = 12; // spacing of parallel runs
  var HUG = 0.15; // extra cost per px of run that hugs an obstacle
  var SHARE = 0.5; // extra cost per px of run that rides another arrow
  var EDGE = 56; // free canvas kept around the obstacles for detours
  var MID_MIN = 20; // gaps at least this wide get a centre line

  /** Runs already routed, so later arrows avoid riding them. */
  function createUsed() {
    return { h: {}, v: {} };
  }

  function addUsed(used, points) {
    for (var k = 0; k + 1 < points.length; k += 1) {
      var a = points[k];
      var b = points[k + 1];
      if (Math.abs(a.y - b.y) < 0.01 && Math.abs(a.x - b.x) >= 0.01) {
        var hk = Math.round(a.y);
        (used.h[hk] = used.h[hk] || []).push([Math.min(a.x, b.x), Math.max(a.x, b.x)]);
      } else if (Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) >= 0.01) {
        var vk = Math.round(a.x);
        (used.v[vk] = used.v[vk] || []).push([Math.min(a.y, b.y), Math.max(a.y, b.y)]);
      }
    }
  }

  function overlapOf(used, horizontal, pos, lo, hi) {
    var list = (horizontal ? used.h : used.v)[Math.round(pos)];
    if (!list) return 0;
    var total = 0;
    for (var i = 0; i < list.length; i += 1) {
      var over = Math.min(hi, list[i][1]) - Math.max(lo, list[i][0]);
      if (over > 0) total += over;
    }
    return total;
  }

  function unique(values) {
    return values.slice().sort(function (a, b) { return a - b; }).filter(function (v, i, list) { return i === 0 || v - list[i - 1] > 0.01; });
  }

  /**
   * Grid lines for one axis: every obstacle boundary, the ports, the open
   * canvas around everything, and a centre line through each wide gap. Lines
   * that are only an obstacle boundary are marked as hugging.
   */
  function linesFor(boundaries, anchors, lo, hi) {
    var hug = {};
    boundaries.forEach(function (v) { hug[Math.round(v * 100)] = true; });
    anchors.forEach(function (v) { hug[Math.round(v * 100)] = false; });
    var base = unique(boundaries.concat(anchors, [lo, hi]));
    var all = base.slice();
    for (var i = 0; i + 1 < base.length; i += 1) {
      if (base[i + 1] - base[i] >= MID_MIN) {
        var mid = (base[i] + base[i + 1]) / 2;
        all.push(mid);
        hug[Math.round(mid * 100)] = false;
      }
    }
    all = unique(all);
    return { at: all, hug: all.map(function (v) { return hug[Math.round(v * 100)] !== false; }) };
  }

  function indexOf(list, value) {
    var lo = 0;
    var hi = list.length - 1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (Math.abs(list[mid] - value) < 0.02) return mid;
      if (list[mid] < value) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  }

  /**
   * The cheapest orthogonal path from port `from` to port `to`.
   *   obstacles: [{ x, y, w, h }]  the path keeps `margin` clear of each
   *   from: { x, y, dir }  dir = +1 / -1, the way the path leaves along x
   *   to:   { x, y, dir }  dir = +1 / -1, the way the path is moving as it arrives
   *   opt:  { margin, stub, bend, used }
   * Returns [{ x, y }] from `from` to `to`, or null when the ports are walled in.
   */
  function orthogonal(obstacles, from, to, opt) {
    var o = opt || {};
    var margin = o.margin == null ? MARGIN : o.margin;
    var stub = o.stub == null ? STUB : o.stub;
    var bend = o.bend == null ? BEND : o.bend;
    var used = o.used || null;
    var s = { x: from.x + from.dir * stub, y: from.y };
    var t = { x: to.x - to.dir * stub, y: to.y };
    var rects = obstacles.map(function (r) {
      return { x0: r.x - margin, y0: r.y - margin, x1: r.x + r.w + margin, y1: r.y + r.h + margin };
    });
    var bx = [];
    var by = [];
    var minX = Math.min(s.x, t.x, from.x, to.x);
    var maxX = Math.max(s.x, t.x, from.x, to.x);
    var minY = Math.min(s.y, t.y);
    var maxY = Math.max(s.y, t.y);
    rects.forEach(function (r) {
      bx.push(r.x0, r.x1);
      by.push(r.y0, r.y1);
      minX = Math.min(minX, r.x0);
      maxX = Math.max(maxX, r.x1);
      minY = Math.min(minY, r.y0);
      maxY = Math.max(maxY, r.y1);
    });
    var gx = linesFor(bx, [s.x, t.x], minX - EDGE, maxX + EDGE);
    var gy = linesFor(by, [s.y, t.y], minY - EDGE, maxY + EDGE);
    var xs = gx.at;
    var ys = gy.at;
    var nx = xs.length;
    var ny = ys.length;
    var si = indexOf(xs, s.x);
    var sj = indexOf(ys, s.y);
    var ti = indexOf(xs, t.x);
    var tj = indexOf(ys, t.y);
    var cells = nx * ny;
    var nodeBlocked = new Uint8Array(cells);
    var hBlocked = new Uint8Array(cells);
    var vBlocked = new Uint8Array(cells);
    rects.forEach(function (r) {
      var ia = indexOf(xs, r.x0);
      var ib = indexOf(xs, r.x1);
      var ja = indexOf(ys, r.y0);
      var jb = indexOf(ys, r.y1);
      var i;
      var j;
      for (j = ja + 1; j < jb; j += 1) {
        for (i = ia + 1; i < ib; i += 1) nodeBlocked[j * nx + i] = 1;
        for (i = ia; i < ib; i += 1) hBlocked[j * nx + i] = 1;
      }
      for (i = ia + 1; i < ib; i += 1) {
        for (j = ja; j < jb; j += 1) vBlocked[j * nx + i] = 1;
      }
    });
    if (nodeBlocked[sj * nx + si] || nodeBlocked[tj * nx + ti]) return null;

    // State = cell + the way the last step moved: 0 +x, 1 -x, 2 +y, 3 -y.
    var DX = [1, -1, 0, 0];
    var DY = [0, 0, 1, -1];
    var states = cells * 4;
    var cost = new Float64Array(states).fill(Infinity);
    var back = new Int32Array(states).fill(-1);
    var heapState = [];
    var heapF = [];
    function push(state, f) {
      var at = heapState.length;
      heapState.push(state);
      heapF.push(f);
      while (at > 0) {
        var up = (at - 1) >> 1;
        if (heapF[up] <= heapF[at]) break;
        var ts = heapState[up]; heapState[up] = heapState[at]; heapState[at] = ts;
        var tf = heapF[up]; heapF[up] = heapF[at]; heapF[at] = tf;
        at = up;
      }
    }
    function pop() {
      var top = heapState[0];
      var lastState = heapState.pop();
      var lastF = heapF.pop();
      if (heapState.length) {
        heapState[0] = lastState;
        heapF[0] = lastF;
        var at = 0;
        for (;;) {
          var l = at * 2 + 1;
          var r = l + 1;
          var m = at;
          if (l < heapState.length && heapF[l] < heapF[m]) m = l;
          if (r < heapState.length && heapF[r] < heapF[m]) m = r;
          if (m === at) break;
          var ts = heapState[m]; heapState[m] = heapState[at]; heapState[at] = ts;
          var tf = heapF[m]; heapF[m] = heapF[at]; heapF[at] = tf;
          at = m;
        }
      }
      return top;
    }
    function heuristic(i, j) {
      return Math.abs(xs[i] - t.x) + Math.abs(ys[j] - t.y);
    }
    var startDir = from.dir > 0 ? 0 : 1;
    var wantDir = to.dir > 0 ? 0 : 1;
    var start = (sj * nx + si) * 4 + startDir;
    cost[start] = 0;
    push(start, heuristic(si, sj));
    var goal = -1;
    while (heapState.length) {
      var cur = pop();
      var d = cur & 3;
      var cell = cur >> 2;
      var ci = cell % nx;
      var cj = (cell - ci) / nx;
      var here = cost[cur];
      if (ci === ti && cj === tj) { goal = cur; break; }
      for (var nd = 0; nd < 4; nd += 1) {
        if (nd === (d ^ 1)) continue;
        var ni = ci + DX[nd];
        var nj = cj + DY[nd];
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
        var ncell = nj * nx + ni;
        if (nodeBlocked[ncell]) continue;
        var horizontal = nd < 2;
        var edgeCell = horizontal ? (nd === 0 ? cell : ncell) : (nd === 2 ? cell : ncell);
        if (horizontal ? hBlocked[edgeCell] : vBlocked[edgeCell]) continue;
        var len = horizontal ? Math.abs(xs[ni] - xs[ci]) : Math.abs(ys[nj] - ys[cj]);
        var step = len;
        if ((nd >> 1) !== (d >> 1)) step += bend;
        if (horizontal ? gy.hug[cj] : gx.hug[ci]) step += len * HUG;
        if (used) {
          var lo = horizontal ? Math.min(xs[ci], xs[ni]) : Math.min(ys[cj], ys[nj]);
          step += overlapOf(used, horizontal, horizontal ? ys[cj] : xs[ci], lo, lo + len) * SHARE;
        }
        if (ni === ti && nj === tj) {
          if (nd === (wantDir ^ 1)) continue;
          if (nd !== wantDir) step += bend;
        }
        var total = here + step;
        var nstate = ncell * 4 + nd;
        if (total < cost[nstate]) {
          cost[nstate] = total;
          back[nstate] = cur;
          push(nstate, total + heuristic(ni, nj));
        }
      }
    }
    if (goal < 0) return null;
    var grid = [];
    for (var at = goal; at >= 0; at = back[at]) {
      var c = at >> 2;
      var gi = c % nx;
      grid.push({ x: xs[gi], y: ys[(c - gi) / nx] });
    }
    grid.reverse();
    return simplify([{ x: from.x, y: from.y }].concat(grid, [{ x: to.x, y: to.y }]));
  }

  /** Drop repeated points and the middle point of every straight run. */
  function simplify(points) {
    var out = [];
    points.forEach(function (p) {
      var last = out[out.length - 1];
      if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) return;
      out.push({ x: p.x, y: p.y });
    });
    for (var i = out.length - 2; i > 0; i -= 1) {
      var a = out[i - 1];
      var b = out[i];
      var c = out[i + 1];
      var flatX = Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - c.x) < 0.01;
      var flatY = Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01;
      if (flatX || flatY) out.splice(i, 1);
    }
    return out;
  }

  /**
   * Runs that lie on the same line and overlap are moved onto parallel tracks,
   * kept clear of obstacles, ordered so the legs at their ends cross as few
   * other runs as possible. The first and last run of a path hold its ports and
   * never move. Points are edited in place.
   *   paths: [[{ x, y }]]   obstacles: [{ x, y, w, h }]   opt: { track, clear }
   */
  function spread(paths, obstacles, opt) {
    var o = opt || {};
    var track = o.track || TRACK;
    var clear = o.clear == null ? 14 : o.clear;
    [true, false].forEach(function (horizontal) {
      var recs = [];
      paths.forEach(function (P, pi) {
        for (var k = 1; k + 2 < P.length; k += 1) {
          var a = P[k];
          var b = P[k + 1];
          var isH = Math.abs(a.y - b.y) < 0.01 && Math.abs(a.x - b.x) >= 0.01;
          var isV = Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) >= 0.01;
          if (horizontal ? !isH : !isV) continue;
          var before = P[k - 1];
          var after = P[k + 2];
          recs.push(horizontal
            ? {
              path: P, k: k, pi: pi, pos: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x),
              ends: [{ at: a.x, dir: Math.sign(before.y - a.y) }, { at: b.x, dir: Math.sign(after.y - b.y) }],
            }
            : {
              path: P, k: k, pi: pi, pos: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y),
              ends: [{ at: a.y, dir: Math.sign(before.x - a.x) }, { at: b.y, dir: Math.sign(after.x - b.x) }],
            });
        }
      });
      // runs that sit within half a track of each other and overlap are one bundle
      var parent = recs.map(function (_, i) { return i; });
      function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
      for (var i = 0; i < recs.length; i += 1) {
        for (var j = i + 1; j < recs.length; j += 1) {
          if (Math.abs(recs[i].pos - recs[j].pos) < track * 0.45 && recs[i].lo < recs[j].hi - 1 && recs[j].lo < recs[i].hi - 1) parent[find(i)] = find(j);
        }
      }
      var bundles = {};
      recs.forEach(function (rec, i) { (bundles[find(i)] = bundles[find(i)] || []).push(rec); });
      Object.keys(bundles).forEach(function (key) {
        var bundle = bundles[key];
        if (bundle.length < 2) return;
        // cost of putting `first` before (above / left of) `second`
        function crossings(first, second) {
          var n = 0;
          first.ends.forEach(function (end) { if (end.dir > 0 && end.at > second.lo + 0.5 && end.at < second.hi - 0.5) n += 1; });
          second.ends.forEach(function (end) { if (end.dir < 0 && end.at > first.lo + 0.5 && end.at < first.hi - 0.5) n += 1; });
          return n;
        }
        var order = [];
        bundle.sort(function (a, b) { return a.lo - b.lo || a.pi - b.pi; }).forEach(function (rec) {
          var bestAt = 0;
          var bestCost = Infinity;
          for (var p = 0; p <= order.length; p += 1) {
            var total = 0;
            for (var q = 0; q < order.length; q += 1) total += q < p ? crossings(order[q], rec) : crossings(rec, order[q]);
            if (total < bestCost) { bestCost = total; bestAt = p; }
          }
          order.splice(bestAt, 0, rec);
        });
        var avg = order.reduce(function (sum, r) { return sum + r.pos; }, 0) / order.length;
        var fmin = -Infinity;
        var fmax = Infinity;
        order.forEach(function (rec) {
          obstacles.forEach(function (ob) {
            var oLo = horizontal ? ob.x : ob.y;
            var oHi = horizontal ? ob.x + ob.w : ob.y + ob.h;
            if (!(oLo < rec.hi && oHi > rec.lo)) return;
            var aLo = horizontal ? ob.y : ob.x;
            var aHi = horizontal ? ob.y + ob.h : ob.x + ob.w;
            if (aHi <= rec.pos + 0.5) fmin = Math.max(fmin, aHi + clear);
            else if (aLo >= rec.pos - 0.5) fmax = Math.min(fmax, aLo - clear);
          });
        });
        var room = fmax - fmin;
        var spacing = Math.min(track, order.length > 1 && isFinite(room) ? Math.max(4, room / (order.length - 1)) : track);
        var half = ((order.length - 1) * spacing) / 2;
        var center = avg;
        if (isFinite(fmin) && center - half < fmin) center = fmin + half;
        if (isFinite(fmax) && center + half > fmax) center = fmax - half;
        order.forEach(function (rec, n) {
          var value = Math.round(center + (n - (order.length - 1) / 2) * spacing);
          if (horizontal) { rec.path[rec.k].y = value; rec.path[rec.k + 1].y = value; }
          else { rec.path[rec.k].x = value; rec.path[rec.k + 1].x = value; }
        });
      });
    });
    return paths;
  }

  return {
    MARGIN: MARGIN,
    STUB: STUB,
    TRACK: TRACK,
    createUsed: createUsed,
    addUsed: addUsed,
    orthogonal: orthogonal,
    simplify: simplify,
    spread: spread,
  };
});
