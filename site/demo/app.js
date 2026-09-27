(function () {
  var root = typeof globalThis !== "undefined" ? globalThis : this;

  var SERVE_HELP =
    '<main class="serve-help"><div>' +
    "<h1>Smartypants canvas</h1>" +
    "<p>This page reads the persisted design from the project, so open it through the local server.</p>" +
    "<p>From the project root, run <code>node bin/smartypants-serve.mjs</code></p>" +
    "<p>Then open <code>http://127.0.0.1:4173</code></p>" +
    "</div></main>";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var KIND_LABEL = { system: "System", component: "Component", module: "Module", unmapped: "Unmapped drift" };
  var ARROW = 9; // arrowhead length in world units
  var LABEL_ZOOM = 0.75; // arrow labels show from this zoom up (and always on focus)

  /**
   * Server calls, or their static stand-ins on the website demo
   * (window.SMARTYPANTS_STATIC = { design: "url", intent: "url" }).
   */
  function api(url, init) {
    var fixed = root.SMARTYPANTS_STATIC;
    if (!fixed) return fetch(url, init);
    var method = (init && init.method) || "GET";
    function json(value) {
      return Promise.resolve({ ok: true, json: function () { return Promise.resolve(value); }, text: function () { return Promise.resolve(typeof value === "string" ? value : JSON.stringify(value)); } });
    }
    if (url.indexOf("/design.json") === 0) return fetch(fixed.design, { cache: "no-store" });
    if (url.indexOf("/intent.json") === 0) return fixed.intent ? fetch(fixed.intent) : json({ atoms: [], text: "", tokens: 0 });
    if (url.indexOf("/design.mmd") === 0) return fixed.mermaid ? fetch(fixed.mermaid) : Promise.reject(new Error("static"));
    if (method === "POST" && url.indexOf("/positions") === 0) return json({ ok: true, changed: false });
    if (method === "POST") {
      if (typeof fixed.notice === "function") fixed.notice(url);
      return json({ ok: true, static: true });
    }
    return Promise.reject(new Error("static"));
  }

  function showServeHelp() {
    if (typeof document === "undefined" || !document.body) return;
    document.body.innerHTML = SERVE_HELP;
  }

  function esc(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(root.localStorage.getItem(key) || "null");
      root.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      return null;
    }
    return value;
  }

  function n1(v) {
    return Math.round(v * 10) / 10;
  }

  // ---- Shapes ----------------------------------------------------------------

  function shapePath(shape, w, h) {
    var r;
    switch (shape) {
      case "store":
      case "cache":
        r = 8;
        return "M0," + r + " a" + w / 2 + "," + r + " 0 0,0 " + w + ",0 a" + w / 2 + "," + r + " 0 0,0 " + -w + ",0" +
          " l0," + (h - 2 * r) + " a" + w / 2 + "," + r + " 0 0,0 " + w + ",0 l0," + -(h - 2 * r);
      case "queue":
        r = Math.min(16, h / 2);
        return "M" + r + ",0 L" + (w - r) + ",0 L" + w + "," + h / 2 + " L" + (w - r) + "," + h + " L" + r + "," + h + " L0," + h / 2 + " Z";
      case "gateway":
        return "M12,0 L" + (w - 12) + ",0 L" + w + "," + h + " L0," + h + " Z";
      case "external":
        return "M14,0 L" + w + ",0 L" + (w - 14) + "," + h + " L0," + h + " Z";
      default:
        return null;
    }
  }

  function textRows(lines, x, top, cls, step, anchor) {
    return lines.map(function (line, i) {
      return '<text class="' + cls + '" x="' + n1(x) + '" y="' + n1(top + i * step) + '"' + (anchor ? ' text-anchor="' + anchor + '"' : "") + ">" + esc(line) + "</text>";
    }).join("");
  }

  function lineSet(node) {
    var lines = node.lines || {};
    var name = lines.name && lines.name.length ? lines.name : [node.name || ""];
    var blurb = lines.blurb || (node.blurb ? [node.blurb] : []);
    return { name: name, blurb: blurb };
  }

  function nodeSvg(node, state) {
    var classes = "node shape-" + esc(node.shape) + " kind-" + esc(node.kind) + " tier-" + esc(node.tier || "service") +
      (node.header ? " is-header" : "") + (node.flagged ? " is-drift" : "") + (state.selected ? " is-selected" : "") + (state.fresh ? " is-fresh" : "");
    var w = node.w;
    var h = node.h;
    var lines = lineSet(node);
    var body = "";
    var label = "";
    var badges = "";
    if (node.kind === "system") {
      body = '<rect class="box" width="' + w + '" height="' + h + '" rx="12"/>';
      label = '<text class="title" x="16" y="27">' + esc(lines.name[0]) + "</text>" +
        (lines.blurb[0] ? '<text class="subtitle" x="16" y="48">' + esc(lines.blurb[0]) + "</text>" : "");
    } else if (node.header) {
      // A subgraph's title panel: the frame is drawn with the frames.
      body = '<rect class="box" width="' + w + '" height="' + h + '" rx="12"/>';
      var textH = lines.name.length * 20 + 6 + lines.blurb.length * 17 + 10 + 14;
      var top = h <= 160 ? Math.max(18, (h - textH) / 2) + 10 : 30;
      label = textRows(lines.name, 18, top, "head-name", 20) +
        textRows(lines.blurb, 18, top + lines.name.length * 20 + 6, "head-blurb", 17) +
        '<text class="head-meta" x="18" y="' + n1(top + lines.name.length * 20 + 6 + lines.blurb.length * 17 + 12) + '">' +
        esc(node.parts + (node.parts === 1 ? " PART" : " PARTS")) + "</text>";
    } else if (node.kind === "unmapped") {
      body = '<rect class="box" width="' + w + '" height="' + h + '" rx="10"/>';
      var code = (node.lines && node.lines.code) || [];
      label = '<text class="card-title" x="16" y="26">Unmapped drift</text>' + textRows(lines.blurb, 16, 50, "card-line", 17) +
        textRows(code, 16, 58 + lines.blurb.length * 17, "card-code", 17);
    } else {
      var path = shapePath(node.shape, w, h);
      if (path) body = '<path class="box" d="' + path + '"/>';
      else if (node.shape === "client") body = '<rect class="box" width="' + w + '" height="' + h + '" rx="' + Math.min(h / 2, 28) + '"/>';
      else if (node.shape === "worker") {
        body = '<rect class="box" width="' + w + '" height="' + h + '" rx="3"/>' +
          '<line class="rule" x1="7" y1="0" x2="7" y2="' + h + '"/><line class="rule" x1="' + (w - 7) + '" y1="0" x2="' + (w - 7) + '" y2="' + h + '"/>';
      } else body = '<rect class="box" width="' + w + '" height="' + h + '" rx="8"/>';
      var cap = node.shape === "store" || node.shape === "cache" ? 16 : 0;
      var blockH = lines.name.length * 20 + (lines.blurb.length ? 4 + lines.blurb.length * 17 : 0);
      var start = cap + (h - cap - blockH) / 2;
      label = textRows(lines.name, w / 2, start + 10, "label", 20, "middle") +
        textRows(lines.blurb, w / 2, start + lines.name.length * 20 + 4 + 8.5, "blurb", 17, "middle");
    }
    if (node.flagged && node.kind !== "unmapped") badges += '<g class="badge drift-badge" transform="translate(' + (w - 4) + ',4)"><circle r="9"/><text y="0.5">!</text></g>';
    if (node.collapsed) badges += '<g class="badge more-badge" transform="translate(' + w / 2 + "," + h + ')"><rect x="-18" y="-9" width="36" height="18" rx="9"/><text y="0.5">+' + node.hidden + "</text></g>";
    else if (node.notes && node.notes.length && !node.header && node.kind !== "system") badges += '<g class="badge notes-badge" transform="translate(4,4)"><circle r="7"/><text y="0.5">i</text></g>';
    return '<g class="' + classes + '" data-node-id="' + esc(node.id) + '" transform="translate(' + node.x + "," + node.y + ')">' + body + label + badges + "</g>";
  }

  function roundedPath(points, radius, closed) {
    if (!points.length) return "";
    var list = points;
    var n = list.length;
    function corner(prev, at, next) {
      var inLen = Math.hypot(at.x - prev.x, at.y - prev.y);
      var outLen = Math.hypot(next.x - at.x, next.y - at.y);
      var r = Math.min(radius, inLen / 2, outLen / 2);
      if (!r) return { a: at, b: at, at: at, flat: true };
      return {
        a: { x: at.x - ((at.x - prev.x) / inLen) * r, y: at.y - ((at.y - prev.y) / inLen) * r },
        b: { x: at.x + ((next.x - at.x) / outLen) * r, y: at.y + ((next.y - at.y) / outLen) * r },
        at: at,
      };
    }
    var d;
    if (closed) {
      var first = corner(list[n - 1], list[0], list[1]);
      d = "M" + n1(first.b.x) + "," + n1(first.b.y);
      for (var i = 1; i <= n; i += 1) {
        var c = corner(list[i - 1], list[i % n], list[(i + 1) % n]);
        d += " L" + n1(c.a.x) + "," + n1(c.a.y) + (c.flat ? "" : " Q" + n1(c.at.x) + "," + n1(c.at.y) + " " + n1(c.b.x) + "," + n1(c.b.y));
      }
      return d + " Z";
    }
    d = "M" + n1(list[0].x) + "," + n1(list[0].y);
    for (var k = 1; k < n - 1; k += 1) {
      var cc = corner(list[k - 1], list[k], list[k + 1]);
      d += " L" + n1(cc.a.x) + "," + n1(cc.a.y) + (cc.flat ? "" : " Q" + n1(cc.at.x) + "," + n1(cc.at.y) + " " + n1(cc.b.x) + "," + n1(cc.b.y));
    }
    return d + " L" + n1(list[n - 1].x) + "," + n1(list[n - 1].y);
  }

  /** The line stops at the base of the arrowhead; the head is a crisp triangle. */
  function edgeGeometry(edge) {
    var points = (edge.points && edge.points.length ? edge.points : [{ x: edge.x1, y: edge.y1 }, { x: edge.x2, y: edge.y2 }])
      .filter(function (p, i, all) { return i === 0 || Math.abs(p.x - all[i - 1].x) + Math.abs(p.y - all[i - 1].y) > 0.1; });
    if (points.length < 2) points = [{ x: edge.x1, y: edge.y1 }, { x: edge.x2, y: edge.y2 }];
    var tip = points[points.length - 1];
    var prev = points[points.length - 2];
    var len = Math.hypot(tip.x - prev.x, tip.y - prev.y) || 1;
    var ux = (tip.x - prev.x) / len;
    var uy = (tip.y - prev.y) / len;
    var cut = Math.min(ARROW - 1, len - 0.5);
    var line = points.slice(0, -1).concat([{ x: tip.x - ux * cut, y: tip.y - uy * cut }]);
    var bx = tip.x - ux * ARROW;
    var by = tip.y - uy * ARROW;
    var head = "M" + n1(tip.x) + "," + n1(tip.y) + " L" + n1(bx - uy * 4.5) + "," + n1(by + ux * 4.5) + " L" + n1(bx + uy * 4.5) + "," + n1(by - ux * 4.5) + " Z";
    return { d: roundedPath(line, 8), full: roundedPath(points, 8), head: head };
  }

  function edgeAttrs(edge) {
    return ' data-edge-index="' + edge.index + '" data-from="' + esc(edge.from) + '" data-to="' + esc(edge.to) + '"';
  }

  function edgeSvg(edge, related) {
    var g = edgeGeometry(edge);
    var cls = "edge flow-" + esc(edge.kind === "control" ? "control" : edge.kind === "dependency" ? "dependency" : "data") + (related ? " is-related" : "");
    return '<g class="' + cls + '"' + edgeAttrs(edge) + '><path class="hit" d="' + g.full + '"/><path class="line" d="' + g.d + '"/><path class="head" d="' + g.head + '"/></g>';
  }

  function edgeLabelSvg(edge, related) {
    if (!edge.label) return "";
    var text = edge.text || edge.label;
    var w = edge.lw || text.length * 6.3 + 18;
    var h = edge.lh || 20;
    var cls = "edge-label flow-" + esc(edge.kind === "control" ? "control" : "data") + (edge.crowded ? " is-crowded" : "") + (related ? " is-related" : "");
    return '<g class="' + cls + '"' + edgeAttrs(edge) + ' transform="translate(' + n1(edge.cx) + "," + n1(edge.cy) + ')"><title>' + esc(edge.label) + "</title>" +
      '<rect x="' + n1(-w / 2) + '" y="' + n1(-h / 2) + '" width="' + n1(w) + '" height="' + h + '" rx="' + h / 2 + '"/><text y="0.5">' + esc(text) + "</text></g>";
  }

  function clusterSvg(group, title, selected, flow) {
    var cls = "cluster" + (group.header ? " is-header" : "") + (selected ? " is-selected" : "");
    var top = flow && title ? group.y - 26 : group.y;
    var height = flow && title ? group.h + 26 : group.h;
    var out = '<g class="' + cls + '" data-group="' + esc(group.id) + '"><rect x="' + group.x + '" y="' + top + '" width="' + group.w + '" height="' + height + '" rx="14"/>';
    if (group.header && group.divider) out += '<line class="divider" x1="' + group.divider + '" y1="' + (group.y + 14) + '" x2="' + group.divider + '" y2="' + (group.y + group.h - 14) + '"/>';
    if (flow && title) out += '<text x="' + (group.x + 16) + '" y="' + (group.y - 8) + '">' + esc(title) + "</text>";
    return out + "</g>";
  }

  function zoneSvg(zone) {
    var d = (zone.outline || []).map(function (poly) { return roundedPath(poly, 12, true); }).join(" ");
    if (!d) d = roundedPath([{ x: zone.x, y: zone.y }, { x: zone.x + zone.w, y: zone.y }, { x: zone.x + zone.w, y: zone.y + zone.h }, { x: zone.x, y: zone.y + zone.h }], 12, true);
    return '<g class="zone" data-zone="' + esc(zone.id) + '"><path class="zone-fill" d="' + d + '"/><path class="zone-line" d="' + d + '"/><path class="zone-hit" d="' + d + '"/></g>';
  }

  function zoneLabelSvg(zone) {
    var labels = zone.labels && zone.labels.length ? zone.labels : [{ x: zone.x + 10, y: zone.y + 8, w: zone.name.length * 6.9 + 18, h: 22 }];
    return labels.map(function (label) {
      return '<g class="zone-label" data-zone="' + esc(zone.id) + '" transform="translate(' + n1(label.x) + "," + n1(label.y) + ')"><rect width="' + n1(label.w) + '" height="' + label.h + '" rx="6"/>' +
        '<text x="9" y="' + label.h / 2 + '">' + esc(zone.name) + "</text></g>";
    }).join("");
  }

  var TIER_NAMES = { client: "Users and clients", edge: "Edge", frontend: "Frontend", api: "API", service: "Services", platform: "Services", external: "Services", worker: "Async", messaging: "Async", cache: "Data", database: "Data", storage: "Storage" };
  var TIER_TEXT = {
    "Users and clients": "Who starts the journey: people, apps, devices, and callers outside the system.",
    Edge: "Where traffic enters: CDN, DNS, WAF, load balancers, ingress, API gateways.",
    Frontend: "User interface served to clients.",
    API: "Public APIs and backends-for-frontends that clients call.",
    Services: "Domain logic, platform services, and third parties at the right edge.",
    Async: "Queues and streams on the left, then the workers, jobs, and schedulers that consume them.",
    Data: "Caches beside the systems of record they front: relational, key-value, document, search.",
    Storage: "Objects, files, archives, and warehouses at the bottom of the stack.",
  };

  /** Tier lanes from where the boxes are now, so they follow drags. */
  function lanesOf(scene) {
    var lanes = {};
    var placed = {};
    (scene.nodes || []).forEach(function (node) { placed[node.id] = node; });
    (scene.nodes || []).forEach(function (node) {
      if (node.kind === "system" || node.kind === "unmapped") return;
      // A module inside a drawn component rides with its component's layer.
      if (node.kind === "module" && placed[node.parentId] && placed[node.parentId].kind === "component") return;
      var name = TIER_NAMES[node.tier] || "Services";
      var lane = (lanes[name] = lanes[name] || { name: name, x: Infinity, y: Infinity, bottom: -Infinity, members: [] });
      lane.x = Math.min(lane.x, node.x);
      lane.y = Math.min(lane.y, node.y);
      lane.bottom = Math.max(lane.bottom, node.y + node.h);
      lane.members.push(node.id);
      (scene.nodes || []).forEach(function (child) {
        if (child.parentId === node.id && child.kind === "module") {
          lane.bottom = Math.max(lane.bottom, child.y + child.h);
          lane.members.push(child.id);
        }
      });
    });
    return Object.keys(lanes).map(function (key) { return lanes[key]; });
  }

  function laneSvg(lane, left) {
    var y = (lane.y + lane.bottom) / 2;
    var text = lane.name.toUpperCase();
    var w = text.length * 7.6 * 1.8 + 16;
    return '<g class="lane" data-lane="' + esc(lane.name) + '"><rect class="lane-hit" x="' + n1(left - w) + '" y="' + n1(y - 18) + '" width="' + n1(w + 12) + '" height="36" rx="6"/>' +
      '<text x="' + n1(left - 8) + '" y="' + n1(y) + '">' + esc(text) + '</text><line x1="' + n1(left) + '" y1="' + n1(y) + '" x2="' + n1(left + 10) + '" y2="' + n1(y) + '"/></g>';
  }

  /** The sheet the whole system sits on. */
  function systemBox(scene) {
    var system = scene.nodes.filter(function (node) { return node.kind === "system"; })[0];
    var rest = scene.nodes.filter(function (node) { return node.kind !== "unmapped"; });
    if (!system || rest.length < 2) return null;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    rest.concat(scene.zones || [], scene.groups || []).forEach(function (item) {
      minX = Math.min(minX, item.x); minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + item.w); maxY = Math.max(maxY, item.y + item.h);
    });
    (scene.edges || []).forEach(function (edge) {
      (edge.points || []).forEach(function (p) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
    });
    var pad = 32;
    return { id: system.id, x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }

  function systemFrameSvg(box) {
    if (!box) return "";
    var attrs = ' x="' + n1(box.x) + '" y="' + n1(box.y) + '" width="' + n1(box.w) + '" height="' + n1(box.h) + '" rx="20"';
    return '<rect class="system-sheet"' + attrs + "/>" + '<rect class="system-frame"' + attrs + "/>" +
      '<rect class="system-hit" data-system="' + esc(box.id) + '"' + attrs + "/>";
  }

  // ---- App -------------------------------------------------------------------

  var ICON_SEARCH = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg>';

  function shell() {
    return (
      '<div id="viewport">' +
      '<svg id="surface" xmlns="' + SVG_NS + '">' +
      '<g id="world"><g id="layer-frames"></g><g id="layer-edges"></g><g id="layer-labels"></g><g id="layer-nodes"></g></g></svg>' +
      "</div>" +
      '<header id="hud">' +
      '<div class="pill brand"><span class="mark" aria-hidden="true"></span><strong>Smartypants</strong><span id="level-label"></span><span id="busy" hidden>thinking…</span></div>' +
      '<label class="pill search-wrap">' + ICON_SEARCH + '<input id="search" class="search" placeholder="Find a part" autocomplete="off" aria-label="Find a part" /><kbd>/</kbd></label>' +
      '<div class="pill tools">' +
      '<span class="zoom"><button id="zoom-out" title="Zoom out (−)" aria-label="Zoom out">−</button><span id="zoom-label">100%</span><button id="zoom-in" title="Zoom in (+)" aria-label="Zoom in">+</button></span>' +
      '<span class="sep"></span><button id="fit" title="Fit (F)">Fit</button><button id="tidy" title="Forget dragged positions and lay everything out again (T)">Tidy</button><button id="expand-all" title="Expand everything">Expand</button>' +
      '<button id="toggle-layout" title="Switch between tiered layers and a left-to-right flow (L)">Layout: Tiers</button>' +
      '<span class="sep"></span><button id="show-intent" title="Intent memory (I)">Intent</button><button id="copy-mermaid" title="Copy Mermaid source">Mermaid</button>' +
      "</div></header>" +
      '<div class="legend pill"><span><i class="swatch flow-data"></i>data</span><span><i class="swatch flow-control"></i>control</span><span><i class="swatch zone"></i>boundary</span><span><i class="swatch frame"></i>subgraph</span><span><i class="swatch drift"></i>drift</span>' +
      '<span class="hint">Click to read · drag to move · scroll to zoom · <kbd>F</kbd> fit</span></div>' +
      '<aside id="panel" hidden aria-live="polite"><div class="grip" aria-hidden="true"></div><button id="panel-close" title="Close (Esc)" aria-label="Close">×</button><div id="panel-body"></div></aside>' +
      '<div id="tip" hidden></div>' +
      '<svg id="minimap" xmlns="' + SVG_NS + '"></svg>' +
      '<div id="toast" hidden></div>' +
      '<div id="empty" class="empty" hidden><div><h2>No system on the canvas yet</h2>' +
      "<p>Describe the application in your coding agent. The diagram appears here once smartypants.config.json is at the project root and the turn is about the design.</p>" +
      "<p>Try: <code>Design YouTube top-k</code>, then <code>go deeper on the aggregator</code>.</p>" +
      '<p>Already have code? <button id="catchup-button" class="primary-button">Build the diagram from code</button></p></div></div>'
    );
  }

  function start() {
    if (typeof document === "undefined" || !document.body) return;
    if (typeof location !== "undefined" && location.protocol === "file:") {
      showServeHelp();
      return;
    }
    if (typeof fetch !== "function" || typeof SmartypantsScene === "undefined") return;

    document.body.innerHTML = shell();
    var viewport = document.getElementById("viewport");
    var svg = document.getElementById("surface");
    if (!viewport || !svg || typeof viewport.addEventListener !== "function") return;
    var world = document.getElementById("world");
    var layerFrames = document.getElementById("layer-frames");
    var layerEdges = document.getElementById("layer-edges");
    var layerLabels = document.getElementById("layer-labels");
    var layerNodes = document.getElementById("layer-nodes");
    var empty = document.getElementById("empty");
    var panel = document.getElementById("panel");
    var panelBody = document.getElementById("panel-body");
    var minimap = document.getElementById("minimap");
    var busy = document.getElementById("busy");
    var levelLabel = document.getElementById("level-label");
    var zoomLabel = document.getElementById("zoom-label");
    var search = document.getElementById("search");
    var toast = document.getElementById("toast");
    var tip = document.getElementById("tip");

    var camera = { x: 0, y: 0, scale: 1 };
    var model = { nodes: [], connections: [] };
    var scene = { nodes: [], edges: [], groups: [], bounds: { x: 0, y: 0, w: 0, h: 0 } };
    var collapsed = store("smartypants:collapsed") || [];
    var layoutMode = store("smartypants:layout") || "tiers";
    var tidied = false;
    var selected = null;
    var fitted = false;
    var drag = null;
    var held = {};
    var lastPayload = "";
    var knownIds = null;
    var fresh = {};
    var intentCache = null;
    var hotKey = "";
    var tipTimer = null;
    var laneLeft = 0;

    root.__smartypants = {
      get camera() { return { x: camera.x, y: camera.y, scale: camera.scale }; },
      get scene() { return scene; },
      get selected() { return selected; },
      /** Point the camera at a world position (used by screenshot scripts). */
      look: function (x, y, scale) {
        if (scale) camera.scale = scale;
        camera.x = x;
        camera.y = y;
        applyCamera();
      },
    };

    function viewSize() {
      return { w: viewport.clientWidth, h: viewport.clientHeight };
    }

    function narrow() {
      return viewSize().w < 720;
    }

    function applyCamera() {
      var size = viewSize();
      var ox = size.w / 2 - camera.x * camera.scale;
      var oy = size.h / 2 - camera.y * camera.scale;
      world.setAttribute("transform", "translate(" + ox + "," + oy + ") scale(" + camera.scale + ")");
      var grid = 24 * camera.scale;
      while (grid < 12) grid *= 2;
      viewport.style.backgroundSize = grid + "px " + grid + "px";
      viewport.style.backgroundPosition = ox + "px " + oy + "px";
      // Layer names stay readable when zoomed out: they grow as the picture shrinks.
      viewport.style.setProperty("--lane-scale", String(laneScale(camera.scale)));
      viewport.classList.toggle("lod-far", camera.scale < LABEL_ZOOM);
      viewport.classList.toggle("lod-tiny", camera.scale < 0.42);
      zoomLabel.textContent = Math.round(camera.scale * 100) + "%";
      drawMinimap();
    }

    function laneScale(scale) {
      return Math.min(1.8, Math.max(1, 0.9 / scale));
    }

    /** Everything drawn, including the layer labels in the left gutter. */
    function worldBounds(atScale) {
      var b = scene.bounds;
      if (!b || !b.w) return b;
      var minX = b.x;
      var minY = b.y;
      var maxX = b.x + b.w;
      var maxY = b.y + b.h;
      var sheet = systemBox(scene);
      if (sheet) {
        minX = Math.min(minX, sheet.x - 16); minY = Math.min(minY, sheet.y - 16);
        maxX = Math.max(maxX, sheet.x + sheet.w + 16); maxY = Math.max(maxY, sheet.y + sheet.h + 16);
      }
      if (scene.mode === "tiers" && (scene.lanesNow || []).length) {
        var widest = 0;
        var grow = laneScale(atScale || camera.scale);
        scene.lanesNow.forEach(function (lane) { widest = Math.max(widest, lane.name.length * 7.4 * grow + 16); });
        minX = Math.min(minX, laneLeft - widest - 16);
      }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    function panelInset() {
      if (panel.hidden) return { right: 0, bottom: 0 };
      if (narrow()) return { right: 0, bottom: panel.offsetHeight || viewSize().h * 0.55 };
      return { right: (panel.offsetWidth || 400) + 16, bottom: 0 };
    }

    /**
     * Fit keeps text legible: the whole picture when it fits at a readable
     * zoom, else the readable floor from the top, centred on the width.
     */
    function fit() {
      var size = viewSize();
      var inset = panelInset();
      var mobile = narrow();
      var left = mobile ? 8 : 16;
      var right = size.w - (mobile ? 8 : 16) - inset.right;
      var top = mobile ? 108 : 68;
      var bottom = size.h - (mobile ? 12 : 52) - inset.bottom;
      var floor = mobile ? 0.5 : 0.55;
      var b = worldBounds(1);
      if (!b || !b.w || !b.h) return;
      var scale = 1;
      // Twice: the layer-label gutter depends on the zoom it is fitted at.
      for (var pass = 0; pass < 2; pass += 1) {
        var sw = (right - left) / b.w;
        var sh = (bottom - top) / b.h;
        // As much of the picture as fits while text stays readable; never
        // wider than the view unless even the width needs the floor.
        scale = Math.min(sw, Math.max(sh, floor));
        if (scale < floor) scale = floor;
        scale = Math.min(scale, 1.2);
        b = worldBounds(scale);
      }
      camera.scale = scale;
      var cx = (left + right) / 2;
      if (b.w * scale <= right - left + 1) camera.x = b.x + b.w / 2 - (cx - size.w / 2) / scale;
      else {
        // Too wide: start at the left edge (layer names in view), unless the
        // journey's first layer would then be off screen; phones start on it.
        var start = journeyStart(b);
        var seen = b.x + (right - left) / scale;
        camera.x = !mobile && start < seen - 40 / scale ? b.x - (left - size.w / 2) / scale : start - (cx - size.w / 2) / scale;
      }
      if (b.h * scale <= bottom - top + 1) camera.y = b.y + b.h / 2 - ((top + bottom) / 2 - size.h / 2) / scale;
      else camera.y = b.y - (top - size.h / 2) / scale;
      applyCamera();
    }

    /** Where the journey starts: the middle of the top layer. */
    function journeyStart(b) {
      var lanes = (scene.lanesNow || []).slice().sort(function (p, q) { return p.y - q.y; });
      if (!lanes.length) return b.x + b.w / 2;
      var lo = Infinity;
      var hi = -Infinity;
      lanes[0].members.forEach(function (id) {
        var node = nodeById(id);
        if (!node) return;
        lo = Math.min(lo, node.x);
        hi = Math.max(hi, node.x + node.w);
      });
      return lo < hi ? (lo + hi) / 2 : b.x + b.w / 2;
    }

    function zoomAt(factor, sx, sy) {
      var size = viewSize();
      if (sx == null) { sx = size.w / 2; sy = size.h / 2; }
      var wx = (sx - size.w / 2) / camera.scale + camera.x;
      var wy = (sy - size.h / 2) / camera.scale + camera.y;
      camera.scale = Math.max(0.1, Math.min(4, camera.scale * factor));
      camera.x = wx - (sx - size.w / 2) / camera.scale;
      camera.y = wy - (sy - size.h / 2) / camera.scale;
      applyCamera();
    }

    function centerOn(node) {
      var size = viewSize();
      var inset = panelInset();
      var sx = (size.w - inset.right) / 2;
      var sy = 64 + (size.h - 64 - inset.bottom) / 2;
      camera.x = node.x + node.w / 2 - (sx - size.w / 2) / camera.scale;
      camera.y = node.y + node.h / 2 - (sy - size.h / 2) / camera.scale;
      applyCamera();
    }

    /** Pan just enough that a box is not hidden under the panel or the HUD. */
    function reveal(node) {
      if (!node) return;
      var size = viewSize();
      var inset = panelInset();
      var s = camera.scale;
      var x0 = (node.x - camera.x) * s + size.w / 2;
      var y0 = (node.y - camera.y) * s + size.h / 2;
      var x1 = x0 + node.w * s;
      var y1 = y0 + node.h * s;
      var free = { x0: 8, y0: 72, x1: size.w - inset.right - 8, y1: size.h - inset.bottom - 8 };
      if (x0 >= free.x0 && x1 <= free.x1 && y0 >= free.y0 && y1 <= free.y1) return;
      centerOn(node);
    }

    function nodeById(id) {
      return (scene.nodes || []).filter(function (node) { return node.id === id; })[0] || null;
    }

    function sourceById(id) {
      return (model.nodes || []).filter(function (node) { return node.id === id; })[0] || null;
    }

    function titleFor(group) {
      var owner = sourceById(group.id);
      return owner ? owner.name : "";
    }

    function paint() {
      var related = {};
      if (selected) {
        (scene.edges || []).forEach(function (edge, i) {
          if (edge.from === selected || edge.to === selected) related[i] = true;
        });
      }
      var lanes = scene.mode === "tiers" ? lanesOf(scene) : [];
      var left = Infinity;
      (scene.nodes || []).forEach(function (node) { if (node.kind !== "system" && node.kind !== "unmapped") left = Math.min(left, node.x); });
      (scene.zones || []).forEach(function (zone) { left = Math.min(left, zone.x); });
      (scene.groups || []).forEach(function (group) { left = Math.min(left, group.x); });
      var sheet = systemBox(scene);
      if (sheet) left = Math.min(left, sheet.x);
      laneLeft = left - 20;
      scene.lanesNow = lanes;
      var flow = scene.mode !== "tiers";
      layerFrames.innerHTML = systemFrameSvg(sheet) + (scene.zones || []).map(zoneSvg).join("") +
        (scene.groups || []).map(function (group) { return clusterSvg(group, titleFor(group), group.id === selected, flow); }).join("") +
        lanes.map(function (lane) { return laneSvg(lane, laneLeft); }).join("");
      var edges = scene.edges || [];
      edges.forEach(function (edge, i) { edge.index = i; });
      layerEdges.innerHTML = edges.map(function (edge, i) { return edgeSvg(edge, related[i]); }).join("");
      layerLabels.innerHTML = (scene.zones || []).map(zoneLabelSvg).join("") +
        edges.map(function (edge, i) { return edgeLabelSvg(edge, related[i]); }).join("");
      layerNodes.innerHTML = (scene.nodes || []).map(function (node) {
        return nodeSvg(node, { selected: node.id === selected, fresh: fresh[node.id] });
      }).join("");
      viewport.classList.toggle("has-selection", Boolean(selected) && Object.keys(related).length > 0);
      if (selected) {
        edges.forEach(function (edge, i) {
          if (!related[i]) return;
          var other = edge.from === selected ? edge.to : edge.from;
          var el = layerNodes.querySelector('[data-node-id="' + cssEscape(other) + '"]');
          if (el) el.classList.add("is-near");
        });
      }
      hotKey = "";
      viewport.classList.remove("has-hot");
      applyCamera();
    }

    function cssEscape(value) {
      if (root.CSS && typeof root.CSS.escape === "function") return root.CSS.escape(value);
      return String(value).replace(/["\\]/g, "\\$&");
    }

    // ---- Focus and tooltip ---------------------------------------------------

    function clearHot() {
      Array.prototype.forEach.call(world.querySelectorAll(".is-hot, .is-lit"), function (el) {
        el.classList.remove("is-hot");
        el.classList.remove("is-lit");
      });
      viewport.classList.remove("has-hot");
    }

    function lightEdges(selector) {
      Array.prototype.forEach.call(world.querySelectorAll(selector), function (el) {
        el.classList.add("is-hot");
        var from = el.getAttribute("data-from");
        var to = el.getAttribute("data-to");
        [from, to].forEach(function (id) {
          var node = layerNodes.querySelector('[data-node-id="' + cssEscape(id) + '"]');
          if (node) node.classList.add("is-lit");
        });
      });
    }

    function setHot(hit, event) {
      var key = hit && (hit.kind === "node" || hit.kind === "edge") ? hit.kind + ":" + hit.id : "";
      if (key === hotKey) {
        if (key && !tip.hidden && event) moveTip(event);
        return;
      }
      hotKey = key;
      clearHot();
      hideTip();
      if (!key) return;
      if (hit.kind === "node") {
        var id = cssEscape(hit.id);
        lightEdges('[data-from="' + id + '"], [data-to="' + id + '"]');
        var self = layerNodes.querySelector('[data-node-id="' + id + '"]');
        if (self) self.classList.add("is-lit");
        viewport.classList.add("has-hot");
        var node = nodeById(hit.id);
        if (node && node.kind !== "system" && event && event.pointerType !== "touch") {
          var at = { x: event.clientX, y: event.clientY };
          tipTimer = setTimeout(function () { showTip(node, at); }, 280);
        }
      } else {
        lightEdges('[data-edge-index="' + hit.id + '"]');
        viewport.classList.add("has-hot");
      }
    }

    function showTip(node, at) {
      var source = sourceById(node.id) || node;
      var why = source.why || "";
      tip.innerHTML = '<p class="tip-name">' + esc(source.name) + "</p>" +
        (node.blurb ? '<p class="tip-blurb">' + esc(node.blurb) + "</p>" : "") +
        (why ? '<p class="tip-why"><span>Why</span>' + esc(why) + "</p>" : "") +
        '<p class="tip-hint">Click for details</p>';
      tip.hidden = false;
      moveTip({ clientX: at.x, clientY: at.y });
    }

    function moveTip(event) {
      var size = viewSize();
      var w = tip.offsetWidth || 280;
      var h = tip.offsetHeight || 100;
      var x = event.clientX + 16;
      var y = event.clientY + 18;
      if (x + w > size.w - 8) x = event.clientX - w - 12;
      if (y + h > size.h - 8) y = event.clientY - h - 12;
      tip.style.transform = "translate(" + Math.max(8, x) + "px," + Math.max(8, y) + "px)";
    }

    function hideTip() {
      clearTimeout(tipTimer);
      tip.hidden = true;
    }

    // ---- Data -------------------------------------------------------------------

    function rebuild() {
      var visible = SmartypantsScene.collapse(model, collapsed);
      (visible.nodes || []).forEach(function (node) {
        if (!held[node.id]) return;
        node.x = held[node.id].x;
        node.y = held[node.id].y;
      });
      if (layoutMode === "flow") visible.direction = "LR";
      if (tidied && root.SMARTYPANTS_STATIC) {
        visible.nodes = visible.nodes.map(function (node) { var copy = Object.assign({}, node); delete copy.x; delete copy.y; return copy; });
      }
      scene = SmartypantsScene.buildScene(visible);
      empty.hidden = scene.nodes.length > 0;
      paint();
    }

    function flash(text) {
      toast.textContent = text;
      toast.hidden = false;
      clearTimeout(flash.timer);
      flash.timer = setTimeout(function () { toast.hidden = true; }, 2200);
    }

    function render(next) {
      var ids = {};
      (next.nodes || []).forEach(function (node) { ids[node.id] = true; });
      fresh = {};
      if (knownIds) Object.keys(ids).forEach(function (id) { if (!knownIds[id]) fresh[id] = true; });
      knownIds = ids;
      model = next;
      levelLabel.textContent = next.level ? "level " + next.level : next.floor ? String(next.floor) : "";
      busy.hidden = !next.busy;
      var status = next.catchup;
      busy.textContent = status && status.state === "running" ? (status.message || "catching up from code…") : "thinking…";
      if (status && status.state === "failed" && !render.warned) {
        render.warned = true;
        flash(status.message || "Catch-up failed");
      }
      rebuild();
      if (!fitted && scene.nodes.length) {
        fit();
        fitted = true;
      }
      if (selected) openPanel(selected, true);
      if (Object.keys(fresh).length) setTimeout(function () { fresh = {}; paint(); }, 1600);
    }

    function load() {
      return api("/design.json", { cache: "no-store" })
        .then(function (response) {
          if (!response.ok) throw new Error("design unavailable");
          return response.text();
        })
        .then(function (text) {
          if (drag || text === lastPayload) return;
          lastPayload = text;
          intentCache = null;
          render(JSON.parse(text));
        })
        .catch(function () {
          empty.hidden = false;
        });
    }

    function intent() {
      if (intentCache) return Promise.resolve(intentCache);
      return api("/intent.json", { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (data) { intentCache = data; return data; })
        .catch(function () { return { atoms: [], text: "", tokens: 0 }; });
    }

    // ---- Panel ---------------------------------------------------------------------

    function nameOf(id) {
      var node = sourceById(id) || nodeById(id);
      return node ? node.name : id;
    }

    function tierOf(node) {
      var placed = nodeById(node.id);
      return (placed && placed.tier) || (typeof SmartypantsScene.inferTier === "function" ? SmartypantsScene.inferTier(node) : node.tier) || "";
    }

    function tierChip(tier) {
      if (!tier) return "";
      return '<span class="chip tier-chip tier-' + esc(tier) + '"><i></i>' + esc(TIER_NAMES[tier] === "Services" && tier !== "service" ? tier : TIER_NAMES[tier] || tier) + "</span>";
    }

    function section(title, body, extra) {
      return '<section class="p-sec' + (extra ? " " + extra : "") + '"><h3>' + title + "</h3>" + body + "</section>";
    }

    function linkRow(id, text, sub, tag) {
      return '<li><button class="row-link" data-goto="' + esc(id) + '"><span class="row-name">' + esc(text) + "</span>" +
        (sub ? '<span class="row-sub">' + esc(sub) + "</span>" : "") + "</button>" + (tag || "") + "</li>";
    }

    /** Calls this part makes (with the reply that comes back) and calls it receives. */
    function flowsOf(id) {
      var all = model.connections || [];
      var replyOf = {};
      var isReply = {};
      all.forEach(function (c, i) {
        if (isReply[i]) return;
        for (var j = i + 1; j < all.length; j += 1) {
          if (!isReply[j] && replyOf[j] == null && all[j].fromId === c.toId && all[j].toId === c.fromId) {
            replyOf[i] = j;
            isReply[j] = true;
            break;
          }
        }
      });
      var calls = [];
      var callers = [];
      all.forEach(function (c, i) {
        if (isReply[i]) return;
        var reply = replyOf[i] != null ? all[replyOf[i]] : null;
        if (c.fromId === id) calls.push({ c: c, other: c.toId, reply: reply });
        else if (c.toId === id) callers.push({ c: c, other: c.fromId, reply: reply });
      });
      return { calls: calls, callers: callers };
    }

    function flowList(items) {
      return '<ul class="rows flows">' + items.map(function (item) {
        var c = item.c;
        var tag = c.kind === "control" ? '<span class="tag control">control</span>' : "";
        var sub = (c.label || "") + (item.reply ? "  ↩ " + (item.reply.label || "reply") : "");
        return linkRow(item.other, nameOf(item.other), sub, tag);
      }).join("") + "</ul>";
    }

    function openPanel(id, quiet) {
      var node = sourceById(id) || nodeById(id);
      if (!node) {
        closePanel();
        return;
      }
      hideTip();
      selected = id;
      var parent = node.parentId ? sourceById(node.parentId) : null;
      var children = (model.nodes || []).filter(function (item) { return item.parentId === node.id; });
      var isCollapsed = collapsed.indexOf(node.id) !== -1;
      var placed = nodeById(id);
      var blurb = (placed && placed.blurb) || node.blurb || "";
      var tier = node.kind === "system" || node.kind === "unmapped" ? "" : tierOf(node);
      var flags = node.flags || [];
      var html =
        '<header class="p-head">' +
        '<p class="eyebrow">' + esc(KIND_LABEL[node.kind] || node.kind) + (node.shape && node.kind !== "system" && node.kind !== "unmapped" ? " · " + esc(node.shape) : "") +
        (parent ? ' · in <button class="link" data-goto="' + esc(parent.id) + '">' + esc(parent.name) + "</button>" : "") + "</p>" +
        "<h2>" + esc(node.name) + "</h2>" +
        (blurb ? '<p class="lede">' + esc(blurb) + "</p>" : "") +
        '<p class="chips">' + tierChip(tier) + (node.zone ? '<span class="chip zone-chip">' + esc(node.zone) + "</span>" : "") +
        (flags.length ? '<span class="chip drift-chip">' + flags.length + " drift</span>" : "") + "</p></header>";
      var unmapped = node.kind === "unmapped";
      if (unmapped) html += '<p class="muted small">The code diverges from the intent, and the divergence does not map to a part on the diagram yet.</p>';
      if (node.why && !unmapped) html += section("Why it exists", '<p class="why-text">' + esc(node.why) + "</p>", "why");
      if (node.what && !unmapped) html += section("What it does", "<p>" + esc(node.what) + "</p>");
      if (node.notes && node.notes.length) {
        html += section("Deep dive", '<ul class="notes">' + node.notes.map(function (note) { return "<li>" + esc(note) + "</li>"; }).join("") + "</ul>");
      }
      if (children.length) {
        html += section("Inside <span class=\"count\">" + children.length + "</span>", '<ul class="rows">' + children.map(function (child) {
          return linkRow(child.id, child.name, child.blurb || child.what || "");
        }).join("") + "</ul>");
      }
      var flows = flowsOf(node.id);
      if (flows.calls.length) html += section("Calls <span class=\"count\">" + flows.calls.length + "</span>", flowList(flows.calls));
      if (flows.callers.length) html += section("Called by <span class=\"count\">" + flows.callers.length + "</span>", flowList(flows.callers));
      if (flags.length) {
        html += section("Drift", flags.map(function (flag) {
          return '<div class="flag"><p><span class="flag-k">Intent</span>' + esc(flag.intent) + '</p><p><span class="flag-k">Code</span>' + esc(flag.difference) + "</p></div>";
        }).join(""), "drift");
      }
      html += '<div id="panel-intent"></div>';
      html += '<div class="actions">' +
        (node.kind !== "unmapped" ? '<button id="go-deeper" class="primary" title="Ask for the next level of detail (D)">Go deeper</button>' : "") +
        (children.length ? '<button id="toggle-collapse">' + (isCollapsed ? "Expand" : "Collapse") + "</button>" : "") +
        '<button id="center-node">Center</button></div>';
      var scroll = quiet ? panel.scrollTop : 0;
      panelBody.innerHTML = html;
      var wasHidden = panel.hidden;
      panel.hidden = false;
      panel.scrollTop = scroll;
      if (!quiet) {
        paint();
        if (wasHidden || narrow()) reveal(nodeById(id));
      }
      intent().then(function (data) {
        var mine = (data.atoms || []).filter(function (atom) {
          var head = String(atom.s).split(".")[0];
          return head === node.id || head.split(">").indexOf(node.id) !== -1;
        });
        var target = document.getElementById("panel-intent");
        if (!target || !mine.length) return;
        target.innerHTML = section("Intent <span class=\"count\">" + mine.length + "</span>", '<pre class="intent">' + mine.map(function (a) { return esc(a.k + " " + a.s + " " + a.v); }).join("\n") + "</pre>");
      });
    }

    function showPanel(html) {
      hideTip();
      panelBody.innerHTML = html;
      panel.hidden = false;
      panel.scrollTop = 0;
      paint();
    }

    function closePanel() {
      selected = null;
      panel.hidden = true;
      paint();
    }

    function goDeeper(id) {
      var node = sourceById(id);
      busy.hidden = false;
      flash("Going deeper on " + (node ? node.name : id) + "…");
      collapsed = collapsed.filter(function (item) { return item !== id; });
      store("smartypants:collapsed", collapsed);
      api("/deeper", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: id }) }).catch(function () {
        flash("Could not reach the server");
      });
    }

    function toggleCollapse(id) {
      if (collapsed.indexOf(id) === -1) collapsed.push(id);
      else collapsed = collapsed.filter(function (item) { return item !== id; });
      store("smartypants:collapsed", collapsed);
      rebuild();
      if (selected) openPanel(selected, true);
    }

    function showIntent() {
      Promise.all([intent(), api("/stats.json").then(function (r) { return r.json(); }).catch(function () { return null; })]).then(function (all) {
        var data = all[0];
        var stats = all[1];
        selected = null;
        var html = '<header class="p-head"><p class="eyebrow">Memory</p><h2>Intent</h2><p class="lede">' + (data.atoms || []).length + " atoms · ~" + (data.tokens || 0) + " tokens</p></header>" +
          section("Key", '<p class="muted"><code>K subject value</code> — G goal, F function, N constraint, D decision, X excluded, E flow, Q question, ! drift.</p>') +
          section("Atoms", '<pre class="intent">' + esc(data.text || "(nothing recorded yet)") + "</pre>");
        if (stats && stats.turns) {
          html += section("Efficiency", "<p>" + stats.turns + " turns · " + (stats.actions.skip || 0) + " skipped free · " + (stats.actions.remember || 0) +
            " remembered without a builder · " + stats.calls.builder + " builder calls · $" + Number(stats.cost || 0).toFixed(4) + "</p>");
        }
        showPanel(html);
      });
    }

    function copyMermaid() {
      api("/design.mmd", { cache: "no-store" })
        .then(function (r) { return r.text(); })
        .then(function (text) {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).then(function () { flash("Mermaid copied"); });
          }
          var blob = new Blob([text], { type: "text/plain" });
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "design.mmd";
          a.click();
          flash("Mermaid downloaded");
        })
        .catch(function () { flash("Could not export Mermaid"); });
    }

    function drawMinimap() {
      var b = worldBounds();
      if (!b || !b.w || !b.h) {
        minimap.innerHTML = "";
        return;
      }
      var size = viewSize();
      var mw = 176;
      var mh = 112;
      var s = Math.min((mw - 12) / b.w, (mh - 12) / b.h);
      var ox = (mw - b.w * s) / 2 - b.x * s;
      var oy = (mh - b.h * s) / 2 - b.y * s;
      var view = {
        x: camera.x - size.w / 2 / camera.scale,
        y: camera.y - size.h / 2 / camera.scale,
        w: size.w / camera.scale,
        h: size.h / camera.scale,
      };
      minimap.innerHTML = (scene.zones || []).map(function (zone) {
        return '<rect class="mm-zone" x="' + n1(zone.x * s + ox) + '" y="' + n1(zone.y * s + oy) + '" width="' + n1(zone.w * s) + '" height="' + n1(zone.h * s) + '" rx="2"/>';
      }).join("") + (scene.nodes || []).filter(function (node) { return !node.header && node.kind !== "system"; }).map(function (node) {
        return '<rect class="' + (node.flagged ? "mm-drift" : "mm-node") + '" x="' + n1(node.x * s + ox) + '" y="' + n1(node.y * s + oy) + '" width="' + n1(Math.max(2, node.w * s)) + '" height="' + n1(Math.max(2, node.h * s)) + '" rx="1"/>';
      }).join("") + '<rect class="mm-view" x="' + n1(view.x * s + ox) + '" y="' + n1(view.y * s + oy) + '" width="' + n1(view.w * s) + '" height="' + n1(view.h * s) + '" rx="3"/>';
      minimap.__map = { s: s, ox: ox, oy: oy };
    }

    function toWorld(event) {
      var size = viewSize();
      var rect = viewport.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left - size.w / 2) / camera.scale + camera.x,
        y: (event.clientY - rect.top - size.h / 2) / camera.scale + camera.y,
      };
    }

    function everything() {
      return (scene.nodes || []).filter(function (n) { return n.kind !== "unmapped"; }).map(function (n) { return n.id; });
    }

    /** What the pointer is on: a box, a subgraph, a zone, a tier lane, an arrow, the system frame, or empty canvas. */
    function targetOf(event) {
      var el = event.target;
      while (el && el !== viewport) {
        if (el.getAttribute) {
          var id = el.getAttribute("data-node-id");
          if (id) {
            var node = nodeById(id);
            // A subgraph title moves its subgraph; the system title moves the picture.
            if (node && node.header) return { kind: "node", id: id, members: groupMembers(id) };
            if (node && node.kind === "system") return { kind: "node", id: id, members: everything() };
            return { kind: "node", id: id, members: [id] };
          }
          var group = el.getAttribute("data-group");
          if (group) return { kind: "group", id: group, members: groupMembers(group) };
          var zone = el.getAttribute("data-zone");
          if (zone) {
            var found = (scene.zones || []).filter(function (z) { return z.id === zone; })[0];
            return { kind: "zone", id: zone, members: found ? found.members.slice() : [] };
          }
          var lane = el.getAttribute("data-lane");
          if (lane) {
            var row = (scene.lanesNow || []).filter(function (l) { return l.name === lane; })[0];
            return { kind: "lane", id: lane, members: row ? row.members.slice() : [] };
          }
          var edge = el.getAttribute("data-edge-index");
          if (edge != null) return { kind: "edge", id: Number(edge), members: [] };
          var system = el.getAttribute("data-system");
          if (system) return { kind: "system-frame", id: system, members: everything() };
        }
        el = el.parentNode;
      }
      return null;
    }

    function groupMembers(id) {
      return (scene.nodes || []).filter(function (node) { return node.id === id || node.parentId === id; }).map(function (node) { return node.id; });
    }

    viewport.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      hideTip();
      var hit = targetOf(event);
      var start = {};
      (hit ? hit.members : []).forEach(function (id) {
        var node = nodeById(id);
        if (node) start[id] = { x: node.x, y: node.y };
      });
      var point = toWorld(event);
      drag = hit
        ? { kind: "target", target: hit, id: event.pointerId, start: start, px: point.x, py: point.y, sx: event.clientX, sy: event.clientY, moved: false }
        : { kind: "pan", id: event.pointerId, x: event.clientX, y: event.clientY, camX: camera.x, camY: camera.y, moved: false };
      viewport.classList.add(hit && hit.members.length ? "is-moving" : "is-panning");
      viewport.setPointerCapture(event.pointerId);
    });

    viewport.addEventListener("pointermove", function (event) {
      if (!drag || drag.id !== event.pointerId) {
        var over = drag ? null : targetOf(event);
        viewport.classList.toggle("is-over", Boolean(over));
        if (!drag) setHot(over, event);
        return;
      }
      if (drag.kind === "target") {
        if (!drag.moved && Math.hypot(event.clientX - drag.sx, event.clientY - drag.sy) < 4) return;
        var ids = Object.keys(drag.start);
        if (!ids.length) return;
        if (!drag.moved) { hotKey = ""; clearHot(); }
        drag.moved = true;
        var point = toWorld(event);
        var dx = point.x - drag.px;
        var dy = point.y - drag.py;
        ids.forEach(function (id, i) {
          var to = { x: drag.start[id].x + dx, y: drag.start[id].y + dy };
          SmartypantsScene.moveNode(scene, id, to.x, to.y, i < ids.length - 1);
          held[id] = to;
        });
        paint();
        return;
      }
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 3) drag.moved = true;
      camera.x = drag.camX - (event.clientX - drag.x) / camera.scale;
      camera.y = drag.camY - (event.clientY - drag.y) / camera.scale;
      applyCamera();
    });

    viewport.addEventListener("pointerleave", function () {
      if (!drag) setHot(null);
    });

    function endDrag(event) {
      if (!drag || (event && drag.id !== event.pointerId)) return;
      var finished = drag;
      drag = null;
      viewport.classList.remove("is-panning");
      viewport.classList.remove("is-moving");
      if (finished.kind === "pan") {
        if (!finished.moved && !panel.hidden) closePanel();
        return;
      }
      var hit = finished.target;
      if (!finished.moved) {
        if (hit.kind === "node") openPanel(hit.id);
        else if (hit.kind === "group") openPanel(hit.id);
        else if (hit.kind === "system-frame") openPanel(hit.id);
        else if (hit.kind === "edge") openEdge(hit.id);
        else if (hit.kind === "zone") openZone(hit.id);
        else if (hit.kind === "lane") openLane(hit.id);
        return;
      }
      var moves = Object.keys(finished.start).map(function (id) {
        var node = nodeById(id);
        return node ? { id: id, x: node.x, y: node.y } : null;
      }).filter(Boolean);
      if (!moves.length) return;
      api("/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(moves.length === 1 ? moves[0] : { moves: moves }),
      }).catch(function () {});
    }

    function openEdge(index) {
      var edge = (scene.edges || [])[index];
      if (!edge) return;
      selected = null;
      var from = sourceById(edge.from) || nodeById(edge.from);
      var to = sourceById(edge.to) || nodeById(edge.to);
      var reply = (model.connections || []).filter(function (c) { return c.fromId === edge.to && c.toId === edge.from; })[0];
      var crossing = from && to && from.zone && to.zone && from.zone !== to.zone;
      var kind = edge.kind === "control" ? "control" : edge.kind === "dependency" ? "dependency" : "data";
      var html = '<header class="p-head"><p class="eyebrow">Flow · ' + esc(kind) + "</p>" +
        "<h2>" + esc(edge.label || "(unlabeled)") + "</h2>" +
        '<div class="route"><button class="route-end" data-goto="' + esc(edge.from) + '">' + esc(from ? from.name : edge.from) + '</button><span class="route-arrow ' + esc(kind) + '">→</span>' +
        '<button class="route-end" data-goto="' + esc(edge.to) + '">' + esc(to ? to.name : edge.to) + "</button></div></header>";
      if (crossing) html += section("Crosses a boundary", "<p>From <strong>" + esc(from.zone) + "</strong> into <strong>" + esc(to.zone) + "</strong>.</p>", "why");
      if (reply) html += section("Reply", '<ul class="rows">' + linkRow(edge.from, reply.label || "reply", "comes back to " + (from ? from.name : edge.from)) + "</ul>");
      if (from) html += section("From", '<ul class="rows">' + linkRow(edge.from, from.name, from.what) + "</ul>");
      if (to) html += section("To", '<ul class="rows">' + linkRow(edge.to, to.name, to.what) + "</ul>");
      showPanel(html);
    }

    function memberList(ids) {
      return '<ul class="rows">' + ids.map(function (id) {
        var node = sourceById(id) || nodeById(id);
        return node ? linkRow(id, node.name, node.blurb || node.what || "") : "";
      }).join("") + "</ul>";
    }

    function openZone(id) {
      var zone = (scene.zones || []).filter(function (z) { return z.id === id; })[0];
      if (!zone) return;
      selected = null;
      showPanel('<header class="p-head"><p class="eyebrow">Boundary</p><h2>' + esc(zone.name) + "</h2>" +
        '<p class="lede">A network or trust boundary. Arrows that leave it cross a firewall, a namespace, or a subnet.</p></header>' +
        section("Inside <span class=\"count\">" + zone.members.length + "</span>", memberList(zone.members)) +
        '<p class="muted small">Drag the frame to move everything inside.</p>');
    }

    function openLane(name) {
      var lane = (scene.lanesNow || []).filter(function (l) { return l.name === name; })[0];
      if (!lane) return;
      selected = null;
      showPanel('<header class="p-head"><p class="eyebrow">Layer</p><h2>' + esc(name) + '</h2><p class="lede">' + esc(TIER_TEXT[name] || "") + "</p></header>" +
        section("In this layer <span class=\"count\">" + lane.members.length + "</span>", memberList(lane.members)) +
        '<p class="muted small">Layers run top to bottom: users, edge, frontend, API, services, async, data, storage. Drag the label to move the whole layer.</p>');
    }
    viewport.addEventListener("pointerup", endDrag);
    viewport.addEventListener("pointercancel", endDrag);
    viewport.addEventListener("dblclick", function (event) {
      var hit = targetOf(event);
      var id = hit && (hit.kind === "node" || hit.kind === "group") ? hit.id : null;
      if (id && id.indexOf("unmapped-") !== 0) goDeeper(id);
      else if (!id) fit();
    });

    viewport.addEventListener("wheel", function (event) {
      event.preventDefault();
      hideTip();
      var rect = viewport.getBoundingClientRect();
      var pan = !event.ctrlKey && Math.abs(event.deltaX) > Math.abs(event.deltaY) * 0.5 && Math.abs(event.deltaX) > 0;
      if (pan) {
        camera.x += event.deltaX / camera.scale;
        camera.y += event.deltaY / camera.scale;
        applyCamera();
        return;
      }
      var factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0022));
      zoomAt(factor, event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false });

    minimap.addEventListener("pointerdown", function (event) {
      var map = minimap.__map;
      if (!map) return;
      var rect = minimap.getBoundingClientRect();
      camera.x = (event.clientX - rect.left - map.ox) / map.s;
      camera.y = (event.clientY - rect.top - map.oy) / map.s;
      applyCamera();
    });

    panel.addEventListener("click", function (event) {
      var target = event.target && event.target.closest ? event.target.closest("button") || event.target : event.target;
      if (!target) return;
      if (target.id === "panel-close") return closePanel();
      if (target.id === "go-deeper" && selected) return goDeeper(selected);
      if (target.id === "toggle-collapse" && selected) return toggleCollapse(selected);
      if (target.id === "center-node" && selected) {
        var node = nodeById(selected);
        if (node) centerOn(node);
        return;
      }
      var go = target.getAttribute && target.getAttribute("data-goto");
      if (go) {
        if (!nodeById(go)) {
          var src = sourceById(go);
          collapsed = collapsed.filter(function (id) { return !src || id !== src.parentId; });
          rebuild();
        }
        openPanel(go);
        var found = nodeById(go);
        if (found) centerOn(found);
      }
    });

    document.getElementById("zoom-in").addEventListener("click", function () { zoomAt(1.2); });
    document.getElementById("zoom-out").addEventListener("click", function () { zoomAt(1 / 1.2); });
    document.getElementById("fit").addEventListener("click", fit);
    function tidy() {
      held = {};
      tidied = true;
      api("/positions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reset: true }) })
        .then(function () { lastPayload = ""; return load(); })
        .then(function () { fit(); flash("Laid out again"); })
        .catch(function () {});
    }
    document.getElementById("tidy").addEventListener("click", tidy);
    document.getElementById("expand-all").addEventListener("click", function () {
      collapsed = [];
      store("smartypants:collapsed", collapsed);
      rebuild();
    });
    document.getElementById("show-intent").addEventListener("click", showIntent);
    var catchupButton = document.getElementById("catchup-button");
    if (catchupButton) {
      catchupButton.addEventListener("click", function () {
        busy.hidden = false;
        busy.textContent = "catching up from code…";
        flash("Reading the code in the background. The diagram appears when it is drawn.");
        api("/catchup", { method: "POST" }).catch(function () { flash("Could not reach the server"); });
      });
    }
    var layoutButton = document.getElementById("toggle-layout");
    function setLayout(mode) {
      layoutMode = mode;
      store("smartypants:layout", mode);
      layoutButton.textContent = mode === "flow" ? "Layout: Flow" : "Layout: Tiers";
      held = {};
      rebuild();
      fit();
    }
    layoutButton.textContent = layoutMode === "flow" ? "Layout: Flow" : "Layout: Tiers";
    layoutButton.addEventListener("click", function () { setLayout(layoutMode === "flow" ? "tiers" : "flow"); });
    document.getElementById("copy-mermaid").addEventListener("click", copyMermaid);

    search.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        search.value = "";
        search.blur();
        return;
      }
      if (event.key !== "Enter") return;
      var want = search.value.trim().toLowerCase();
      if (!want) return;
      var match = (model.nodes || []).filter(function (node) {
        return String(node.name).toLowerCase().indexOf(want) !== -1 || String(node.what).toLowerCase().indexOf(want) !== -1;
      })[0];
      if (!match) return flash("No part matches " + search.value);
      if (!nodeById(match.id)) {
        collapsed = [];
        rebuild();
      }
      openPanel(match.id);
      var found = nodeById(match.id);
      if (found) centerOn(found);
    });

    document.addEventListener("keydown", function (event) {
      if (event.target === search) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "/") { event.preventDefault(); search.focus(); return; }
      if (event.key === "Escape") return closePanel();
      if (event.key === "f" || event.key === "F") return fit();
      if (event.key === "t" || event.key === "T") return tidy();
      if (event.key === "+" || event.key === "=") return zoomAt(1.2);
      if (event.key === "-" || event.key === "_") return zoomAt(1 / 1.2);
      if (event.key === "0") { camera.scale = 1; return applyCamera(); }
      if (event.key === "i" || event.key === "I") return showIntent();
      if (event.key === "l" || event.key === "L") return setLayout(layoutMode === "flow" ? "tiers" : "flow");
      if (event.key === "d" && selected) return goDeeper(selected);
      var step = 60 / camera.scale;
      if (event.key === "ArrowLeft") { camera.x -= step; applyCamera(); }
      if (event.key === "ArrowRight") { camera.x += step; applyCamera(); }
      if (event.key === "ArrowUp") { camera.y -= step; applyCamera(); }
      if (event.key === "ArrowDown") { camera.y += step; applyCamera(); }
    });

    window.addEventListener("resize", applyCamera);
    load();
    setInterval(load, 1500);
  }

  root.SmartypantsApp = { start: start, showServeHelp: showServeHelp };

  if (typeof document === "undefined" || !document.body) return;
  if (typeof location !== "undefined" && location.protocol === "file:") {
    showServeHelp();
    return;
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
