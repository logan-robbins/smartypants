"use strict";

(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SmartypantsScene = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var SIZE = {
    system: { w: 560, h: 248 },
    component: { w: 360, h: 256 },
    module: { w: 300, h: 244 },
    unmapped: { w: 340, h: 220 },
  };
  var GAP_X = 40;
  var GAP_Y = 96;
  var TREE_GAP = 88;
  var FLAG_EXTRA = 92;

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

  function sizeOf(node) {
    var base = SIZE[node.kind] || SIZE.module;
    var flags = Array.isArray(node.flags) ? node.flags.length : 0;
    return { w: base.w, h: base.h + flags * FLAG_EXTRA };
  }

  function rowWidth(widths) {
    if (!widths.length) return 0;
    var total = 0;
    for (var i = 0; i < widths.length; i += 1) {
      total += widths[i];
      if (i) total += GAP_X;
    }
    return total;
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
        var mods = nodes.filter(function (node) {
          return node.kind === "module" && sameParent(node, comp);
        });
        var modWidths = mods.map(function (mod) {
          return sizeOf(mod).w;
        });
        return {
          node: comp,
          mods: mods,
          width: Math.max(sizeOf(comp).w, rowWidth(modWidths)),
        };
      });
      var compWidths = compBlocks.map(function (block) {
        return block.width;
      });
      return {
        node: system,
        comps: compBlocks,
        width: Math.max(sizeOf(system).w, rowWidth(compWidths)),
      };
    });

    var placed = [];
    var edges = [];
    var cursor = 0;
    trees.forEach(function (tree, index) {
      if (index) cursor += TREE_GAP;
      var sysSize = sizeOf(tree.node);
      var sysX = cursor + (tree.width - sysSize.w) / 2;
      var systemCard = place(tree.node, sysX, 0);
      placed.push(systemCard);

      var compRow = rowWidth(
        tree.comps.map(function (block) {
          return block.width;
        }),
      );
      var blockX = cursor + (tree.width - compRow) / 2;
      var compY = systemCard.h + GAP_Y;
      tree.comps.forEach(function (block) {
        var compSize = sizeOf(block.node);
        var compX = blockX + (block.width - compSize.w) / 2;
        var compCard = place(block.node, compX, compY);
        placed.push(compCard);
        edges.push(edge(systemCard, compCard));
        var modWidths = block.mods.map(function (mod) {
          return sizeOf(mod).w;
        });
        var modRow = rowWidth(modWidths);
        var modX = blockX + (block.width - modRow) / 2;
        var modY = compCard.y + compCard.h + GAP_Y;
        block.mods.forEach(function (mod) {
          var modCard = place(mod, modX, modY);
          placed.push(modCard);
          edges.push(edge(compCard, modCard));
          modX += modCard.w + GAP_X;
        });
        blockX += block.width + GAP_X;
      });
      cursor += tree.width;
    });

    var bounds = boundsOf(placed);
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
      var y = (bounds.w || bounds.h ? bounds.y : 0) + index * (SIZE.unmapped.h + 32);
      return place(node, x, y);
    });
    placed = placed.concat(unmapped);
    bounds = boundsOf(placed);

    return { nodes: placed, edges: edges, unmapped: unmapped, bounds: bounds };
  }

  function edge(parent, child) {
    return {
      from: parent.id,
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

  return { buildScene: buildScene };
});
