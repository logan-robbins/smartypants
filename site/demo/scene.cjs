"use strict";

(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SmartypantsScene = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var inNode = typeof module !== "undefined" && module.exports;
  var Space = inNode ? require("./space.cjs") : globalThis.SmartypantsSpace;
  var Route = inNode ? require("./route.cjs") : globalThis.SmartypantsRoute;
  if (!Space || !Route) throw new Error("web/space.cjs and web/route.cjs must load before web/scene.cjs");

  // ---- Box metrics -----------------------------------------------------------
  //
  // One 8px rhythm for everything: box sizes snap to 8, gaps are multiples of 8.
  // Text widths are estimated (the builder runs in Node too), with averages
  // taken from common UI sans faces: 16px semibold names, 13px regular blurbs.
  var NAME_PX = 8.3;
  var BLURB_PX = 6.2;
  var TITLE_PX = 11.6;
  var PAD_X = 18;
  var BOX_MIN = 184;
  var BOX_MAX = 288;
  var NAME_LINE = 20;
  var BLURB_LINE = 17;
  var SYSTEM_H = 64;
  var HEADER_MIN = 168;
  var HEADER_MAX = 256;
  var LABEL_PX = 6.0;
  var LABEL_H = 20;
  var LABEL_CHARS = 28;

  function slug(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function findNode(nodes, id) {
    if (!id) return null;
    var want = String(id);
    return nodes.find(function (node) {
      return node.id === want || slug(node.id) === slug(want) || slug(node.name) === slug(want);
    });
  }

  function serviceName(node, nodes) {
    var parent = findNode(nodes, node.parentId);
    if (!parent || parent.kind === "system") return "";
    return parent.name || "";
  }

  function snap(value) {
    return Math.ceil(value / 8) * 8;
  }

  /** The short line under the name: the blurb, else the first words of what. */
  function blurbOf(node) {
    var text = String(node.blurb || "").trim();
    if (!text) {
      var words = String(node.what || "").replace(/\s+/g, " ").trim().split(" ");
      text = words.slice(0, 8).join(" ") + (words.length > 8 ? "…" : "");
    }
    return text;
  }

  function wrapLines(text, per, max) {
    var words = String(text || "").split(/\s+/).filter(Boolean);
    var lines = [];
    var line = "";
    words.forEach(function (word) {
      if (word.length > per) word = word.slice(0, Math.max(1, per - 1)) + "…";
      var next = line ? line + " " + word : word;
      if (line && next.length > per) {
        lines.push(line);
        line = word;
      } else line = next;
    });
    if (line) lines.push(line);
    if (max && lines.length > max) {
      lines = lines.slice(0, max);
      var last = lines[max - 1];
      lines[max - 1] = (last.length > per - 1 ? last.slice(0, per - 1).replace(/\s*\S*$/, "") : last) + "…";
    }
    return lines;
  }

  /** Slanted and pointed shapes lose some width for text. */
  function insetOf(shape) {
    return shape === "queue" ? 28 : shape === "external" ? 24 : shape === "gateway" ? 20 : shape === "worker" ? 12 : 0;
  }

  function capOf(shape) {
    return shape === "store" || shape === "cache" ? 16 : 0;
  }

  /** Name and blurb lines for a box of a given width. */
  function boxLines(node, w) {
    var inner = Math.max(80, w - PAD_X * 2 - insetOf(node.shape));
    var blurb = blurbOf(node);
    return {
      name: wrapLines(node.name, Math.max(8, Math.floor(inner / NAME_PX)), 2),
      blurb: blurb ? wrapLines(blurb, Math.max(10, Math.floor(inner / BLURB_PX)), 2) : [],
    };
  }

  function boxHeight(lines, shape) {
    var text = lines.name.length * NAME_LINE + (lines.blurb.length ? 4 + lines.blurb.length * BLURB_LINE : 0);
    return snap(28 + text) + capOf(shape);
  }

  /** A cluster's title panel: name, blurb, and how many parts are inside. */
  function headerLines(node, w) {
    var inner = w - 32;
    return {
      name: wrapLines(node.name, Math.max(8, Math.floor(inner / NAME_PX)), 3),
      blurb: wrapLines(blurbOf(node), Math.max(10, Math.floor(inner / BLURB_PX)), 3),
    };
  }

  function headerSize(node) {
    var natural = Math.max(String(node.name || "").length * NAME_PX, blurbOf(node).length * BLURB_PX * 0.6) + 32;
    var w = Math.max(HEADER_MIN, Math.min(HEADER_MAX, snap(natural)));
    var lines = headerLines(node, w);
    var h = snap(20 + lines.name.length * NAME_LINE + 6 + lines.blurb.length * BLURB_LINE + 10 + 14 + 20);
    return { w: w, h: h, lines: lines };
  }

  // Boxes carry a readable name and a one-line description; details open on click.
  function sizeOf(node) {
    var name = String(node.name || "");
    if (node.kind === "system") {
      return { w: snap(Math.max(name.length * TITLE_PX, blurbOf(node).length * BLURB_PX) + 48), h: SYSTEM_H };
    }
    if (node.kind === "unmapped") {
      var body = wrapLines(node.what, 34).length + wrapLines(node.why, 34).length;
      return { w: 264, h: snap(64 + body * BLURB_LINE) };
    }
    var natural = Math.max(name.length * NAME_PX, blurbOf(node).length * BLURB_PX) + PAD_X * 2 + insetOf(node.shape);
    var w = Math.max(BOX_MIN, Math.min(BOX_MAX, snap(natural)));
    return { w: w, h: boxHeight(boxLines(node, w), node.shape) };
  }

  /** One width and height per row, so a layer reads as a layer. */
  function evenSizes(nodes, rankOf) {
    var rows = {};
    nodes.forEach(function (node) {
      var key = rankOf(node);
      (rows[key] = rows[key] || []).push(node);
    });
    var out = {};
    Object.keys(rows).forEach(function (key) {
      var row = rows[key];
      var w = 0;
      row.forEach(function (node) { w = Math.max(w, sizeOf(node).w); });
      var base = 0;
      row.forEach(function (node) { base = Math.max(base, boxHeight(boxLines(node, w), node.shape) - capOf(node.shape)); });
      // Cylinders keep their caps; everything else shares the row height.
      row.forEach(function (node) { out[node.id] = { w: w, h: base + capOf(node.shape) }; });
    });
    return out;
  }

  function labelOf(node) {
    var parts = [node.group, node.name, node.what, node.why].concat(node.notes || []);
    var flags = node.flags || [];
    for (var i = 0; i < flags.length; i += 1) {
      parts.push(flags[i].intent);
      parts.push(flags[i].difference);
    }
    return parts.filter(Boolean).join(" ");
  }

  function place(node, x, y, size, extra) {
    size = size || sizeOf(node);
    var header = Boolean(extra && extra.header);
    var lines;
    if (node.kind === "system") lines = { name: [String(node.name || "")], blurb: blurbOf(node) ? [blurbOf(node)] : [] };
    else if (node.kind === "unmapped") lines = { name: ["Unmapped drift"], blurb: wrapLines(node.what, 34), code: wrapLines(node.why, 34) };
    else if (header) lines = headerLines(node, size.w);
    else lines = boxLines(node, size.w);
    return {
      id: node.id,
      kind: node.kind,
      name: node.name,
      group: node.group || "",
      what: node.what || "",
      why: node.why || "",
      blurb: blurbOf(node),
      tier: inferTier(node),
      zone: node.zone || "",
      flags: node.flags || [],
      flagged: (node.flags || []).length > 0,
      shape: node.shape || (node.kind === "system" ? "system" : "service"),
      notes: node.notes || [],
      collapsed: Boolean(node.collapsed),
      hidden: node.hidden || 0,
      parentId: node.parentId || null,
      header: header,
      parts: header ? extra.parts || 0 : 0,
      lines: lines,
      x: x,
      y: y,
      w: size.w,
      h: size.h,
      label: labelOf(node),
    };
  }

  function annotate(nodes) {
    return nodes.map(function (node) {
      return Object.assign({}, node, { group: serviceName(node, nodes) });
    });
  }

  var RANK_MIN = 96;
  var PORT_STEP = 18;
  var CLUSTER_PAD = 24;
  var CLUSTER_TITLE = 30;

  /** The text an arrow label shows and the width its box needs. */
  function labelSize(label) {
    var text = String(label || "").trim();
    if (text.length > LABEL_CHARS) text = text.slice(0, LABEL_CHARS - 1).replace(/[\s,;:/.-]+$/, "") + "…";
    return { text: text, w: text ? Math.round(text.length * LABEL_PX + 18) : 0, h: LABEL_H };
  }

  /**
   * Layered (Sugiyama-style) layout, ranks left to right.
   *   - Rows in a rank keep `rowGap` between them.
   *   - A rank gap is as wide as the arrows and labels crossing it need.
   *   - An arrow spanning several ranks reserves a lane in each rank it passes,
   *     so it has a corridor and never has to cut through a card.
   * items: [{ id, w, h }]  links: [{ from, to, lab }] (lab = label extent along the rank axis)
   * opt: { rowGap } -> { at: { id: { x, y, w, h } }, w, h }
   */
  function layered(items, links, opt) {
    var rowGap = (opt && opt.rowGap) || Space.GAP.y;
    var lane = Route.TRACK;
    var ids = items.map(function (item) { return item.id; });
    var index = {};
    var size = {};
    items.forEach(function (item, i) {
      index[item.id] = i;
      size[item.id] = { w: item.w, h: item.h, lane: false };
    });
    var succ = {};
    var pred = {};
    ids.forEach(function (id) { succ[id] = []; pred[id] = []; });
    // Break cycles: a DFS back edge is laid out reversed.
    var state = {};
    var edges = [];
    function dfs(id) {
      state[id] = 1;
      links.forEach(function (link) {
        if (link.from !== id || !(link.to in index) || link.to === id) return;
        if (state[link.to] === 1) edges.push({ from: link.to, to: id });
        else {
          edges.push({ from: id, to: link.to });
          if (!state[link.to]) dfs(link.to);
        }
      });
      state[id] = 2;
    }
    // Roots: sources first, then the order nodes first send a message, so a
    // request reads left to right and its reply is the reversed edge.
    var firstSend = {};
    links.forEach(function (link, i) { if (firstSend[link.from] == null) firstSend[link.from] = i; });
    var indegree = {};
    links.forEach(function (link) { if (link.from !== link.to) indegree[link.to] = (indegree[link.to] || 0) + 1; });
    ids.slice().sort(function (a, b) {
      var ra = indegree[a] ? 1 : 0;
      var rb = indegree[b] ? 1 : 0;
      if (ra !== rb) return ra - rb;
      var fa = firstSend[a] == null ? Infinity : firstSend[a];
      var fb = firstSend[b] == null ? Infinity : firstSend[b];
      return fa - fb || index[a] - index[b];
    }).forEach(function (id) { if (!state[id]) dfs(id); });
    var seen = {};
    edges.forEach(function (edge) {
      var key = edge.from + ">" + edge.to;
      if (seen[key]) return;
      seen[key] = true;
      succ[edge.from].push(edge.to);
      pred[edge.to].push(edge.from);
    });
    // Longest-path ranks, then pull sinks-only nodes right next to their callers.
    var rank = {};
    function rankOf(id, guard) {
      if (rank[id] != null) return rank[id];
      if (guard > items.length) return 0;
      var best = 0;
      pred[id].forEach(function (p) { best = Math.max(best, rankOf(p, guard + 1) + 1); });
      rank[id] = best;
      return best;
    }
    ids.forEach(function (id) { rankOf(id, 0); });
    ids.forEach(function (id) {
      if (pred[id].length || !succ[id].length) return;
      var min = Infinity;
      succ[id].forEach(function (s) { min = Math.min(min, rank[s]); });
      if (min !== Infinity && min - 1 > rank[id]) rank[id] = min - 1;
    });
    var ranks = [];
    ids.forEach(function (id) {
      (ranks[rank[id]] = ranks[rank[id]] || []).push(id);
    });
    ranks = ranks.filter(Boolean);
    ranks.forEach(function (list, r) { list.forEach(function (id) { rank[id] = r; }); });
    // Lanes: an arrow that spans several ranks gets a zero-size stand-in in each rank it passes.
    var spare = items.length;
    ids.forEach(function (from) {
      succ[from].slice().forEach(function (to) {
        if (rank[to] - rank[from] < 2) return;
        succ[from].splice(succ[from].indexOf(to), 1);
        pred[to].splice(pred[to].indexOf(from), 1);
        var prev = from;
        for (var r = rank[from] + 1; r < rank[to]; r += 1) {
          var id = "lane:" + from + ">" + to + ":" + r;
          index[id] = spare;
          spare += 1;
          size[id] = { w: 0, h: 0, lane: true };
          rank[id] = r;
          succ[id] = [];
          pred[id] = [prev];
          succ[prev].push(id);
          ranks[r].push(id);
          prev = id;
        }
        succ[prev].push(to);
        pred[to].push(prev);
      });
    });
    // Order within ranks: barycenter sweeps.
    var pos = {};
    function number() {
      ranks.forEach(function (list) { list.forEach(function (id, i) { pos[id] = i; }); });
    }
    number();
    function bary(id, neighbors) {
      var list = neighbors[id];
      if (!list.length) return pos[id];
      var sum = 0;
      list.forEach(function (n) { sum += pos[n]; });
      return sum / list.length;
    }
    for (var iter = 0; iter < 6; iter += 1) {
      var down = iter % 2 === 0;
      var order = down ? ranks.slice(1) : ranks.slice(0, -1).reverse();
      order.forEach(function (list) {
        var weights = {};
        list.forEach(function (id) { weights[id] = bary(id, down ? pred : succ); });
        list.sort(function (a, b) { return weights[a] - weights[b] || index[a] - index[b]; });
        list.forEach(function (id, i) { pos[id] = i; });
      });
    }
    // Rank gaps: wide enough for the label of every adjacent-rank arrow and a track for every arrow crossing.
    var lanesAt = [];
    var labelAt = [];
    links.forEach(function (link) {
      if (!(link.from in rank) || !(link.to in rank) || link.from === link.to) return;
      var lo = Math.min(rank[link.from], rank[link.to]);
      var hi = Math.max(rank[link.from], rank[link.to]);
      for (var g = lo; g < hi; g += 1) lanesAt[g] = (lanesAt[g] || 0) + 1;
      if (hi - lo === 1) labelAt[lo] = Math.max(labelAt[lo] || 0, link.lab || 0);
    });
    function gapAfter(r) {
      return Math.max(
        RANK_MIN,
        labelAt[r] ? labelAt[r] + Route.STUB * 2 : 0,
        (lanesAt[r] || 0) * lane + Route.STUB * 2 + 24,
      );
    }
    function between(a, b) {
      if (size[a].lane && size[b].lane) return lane;
      return size[a].lane || size[b].lane ? rowGap / 2 : rowGap;
    }
    // Coordinates: columns by rank, rows stacked, then aligned to neighbours.
    var out = {};
    var x = 0;
    ranks.forEach(function (list, r) {
      var width = 0;
      list.forEach(function (id) { width = Math.max(width, size[id].w); });
      var y = 0;
      list.forEach(function (id, i) {
        if (i) y += between(list[i - 1], id);
        out[id] = { x: x + (width - size[id].w) / 2, y: y, w: size[id].w, h: size[id].h };
        y += size[id].h;
      });
      list.forEach(function (id) { out[id].y -= y / 2; });
      x += width + gapAfter(r);
    });
    function center(id) { return out[id].y + out[id].h / 2; }
    function align(list, neighbors) {
      var want = list.map(function (id) {
        var near = neighbors[id].filter(function (n) { return out[n]; });
        if (!near.length) return center(id);
        var ys = near.map(center).sort(function (a, b) { return a - b; });
        return ys[Math.floor((ys.length - 1) / 2)] * 0.5 + ys[Math.ceil((ys.length - 1) / 2)] * 0.5;
      });
      var tops = list.map(function (id, i) { return want[i] - out[id].h / 2; });
      for (var i = 1; i < list.length; i += 1) {
        var min = tops[i - 1] + out[list[i - 1]].h + between(list[i - 1], list[i]);
        if (tops[i] < min) tops[i] = min;
      }
      for (var j = list.length - 2; j >= 0; j -= 1) {
        var max = tops[j + 1] - out[list[j]].h - between(list[j], list[j + 1]);
        if (tops[j] > max) tops[j] = Math.max(max, want[j] - out[list[j]].h / 2 - 400);
      }
      for (var k = 1; k < list.length; k += 1) {
        var floor = tops[k - 1] + out[list[k - 1]].h + between(list[k - 1], list[k]);
        if (tops[k] < floor) tops[k] = floor;
      }
      list.forEach(function (id, i) { out[id].y = tops[i]; });
    }
    for (var pass = 0; pass < 4; pass += 1) {
      ranks.slice(1).forEach(function (list) { align(list, pred); });
      ranks.slice(0, -1).reverse().forEach(function (list) { align(list, succ); });
    }
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ids.forEach(function (id) {
      minX = Math.min(minX, out[id].x); minY = Math.min(minY, out[id].y);
      maxX = Math.max(maxX, out[id].x + out[id].w); maxY = Math.max(maxY, out[id].y + out[id].h);
    });
    var at = {};
    ids.forEach(function (id) { at[id] = { x: out[id].x - minX, y: out[id].y - minY, w: out[id].w, h: out[id].h }; });
    return { at: at, w: ids.length ? maxX - minX : 0, h: ids.length ? maxY - minY : 0 };
  }


  // ---- Tiered layout ---------------------------------------------------------
  //
  // 2026 architecture-diagram convention: layers run top to bottom (who calls at
  // the top, where data rests at the bottom), the request journey runs left to
  // right inside a layer, trust and network boundaries are drawn as frames, and
  // third parties sit at the right edge of the service layer.

  // Rows, top to bottom. Messaging shares a row with the workers it feeds
  // (stream on the left, consumers after it), and caches sit beside the
  // databases they front; object storage is always the bottom row.
  var TIER_ORDER = { client: 0, edge: 1, frontend: 2, api: 3, service: 4, platform: 4, external: 4, messaging: 5, worker: 5, cache: 6, database: 6, storage: 7 };
  var TIER_LABEL = ["Users and clients", "Edge", "Frontend", "API", "Services", "Async", "Data", "Storage"];
  var WITHIN_ROW = { messaging: 0, worker: 1, cache: 0, database: 1, platform: 1, service: 0, external: 2 };
  var TIER_GAP = 96; // between layers: room for arrow lanes and frame padding
  var COL_GAP = Space.GAP.x; // between boxes in a layer
  var ZONE_SEP = Space.ZONE_GAP.x; // between boxes in different boundaries
  var ZONE_PAD = 16; // boundary frame padding
  var ZONE_TOP = 36; // boundary frame padding under its label
  var ZONE_WIDEN = 48; // how close a widened boundary may come to a neighbour
  var FRAME_PAD = 16; // subgraph padding
  var INNER_GAP = Space.GAP.x; // between modules inside a subgraph
  var INNER_ROW_GAP = Space.GAP.y + 8;
  var TRACK = 12; // spacing of parallel arrows in one channel
  var MAX_PER_ROW = 6; // a layer with more boxes wraps into sub-rows
  var LABEL_KEEP = 32; // room kept in a gap for a boundary label

  function inferTier(node) {
    if (!node) return "service";
    if (TIER_ORDER[node.tier] != null) return node.tier;
    var n = String(node.name || "").toLowerCase();
    switch (node.shape) {
      case "client": return "client";
      case "gateway": return "edge";
      case "queue": return "messaging";
      case "cache": return "cache";
      case "worker": return "worker";
      case "external": return "external";
      case "store": return /\b(blob|object|bucket|s3|gcs|files?|archive|warehouse|lake|cold|backup|media|cdn origin)\b/.test(n) ? "storage" : "database";
      default: break;
    }
    if (/\b(cdn|dns|waf|load balancer|lb|ingress|edge|gateway|proxy)\b/.test(n)) return "edge";
    if (/\b(web|ui|frontend|front end|spa|portal|dashboard|site)\b/.test(n)) return "frontend";
    if (/\b(api|bff|graphql|rest)\b/.test(n)) return "api";
    if (/\b(auth|identity|config|observability|logging|metrics|monitor|tracing|secrets?)\b/.test(n)) return "platform";
    if (/\b(worker|job|consumer|scheduler|batch|cron|processor)\b/.test(n)) return "worker";
    if (/\b(queue|stream|topic|kafka|bus|pubsub|broker)\b/.test(n)) return "messaging";
    if (/\b(cache|redis|memcached)\b/.test(n)) return "cache";
    if (/\b(db|database|table|postgres|mysql|cassandra|dynamo|dynamodb|mongo|index|search)\b/.test(n)) return "database";
    if (/\b(blob|bucket|s3|object store|archive|warehouse|lake)\b/.test(n)) return "storage";
    if (/\b(client|app|user|users|browser|mobile|device)\b/.test(n) && !/\bservice\b/.test(n)) return "client";
    return "service";
  }

  function tierRank(node) {
    return TIER_ORDER[inferTier(node)];
  }

  /** Least-squares nondecreasing fit (pool adjacent violators). */
  function isotonic(values) {
    var pools = [];
    values.forEach(function (value) {
      pools.push({ sum: value, n: 1 });
      while (pools.length > 1) {
        var a = pools[pools.length - 2];
        var b = pools[pools.length - 1];
        if (a.sum / a.n <= b.sum / b.n) break;
        pools.pop();
        a.sum += b.sum;
        a.n += b.n;
      }
    });
    var out = [];
    pools.forEach(function (pool) {
      for (var i = 0; i < pool.n; i += 1) out.push(pool.sum / pool.n);
    });
    return out;
  }

  /**
   * Rows of items, top to bottom by tier; left to right by journey order, then
   * pulled toward the items they talk to. Items of one boundary stay together
   * in a row, so boundary frames never interleave. Returns positions and size.
   */
  function tierRows(items, links, options) {
    options = options || {};
    var colGap = options.colGap || COL_GAP;
    var sepGap = options.sepGap || ZONE_SEP;
    var rowGap = options.rowGap || TIER_GAP;
    var rowGaps = options.rowGaps || [];
    var index = {};
    items.forEach(function (item, i) { index[item.id] = i; });
    var neighbors = {};
    var out = {};
    items.forEach(function (item) { neighbors[item.id] = []; out[item.id] = []; });
    links.forEach(function (link) {
      if (!(link.from in index) || !(link.to in index) || link.from === link.to) return;
      neighbors[link.from].push(link.to);
      neighbors[link.to].push(link.from);
      out[link.from].push(link.to);
    });
    // Journey order: walk the flows from the topmost callers.
    var journey = {};
    var counter = 0;
    var indegree = {};
    var firstSend = {};
    links.forEach(function (link, i) {
      if (link.from === link.to) return;
      indegree[link.to] = (indegree[link.to] || 0) + 1;
      if (firstSend[link.from] == null) firstSend[link.from] = i;
    });
    // Callers first: within a tier, what nobody calls starts the journey.
    var starts = items.slice().sort(function (a, b) {
      return a.rank - b.rank || (indegree[a.id] ? 1 : 0) - (indegree[b.id] ? 1 : 0) ||
        (firstSend[a.id] == null ? Infinity : firstSend[a.id]) - (firstSend[b.id] == null ? Infinity : firstSend[b.id]) || index[a.id] - index[b.id];
    });
    starts.forEach(function (start) {
      if (journey[start.id] != null) return;
      var queue = [start.id];
      journey[start.id] = counter++;
      while (queue.length) {
        var id = queue.shift();
        out[id].forEach(function (next) {
          if (journey[next] != null) return;
          journey[next] = counter++;
          queue.push(next);
        });
      }
    });
    function zoneKey(item) {
      return (item.last ? "last|" : "") + (options.flat ? "" : item.zone || "");
    }
    var zoneOrder = {};
    var zones = 0;
    items.slice().sort(function (a, b) { return a.rank - b.rank || journey[a.id] - journey[b.id]; }).forEach(function (item) {
      var key = zoneKey(item);
      if (zoneOrder[key] == null) zoneOrder[key] = zones++;
    });
    var rowsByRank = {};
    items.forEach(function (item) { (rowsByRank[item.rank] = rowsByRank[item.rank] || []).push(item); });
    var ranks = Object.keys(rowsByRank).map(Number).sort(function (a, b) { return a - b; });
    function sortRow(row) {
      var blocks = {};
      row.forEach(function (item) {
        var key = zoneKey(item);
        var block = (blocks[key] = blocks[key] || { last: Boolean(item.last), sub: Infinity });
        block.sub = Math.min(block.sub, item.sub || 0);
      });
      var keys = Object.keys(blocks).sort(function (a, b) {
        return (blocks[a].last ? 1 : 0) - (blocks[b].last ? 1 : 0) || blocks[a].sub - blocks[b].sub || zoneOrder[a] - zoneOrder[b];
      });
      row.forEach(function (item) { item.block = keys.indexOf(zoneKey(item)); });
      return row.sort(function (a, b) {
        return a.block - b.block || (a.sub || 0) - (b.sub || 0) || journey[a.id] - journey[b.id];
      });
    }
    function gapOf(a, b) {
      return zoneKey(a) === zoneKey(b) ? colGap : sepGap;
    }

    /**
     * Wrap a long layer into sub-rows: callers inside the layer above the
     * parts they call (an orchestrator above its services), else balanced
     * runs in journey order. Third parties stay on the first sub-row.
     */
    function splitRow(row, per) {
      var own = row.filter(function (item) { return !item.last; });
      var tail = row.filter(function (item) { return item.last; });
      var inRow = {};
      own.forEach(function (item) { inRow[item.id] = true; });
      var depth = {};
      function depthOf(id, seen) {
        if (depth[id] != null) return depth[id];
        if (seen[id]) return 0;
        seen[id] = true;
        var best = 0;
        own.forEach(function (other) {
          if (other.id !== id && out[other.id].indexOf(id) !== -1 && out[id].indexOf(other.id) === -1) best = Math.max(best, depthOf(other.id, seen) + 1);
        });
        seen[id] = false;
        depth[id] = best;
        return best;
      }
      own.forEach(function (item) { depthOf(item.id, {}); });
      var levels = [];
      own.forEach(function (item) { (levels[depth[item.id]] = levels[depth[item.id]] || []).push(item); });
      levels = levels.filter(Boolean);
      if (levels.length < 2 || levels.length > 3) levels = [own];
      var subRows = [];
      levels.forEach(function (level) {
        var parts = Math.ceil(level.length / per);
        var size = Math.ceil(level.length / parts);
        for (var i = 0; i < level.length; i += size) subRows.push(level.slice(i, i + size));
      });
      if (subRows.length < 2 && own.length > 1) {
        var half = Math.ceil(own.length / 2);
        subRows = [own.slice(0, half), own.slice(half)];
      }
      subRows[0] = subRows[0].concat(tail);
      return subRows.map(sortRow);
    }

    function layoutRows(rows) {
      var at = {};
      function placeRow(row) {
        var x = 0;
        row.forEach(function (item, i) {
          if (i) x += gapOf(row[i - 1], item);
          at[item.id] = { x: x, w: item.w };
          x += item.w;
        });
        return x;
      }
      var widest = 0;
      var widths = rows.map(function (row) { var w = placeRow(row); widest = Math.max(widest, w); return w; });
      rows.forEach(function (row, r) {
        var shift = (widest - widths[r]) / 2;
        row.forEach(function (item) { at[item.id].x += shift; });
      });
      function center(id) { return at[id].x + at[id].w / 2; }
      function align(row) {
        var inRow = {};
        row.forEach(function (item) { inRow[item.id] = true; });
        var want = {};
        row.forEach(function (item) {
          var near = neighbors[item.id].filter(function (n) { return at[n] && !inRow[n]; });
          if (!near.length) {
            want[item.id] = center(item.id);
            return;
          }
          var xs = near.map(center).sort(function (a, b) { return a - b; });
          want[item.id] = (xs[Math.floor((xs.length - 1) / 2)] + xs[Math.ceil((xs.length - 1) / 2)]) / 2;
        });
        // Reorder by pull inside each boundary block; blocks keep their order.
        row.sort(function (a, b) {
          return a.block - b.block || (a.sub || 0) - (b.sub || 0) || want[a.id] - want[b.id] || journey[a.id] - journey[b.id];
        });
        // Move as little as possible while keeping order and gaps.
        var offsets = [];
        var offset = 0;
        row.forEach(function (item, i) {
          if (i) offset += row[i - 1].w + gapOf(row[i - 1], item);
          offsets.push(offset);
        });
        var fitted = isotonic(row.map(function (item, i) { return want[item.id] - item.w / 2 - offsets[i]; }));
        row.forEach(function (item, i) { at[item.id].x = fitted[i] + offsets[i]; });
      }
      for (var pass = 0; pass < 4; pass += 1) {
        rows.slice(1).forEach(align);
        rows.slice(0, -1).reverse().forEach(align);
      }
      // Third parties sit at the right edge of the whole picture.
      var rightEdge = -Infinity;
      rows.forEach(function (row) {
        row.forEach(function (item) { if (!item.last) rightEdge = Math.max(rightEdge, at[item.id].x + item.w); });
      });
      rows.forEach(function (row) {
        var cursor = rightEdge > -Infinity ? rightEdge + sepGap : 0;
        var prev = null;
        row.forEach(function (item) {
          if (!item.last) return;
          if (prev) cursor += gapOf(prev, item);
          at[item.id].x = cursor;
          cursor += item.w;
          prev = item;
        });
      });
      var y = 0;
      var plain = 0;
      var minX = Infinity;
      var maxX = -Infinity;
      var rowInfo = [];
      rows.forEach(function (row, r) {
        var height = 0;
        row.forEach(function (item) { height = Math.max(height, item.h); });
        row.forEach(function (item) {
          at[item.id].y = y + (height - item.h) / 2;
          at[item.id].h = item.h;
          minX = Math.min(minX, at[item.id].x);
          maxX = Math.max(maxX, at[item.id].x + item.w);
        });
        rowInfo.push({ rank: row[0].rank, y: y, h: height });
        y += height + (rowGaps[r] != null ? rowGaps[r] : rowGap);
        plain += height + (r < rows.length - 1 ? rowGap : 0);
      });
      Object.keys(at).forEach(function (id) { at[id].x = Math.round(at[id].x - minX); at[id].y = Math.round(at[id].y); });
      var lastGap = rows.length && rowGaps[rows.length - 1] != null ? rowGaps[rows.length - 1] : rowGap;
      return { at: at, w: items.length ? maxX - minX : 0, h: items.length ? y - lastGap : 0, plainH: plain, rows: rowInfo };
    }

    var per = options.perRow || MAX_PER_ROW;
    var rows = [];
    ranks.forEach(function (rank) {
      var row = sortRow(rowsByRank[rank]);
      var own = row.filter(function (item) { return !item.last; }).length;
      if (own > per) rows = rows.concat(splitRow(row, per));
      else rows.push(row);
    });
    var result = layoutRows(rows);
    // A picture far wider than tall cannot be read at any zoom: wrap the
    // longest layers until it is at most about twice as wide as tall. The
    // check uses plain gaps, so the result does not depend on gap sizing.
    for (var guard = 0; guard < 3 && !options.flat && result.w > 2 * result.plainH; guard += 1) {
      var target = null;
      rows.forEach(function (row, r) {
        var own = row.filter(function (item) { return !item.last; }).length;
        if (own >= 5 && (!target || own > target.own)) target = { r: r, own: own };
      });
      if (!target) break;
      var subRows = splitRow(rows[target.r], Math.ceil(target.own / 2));
      rows = rows.slice(0, target.r).concat(subRows, rows.slice(target.r + 1));
      result = layoutRows(rows);
    }
    return result;
  }

  function tieredScene(design) {
    var sourceNodes = design && Array.isArray(design.nodes) ? design.nodes : [];
    var nodes = annotate(sourceNodes);
    var systems = nodes.filter(function (node) { return node.kind === "system"; });
    var rest = nodes.filter(function (node) { return node.kind !== "system"; });
    var connections = design && Array.isArray(design.connections) ? design.connections : [];
    var byId = {};
    rest.forEach(function (node) { byId[node.id] = node; });
    var members = {};
    rest.forEach(function (node) {
      if (node.kind !== "module" || !byId[node.parentId] || byId[node.parentId].kind !== "component") return;
      (members[node.parentId] = members[node.parentId] || []).push(node);
    });
    function inside(id, cid) {
      var node = byId[id];
      return Boolean(node && node.kind === "module" && node.parentId === cid);
    }
    // A component that talks to its own modules is an actor: it is drawn as a
    // box inside its frame. Otherwise the component is the frame, titled on
    // its left, and arrows to it land on the frame.
    var actor = {};
    Object.keys(members).forEach(function (cid) {
      actor[cid] = connections.some(function (c) {
        return (c.fromId === cid && inside(c.toId, cid)) || (c.toId === cid && inside(c.fromId, cid));
      });
    });
    function ownerOf(id) {
      var node = byId[id];
      if (!node) return null;
      if (members[id]) return id;
      if (node.kind === "module" && members[node.parentId]) return node.parentId;
      return id;
    }
    function itemFor(node, size) {
      var tier = inferTier(node);
      return { id: node.id, w: size.w, h: size.h, rank: TIER_ORDER[tier], sub: WITHIN_ROW[tier] || 0, last: tier === "external", zone: node.zone || "" };
    }
    var inner = {};
    Object.keys(members).forEach(function (cid) {
      var list = (actor[cid] ? [byId[cid]] : []).concat(members[cid]);
      var local = {};
      list.forEach(function (node) { local[node.id] = true; });
      var sizes = evenSizes(list, function () { return 0; });
      var items = list.map(function (node) { return itemFor(node, sizes[node.id]); });
      var links = connections.filter(function (c) { return local[c.fromId] && local[c.toId]; }).map(function (c) { return { from: c.fromId, to: c.toId }; });
      if (actor[cid]) {
        list.slice(1).forEach(function (node) {
          if (!links.some(function (l) { return l.from === node.id || l.to === node.id; })) links.push({ from: cid, to: node.id });
        });
      }
      inner[cid] = { box: tierRows(items, links, { flat: true, colGap: INNER_GAP, sepGap: INNER_GAP, rowGap: INNER_ROW_GAP }), sizes: sizes };
    });
    var plain = rest.filter(function (node) { return ownerOf(node.id) === node.id && !inner[node.id]; });
    var sizes = evenSizes(plain, tierRank);
    var heads = {};
    var topItems = [];
    rest.forEach(function (node) {
      if (ownerOf(node.id) !== node.id) return;
      var size = sizes[node.id];
      if (inner[node.id]) {
        var box = inner[node.id].box;
        if (actor[node.id]) size = { w: box.w + FRAME_PAD * 2, h: box.h + FRAME_PAD * 2 };
        else {
          var head = (heads[node.id] = headerSize(node));
          size = { w: head.w + box.w + FRAME_PAD * 2, h: Math.max(box.h + FRAME_PAD * 2, head.h) };
        }
      }
      topItems.push(itemFor(node, size));
    });
    var topLinks = [];
    connections.forEach(function (c) {
      var from = ownerOf(c.fromId);
      var to = ownerOf(c.toId);
      if (from && to && from !== to) topLinks.push({ from: from, to: to });
    });
    function arrange(rowGaps, pinned) {
      var top = tierRows(topItems, topLinks, { rowGaps: rowGaps });
      // The system title sits at the top left: beside the first layer when that
      // layer leaves room (it usually is narrow and centred), else above it.
      var titleW = 0;
      systems.forEach(function (node) { titleW = Math.max(titleW, sizeOf(node).w); });
      var firstLeft = Infinity;
      topItems.forEach(function (item) { if (top.rows.length && item.rank === top.rows[0].rank) firstLeft = Math.min(firstLeft, top.at[item.id].x); });
      var beside = systems.length === 1 && firstLeft - ZONE_PAD >= titleW + 48;
      var offsetY = !systems.length ? 0 : beside ? ZONE_TOP : SYSTEM_H + 24 + ZONE_TOP;
      var placed = [];
      topItems.forEach(function (item) {
        var at = top.at[item.id];
        var x = at.x;
        var y = offsetY + at.y;
        var group = inner[item.id];
        if (!group) {
          placed.push(place(byId[item.id], x, y, { w: item.w, h: item.h }));
          return;
        }
        var box = group.box;
        if (actor[item.id]) {
          Object.keys(box.at).forEach(function (id) {
            var spot = box.at[id];
            placed.push(place(byId[id], x + FRAME_PAD + spot.x, y + FRAME_PAD + spot.y, group.sizes[id]));
          });
          return;
        }
        var headW = heads[item.id].w;
        placed.push(place(byId[item.id], x, y, { w: headW, h: item.h }, { header: true, parts: members[item.id].length }));
        var top0 = y + Math.round((item.h - box.h) / 2);
        Object.keys(box.at).forEach(function (id) {
          var spot = box.at[id];
          placed.push(place(byId[id], x + headW + FRAME_PAD + spot.x, top0 + spot.y, group.sizes[id]));
        });
      });
      systems.forEach(function (node, index) {
        placed.unshift(place(node, 0, index * (SYSTEM_H + 8)));
      });
      placed.forEach(function (card) {
        if (card.kind !== "module") return;
        if (placed.some(function (item) { return item.id === card.parentId && item.kind === "component"; })) card.group = "";
      });
      var home = pinned ? pinSaved(placed, sourceNodes, FRAME_PAD) : snapshot(placed);
      var groups = groupsFor(placed, FRAME_PAD);
      var zones = zonesFor(placed, groups);
      var reserved = zoneLabelRects(zones);
      var routed = routeTiers(placed, connections, groups, reserved);
      return { top: top, placed: placed, home: home, groups: groups, zones: zones, edges: routed.edges, demand: routed.demand, bands: routed.bands, reserved: reserved, offsetY: offsetY };
    }
    // Route the unpinned layout once and give each gap between layers the room its
    // arrows need. Pins are applied after, so dragging one card never moves the rest.
    var plan = arrange(null, false);
    var gaps = null;
    if (plan.bands.length === plan.top.rows.length) {
      var wanted = plan.top.rows.slice(0, -1).map(function (row, i) {
        var tracks = plan.demand["g" + i] || 0;
        var gap = plan.bands[i + 1].top - plan.bands[i].bottom;
        var labelled = plan.reserved.some(function (r) { return r.y > plan.bands[i].bottom && r.y < plan.bands[i + 1].top; });
        var need = snap(32 + Math.max(0, tracks - 1) * TRACK + (labelled ? LABEL_KEEP : 0));
        return need > gap ? TIER_GAP + (need - gap) : TIER_GAP;
      });
      if (wanted.some(function (g) { return g > TIER_GAP; })) gaps = wanted;
    }
    var pass = arrange(gaps, true);
    var top = pass.top;
    var placed = pass.placed;
    var groups = pass.groups;
    var zones = pass.zones;
    var edges = pass.edges;
    var offsetY = pass.offsetY;
    placeLabels(edges, placed, pass.reserved);
    // One lane per tier, spanning its sub-rows when a long layer wrapped.
    var lanes = [];
    top.rows.forEach(function (row) {
      var last = lanes[lanes.length - 1];
      if (last && last.rank === row.rank) {
        last.h = offsetY + row.y + row.h - last.y;
        last.rows += 1;
        return;
      }
      lanes.push({ rank: row.rank, label: TIER_LABEL[row.rank] || "", y: offsetY + row.y, h: row.h, rows: 1 });
    });
    var bounds = expandForFlows(boundsOf(placed.concat(groups, zones)), edges);
    var unmappedSrc = design && Array.isArray(design.unmappedFlags) ? design.unmappedFlags : [];
    var unmapped = unmappedSrc.map(function (flag, index) {
      var node = { id: "unmapped-" + index, kind: "unmapped", name: "Unmapped drift", what: flag.intent, why: flag.difference, flags: [flag], parentId: null, group: "" };
      var x = bounds.w ? bounds.x + bounds.w + 48 : 0;
      var y = (bounds.w || bounds.h ? bounds.y : 0) + index * (sizeOf(node).h + 24);
      return place(node, x, y);
    });
    placed = placed.concat(unmapped);
    var home = Object.assign(pinSaved(placed, design && Array.isArray(design.unmappedPositions) ? design.unmappedPositions : [], FRAME_PAD), pass.home);
    bounds = expandForFlows(boundsOf(placed.concat(groups, zones)), edges);
    return {
      mode: "tiers",
      home: home,
      nodes: placed,
      edges: edges,
      groups: groups,
      zones: zones,
      lanes: lanes,
      captions: [],
      boundaries: Object.keys(members).map(function (id) { return { id: id, name: byId[id].name, what: byId[id].what || "" }; }),
      connections: connections,
      unmapped: unmapped,
      bounds: bounds,
      direction: "TB",
    };
  }

  // ---- Geometry helpers --------------------------------------------------------

  function overlapsY(a, b) {
    return a.y < b.y + b.h && b.y < a.y + a.h;
  }

  function overlapX(a, b) {
    return Math.min(a.r, b.r) - Math.max(a.x, b.x);
  }

  function hits(a, b, margin) {
    var m = margin || 0;
    return a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
  }

  /** Horizontal bands: y ranges where something stands, merged when they touch. */
  function bandsOf(rects) {
    var spans = rects.map(function (r) { return { top: r.y, bottom: r.y + r.h }; }).sort(function (a, b) { return a.top - b.top || a.bottom - b.bottom; });
    var bands = [];
    spans.forEach(function (span) {
      var last = bands[bands.length - 1];
      if (last && span.top < last.bottom + 1) last.bottom = Math.max(last.bottom, span.bottom);
      else bands.push({ top: span.top, bottom: span.bottom });
    });
    return bands;
  }

  function bandIndex(bands, y) {
    var best = 0;
    var distance = Infinity;
    for (var i = 0; i < bands.length; i += 1) {
      if (y >= bands[i].top - 0.5 && y <= bands[i].bottom + 0.5) return i;
      var d = Math.min(Math.abs(y - bands[i].top), Math.abs(y - bands[i].bottom));
      if (d < distance) { distance = d; best = i; }
    }
    return best;
  }

  /** The outline of a union of rectangles, as closed rectilinear polygons. */
  function outlineOf(rects) {
    function uniq(list) {
      return list.sort(function (a, b) { return a - b; }).filter(function (v, i, all) { return i === 0 || v !== all[i - 1]; });
    }
    var xs = [];
    var ys = [];
    rects.forEach(function (r) { xs.push(r.x, r.x + r.w); ys.push(r.y, r.y + r.h); });
    xs = uniq(xs);
    ys = uniq(ys);
    var nx = xs.length - 1;
    var ny = ys.length - 1;
    var grid = [];
    for (var i = 0; i < nx; i += 1) {
      for (var j = 0; j < ny; j += 1) {
        var cx = (xs[i] + xs[i + 1]) / 2;
        var cy = (ys[j] + ys[j + 1]) / 2;
        grid[i * ny + j] = rects.some(function (r) { return cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h; });
      }
    }
    function covered(a, b) {
      return a >= 0 && b >= 0 && a < nx && b < ny && grid[a * ny + b];
    }
    var edges = [];
    for (i = 0; i < nx; i += 1) {
      for (j = 0; j < ny; j += 1) {
        if (!covered(i, j)) continue;
        if (!covered(i, j - 1)) edges.push([xs[i], ys[j], xs[i + 1], ys[j]]);
        if (!covered(i + 1, j)) edges.push([xs[i + 1], ys[j], xs[i + 1], ys[j + 1]]);
        if (!covered(i, j + 1)) edges.push([xs[i + 1], ys[j + 1], xs[i], ys[j + 1]]);
        if (!covered(i - 1, j)) edges.push([xs[i], ys[j + 1], xs[i], ys[j]]);
      }
    }
    var starts = {};
    edges.forEach(function (e, n) { (starts[e[0] + "," + e[1]] = starts[e[0] + "," + e[1]] || []).push(n); });
    var used = [];
    var polygons = [];
    edges.forEach(function (e, n) {
      if (used[n]) return;
      var ring = [];
      var cur = n;
      var guard = 0;
      while (cur != null && !used[cur] && guard < 100000) {
        guard += 1;
        used[cur] = true;
        var edge = edges[cur];
        ring.push({ x: edge[0], y: edge[1] });
        var next = (starts[edge[2] + "," + edge[3]] || []).filter(function (m) { return !used[m]; });
        cur = next.length ? next[0] : null;
      }
      var clean = ring.filter(function (pt, k) {
        var prev = ring[(k - 1 + ring.length) % ring.length];
        var next = ring[(k + 1) % ring.length];
        return !((prev.x === pt.x && pt.x === next.x) || (prev.y === pt.y && pt.y === next.y));
      });
      if (clean.length >= 4) polygons.push(clean);
    });
    return polygons;
  }

  // ---- Subgraphs and boundaries ---------------------------------------------

  /** The frame around a component and its modules. */
  function frameOf(owner, kids, pad) {
    var box = boundsOf(kids);
    if (owner.header) {
      var x0 = Math.min(owner.x, box.x - pad);
      var y0 = Math.min(owner.y, box.y - pad);
      var x1 = Math.max(owner.x + owner.w, box.x + box.w + pad);
      var y1 = Math.max(owner.y + owner.h, box.y + box.h + pad);
      return { id: owner.id, header: true, x: x0, y: y0, w: x1 - x0, h: y1 - y0, divider: owner.x + owner.w };
    }
    var all = boundsOf([owner].concat(kids));
    return { id: owner.id, header: false, x: all.x - pad, y: all.y - pad, w: all.w + pad * 2, h: all.h + pad * 2 };
  }

  function groupsFor(placed, pad) {
    pad = pad == null ? CLUSTER_PAD : pad;
    var groups = [];
    placed.forEach(function (owner) {
      if (owner.kind !== "component") return;
      var kids = placed.filter(function (node) { return node.kind === "module" && node.parentId === owner.id; });
      if (kids.length) groups.push(frameOf(owner, kids, pad));
    });
    return groups;
  }

  // ---- Clearance -------------------------------------------------------------------
  //
  // Parts move as units: a plain card, or a subgraph frame with its modules. A
  // unit's rectangle is what every other unit keeps clear of, by Space.GAP (more
  // across a boundary). Pinned and dropped positions are settled to the nearest
  // legal spot; the automatic layout is the fixed obstacle set.

  function unitsOf(placed, pad) {
    var frames = {};
    groupsFor(placed, pad).forEach(function (g) { frames[g.id] = true; });
    var units = [];
    var at = {};
    placed.forEach(function (card) {
      if (card.kind === "system") return;
      var key = frames[card.id] ? card.id : card.kind === "module" && frames[card.parentId] ? card.parentId : card.id;
      if (!at[key]) {
        at[key] = { key: key, ids: [], frame: Boolean(frames[key]), zone: "" };
        units.push(at[key]);
      }
      at[key].ids.push(card.id);
      if (!at[key].zone && card.zone) at[key].zone = card.zone;
    });
    return units;
  }

  function snapshot(placed) {
    var home = {};
    placed.forEach(function (card) { home[card.id] = { x: card.x, y: card.y }; });
    return home;
  }

  /**
   * Settle the cards in `moverIds` (their x/y are where they were put) onto
   * legal positions, moving each unit by the smallest translation. Returns the
   * ids that had to move. With `probe`, only reports whether any would (no change).
   */
  function legalize(placed, moverIds, pad, homes, probe) {
    var wanted = {};
    moverIds.forEach(function (id) { wanted[id] = true; });
    var byId = {};
    placed.forEach(function (card) { byId[card.id] = card; });
    var systems = placed.filter(function (card) { return card.kind === "system"; });
    function cardsOf(unit) { return unit.ids.map(function (id) { return byId[id]; }); }
    function rectOf(unit) {
      if (!unit.frame) return byId[unit.ids[0]];
      return frameOf(byId[unit.key], cardsOf(unit).filter(function (card) { return card.id !== unit.key; }), pad);
    }
    var done = [];
    var pending = [];
    unitsOf(placed, pad).forEach(function (unit) {
      (unit.ids.some(function (id) { return wanted[id]; }) ? pending : done).push(unit);
    });
    pending.forEach(function (unit) { unit.rect = rectOf(unit); });
    pending.sort(function (a, b) { return a.rect.y - b.rect.y || a.rect.x - b.rect.x; });
    var moved = [];
    pending.forEach(function (unit) {
      var cards = cardsOf(unit);
      var movers = cards.filter(function (card) { return wanted[card.id]; });
      // a header component only labels its frame; it is nested, not a neighbour
      var peers = cards.filter(function (card) { return !(unit.frame && card.id === unit.key && card.header); });
      var base = movers.map(function (card) { return { x: card.x, y: card.y }; });
      var outside = done.map(function (other) {
        var rect = rectOf(other);
        return { x: rect.x, y: rect.y, w: rect.w, h: rect.h, gap: other.zone !== unit.zone ? Space.ZONE_GAP : Space.GAP };
      }).concat(systems.map(function (card) { return { x: card.x, y: card.y, w: card.w, h: card.h, gap: Space.GAP }; }));
      function shift(dx, dy) {
        movers.forEach(function (card, i) { card.x = base[i].x + dx; card.y = base[i].y + dy; });
      }
      function legal(dx, dy) {
        shift(dx, dy);
        var rect = rectOf(unit);
        var ok = !outside.some(function (o) { return Space.clash(rect, o, o.gap); });
        for (var i = 0; ok && i < peers.length; i += 1) {
          for (var j = i + 1; ok && j < peers.length; j += 1) ok = !Space.clash(peers[i], peers[j], Space.GAP);
        }
        return ok;
      }
      if (legal(0, 0)) {
        done.push(unit);
        return;
      }
      if (probe) {
        shift(0, 0);
        moved.push(movers[0].id);
        return;
      }
      var box = Space.inflate(boundsOf(movers), unit.frame ? pad : 0);
      var rest = peers.filter(function (card) { return !wanted[card.id]; }).map(function (card) {
        return { x: card.x, y: card.y, w: card.w, h: card.h, gap: Space.GAP };
      });
      var found = Space.nearest(box, outside.concat(rest), legal);
      if (found) shift(found.dx, found.dy);
      else if (homes) {
        movers.forEach(function (card) { if (homes[card.id]) { card.x = homes[card.id].x; card.y = homes[card.id].y; } });
      } else shift(0, 0);
      movers.forEach(function (card, i) {
        if (card.x !== base[i].x || card.y !== base[i].y) moved.push(card.id);
      });
      done.push(unit);
    });
    return moved;
  }

  /** Give the cards their saved positions, then settle them onto legal ones. */
  function pinSaved(placed, sources, pad) {
    var home = snapshot(placed);
    var byId = {};
    sources.forEach(function (node) { byId[node.id] = node; });
    var pinned = [];
    placed.forEach(function (card) {
      var source = byId[card.id];
      if (!source || !isFinite(source.x) || !isFinite(source.y)) return;
      card.x = source.x;
      card.y = source.y;
      pinned.push(card.id);
    });
    if (pinned.length) legalize(placed, pinned, pad, home);
    return home;
  }

  /** After a drop: the nearest legal spot for `ids` (already at their dropped x/y). */
  function settle(scene, ids) {
    if (!scene || !ids || !ids.length) return [];
    var moved = legalize(scene.nodes, ids, scene.mode === "tiers" ? FRAME_PAD : CLUSTER_PAD, scene.home);
    if (moved.length) reroute(scene);
    return moved;
  }

  /** True when `ids` stand too close to another part where they are now. */
  function blocked(scene, ids) {
    if (!scene || !ids || !ids.length) return false;
    return legalize(scene.nodes, ids, scene.mode === "tiers" ? FRAME_PAD : CLUSTER_PAD, null, true).length > 0;
  }

  /**
   * Network and trust boundaries. A boundary is drawn around runs of its parts
   * in each layer, widened and bridged to the runs in the next layer, so its
   * outline is one rectilinear shape that never cuts through another boundary.
   */
  function zonesFor(placed, groups) {
    var frames = {};
    (groups || []).forEach(function (g) { frames[g.id] = g; });
    var solid = placed.filter(function (node) { return node.kind !== "system" && node.kind !== "unmapped"; });
    var byId = {};
    solid.forEach(function (node) { byId[node.id] = node; });
    var units = [];
    var unitOf = {};
    solid.forEach(function (node) {
      var key = frames[node.id] ? node.id : node.parentId && frames[node.parentId] ? node.parentId : node.id;
      if (unitOf[key]) {
        if (!unitOf[key].zone && node.zone) unitOf[key].zone = node.zone;
        return;
      }
      var rect = frames[key] || node;
      var owner = byId[key] || node;
      unitOf[key] = { key: key, x: rect.x, y: rect.y, w: rect.w, h: rect.h, zone: owner.zone || node.zone || "" };
      units.push(unitOf[key]);
    });
    var bands = bandsOf(units);
    units.forEach(function (u) { u.band = bandIndex(bands, u.y + u.h / 2); });
    var buckets = {};
    var names = [];
    solid.forEach(function (node) {
      if (!node.zone) return;
      if (!buckets[node.zone]) { buckets[node.zone] = []; names.push(node.zone); }
      buckets[node.zone].push(node.id);
    });
    return names.map(function (name) {
      var blocks = [];
      bands.forEach(function (band, b) {
        var run = null;
        units.filter(function (u) { return u.band === b; }).sort(function (p, q) { return p.x - q.x; }).forEach(function (u) {
          if (u.zone !== name) {
            run = null;
            return;
          }
          if (!run) {
            run = { band: b, x: u.x, y: u.y, r: u.x + u.w, bottom: u.y + u.h };
            blocks.push(run);
            return;
          }
          run.x = Math.min(run.x, u.x);
          run.y = Math.min(run.y, u.y);
          run.r = Math.max(run.r, u.x + u.w);
          run.bottom = Math.max(run.bottom, u.y + u.h);
        });
      });
      if (!blocks.length) return null;
      blocks.forEach(function (block) {
        block.minX = -Infinity;
        block.maxX = Infinity;
        units.forEach(function (u) {
          if (u.band !== block.band || u.zone === name) return;
          if (u.x + u.w <= block.x) block.minX = Math.max(block.minX, u.x + u.w + ZONE_WIDEN);
          if (u.x >= block.r) block.maxX = Math.min(block.maxX, u.x - ZONE_WIDEN);
        });
      });
      function widen(block, toward) {
        block.x = Math.min(block.x, Math.max(block.minX, toward.x));
        block.r = Math.max(block.r, Math.min(block.maxX, toward.r));
      }
      blocks.forEach(function (lower) {
        var uppers = blocks.filter(function (u) { return u.band === lower.band - 1; });
        if (!uppers.length || uppers.some(function (u) { return overlapX(u, lower) >= 24; })) return;
        var mid = (lower.x + lower.r) / 2;
        var upper = uppers.slice().sort(function (p, q) { return Math.abs((p.x + p.r) / 2 - mid) - Math.abs((q.x + q.r) / 2 - mid); })[0];
        widen(upper, lower);
        if (overlapX(upper, lower) < 24) widen(lower, upper);
      });
      var rects = [];
      var labels = [];
      blocks.forEach(function (block) {
        var bridged = blocks.some(function (u) { return u.band === block.band - 1 && overlapX(u, block) >= 24; });
        block.px = block.x - ZONE_PAD;
        block.pr = block.r + ZONE_PAD;
        block.py = block.y - (bridged ? ZONE_PAD : ZONE_TOP);
        block.pb = block.bottom + ZONE_PAD;
        rects.push({ x: block.px, y: block.py, w: block.pr - block.px, h: block.pb - block.py });
        if (!bridged) labels.push({ x: block.px + 10, y: block.py + 9, w: Math.round(name.length * 6.9 + 18), h: 22 });
      });
      blocks.forEach(function (lower) {
        blocks.forEach(function (upper) {
          if (upper.band !== lower.band - 1) return;
          var lo = Math.max(upper.px, lower.px);
          var hi = Math.min(upper.pr, lower.pr);
          if (hi - lo < 24 || lower.py <= upper.pb) return;
          rects.push({ x: lo, y: upper.pb - 1, w: hi - lo, h: lower.py - upper.pb + 2 });
        });
      });
      var box = boundsOf(rects);
      return {
        id: "zone:" + name,
        name: name,
        members: buckets[name],
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        outline: outlineOf(rects),
        labels: labels,
      };
    }).filter(Boolean);
  }

  function zoneLabelRects(zones) {
    var out = [];
    (zones || []).forEach(function (zone) { (zone.labels || []).forEach(function (label) { out.push(label); }); });
    return out;
  }

  // ---- Orthogonal routing ----------------------------------------------------

  /**
   * Orthogonal routes for a tiered picture. Arrows leave the bottom of a
   * caller and enter the top of the callee; replies go back up on their own
   * port beside the request, so a request and its reply run as a pair. Flows
   * inside a layer go side to side, or under the layer when something stands
   * between. Horizontal runs live in the gaps between layers; a flow that
   * skips layers drops straight down when the column is free, else through
   * the nearest free channel. Runs that share a gap or channel are then
   * spread onto separate tracks, ordered to avoid crossings.
   */
  function tierEdges(placed, connections, groups, reserved) {
    return routeTiers(placed, connections, groups, reserved).edges;
  }

  function routeTiers(placed, connections, groups, reserved) {
    groups = groups || groupsFor(placed, FRAME_PAD);
    reserved = reserved || [];
    var byId = {};
    placed.forEach(function (node) { byId[node.id] = node; });
    var solid = placed.filter(function (node) { return node.kind !== "system" && node.kind !== "unmapped"; });
    var frameOf = {};
    groups.forEach(function (g) { frameOf[g.id] = g.id; });
    solid.forEach(function (node) {
      if (node.kind === "module" && node.parentId && frameOf[node.parentId] === node.parentId) frameOf[node.id] = node.parentId;
    });
    var obstacles = solid.map(function (node) { return { key: node.id, x: node.x - 6, y: node.y - 4, w: node.w + 12, h: node.h + 8 }; })
      .concat(groups.map(function (g) { return { key: "frame:" + g.id, x: g.x, y: g.y, w: g.w, h: g.h }; }));
    var bands = bandsOf(solid.concat(groups));
    function bandOf(node) { return bandIndex(bands, node.y + node.h / 2); }
    function gapBelow(i) {
      var gap;
      if (!bands.length) gap = { id: "g", top: 0, bottom: 0 };
      else if (i < 0) gap = { id: "g-1", top: bands[0].top - 72, bottom: bands[0].top };
      else if (i >= bands.length - 1) gap = { id: "g" + (bands.length - 1), top: bands[bands.length - 1].bottom, bottom: bands[bands.length - 1].bottom + 72 };
      else gap = { id: "g" + i, top: bands[i].bottom, bottom: bands[i + 1].top };
      // Boundary labels hang in the lower part of a gap; tracks keep clear.
      gap.labels = reserved.filter(function (r) { return r.y > gap.top - 1 && r.y < gap.bottom; });
      return gap;
    }
    function mid(gap) { return (gap.top + gap.bottom) / 2; }
    function blocked(x1, y1, x2, y2, skip) {
      var r = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
      return obstacles.some(function (o) { return !skip[o.key] && hits(r, o); });
    }
    function pt(x, y) { return { x: x, y: y }; }

    // A subgraph titled by its owner is one shape for routing: its frame.
    var geo = {};
    placed.forEach(function (node) { geo[node.id] = node; });
    groups.forEach(function (g) {
      var owner = byId[g.id];
      if (!g.header || !owner) return;
      geo[g.id] = { id: g.id, kind: owner.kind, shape: "frame", x: g.x, y: g.y, w: g.w, h: g.h, portX: owner.x, portW: owner.w };
    });
    var list = [];
    (connections || []).forEach(function (c) {
      var from = geo[c.fromId];
      var to = geo[c.toId];
      if (!from || !to || from === to) return;
      var skip = {};
      skip[from.id] = true;
      skip[to.id] = true;
      if (frameOf[from.id]) skip["frame:" + frameOf[from.id]] = true;
      if (frameOf[to.id]) skip["frame:" + frameOf[to.id]] = true;
      var e = { c: c, from: from, to: to, skip: skip, index: list.length, segs: [] };
      // Same layer band but not beside each other: still a flow inside the
      // layer, unless both sit in one subgraph's stacked inner rows.
      var sameFrame = frameOf[from.id] && frameOf[from.id] === frameOf[to.id];
      var sideways = overlapsY(from, to) || (!sameFrame && bandOf(from) === bandOf(to));
      if (sideways) {
        var left = from.x + from.w / 2 <= to.x + to.w / 2 ? from : to;
        var right = left === from ? to : from;
        var ya = Math.min(from.y + from.h / 2, to.y + to.h / 2) - 12;
        var yb = Math.max(from.y + from.h / 2, to.y + to.h / 2) + 12;
        var clear = right.x - (left.x + left.w) >= 16 && !blocked(left.x + left.w + 1, ya, right.x - 1, yb, skip);
        e.type = clear ? "side" : "under";
        e.band = Math.max(bandOf(from), bandOf(to));
      } else {
        e.type = to.y >= from.y + from.h ? "down" : "up";
        e.a = bandOf(from);
        e.b = bandOf(to);
      }
      list.push(e);
    });

    // Ports: each flow takes a slot on the side of each end it uses.
    var sides = {};
    function slot(node, side, entry) {
      var key = node.id + ":" + side;
      (sides[key] = sides[key] || { node: node, side: side, list: [] }).list.push(entry);
    }
    list.forEach(function (e) {
      var pair = pairKey(e.from.id, e.to.id);
      var fromSide;
      var toSide;
      if (e.type === "side") {
        var rightward = e.to.x + e.to.w / 2 >= e.from.x + e.from.w / 2;
        fromSide = rightward ? "right" : "left";
        toSide = rightward ? "left" : "right";
      } else if (e.type === "under") {
        fromSide = "bottom";
        toSide = "bottom";
      } else {
        fromSide = e.type === "down" ? "bottom" : "top";
        toSide = e.type === "down" ? "top" : "bottom";
      }
      slot(e.from, fromSide, { e: e, end: "from", other: e.to, pair: pair });
      slot(e.to, toSide, { e: e, end: "to", other: e.from, pair: pair });
    });
    Object.keys(sides).sort().forEach(function (key) {
      var s = sides[key];
      var node = s.node;
      var upright = s.side === "left" || s.side === "right";
      s.list.sort(function (p, q) {
        var a = upright ? p.other.y + p.other.h / 2 : p.other.x + p.other.w / 2;
        var b = upright ? q.other.y + q.other.h / 2 : q.other.x + q.other.w / 2;
        return a - b || (p.pair < q.pair ? -1 : p.pair > q.pair ? 1 : 0) || p.e.index - q.e.index;
      });
      var units = [];
      s.list.forEach(function (entry) {
        var last = units[units.length - 1];
        if (last && last.pair === entry.pair && last.items.length < 2) last.items.push(entry);
        else units.push({ pair: entry.pair, items: [entry] });
      });
      var margin = upright ? 14 : Math.max(20, insetOf(node.shape) + 8);
      var start = (upright ? node.y : node.portW ? node.portX : node.x) + margin;
      var end = (upright ? node.y + node.h : node.portW ? node.portX + node.portW : node.x + node.w) - margin;
      if (end < start) start = end = upright ? node.y + node.h / 2 : node.x + node.w / 2;
      // Arrows into a top side keep out from under a boundary label hanging
      // just above it.
      if (s.side === "top") {
        reserved.forEach(function (r) {
          if (r.y + r.h > node.y + 1 || r.y + r.h < node.y - 72) return;
          if (r.x + r.w + 8 > start && r.x < start && end - (r.x + r.w + 8) >= 32) start = r.x + r.w + 8;
        });
      }
      units.forEach(function (unit, i) {
        var c = start + ((end - start) * (i + 1)) / (units.length + 1);
        unit.items.forEach(function (entry, k) {
          var v = Math.round(unit.items.length === 2 ? c + (k === 0 ? -7 : 7) : c);
          if (entry.end === "from") entry.e.p1 = v;
          else entry.e.p2 = v;
        });
      });
    });

    function channelFor(top, bottom, target, skip) {
      var spans = [];
      obstacles.forEach(function (o) {
        if (skip[o.key] || o.y >= bottom || o.y + o.h <= top) return;
        spans.push([o.x - 8, o.x + o.w + 8]);
      });
      if (!spans.length) return { x: target, id: "k:open", lo: target - 40, hi: target + 40 };
      spans.sort(function (a, b) { return a[0] - b[0]; });
      var merged = [spans[0].slice()];
      spans.slice(1).forEach(function (span) {
        var last = merged[merged.length - 1];
        if (span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
        else merged.push(span.slice());
      });
      var options = [{ lo: merged[0][0] - 64, hi: merged[0][0] }];
      for (var i = 0; i < merged.length - 1; i += 1) {
        if (merged[i + 1][0] - merged[i][1] >= 16) options.push({ lo: merged[i][1], hi: merged[i + 1][0] });
      }
      options.push({ lo: merged[merged.length - 1][1], hi: merged[merged.length - 1][1] + 64 });
      options.forEach(function (o) { o.x = Math.round((o.lo + o.hi) / 2); });
      options.sort(function (a, b) { return Math.abs(a.x - target) - Math.abs(b.x - target); });
      var best = options[0];
      return { x: best.x, id: "k:" + Math.round(best.lo) + ":" + Math.round(best.hi), lo: best.lo + 6, hi: best.hi - 6 };
    }

    list.forEach(function (e) {
      var from = e.from;
      var to = e.to;
      var x1;
      var x2;
      var y1;
      var y2;
      if (e.type === "side") {
        var rightward = to.x + to.w / 2 >= from.x + from.w / 2;
        x1 = rightward ? from.x + from.w : from.x;
        x2 = rightward ? to.x : to.x + to.w;
        y1 = e.p1;
        y2 = e.p2;
        if (Math.abs(y1 - y2) < 1) e.points = [pt(x1, y1), pt(x2, y2)];
        else {
          var mx = Math.round((x1 + x2) / 2);
          e.points = [pt(x1, y1), pt(mx, y1), pt(mx, y2), pt(x2, y2)];
          e.segs.push({ k: 1, v: true, id: "c:" + pairKey(from.id, to.id), lo: Math.min(x1, x2) + 10, hi: Math.max(x1, x2) - 10 });
        }
        return;
      }
      if (e.type === "under") {
        var gap = gapBelow(e.band);
        var gy = mid(gap);
        x1 = e.p1;
        x2 = e.p2;
        e.points = [pt(x1, from.y + from.h), pt(x1, gy), pt(x2, gy), pt(x2, to.y + to.h)];
        e.segs.push({ k: 1, h: true, gap: gap });
        return;
      }
      var down = e.type === "down";
      x1 = e.p1;
      x2 = e.p2;
      y1 = down ? from.y + from.h : from.y;
      y2 = down ? to.y : to.y + to.h;
      var near;
      var far;
      if (e.a === e.b) near = far = { id: "l:" + from.id + ">" + to.id, top: Math.min(y1, y2), bottom: Math.max(y1, y2) };
      else if (down) {
        near = gapBelow(e.a);
        far = gapBelow(e.b - 1);
      } else {
        near = gapBelow(e.a - 1);
        far = gapBelow(e.b);
      }
      if (near.id === far.id) {
        var y = mid(near);
        e.points = [pt(x1, y1), pt(x1, y), pt(x2, y), pt(x2, y2)];
        e.segs.push({ k: 1, h: true, gap: near });
        return;
      }
      if (Math.abs(x1 - x2) < 1 && !blocked(x1, y1, x2, y2, e.skip)) {
        e.points = [pt(x1, y1), pt(x2, y2)];
        return;
      }
      var ny = mid(near);
      var fy = mid(far);
      if (!blocked(x1, y1, x1, fy, e.skip)) {
        e.points = [pt(x1, y1), pt(x1, fy), pt(x2, fy), pt(x2, y2)];
        e.segs.push({ k: 1, h: true, gap: far });
        return;
      }
      if (!blocked(x2, ny, x2, y2, e.skip)) {
        e.points = [pt(x1, y1), pt(x1, ny), pt(x2, ny), pt(x2, y2)];
        e.segs.push({ k: 1, h: true, gap: near });
        return;
      }
      var channel = channelFor(Math.min(ny, fy), Math.max(ny, fy), (x1 + x2) / 2, e.skip);
      e.points = [pt(x1, y1), pt(x1, ny), pt(channel.x, ny), pt(channel.x, fy), pt(x2, fy), pt(x2, y2)];
      e.segs.push({ k: 1, h: true, gap: near }, { k: 2, v: true, id: channel.id, lo: channel.lo, hi: channel.hi }, { k: 3, h: true, gap: far });
    });

    nudge(list, false);
    var demand = nudge(list, true);

    var edges = list.map(function (e) {
      var points = e.points;
      var last = points[points.length - 1];
      var longest = 0;
      var cx = (points[0].x + last.x) / 2;
      var cy = (points[0].y + last.y) / 2;
      for (var k = 1; k < points.length; k += 1) {
        var length = Math.abs(points[k].x - points[k - 1].x) + Math.abs(points[k].y - points[k - 1].y);
        if (length > longest) {
          longest = length;
          cx = (points[k].x + points[k - 1].x) / 2;
          cy = (points[k].y + points[k - 1].y) / 2;
        }
      }
      return {
        from: e.from.id,
        to: e.to.id,
        id: e.c.id,
        kind: e.c.kind || "data",
        label: e.c.label || "",
        x1: points[0].x, y1: points[0].y, x2: last.x, y2: last.y, cx: cx, cy: cy,
        points: points,
      };
    });
    return { edges: edges, demand: demand, bands: bands };
  }

  /**
   * Lane separation: runs that share a gap (horizontal) or a channel
   * (vertical) and overlap are spread onto parallel tracks, ordered so that
   * the legs at their ends cross as few other runs as possible.
   */
  function nudge(list, horizontal) {
    var groups = {};
    var keys = [];
    list.forEach(function (e) {
      e.segs.forEach(function (s) {
        if (horizontal ? !s.h : !s.v) return;
        var P = e.points;
        var a = P[s.k];
        var b = P[s.k + 1];
        var before = P[s.k - 1];
        var after = P[s.k + 2];
        var rec = horizontal
          ? {
            e: e, s: s, pos: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x),
            ends: [{ at: a.x, dir: before ? Math.sign(before.y - a.y) : 0 }, { at: b.x, dir: after ? Math.sign(after.y - b.y) : 0 }],
            min: s.gap.top + 10, max: s.gap.bottom - 10, key: s.gap.id,
          }
          : {
            e: e, s: s, pos: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y),
            ends: [{ at: a.y, dir: before ? Math.sign(before.x - a.x) : 0 }, { at: b.y, dir: after ? Math.sign(after.x - b.x) : 0 }],
            min: s.lo, max: s.hi, key: s.id,
          };
        if (horizontal) {
          (s.gap.labels || []).forEach(function (r) {
            if (r.x < rec.hi + 8 && r.x + r.w > rec.lo - 8) rec.max = Math.min(rec.max, r.y - 8);
          });
          if (rec.max < rec.min) rec.max = rec.min;
        }
        if (!groups[rec.key]) { groups[rec.key] = []; keys.push(rec.key); }
        groups[rec.key].push(rec);
      });
    });
    // cost of putting `first` on the track before `second` (above / left of it)
    function cost(first, second) {
      var n = 0;
      first.ends.forEach(function (end) { if (end.dir > 0 && end.at > second.lo + 0.5 && end.at < second.hi - 0.5) n += 1; });
      second.ends.forEach(function (end) { if (end.dir < 0 && end.at > first.lo + 0.5 && end.at < first.hi - 0.5) n += 1; });
      return n;
    }
    var demand = {};
    keys.forEach(function (key) {
      var recs = groups[key].sort(function (a, b) { return a.lo - b.lo || a.e.index - b.e.index; });
      // components of runs that overlap along the channel
      var parts = [];
      recs.forEach(function (rec) {
        var joined = parts.filter(function (part) { return part.some(function (other) { return rec.lo < other.hi + 12 && other.lo < rec.hi + 12; }); });
        if (!joined.length) { parts.push([rec]); return; }
        var merged = [rec];
        joined.forEach(function (part) { merged = merged.concat(part); parts.splice(parts.indexOf(part), 1); });
        parts.push(merged);
      });
      parts.forEach(function (part) {
        demand[key] = Math.max(demand[key] || 0, part.length);
        if (part.length < 2 && (!horizontal || (part[0].pos >= part[0].min && part[0].pos <= part[0].max))) return;
        part.sort(function (a, b) { return a.lo - b.lo || a.e.index - b.e.index; });
        var order = [];
        part.forEach(function (rec) {
          var bestAt = 0;
          var bestCost = Infinity;
          for (var p = 0; p <= order.length; p += 1) {
            var total = 0;
            for (var i = 0; i < order.length; i += 1) total += i < p ? cost(order[i], rec) : cost(rec, order[i]);
            if (total < bestCost) { bestCost = total; bestAt = p; }
          }
          order.splice(bestAt, 0, rec);
        });
        var lo = Math.max.apply(null, order.map(function (r) { return r.min; }));
        var hi = Math.min.apply(null, order.map(function (r) { return r.max; }));
        var center = horizontal ? (lo + hi) / 2 : order.reduce(function (sum, r) { return sum + r.pos; }, 0) / order.length;
        if (!(hi > lo)) { lo = center - TRACK * order.length; hi = center + TRACK * order.length; }
        var spacing = order.length > 1 ? Math.max(4, Math.min(TRACK, (hi - lo) / (order.length - 1))) : 0;
        order.forEach(function (rec, i) {
          var value = Math.round(center + (i - (order.length - 1) / 2) * spacing);
          var P = rec.e.points;
          if (horizontal) { P[rec.s.k].y = value; P[rec.s.k + 1].y = value; }
          else { P[rec.s.k].x = value; P[rec.s.k + 1].x = value; }
        });
      });
    });
    return demand;
  }

  function pairKey(a, b) {
    return a < b ? a + "~" + b : b + "~" + a;
  }

  // ---- Arrow labels ------------------------------------------------------------

  /**
   * A label goes where it is readable: on a free stretch of its own arrow,
   * clear of boxes, other labels, and (if possible) other arrows. A label that
   * finds no clear spot is marked crowded; the canvas shows it on focus only.
   */
  function placeLabels(edges, placed, reserved) {
    var boxes = (placed || []).map(function (n) { return { x: n.x - 10, y: n.y - 8, w: n.w + 20, h: n.h + 16 }; });
    var taken = (reserved || []).slice();
    var lines = [];
    edges.forEach(function (edge, i) {
      var P = edge.points || [];
      for (var k = 0; k < P.length - 1; k += 1) lines.push({ i: i, x1: Math.min(P[k].x, P[k + 1].x), x2: Math.max(P[k].x, P[k + 1].x), y1: Math.min(P[k].y, P[k + 1].y), y2: Math.max(P[k].y, P[k + 1].y) });
    });
    edges.forEach(function (edge, i) {
      var P = edge.points && edge.points.length ? edge.points : [{ x: edge.x1, y: edge.y1 }, { x: edge.x2, y: edge.y2 }];
      var size = labelSize(edge.label);
      var text = size.text;
      var w = size.w;
      var h = size.h;
      edge.text = text;
      edge.lw = w;
      edge.lh = h;
      edge.crowded = false;
      if (!text) return;
      var segs = [];
      for (var k = 0; k < P.length - 1; k += 1) {
        var a = P[k];
        var b = P[k + 1];
        var len = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        if (len < 1) continue;
        var flat = Math.abs(a.y - b.y) < 0.5;
        var fits = flat ? len >= w * 0.5 : len >= h + 24;
        segs.push({ a: a, b: b, len: len, rank: (fits ? 0 : 2) + (flat ? 0 : 1) });
      }
      segs.sort(function (s, t) { return s.rank - t.rank || t.len - s.len; });
      var best = null;
      var order = 0;
      for (var si = 0; si < segs.length && !(best && best.score < 1); si += 1) {
        var seg = segs[si];
        var ts = [0.5, 0.3, 0.7, 0.15, 0.85];
        for (var ti = 0; ti < ts.length; ti += 1) {
          var x = Math.round(seg.a.x + (seg.b.x - seg.a.x) * ts[ti]);
          var y = Math.round(seg.a.y + (seg.b.y - seg.a.y) * ts[ti]);
          var r = { x: x - w / 2, y: y - h / 2, w: w, h: h };
          var nodeHits = 0;
          var labelHits = 0;
          var lineHits = 0;
          boxes.forEach(function (box) { if (hits(r, box)) nodeHits += 1; });
          taken.forEach(function (box) { if (hits(r, box, 4)) labelHits += 1; });
          lines.forEach(function (line) {
            if (line.i === i) return;
            if (line.x2 > r.x + 1 && line.x1 < r.x + r.w - 1 && line.y2 > r.y + 1 && line.y1 < r.y + r.h - 1) lineHits += 1;
          });
          var score = nodeHits * 1000 + labelHits * 100 + lineHits * 6 + seg.rank * 2 + order * 0.04;
          order += 1;
          if (!best || score < best.score) best = { score: score, x: x, y: y, bad: nodeHits + labelHits > 0 };
          if (score < 1) break;
        }
      }
      if (!best) return;
      edge.cx = best.x;
      edge.cy = best.y;
      edge.crowded = best.bad;
      if (!best.bad) taken.push({ x: best.x - w / 2, y: best.y - h / 2, w: w, h: h });
    });
    return edges;
  }

  function buildScene(design) {
    design = pruneRollups(design);
    if (design && design.direction && design.direction !== "tiers") return buildFlowScene(design);
    return tieredScene(design);
  }

  /**
   * Once a part is drawn open, its own arrow to X says nothing a child's arrow
   * to X (or into X) doesn't already say, and drawing both doubles every flow.
   * Drop the parent's copy; keep parent arrows no child accounts for.
   */
  function pruneRollups(design) {
    var nodes = design && Array.isArray(design.nodes) ? design.nodes : [];
    var connections = design && Array.isArray(design.connections) ? design.connections : null;
    if (!connections || !connections.length) return design;
    var parentOf = {};
    var open = {};
    nodes.forEach(function (node) { parentOf[node.id] = node.parentId || null; });
    nodes.forEach(function (node) { if (node.parentId && parentOf[node.parentId] !== undefined) open[node.parentId] = true; });
    function within(id, root) {
      for (var at = id, guard = 0; at && guard < 32; at = parentOf[at], guard += 1) if (at === root) return true;
      return false;
    }
    function covered(c, side) {
      var mine = side === "from" ? c.fromId : c.toId;
      var other = side === "from" ? c.toId : c.fromId;
      return connections.some(function (d) {
        if (d === c) return false;
        var dm = side === "from" ? d.fromId : d.toId;
        var dother = side === "from" ? d.toId : d.fromId;
        return dm !== mine && within(dm, mine) && within(dother, other);
      });
    }
    var kept = connections.filter(function (c) {
      if (open[c.fromId] && covered(c, "from")) return false;
      if (open[c.toId] && covered(c, "to")) return false;
      return true;
    });
    return kept.length === connections.length ? design : Object.assign({}, design, { connections: kept });
  }

  var ROW_WRAP_GAP = 110;

  /** Split a left-to-right layout into rows of whole rank columns. */
  function wrap(top, rows) {
    var ids = Object.keys(top.at);
    var columns = [];
    ids.forEach(function (id) {
      var x = Math.round(top.at[id].x + top.at[id].w / 2);
      var column = columns.find(function (col) { return Math.abs(col.center - x) < 24; });
      if (!column) columns.push(column = { center: x, ids: [], left: Infinity, right: -Infinity });
      column.ids.push(id);
      column.left = Math.min(column.left, top.at[id].x);
      column.right = Math.max(column.right, top.at[id].x + top.at[id].w);
    });
    columns.sort(function (a, b) { return a.left - b.left; });
    var target = top.w / rows;
    var groups = [[]];
    columns.forEach(function (col) {
      var current = groups[groups.length - 1];
      if (current.length && col.right - current[0].left > target * 1.08 && groups.length < rows) groups.push(current = []);
      current.push(col);
    });
    var at = {};
    var y = 0;
    var width = 0;
    groups.forEach(function (group) {
      var minY = Infinity;
      var maxY = -Infinity;
      group.forEach(function (col) {
        col.ids.forEach(function (id) {
          minY = Math.min(minY, top.at[id].y);
          maxY = Math.max(maxY, top.at[id].y + top.at[id].h);
        });
      });
      var left = group[0].left;
      group.forEach(function (col) {
        col.ids.forEach(function (id) {
          var spot = top.at[id];
          at[id] = { x: spot.x - left, y: spot.y - minY + y, w: spot.w, h: spot.h };
          width = Math.max(width, spot.x - left + spot.w);
        });
      });
      y += maxY - minY + ROW_WRAP_GAP;
    });
    return { at: at, w: width, h: y - ROW_WRAP_GAP };
  }

  function buildFlowScene(design) {
    var sourceNodes = design && Array.isArray(design.nodes) ? design.nodes : [];
    var nodes = annotate(sourceNodes);
    var systems = nodes.filter(function (node) { return node.kind === "system"; });
    var rest = nodes.filter(function (node) { return node.kind !== "system"; });
    var connections = design && Array.isArray(design.connections) ? design.connections : [];
    var byId = {};
    rest.forEach(function (node) { byId[node.id] = node; });

    // Clusters: a component with visible modules is a Mermaid subgraph.
    var members = {};
    rest.forEach(function (node) {
      if (node.kind !== "module" || !byId[node.parentId] || byId[node.parentId].kind !== "component") return;
      (members[node.parentId] = members[node.parentId] || []).push(node);
    });
    function ownerOf(id) {
      var node = byId[id];
      if (!node) return null;
      if (members[id]) return id;
      if (node.kind === "module" && members[node.parentId]) return node.parentId;
      return id;
    }

    // Lay out left to right; for top to bottom, lay out in a transposed space
    // (rank axis vertical) and swap axes back, so one algorithm serves both.
    var wrapRows = 1;
    function arrange(swap) {
      function dims(node) {
        var size = sizeOf(node);
        return swap ? { w: size.h, h: size.w } : size;
      }
      var rowGap = swap ? Space.GAP.x : Space.GAP.y;
      function lab(c) { var w = labelSize(c.label).w; return w ? (swap ? LABEL_H + 12 : w) : 0; }
      var titleAlongX = swap ? CLUSTER_TITLE : 0;
      var titleAlongY = swap ? 0 : CLUSTER_TITLE;
      var inner = {};
      Object.keys(members).forEach(function (cid) {
        var list = [byId[cid]].concat(members[cid]);
        var local = {};
        list.forEach(function (node) { local[node.id] = true; });
        var items = list.map(function (node) { var size = dims(node); return { id: node.id, w: size.w, h: size.h }; });
        var links = connections.filter(function (c) { return local[c.fromId] && local[c.toId]; }).map(function (c) { return { from: c.fromId, to: c.toId, lab: lab(c) }; });
        // Unlinked modules hang off their component so the cluster reads in flow order.
        list.slice(1).forEach(function (node) {
          var linked = links.some(function (l) { return l.from === node.id || l.to === node.id; });
          if (!linked) links.push({ from: cid, to: node.id });
        });
        inner[cid] = layered(items, links, { rowGap: rowGap });
      });
      var topItems = [];
      rest.forEach(function (node) {
        if (ownerOf(node.id) !== node.id) return;
        if (inner[node.id]) {
          topItems.push({ id: node.id, w: inner[node.id].w + CLUSTER_PAD * 2 + titleAlongX, h: inner[node.id].h + CLUSTER_PAD * 2 + titleAlongY });
        } else {
          var size = dims(node);
          topItems.push({ id: node.id, w: size.w, h: size.h });
        }
      });
      var topLinks = [];
      connections.forEach(function (c) {
        var from = ownerOf(c.fromId);
        var to = ownerOf(c.toId);
        if (from && to && from !== to) topLinks.push({ from: from, to: to, lab: lab(c) });
      });
      var top = layered(topItems, topLinks, { rowGap: rowGap });
      if (!swap && wrapRows > 1) top = wrap(top, wrapRows);
      var out = [];
      topItems.forEach(function (item) {
        var at = top.at[item.id];
        if (inner[item.id]) {
          var box = inner[item.id];
          Object.keys(box.at).forEach(function (id) {
            var spot = box.at[id];
            var lx = at.x + CLUSTER_PAD + titleAlongX + spot.x;
            var ly = at.y + CLUSTER_PAD + titleAlongY + spot.y;
            out.push(place(byId[id], swap ? ly : lx, swap ? lx : ly));
          });
        } else {
          out.push(place(byId[item.id], swap ? at.y : at.x, swap ? at.x : at.y));
        }
      });
      return { placed: out, w: swap ? top.h : top.w, h: swap ? top.w : top.h, ranks: topItems.length };
    }

    var wanted = (design && design.direction) || "auto";
    var layout = arrange(false);
    var direction = "LR";
    if (wanted === "TB") {
      layout = arrange(true);
      direction = "TB";
    } else if (wanted === "auto" && layout.h > 0 && layout.w > 1600 && layout.w / layout.h > 2.4) {
      // A long chain reads better wrapped into rows than as one thin strip.
      wrapRows = Math.max(2, Math.min(4, Math.round(Math.sqrt(layout.w / (1.6 * layout.h)))));
      layout = arrange(false);
    }
    var placed = layout.placed;
    var top = { w: layout.w };
    var titleH = 0;
    systems.forEach(function (node) { titleH = Math.max(titleH, sizeOf(node).h); });
    var offsetY = systems.length ? titleH + 48 : 0;
    placed.forEach(function (card) { card.y += offsetY; });
    systems.forEach(function (node, index) {
      var card = place(node, 0, index * (sizeOf(node).h + 12));
      card.x = top.w ? Math.max(0, (top.w - card.w) / 2) : 0;
      placed.unshift(card);
    });

    placed.forEach(function (card) {
      if (card.kind !== "module") return;
      var parent = placed.find(function (item) { return item.id === card.parentId && item.kind === "component"; });
      if (parent) card.group = "";
    });
    var home = pinSaved(placed, sourceNodes, CLUSTER_PAD);
    var groups = groupsFor(placed, CLUSTER_PAD);
    var edges = routeEdges(placed, groups, connections, direction);
    placeLabels(edges, placed);
    var captions = [];
    var bounds = expandForFlows(boundsOf(placed.concat(groups)), edges);
    var unmappedSrc = design && Array.isArray(design.unmappedFlags) ? design.unmappedFlags : [];
    var unmapped = unmappedSrc.map(function (flag, index) {
      var node = {
        id: "unmapped-" + index,
        kind: "unmapped",
        name: "Unmapped drift",
        what: flag.intent,
        why: flag.difference,
        flags: [flag],
        parentId: null,
        group: "",
      };
      var x = bounds.w ? bounds.x + bounds.w + 48 : 0;
      var y = (bounds.w || bounds.h ? bounds.y : 0) + index * (sizeOf(node).h + 24);
      return place(node, x, y);
    });
    placed = placed.concat(unmapped);
    unmapped.forEach(function (card) { home[card.id] = { x: card.x, y: card.y }; });
    bounds = expandForFlows(boundsOf(placed.concat(groups)), edges);
    return {
      home: home,
      nodes: placed,
      edges: edges,
      groups: groups,
      captions: captions,
      boundaries: Object.keys(members).map(function (id) {
        return { id: id, name: byId[id].name, what: byId[id].what || "" };
      }),
      connections: connections,
      unmapped: unmapped,
      bounds: bounds,
      direction: direction,
    };
  }

  /** Route in left-to-right space; for TB, route the transposed picture and swap back. */
  function routeEdges(placed, groups, connections, direction) {
    if (direction !== "TB") return flowEdges(placed, groups, connections);
    var flip = function (box) { return Object.assign({}, box, { x: box.y, y: box.x, w: box.h, h: box.w }); };
    return flowEdges(placed.map(flip), groups.map(flip), connections).map(function (edge) {
      return Object.assign({}, edge, {
        x1: edge.y1, y1: edge.x1, x2: edge.y2, y2: edge.x2, cx: edge.cy, cy: edge.cx,
        points: edge.points.map(function (p) { return { x: p.y, y: p.x }; }),
      });
    });
  }

  /** The side of each card an arrow leaves and arrives on: +1 right / left-facing, -1 the reverse. */
  function sidesFor(from, to) {
    if (to.x >= from.x + from.w) return { out: 1, into: 1 };
    if (to.x + to.w <= from.x) return { out: -1, into: -1 };
    return { out: 1, into: -1 };
  }

  /** Give every arrow its own spot on each card side, ordered so fans do not cross. */
  function assignPorts(links) {
    var sides = {};
    links.forEach(function (link) {
      [
        { node: link.from, role: "from", side: link.out > 0 ? "R" : "L", other: link.to },
        { node: link.to, role: "to", side: link.into > 0 ? "L" : "R", other: link.from },
      ].forEach(function (end) {
        var key = end.node.id + "|" + end.side;
        (sides[key] = sides[key] || { node: end.node, ends: [] }).ends.push({ link: link, role: end.role, rank: end.other.y + end.other.h / 2 });
      });
    });
    Object.keys(sides).forEach(function (key) {
      var side = sides[key];
      var ends = side.ends.sort(function (a, b) { return a.rank - b.rank || a.link.index - b.link.index; });
      var step = ends.length > 1 ? Math.min(PORT_STEP, Math.max(6, (side.node.h - 32) / (ends.length - 1))) : 0;
      ends.forEach(function (end, k) {
        end.link[end.role + "Y"] = side.node.y + side.node.h / 2 + (k - (ends.length - 1) / 2) * step;
      });
    });
  }

  /** The degraded route for ports with no clear way out (only mid-drag, on illegal geometry). */
  function zRoute(a, b) {
    var midX = (a.x + b.x) / 2;
    return [{ x: a.x, y: a.y }, { x: midX, y: a.y }, { x: midX, y: b.y }, { x: b.x, y: b.y }];
  }

  function flowEdges(placed, groups, connections) {
    var byId = {};
    placed.forEach(function (node) { byId[node.id] = node; });
    var links = [];
    (connections || []).forEach(function (connection, index) {
      var from = byId[connection.fromId];
      var to = byId[connection.toId];
      if (!from || !to || from === to) return;
      var sides = sidesFor(from, to);
      links.push({ index: index, connection: connection, from: from, to: to, out: sides.out, into: sides.into });
    });
    assignPorts(links);
    var cards = placed.map(function (node) { return { x: node.x, y: node.y, w: node.w, h: node.h }; });
    function owns(frame, node) { return node.id === frame.id || node.parentId === frame.id; }
    var used = Route.createUsed();
    var paths = [];
    links.slice().sort(function (a, b) {
      var da = Math.abs(a.from.x - a.to.x) + Math.abs(a.fromY - a.toY);
      var db = Math.abs(b.from.x - b.to.x) + Math.abs(b.fromY - b.toY);
      return da - db || a.index - b.index;
    }).forEach(function (link) {
      var a = { x: link.out > 0 ? link.from.x + link.from.w : link.from.x, y: link.fromY, dir: link.out };
      var b = { x: link.into > 0 ? link.to.x : link.to.x + link.to.w, y: link.toY, dir: link.into };
      var walls = cards.concat(groups.filter(function (frame) { return !owns(frame, link.from) && !owns(frame, link.to); }));
      link.points = Route.orthogonal(walls, a, b, { used: used }) || zRoute(a, b);
      Route.addUsed(used, link.points);
      paths.push(link.points);
    });
    Route.spread(paths, cards.concat(groups));
    return links.sort(function (a, b) { return a.index - b.index; }).map(function (link) {
      var P = link.points;
      var mid = Math.floor((P.length - 1) / 2);
      return {
        from: link.from.id,
        to: link.to.id,
        kind: link.connection.kind || "data",
        label: link.connection.label || "",
        x1: P[0].x,
        y1: P[0].y,
        cx: (P[mid].x + P[mid + 1].x) / 2,
        cy: (P[mid].y + P[mid + 1].y) / 2,
        x2: P[P.length - 1].x,
        y2: P[P.length - 1].y,
        points: P,
      };
    });
  }

  function captionsFor() {
    return [];
  }

  /**
   * Move one card and re-route. Pass `later` when moving several cards at once
   * and only the last move needs to re-route.
   */
  function moveNode(scene, id, x, y, later) {
    if (!scene || !isFinite(x) || !isFinite(y)) return scene;
    var node = (scene.nodes || []).find(function (item) { return item.id === id; });
    if (!node) return scene;
    node.x = x;
    node.y = y;
    if (later) return scene;
    return reroute(scene);
  }

  /** Rebuild frames, boundaries and arrows from the cards' current positions. */
  function reroute(scene) {
    if (scene.mode === "tiers") {
      scene.groups = groupsFor(scene.nodes, FRAME_PAD);
      scene.zones = zonesFor(scene.nodes, scene.groups);
      var reserved = zoneLabelRects(scene.zones);
      scene.edges = tierEdges(scene.nodes, scene.connections || [], scene.groups, reserved);
      placeLabels(scene.edges, scene.nodes, reserved);
    } else {
      scene.groups = groupsFor(scene.nodes, CLUSTER_PAD);
      scene.edges = routeEdges(scene.nodes, scene.groups, scene.connections || [], scene.direction);
      placeLabels(scene.edges, scene.nodes);
    }
    scene.captions = captionsFor(scene.nodes, scene.boundaries || []);
    scene.bounds = expandForFlows(boundsOf(scene.nodes.concat(scene.groups || [], scene.zones || [])), scene.edges);
    return scene;
  }

  function boundsOf(items) {
    var list = (items || []).filter(Boolean);
    if (!list.length) return { x: 0, y: 0, w: 0, h: 0 };
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    list.forEach(function (item) {
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + item.w);
      maxY = Math.max(maxY, item.y + item.h);
    });
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  function expandForFlows(bounds, edges) {
    if (!bounds.w || !bounds.h) return bounds;
    var pad = 48;
    var minX = bounds.x;
    var minY = bounds.y;
    var maxX = bounds.x + bounds.w;
    var maxY = bounds.y + bounds.h;
    (edges || []).forEach(function (item) {
      var points = item.points || [
        { x: item.x1, y: item.y1 },
        { x: item.cx, y: item.cy },
        { x: item.x2, y: item.y2 },
      ];
      points.forEach(function (point) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });
    });
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }

  /**
   * Hide the descendants of collapsed nodes. Their flows are redrawn from the
   * nearest visible ancestor, and each collapsed node reports how much it hides.
   */
  function collapse(model, ids) {
    var closed = {};
    (ids || []).forEach(function (id) { closed[id] = true; });
    var nodes = (model && model.nodes) || [];
    var byId = {};
    nodes.forEach(function (node) { byId[node.id] = node; });
    function visibleAncestor(node) {
      var chain = [];
      var cursor = node;
      var guard = 0;
      while (cursor && guard < 50) {
        chain.unshift(cursor);
        cursor = cursor.parentId ? byId[cursor.parentId] : null;
        guard += 1;
      }
      for (var i = 0; i < chain.length - 1; i += 1) {
        if (closed[chain[i].id] && chain[i].kind !== "system") return chain[i];
      }
      return node;
    }
    var hidden = {};
    var kept = [];
    nodes.forEach(function (node) {
      var owner = visibleAncestor(node);
      if (owner !== node) {
        hidden[owner.id] = (hidden[owner.id] || 0) + 1;
        return;
      }
      kept.push(node);
    });
    kept = kept.map(function (node) {
      var copy = Object.assign({}, node);
      if (closed[node.id] && hidden[node.id]) {
        copy.collapsed = true;
        copy.hidden = hidden[node.id];
      }
      return copy;
    });
    var seen = {};
    var connections = [];
    ((model && model.connections) || []).forEach(function (flow) {
      var from = byId[flow.fromId] ? visibleAncestor(byId[flow.fromId]).id : flow.fromId;
      var to = byId[flow.toId] ? visibleAncestor(byId[flow.toId]).id : flow.toId;
      if (from === to) return;
      var key = from + ">" + to + ":" + flow.kind + ":" + flow.label;
      if (seen[key]) return;
      seen[key] = true;
      connections.push(Object.assign({}, flow, { fromId: from, toId: to, id: from === flow.fromId && to === flow.toId ? flow.id : flow.id + "@" + from + ">" + to }));
    });
    return Object.assign({}, model, { nodes: kept, connections: connections });
  }

  return {
    buildScene: buildScene,
    moveNode: moveNode,
    settle: settle,
    blocked: blocked,
    collapse: collapse,
    inferTier: inferTier,
    blurbOf: blurbOf,
    boxLines: boxLines,
    TIER_LABEL: TIER_LABEL,
  };
});
