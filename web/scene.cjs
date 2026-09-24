"use strict";

(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SmartypantsScene = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var WIDTH = { system: 520, component: 210, module: 200, unmapped: 220 };
  var GAP_X = 108;
  var GAP_Y = 26;

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

  function sizeOf(node) {
    var kind = WIDTH[node.kind] ? node.kind : "module";
    var w = WIDTH[kind];
    if (kind === "system") {
      var titleLines = lineCount(node.name, 32);
      var bodyLines = lineCount(node.what, 58) + lineCount(node.why, 58);
      return { w: w, h: 18 + titleLines * 28 + bodyLines * 18 + 16 };
    }
    var per = kind === "component" ? 26 : 24;
    var flags = Array.isArray(node.flags) ? node.flags : [];
    var h = 16;
    if (node.group) h += 16;
    h += lineCount(node.name, per - 4) * 22;
    h += 6 + lineCount(node.what, per) * 16;
    h += 4 + lineCount(node.why, per) * 15 + 14;
    flags.forEach(function (flag) {
      h += 22 + lineCount(flag.intent, per) * 16 + lineCount(flag.difference, per) * 16 + 10;
    });
    return { w: w, h: h };
  }

  function labelOf(node) {
    var parts = [node.group, node.name, node.what, node.why];
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
      flags: node.flags || [],
      flagged: (node.flags || []).length > 0,
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

  function flowMaps(nodes, connections) {
    var incoming = {};
    var outgoing = {};
    nodes.forEach(function (node) {
      incoming[node.id] = [];
      outgoing[node.id] = [];
    });
    (connections || []).forEach(function (connection) {
      if (!incoming[connection.toId] || !outgoing[connection.fromId]) return;
      incoming[connection.toId].push(connection.fromId);
      outgoing[connection.fromId].push(connection.toId);
    });
    return { incoming: incoming, outgoing: outgoing };
  }

  function familyKey(node) {
    if (!node) return "";
    if (node.kind === "component") return node.id;
    return node.parentId || node.id;
  }

  function isBoundary(node, maps, nodes) {
    if (!node || node.kind !== "component") return false;
    if (inFlow(node.id, maps)) return false;
    if ((node.flags || []).length) return false;
    return nodes.some(function (other) {
      return other.kind === "module" && (other.parentId === node.id || slug(other.parentId) === slug(node.id));
    });
  }

  function inFlow(id, maps) {
    return maps.incoming[id].length > 0 || maps.outgoing[id].length > 0;
  }

  function familyIds(node, nodes) {
    var ids = [];
    var parent = findNode(nodes, node.parentId);
    if (parent && parent.kind !== "system") ids.push(parent.id);
    nodes.forEach(function (other) {
      if (other.id === node.id) return;
      if (other.parentId === node.id) ids.push(other.id);
      if (node.parentId && other.parentId === node.parentId) ids.push(other.id);
    });
    return ids;
  }

  function ranksFor(nodes, maps) {
    var memo = {};
    var stack = {};
    function rankOf(id) {
      if (memo[id] != null) return memo[id];
      if (stack[id]) return 0;
      stack[id] = true;
      var best = 0;
      if (maps.incoming[id].length) {
        maps.incoming[id].forEach(function (src) {
          best = Math.max(best, rankOf(src) + 1);
        });
      } else if (!maps.outgoing[id].length) {
        var found = null;
        familyIds(findNode(nodes, id), nodes).forEach(function (fid) {
          if (!inFlow(fid, maps) || stack[fid]) return;
          var value = rankOf(fid);
          found = found == null ? value : Math.min(found, value);
        });
        best = found == null ? 0 : found;
      }
      stack[id] = false;
      memo[id] = best;
      return best;
    }
    nodes.forEach(function (node) {
      rankOf(node.id);
    });
    return memo;
  }

  function buildScene(design) {
    var sourceNodes = design && Array.isArray(design.nodes) ? design.nodes : [];
    var nodes = annotate(sourceNodes);
    var systems = nodes.filter(function (node) {
      return node.kind === "system";
    });
    var rest = nodes.filter(function (node) {
      return node.kind !== "system";
    });
    var connections = design && Array.isArray(design.connections) ? design.connections : [];
    var maps = flowMaps(rest, connections);
    var ranks = ranksFor(rest, maps);
    var boundaries = rest.filter(function (node) {
      return isBoundary(node, maps, rest);
    });
    var boxes = rest.filter(function (node) {
      return !isBoundary(node, maps, rest);
    });
    var columns = {};
    boxes.forEach(function (node) {
      var rank = ranks[node.id] || 0;
      if (!columns[rank]) columns[rank] = [];
      columns[rank].push(node);
    });
    var placed = [];
    var cursorX = 0;
    Object.keys(columns)
      .map(Number)
      .sort(function (a, b) { return a - b; })
      .forEach(function (rank) {
        var column = columns[rank].slice().sort(function (a, b) {
          var familyA = familyKey(a);
          var familyB = familyKey(b);
          if (familyA !== familyB) return familyA.localeCompare(familyB);
          var flowA = inFlow(a.id, maps) ? 0 : 1;
          var flowB = inFlow(b.id, maps) ? 0 : 1;
          if (flowA !== flowB) return flowA - flowB;
          if (a.kind !== b.kind) return a.kind === "component" ? -1 : 1;
          return String(a.name).localeCompare(String(b.name));
        });
        var cursorY = 0;
        var columnWidth = 0;
        var seenFamily = {};
        column.forEach(function (node) {
          var family = familyKey(node);
          var key = family + ":" + rank;
          if (boundaries.some(function (item) { return item.id === family; }) && !seenFamily[key]) {
            cursorY += 40;
            seenFamily[key] = true;
          }
          var card = place(node, cursorX, cursorY);
          placed.push(card);
          cursorY += card.h + GAP_Y;
          columnWidth = Math.max(columnWidth, card.w);
        });
        cursorX += columnWidth + GAP_X;
      });

    var body = boundsOf(placed);
    var titleH = 0;
    systems.forEach(function (node) {
      titleH = Math.max(titleH, sizeOf(node).h);
    });
    if (systems.length) {
      var shift = titleH + 36;
      placed.forEach(function (card) {
        card.y += shift;
      });
      systems.forEach(function (node, index) {
        var card = place(node, 0, index * (sizeOf(node).h + 12));
        card.x = body.w ? body.x + Math.max(0, (body.w - card.w) / 2) : 0;
        placed.unshift(card);
      });
    }

    placed.forEach(function (card) {
      if (card.kind !== "module") return;
      var parent = placed.find(function (item) { return item.id === card.parentId && item.kind === "component"; });
      if (parent) card.group = "";
    });
    applySavedPositions(placed, sourceNodes);
    var edges = flowEdges(placed, connections);
    var groups = groupsFor(placed);
    var captions = captionsFor(placed, boundaries);
    captions.forEach(function (caption) {
      var under = placed.find(function (node) {
        return Math.abs(node.x - caption.x) < 2 && Math.abs(node.y - (caption.y + 36)) < 8;
      });
      if (under) under.group = "";
    });
    var bounds = expandForFlows(boundsOf(placed.concat(groups, captions)), edges);
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
    bounds = expandForFlows(boundsOf(placed.concat(groups, captions)), edges);
    return {
      nodes: placed,
      edges: edges,
      groups: groups,
      captions: captions,
      boundaries: boundaries.map(function (node) {
        return { id: node.id, name: node.name, what: node.what || "" };
      }),
      connections: connections,
      unmapped: unmapped,
      bounds: bounds,
    };
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
    var buckets = {};
    placed.forEach(function (node) {
      if (node.kind === "component") {
        if (!buckets[node.id]) buckets[node.id] = [];
        buckets[node.id].push(node);
      }
      if (node.kind === "module" && node.parentId) {
        var parent = placed.find(function (item) { return item.id === node.parentId; });
        var key = parent && parent.kind === "component" ? parent.id : node.parentId;
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(node);
      }
    });
    var groups = [];
    Object.keys(buckets).forEach(function (key) {
      var members = buckets[key];
      if (members.length < 2) return;
      var bounds = boundsOf(members);
      var widest = 0;
      members.forEach(function (member) {
        widest = Math.max(widest, member.w);
      });
      if (bounds.w > widest + GAP_X) return;
      groups.push({
        id: key,
        x: bounds.x - 14,
        y: bounds.y - 14,
        w: bounds.w + 28,
        h: bounds.h + 28,
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

  function captionsFor(placed, boundaries) {
    var captions = [];
    (boundaries || []).forEach(function (component) {
      var members = placed.filter(function (node) { return node.parentId === component.id; });
      var tops = {};
      members.forEach(function (node) {
        var key = String(Math.round(node.x));
        if (!tops[key] || node.y < tops[key].y) tops[key] = node;
      });
      Object.keys(tops).forEach(function (key) {
        var top = tops[key];
        captions.push({
          id: component.id + "@" + key,
          name: component.name,
          what: component.what || "",
          x: top.x,
          y: top.y - 36,
          w: top.w,
          h: 32,
        });
      });
    });
    return captions;
  }

  function moveNode(scene, id, x, y) {
    if (!scene || !isFinite(x) || !isFinite(y)) return scene;
    var node = (scene.nodes || []).find(function (item) { return item.id === id; });
    if (!node) return scene;
    node.x = x;
    node.y = y;
    scene.edges = flowEdges(scene.nodes, scene.connections || []);
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

  return { buildScene: buildScene, moveNode: moveNode };
});
