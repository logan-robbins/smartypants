"use strict";

(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SmartypantsScene = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var WIDTH = { system: 520, component: 230, module: 210, unmapped: 240 };
  var GAP_X = 96;
  var GAP_Y = 34;

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

  function lineCount(text, perLine) {
    var words = String(text || "").split(/\s+/).filter(Boolean);
    if (!words.length) return 1;
    var lines = 1;
    var length = 0;
    words.forEach(function (word) {
      var next = length === 0 ? word.length : length + 1 + word.length;
      if (length > 0 && next > perLine) {
        lines += 1;
        length = word.length;
      } else {
        length = next;
      }
    });
    return lines;
  }

  var NAME_CHARS = 24;
  var BLURB_CHARS = 30;

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
      var next = line ? line + " " + word : word;
      if (line && next.length > per) {
        lines.push(line);
        line = word;
      } else line = next;
    });
    if (line) lines.push(line);
    if (max && lines.length > max) {
      lines = lines.slice(0, max);
      lines[max - 1] = lines[max - 1].replace(/\s*\S*$/, "") + "…";
    }
    return lines;
  }

  // Boxes carry a readable name and a one-line description; details open on click.
  function sizeOf(node) {
    var kind = WIDTH[node.kind] ? node.kind : "module";
    var name = String(node.name || "");
    if (kind === "system") {
      return { w: Math.max(240, Math.min(620, name.length * 11 + 110)), h: 58 };
    }
    if (kind === "unmapped") {
      var body = lineCount(node.what, 30) + lineCount(node.why, 30);
      return { w: WIDTH.unmapped, h: 44 + body * 16 };
    }
    var nameLines = wrapLines(name, NAME_CHARS, 3);
    var blurbLines = wrapLines(blurbOf(node), BLURB_CHARS, 2);
    var longest = 0;
    nameLines.forEach(function (line) { longest = Math.max(longest, line.length * 8.4); });
    blurbLines.forEach(function (line) { longest = Math.max(longest, line.length * 6.4); });
    var sideShape = node.shape === "queue" || node.shape === "external" || node.shape === "gateway";
    var w = Math.max(kind === "component" ? 168 : 150, Math.min(WIDTH[kind] + 30, longest + 44)) + (sideShape ? 26 : 0);
    var capPad = node.shape === "store" || node.shape === "cache" ? 18 : 0;
    return { w: Math.round(w), h: 24 + nameLines.length * 19 + blurbLines.length * 15 + capPad };
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

  function place(node, x, y) {
    var size = sizeOf(node);
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

  var RANK_GAP = 132;
  var ROW_GAP = 44;
  var CLUSTER_PAD = 24;
  var CLUSTER_TITLE = 30;

  /**
   * Layered (Sugiyama / dagre-style) left-to-right layout.
   * items: [{ id, w, h }], links: [{ from, to }] -> { id: { x, y } } plus size.
   */
  function layered(items, links) {
    var ids = items.map(function (item) { return item.id; });
    var index = {};
    items.forEach(function (item, i) { index[item.id] = i; });
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
    // Coordinates: columns by rank, rows stacked, then aligned to neighbours.
    var out = {};
    var x = 0;
    ranks.forEach(function (list) {
      var width = 0;
      list.forEach(function (id) { width = Math.max(width, items[index[id]].w); });
      var y = 0;
      list.forEach(function (id) {
        var item = items[index[id]];
        out[id] = { x: x + (width - item.w) / 2, y: y, w: item.w, h: item.h };
        y += item.h + ROW_GAP;
      });
      var shift = (y - ROW_GAP) / 2;
      list.forEach(function (id) { out[id].y -= shift; });
      x += width + RANK_GAP;
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
        var min = tops[i - 1] + out[list[i - 1]].h + ROW_GAP;
        if (tops[i] < min) tops[i] = min;
      }
      for (var j = list.length - 2; j >= 0; j -= 1) {
        var max = tops[j + 1] - out[list[j]].h - ROW_GAP;
        if (tops[j] > max) tops[j] = Math.max(max, want[j] - out[list[j]].h / 2 - 400);
      }
      for (var k = 1; k < list.length; k += 1) {
        var floor = tops[k - 1] + out[list[k - 1]].h + ROW_GAP;
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
    ids.forEach(function (id) { out[id].x -= minX; out[id].y -= minY; });
    return { at: out, w: ids.length ? maxX - minX : 0, h: ids.length ? maxY - minY : 0 };
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
  var TIER_GAP = 104;
  var COL_GAP = 68;
  var ZONE_PAD = 20;

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

  /**
   * Rows of items, top to bottom by tier; left to right by journey order, then
   * pulled toward the items they talk to. Returns positions and size.
   */
  function tierRows(items, links) {
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
    var rowsByRank = {};
    items.forEach(function (item) { (rowsByRank[item.rank] = rowsByRank[item.rank] || []).push(item); });
    var ranks = Object.keys(rowsByRank).map(Number).sort(function (a, b) { return a - b; });
    var rows = ranks.map(function (rank) {
      return rowsByRank[rank].sort(function (a, b) {
        return (a.last ? 1 : 0) - (b.last ? 1 : 0) || (a.sub || 0) - (b.sub || 0) || journey[a.id] - journey[b.id];
      });
    });
    var at = {};
    function placeRow(row) {
      var x = 0;
      row.forEach(function (item) {
        at[item.id] = at[item.id] || {};
        at[item.id].x = x;
        at[item.id].w = item.w;
        x += item.w + COL_GAP;
      });
      return x - COL_GAP;
    }
    var widest = 0;
    rows.forEach(function (row) { widest = Math.max(widest, placeRow(row)); });
    rows.forEach(function (row) {
      var width = row.reduce(function (sum, item) { return sum + item.w; }, 0) + COL_GAP * (row.length - 1);
      var shift = (widest - width) / 2;
      row.forEach(function (item) { at[item.id].x += shift; });
    });
    function center(id) { return at[id].x + at[id].w / 2; }
    function align(row) {
      var want = row.map(function (item) {
        var near = neighbors[item.id].filter(function (n) { return at[n] && !row.some(function (r) { return r.id === n; }); });
        if (!near.length) return center(item.id);
        var xs = near.map(center).sort(function (a, b) { return a - b; });
        return (xs[Math.floor((xs.length - 1) / 2)] + xs[Math.ceil((xs.length - 1) / 2)]) / 2;
      });
      // Reorder by pull, keeping third parties at the right edge.
      var order = row.map(function (item, i) { return { item: item, want: want[i] }; });
      order.sort(function (a, b) { return (a.item.last ? 1 : 0) - (b.item.last ? 1 : 0) || (a.item.sub || 0) - (b.item.sub || 0) || a.want - b.want; });
      row.splice.apply(row, [0, row.length].concat(order.map(function (o) { return o.item; })));
      var lefts = order.map(function (o) { return o.want - o.item.w / 2; });
      for (var i = 1; i < row.length; i += 1) {
        var min = lefts[i - 1] + row[i - 1].w + COL_GAP;
        if (lefts[i] < min) lefts[i] = min;
      }
      for (var j = row.length - 2; j >= 0; j -= 1) {
        var max = lefts[j + 1] - row[j].w - COL_GAP;
        if (lefts[j] > max) lefts[j] = max;
      }
      row.forEach(function (item, k) { at[item.id].x = lefts[k]; });
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
      var inner = row.filter(function (item) { return !item.last; });
      var cursor = inner.length ? at[inner[inner.length - 1].id].x + inner[inner.length - 1].w + COL_GAP * 2 : -Infinity;
      if (rightEdge > -Infinity) cursor = Math.max(cursor, rightEdge + COL_GAP);
      row.forEach(function (item) {
        if (!item.last) return;
        at[item.id].x = cursor;
        cursor += item.w + COL_GAP;
      });
    });
    var y = 0;
    var minX = Infinity;
    var maxX = -Infinity;
    var rowInfo = [];
    rows.forEach(function (row) {
      var height = 0;
      row.forEach(function (item) { height = Math.max(height, item.h); });
      row.forEach(function (item) {
        at[item.id].y = y + (height - item.h) / 2;
        at[item.id].h = item.h;
        minX = Math.min(minX, at[item.id].x);
        maxX = Math.max(maxX, at[item.id].x + item.w);
      });
      rowInfo.push({ rank: row[0].rank, y: y, h: height });
      y += height + TIER_GAP;
    });
    Object.keys(at).forEach(function (id) { at[id].x -= minX; });
    return { at: at, w: items.length ? maxX - minX : 0, h: items.length ? y - TIER_GAP : 0, rows: rowInfo };
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
    function ownerOf(id) {
      var node = byId[id];
      if (!node) return null;
      if (members[id]) return id;
      if (node.kind === "module" && members[node.parentId]) return node.parentId;
      return id;
    }
    function itemFor(node, size) {
      var tier = inferTier(node);
      return { id: node.id, w: size.w, h: size.h, rank: TIER_ORDER[tier], sub: WITHIN_ROW[tier] || 0, last: tier === "external" };
    }
    var inner = {};
    Object.keys(members).forEach(function (cid) {
      var list = [byId[cid]].concat(members[cid]);
      var local = {};
      list.forEach(function (node) { local[node.id] = true; });
      var items = list.map(function (node) { return itemFor(node, sizeOf(node)); });
      var links = connections.filter(function (c) { return local[c.fromId] && local[c.toId]; }).map(function (c) { return { from: c.fromId, to: c.toId }; });
      list.slice(1).forEach(function (node) {
        if (!links.some(function (l) { return l.from === node.id || l.to === node.id; })) links.push({ from: cid, to: node.id });
      });
      inner[cid] = tierRows(items, links);
    });
    var topItems = [];
    rest.forEach(function (node) {
      if (ownerOf(node.id) !== node.id) return;
      var size = inner[node.id]
        ? { w: inner[node.id].w + CLUSTER_PAD * 2, h: inner[node.id].h + CLUSTER_PAD * 2 + CLUSTER_TITLE }
        : sizeOf(node);
      topItems.push(itemFor(node, size));
    });
    var topLinks = [];
    connections.forEach(function (c) {
      var from = ownerOf(c.fromId);
      var to = ownerOf(c.toId);
      if (from && to && from !== to) topLinks.push({ from: from, to: to });
    });
    var top = tierRows(topItems, topLinks);
    var titleH = 0;
    systems.forEach(function (node) { titleH = Math.max(titleH, sizeOf(node).h); });
    var offsetY = systems.length ? titleH + 64 : 0;
    var placed = [];
    topItems.forEach(function (item) {
      var at = top.at[item.id];
      if (inner[item.id]) {
        Object.keys(inner[item.id].at).forEach(function (id) {
          var spot = inner[item.id].at[id];
          placed.push(place(byId[id], at.x + CLUSTER_PAD + spot.x, offsetY + at.y + CLUSTER_PAD + CLUSTER_TITLE + spot.y));
        });
      } else placed.push(place(byId[item.id], at.x, offsetY + at.y));
    });
    systems.forEach(function (node, index) {
      var card = place(node, 0, index * (sizeOf(node).h + 12));
      card.x = top.w ? Math.max(0, (top.w - card.w) / 2) : 0;
      placed.unshift(card);
    });
    placed.forEach(function (card) {
      if (card.kind !== "module") return;
      if (placed.some(function (item) { return item.id === card.parentId && item.kind === "component"; })) card.group = "";
    });
    applySavedPositions(placed, sourceNodes);
    var edges = tierEdges(placed, connections);
    var groups = groupsFor(placed);
    var zones = zonesFor(placed);
    var lanes = top.rows.map(function (row) {
      return { rank: row.rank, label: TIER_LABEL[row.rank] || "", y: offsetY + row.y, h: row.h };
    });
    var bounds = expandForFlows(boundsOf(placed.concat(groups, zones)), edges);
    var unmappedSrc = design && Array.isArray(design.unmappedFlags) ? design.unmappedFlags : [];
    var unmapped = unmappedSrc.map(function (flag, index) {
      var node = { id: "unmapped-" + index, kind: "unmapped", name: "Unmapped drift", what: flag.intent, why: flag.difference, flags: [flag], parentId: null, group: "" };
      var x = bounds.w ? bounds.x + bounds.w + 48 : 0;
      var y = (bounds.w || bounds.h ? bounds.y : 0) + index * (sizeOf(node).h + 24);
      return place(node, x, y);
    });
    applySavedPositions(unmapped, design && Array.isArray(design.unmappedPositions) ? design.unmappedPositions : []);
    placed = placed.concat(unmapped);
    bounds = expandForFlows(boundsOf(placed.concat(groups, zones)), edges);
    return {
      mode: "tiers",
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

  /** Network and trust boundaries: one frame per zone around its parts. */
  function zonesFor(placed) {
    var buckets = {};
    placed.forEach(function (node) {
      if (!node.zone || node.kind === "system" || node.kind === "unmapped") return;
      (buckets[node.zone] = buckets[node.zone] || []).push(node);
    });
    var names = Object.keys(buckets);
    return names.map(function (name) {
      var box = boundsOf(buckets[name]);
      return {
        id: "zone:" + name,
        name: name,
        members: buckets[name].map(function (node) { return node.id; }),
        x: box.x - ZONE_PAD - 8,
        y: box.y - ZONE_PAD - 18,
        w: box.w + (ZONE_PAD + 8) * 2,
        h: box.h + ZONE_PAD * 2 + 18,
      };
    });
  }

  function overlapsY(a, b) {
    return a.y < b.y + b.h && b.y < a.y + a.h;
  }

  function verticalClear(x, ya, yb, placed, skip) {
    var lo = Math.min(ya, yb);
    var hi = Math.max(ya, yb);
    return !placed.some(function (node) {
      if (skip[node.id] || node.kind === "system") return false;
      return x >= node.x - 8 && x <= node.x + node.w + 8 && hi >= node.y - 6 && lo <= node.y + node.h + 6;
    });
  }

  function horizontalClear(y, xa, xb, placed, skip) {
    var lo = Math.min(xa, xb);
    var hi = Math.max(xa, xb);
    return !placed.some(function (node) {
      if (skip[node.id] || node.kind === "system") return false;
      return y >= node.y - 6 && y <= node.y + node.h + 6 && hi >= node.x - 8 && lo <= node.x + node.w + 8;
    });
  }

  /**
   * Orthogonal routes for a tiered picture: down the page from bottom to top
   * ports, replies back up, same-row flows side to side. Crossing a busy row
   * goes through the nearest free channel between boxes.
   */
  function tierEdges(placed, connections) {
    var byId = {};
    placed.forEach(function (node) { byId[node.id] = node; });
    var same = [];
    var vertical = [];
    (connections || []).forEach(function (connection) {
      var from = byId[connection.fromId];
      var to = byId[connection.toId];
      if (!from || !to || from === to) return;
      if (overlapsY(from, to)) same.push(connection);
      else vertical.push({ connection: connection, from: from, to: to, down: to.y >= from.y + from.h });
    });
    // Ports: every vertical flow takes a slot on the bottom or top side of each end.
    var sides = {};
    function side(node, where) {
      var key = node.id + ":" + where;
      return (sides[key] = sides[key] || []);
    }
    vertical.forEach(function (edge) {
      side(edge.from, edge.down ? "bottom" : "top").push({ edge: edge, other: edge.to, end: "from" });
      side(edge.to, edge.down ? "top" : "bottom").push({ edge: edge, other: edge.from, end: "to" });
    });
    Object.keys(sides).forEach(function (key) {
      var list = sides[key];
      var node = byId[key.slice(0, key.lastIndexOf(":"))];
      list.sort(function (a, b) {
        return a.other.x + a.other.w / 2 - (b.other.x + b.other.w / 2) || (a.edge.down ? 0 : 1) - (b.edge.down ? 0 : 1);
      });
      list.forEach(function (slot, i) {
        var x = node.x + (node.w * (i + 1)) / (list.length + 1);
        if (slot.end === "from") slot.edge.x1 = x;
        else slot.edge.x2 = x;
      });
    });
    var lane = 0;
    var result = vertical.map(function (edge) {
      var from = edge.from;
      var to = edge.to;
      var skip = {};
      skip[from.id] = true;
      skip[to.id] = true;
      var x1 = edge.x1;
      var x2 = edge.x2;
      var y1 = edge.down ? from.y + from.h : from.y;
      var y2 = edge.down ? to.y : to.y + to.h;
      var dir = edge.down ? 1 : -1;
      var offset = 22 + (lane % 4) * 7;
      lane += 1;
      var points = null;
      var tries = [y2 - dir * offset, y1 + dir * offset];
      for (var t = 0; t < tries.length && !points; t += 1) {
        var mid = tries[t];
        if (verticalClear(x1, y1, mid, placed, skip) && horizontalClear(mid, x1, x2, placed, skip) && verticalClear(x2, mid, y2, placed, skip)) {
          points = [{ x: x1, y: y1 }, { x: x1, y: mid }, { x: x2, y: mid }, { x: x2, y: y2 }];
        }
      }
      if (!points) {
        var gapA = y1 + dir * offset;
        var gapB = y2 - dir * offset;
        var edges = [];
        placed.forEach(function (node) {
          if (skip[node.id] || node.kind === "system") return;
          if (Math.max(gapA, gapB) >= node.y && Math.min(gapA, gapB) <= node.y + node.h) edges.push([node.x - 8, node.x + node.w + 8]);
        });
        edges.sort(function (a, b) { return a[0] - b[0]; });
        var channels = [];
        if (edges.length) {
          channels.push(edges[0][0] - 24);
          for (var i = 0; i < edges.length - 1; i += 1) {
            if (edges[i + 1][0] - edges[i][1] > 16) channels.push((edges[i][1] + edges[i + 1][0]) / 2);
          }
          var right = Math.max.apply(null, edges.map(function (e) { return e[1]; }));
          channels.push(right + 24);
        }
        var target = (x1 + x2) / 2;
        channels.sort(function (a, b) { return Math.abs(a - target) - Math.abs(b - target); });
        var channel = channels.find(function (c) {
          return verticalClear(c, gapA, gapB, placed, skip);
        });
        if (channel == null) channel = target;
        points = [{ x: x1, y: y1 }, { x: x1, y: gapA }, { x: channel, y: gapA }, { x: channel, y: gapB }, { x: x2, y: gapB }, { x: x2, y: y2 }];
      }
      var longest = 0;
      var cx = (x1 + x2) / 2;
      var cy = (y1 + y2) / 2;
      for (var k = 1; k < points.length; k += 1) {
        var length = Math.abs(points[k].x - points[k - 1].x) + Math.abs(points[k].y - points[k - 1].y);
        if (length > longest) {
          longest = length;
          cx = (points[k].x + points[k - 1].x) / 2;
          cy = (points[k].y + points[k - 1].y) / 2;
        }
      }
      return {
        from: from.id,
        to: to.id,
        id: edge.connection.id,
        kind: edge.connection.kind || "data",
        label: edge.connection.label || "",
        x1: x1, y1: y1, x2: x2, y2: y2, cx: cx, cy: cy,
        points: points,
      };
    });
    var sideways = flowEdges(placed, same).map(function (edge, i) { return Object.assign({ id: same[i] && same[i].id }, edge); });
    return sideways.concat(result);
  }

  function buildScene(design) {
    if (design && design.direction && design.direction !== "tiers") return buildFlowScene(design);
    return tieredScene(design);
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
      var titleAlongX = swap ? CLUSTER_TITLE : 0;
      var titleAlongY = swap ? 0 : CLUSTER_TITLE;
      var inner = {};
      Object.keys(members).forEach(function (cid) {
        var list = [byId[cid]].concat(members[cid]);
        var local = {};
        list.forEach(function (node) { local[node.id] = true; });
        var items = list.map(function (node) { var size = dims(node); return { id: node.id, w: size.w, h: size.h }; });
        var links = connections.filter(function (c) { return local[c.fromId] && local[c.toId]; }).map(function (c) { return { from: c.fromId, to: c.toId }; });
        // Unlinked modules hang off their component so the cluster reads in flow order.
        list.slice(1).forEach(function (node) {
          var linked = links.some(function (l) { return l.from === node.id || l.to === node.id; });
          if (!linked) links.push({ from: cid, to: node.id });
        });
        inner[cid] = layered(items, links);
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
        if (from && to && from !== to) topLinks.push({ from: from, to: to });
      });
      var top = layered(topItems, topLinks);
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
    applySavedPositions(placed, sourceNodes);
    var edges = routeEdges(placed, connections, direction);
    var groups = groupsFor(placed);
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
    bounds = expandForFlows(boundsOf(placed.concat(groups)), edges);
    return {
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
  function routeEdges(placed, connections, direction) {
    if (direction !== "TB") return flowEdges(placed, connections);
    var flipped = placed.map(function (node) {
      return Object.assign({}, node, { x: node.y, y: node.x, w: node.h, h: node.w });
    });
    return flowEdges(flipped, connections).map(function (edge) {
      return Object.assign({}, edge, {
        x1: edge.y1, y1: edge.x1, x2: edge.y2, y2: edge.x2, cx: edge.cy, cy: edge.cx,
        points: (edge.points || []).map(function (p) { return { x: p.y, y: p.x }; }),
      });
    });
  }

  function applySavedPositions(placed, sources) {
    placed.forEach(function (card) {
      var source = sources.find(function (node) { return node.id === card.id; });
      if (!source || !isFinite(source.x) || !isFinite(source.y)) return;
      card.x = source.x;
      card.y = source.y;
    });
  }

  function groupsFor(placed) {
    var groups = [];
    placed.forEach(function (owner) {
      if (owner.kind !== "component") return;
      var kids = placed.filter(function (node) { return node.kind === "module" && node.parentId === owner.id; });
      if (!kids.length) return;
      var box = boundsOf([owner].concat(kids));
      groups.push({
        id: owner.id,
        x: box.x - CLUSTER_PAD,
        y: box.y - CLUSTER_PAD,
        w: box.w + CLUSTER_PAD * 2,
        h: box.h + CLUSTER_PAD * 2,
      });
    });
    return groups;
  }

  function segmentHits(x1, y1, x2, y2, placed, skip) {
    var minX = Math.min(x1, x2);
    var maxX = Math.max(x1, x2);
    var minY = Math.min(y1, y2);
    var maxY = Math.max(y1, y2);
    return placed.some(function (node) {
      if (skip[node.id] || node.kind === "system") return false;
      var pad = 10;
      return maxX >= node.x - pad && minX <= node.x + node.w + pad && maxY >= node.y - pad && minY <= node.y + node.h + pad;
    });
  }

  function portY(node, slot, count) {
    if (!count || count < 2) return node.y + node.h / 2;
    var span = Math.max(18, Math.min(node.h - 28, (count - 1) * 16));
    var start = node.y + node.h / 2 - span / 2;
    return start + (span * slot) / (count - 1);
  }

  function pairKey(a, b) {
    return a < b ? a + "~" + b : b + "~" + a;
  }

  function clampPort(value, node) {
    var min = node.y + 16;
    var max = node.y + node.h - 16;
    if (max <= min) return node.y + node.h / 2;
    return Math.max(min, Math.min(max, value));
  }

  function flowEdges(placed, connections) {
    var outCount = {};
    var inCount = {};
    var pairCount = {};
    (connections || []).forEach(function (connection) {
      outCount[connection.fromId] = (outCount[connection.fromId] || 0) + 1;
      inCount[connection.toId] = (inCount[connection.toId] || 0) + 1;
      var key = pairKey(connection.fromId, connection.toId);
      pairCount[key] = (pairCount[key] || 0) + 1;
    });
    var outSlot = {};
    var inSlot = {};
    var pairSlot = {};
    var laneSlot = 0;
    var list = [];
    (connections || []).forEach(function (connection) {
      var from = placed.find(function (node) { return node.id === connection.fromId; });
      var to = placed.find(function (node) { return node.id === connection.toId; });
      if (!from || !to) return;
      var fromSlot = outSlot[from.id] || 0;
      outSlot[from.id] = fromSlot + 1;
      var toSlot = inSlot[to.id] || 0;
      inSlot[to.id] = toSlot + 1;
      var key = pairKey(from.id, to.id);
      var slot = pairSlot[key] || 0;
      pairSlot[key] = slot + 1;
      var spread = pairCount[key] > 1 ? (slot === 0 ? -18 : 18) : 0;
      var goingRight = to.x + to.w / 2 >= from.x + from.w / 2;
      var y1 = clampPort(portY(from, fromSlot, outCount[from.id]) + spread, from);
      var y2 = clampPort(portY(to, toSlot, inCount[to.id]) + spread, to);
      var x1 = goingRight ? from.x + from.w : from.x;
      var x2 = goingRight ? to.x : to.x + to.w;
      var midX = (x1 + x2) / 2;
      var points = [
        { x: x1, y: y1 },
        { x: midX, y: y1 },
        { x: midX, y: y2 },
        { x: x2, y: y2 },
      ];
      var skip = {};
      skip[from.id] = true;
      skip[to.id] = true;
      var blocked = segmentHits(x1, y1, midX, y1, placed, skip)
        || segmentHits(midX, y1, midX, y2, placed, skip)
        || segmentHits(midX, y2, x2, y2, placed, skip);
      var cx = midX;
      var cy = (y1 + y2) / 2;
      if (blocked) {
        var pairBottom = Math.max(from.y + from.h, to.y + to.h);
        var lane = pairBottom + 28 + laneSlot * 26;
        laneSlot += 1;
        var outX = goingRight ? x1 + 28 : x1 - 28;
        var inX = goingRight ? x2 - 28 : x2 + 28;
        points = [
          { x: x1, y: y1 },
          { x: outX, y: y1 },
          { x: outX, y: lane },
          { x: inX, y: lane },
          { x: inX, y: y2 },
          { x: x2, y: y2 },
        ];
        cx = (outX + inX) / 2;
        cy = lane;
      }
      list.push({
        from: from.id,
        to: to.id,
        kind: connection.kind || "data",
        label: connection.label || "",
        x1: x1,
        y1: y1,
        cx: cx,
        cy: cy,
        x2: x2,
        y2: y2,
        points: points,
      });
    });
    return list;
  }

  function captionsFor() {
    return [];
  }

  function moveNode(scene, id, x, y) {
    if (!scene || !isFinite(x) || !isFinite(y)) return scene;
    var node = (scene.nodes || []).find(function (item) { return item.id === id; });
    if (!node) return scene;
    node.x = x;
    node.y = y;
    scene.edges = scene.mode === "tiers" ? tierEdges(scene.nodes, scene.connections || []) : routeEdges(scene.nodes, scene.connections || [], scene.direction);
    if (scene.mode === "tiers") scene.zones = zonesFor(scene.nodes);
    scene.groups = groupsFor(scene.nodes);
    scene.captions = captionsFor(scene.nodes, scene.boundaries || []);
    scene.bounds = expandForFlows(boundsOf(scene.nodes.concat(scene.groups || [])), scene.edges);
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

  return { buildScene: buildScene, moveNode: moveNode, collapse: collapse, inferTier: inferTier, blurbOf: blurbOf, TIER_LABEL: TIER_LABEL };
});
