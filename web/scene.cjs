"use strict";

(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SmartypantsScene = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var WIDTH = { system: 460, component: 280, module: 250, unmapped: 280 };
  var COLUMN_GAP = 36;
  var STACK_GAP = 22;
  var LEVEL_GAP = 48;

  function slug(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function sameParent(node, parent) {
    if (!node || !parent || !node.parentId) return false;
    var want = String(node.parentId);
    return want === parent.id || slug(want) === parent.id || slug(want) === slug(parent.name);
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
    var per = kind === "system" ? 40 : kind === "component" ? 28 : 26;
    var flags = Array.isArray(node.flags) ? node.flags : [];
    var h = 16 + 14 + lineCount(node.name, per - 6) * 24;
    h += 8 + 12 + lineCount(node.what, per) * 17;
    h += 6 + 12 + lineCount(node.why, per) * 17 + 16;
    flags.forEach(function (flag) {
      h += 28 + lineCount(flag.intent, per) * 18 + lineCount(flag.difference, per) * 18 + 12;
    });
    return { w: w, h: h };
  }

  function labelOf(node) {
    var parts = [node.name, node.what, node.why];
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

  function buildScene(design) {
    var nodes = design && Array.isArray(design.nodes) ? design.nodes : [];
    var systems = nodes.filter(function (node) {
      return node.kind === "system";
    });
    var trees = systems.map(function (system) {
      var comps = nodes.filter(function (node) {
        return node.kind === "component" && sameParent(node, system);
      });
      var compBlocks = comps.map(function (comp) {
        return {
          node: comp,
          mods: nodes.filter(function (node) {
            return node.kind === "module" && sameParent(node, comp);
          }),
        };
      });
      return { node: system, comps: compBlocks };
    });

    var placed = [];
    var columns = [];
    trees.forEach(function (tree) {
      tree.comps.forEach(function (block) {
        var width = sizeOf(block.node).w;
        block.mods.forEach(function (mod) {
          width = Math.max(width, sizeOf(mod).w);
        });
        columns.push({ tree: tree, block: block, width: width });
      });
      if (!tree.comps.length) columns.push({ tree: tree, block: null, width: sizeOf(tree.node).w });
    });
    var cursor = 0;
    var systemBottom = 0;
    trees.forEach(function (tree) {
      var owned = columns.filter(function (column) { return column.tree === tree; });
      var span = 0;
      owned.forEach(function (column, index) {
        if (index) span += COLUMN_GAP;
        span += column.width;
      });
      var sys = sizeOf(tree.node);
      var sysX = cursor + Math.max(0, (span - sys.w) / 2);
      var systemCard = place(tree.node, sysX, 0);
      placed.push(systemCard);
      systemBottom = Math.max(systemBottom, systemCard.h);
      cursor += span + COLUMN_GAP;
    });
    cursor = 0;
    columns.forEach(function (column) {
      if (!column.block) {
        cursor += column.width + COLUMN_GAP;
        return;
      }
      var systemCard = placed.find(function (node) { return node.id === column.tree.node.id; });
      var compSize = sizeOf(column.block.node);
      var compX = cursor + (column.width - compSize.w) / 2;
      var compY = systemBottom + LEVEL_GAP;
      var compCard = place(column.block.node, compX, compY);
      placed.push(compCard);
      var previous = compCard;
      column.block.mods.forEach(function (mod) {
        var modSize = sizeOf(mod);
        var modX = cursor + (column.width - modSize.w) / 2;
        var modY = previous.y + previous.h + STACK_GAP;
        var modCard = place(mod, modX, modY);
        placed.push(modCard);
        previous = modCard;
      });
      cursor += column.width + COLUMN_GAP;
    });

    applySavedPositions(placed, nodes);
    var connections = design && Array.isArray(design.connections) ? design.connections : [];
    var edges = containmentEdges(placed).concat(flowEdges(placed, connections));
    var bounds = expandForFlows(boundsOf(placed), edges);
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
      };
      var x = (bounds.w ? bounds.x + bounds.w + 80 : 0);
      var y = (bounds.w || bounds.h ? bounds.y : 0) + index * (sizeOf(node).h + 32);
      return place(node, x, y);
    });
    placed = placed.concat(unmapped);
    bounds = expandForFlows(boundsOf(placed), edges);

    return { nodes: placed, edges: edges, connections: connections, unmapped: unmapped, bounds: bounds };
  }

  function applySavedPositions(placed, sources) {
    placed.forEach(function (card) {
      var source = sources.find(function (node) { return node.id === card.id; });
      if (!source || !isFinite(source.x) || !isFinite(source.y)) return;
      card.x = source.x;
      card.y = source.y;
    });
  }

  function containmentEdges(placed) {
    var list = [];
    placed.forEach(function (child) {
      if (!child.parentId) return;
      var parent = placed.find(function (node) { return node.id === child.parentId; });
      if (!parent) return;
      list.push(edge(parent, child));
    });
    return list;
  }

  function flowEdges(placed, connections) {
    var list = [];
    (connections || []).forEach(function (connection) {
      var from = placed.find(function (node) { return node.id === connection.fromId; });
      var to = placed.find(function (node) { return node.id === connection.toId; });
      if (!from || !to) return;
      var startX = from.x + from.w / 2;
      var startY = from.y + from.h / 2;
      var endX = to.x + to.w / 2;
      var endY = to.y + to.h / 2;
      var dx = endX - startX;
      var dy = endY - startY;
      var horizontal = Math.abs(dx) > Math.abs(dy);
      var x1 = horizontal ? (dx >= 0 ? from.x + from.w : from.x) : startX;
      var y1 = horizontal ? startY : (dy >= 0 ? from.y + from.h : from.y);
      var x2 = horizontal ? (dx >= 0 ? to.x : to.x + to.w) : endX;
      var y2 = horizontal ? endY : (dy >= 0 ? to.y : to.y + to.h);
      var bend = Math.max(48, Math.min(140, Math.abs(horizontal ? x2 - x1 : y2 - y1) * 0.32));
      list.push({
        from: from.id,
        to: to.id,
        kind: connection.kind || "data",
        label: connection.label || "",
        x1: x1,
        y1: y1,
        cx: horizontal ? (x1 + x2) / 2 : (dx >= 0 ? Math.max(x1, x2) + bend : Math.min(x1, x2) - bend),
        cy: horizontal ? (dy >= 0 ? Math.max(y1, y2) + bend : Math.min(y1, y2) - bend) : (y1 + y2) / 2,
        x2: x2,
        y2: y2,
      });
    });
    return list;
  }

  function moveNode(scene, id, x, y) {
    if (!scene || !isFinite(x) || !isFinite(y)) return scene;
    var node = (scene.nodes || []).find(function (item) { return item.id === id; });
    if (!node) return scene;
    node.x = x;
    node.y = y;
    scene.edges = containmentEdges(scene.nodes).concat(flowEdges(scene.nodes, scene.connections || []));
    scene.bounds = expandForFlows(boundsOf(scene.nodes), scene.edges);
    return scene;
  }

  function edge(parent, child, fromId) {
    return {
      from: fromId || parent.id,
      to: child.id,
      kind: "containment",
      x1: parent.x + parent.w / 2,
      y1: parent.y + parent.h,
      x2: child.x + child.w / 2,
      y2: child.y,
    };
  }

  function boundsOf(items) {
    if (!items.length) return { x: 0, y: 0, w: 0, h: 0 };
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    items.forEach(function (item) {
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + item.w);
      maxY = Math.max(maxY, item.y + item.h);
    });
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  function expandForFlows(bounds, edges) {
    var flows = edges.filter(function (item) { return item.kind !== "containment"; });
    if (!flows.length || !bounds.w || !bounds.h) return bounds;
    var pad = 72;
    var minX = bounds.x;
    var minY = bounds.y;
    var maxX = bounds.x + bounds.w;
    var maxY = bounds.y + bounds.h;
    flows.forEach(function (item) {
      minX = Math.min(minX, item.x1, item.x2, item.cx);
      minY = Math.min(minY, item.y1, item.y2, item.cy);
      maxX = Math.max(maxX, item.x1, item.x2, item.cx);
      maxY = Math.max(maxY, item.y1, item.y2, item.cy);
    });
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }

  return { buildScene: buildScene, moveNode: moveNode };
});
