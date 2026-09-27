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

  // ---- Mermaid shapes -------------------------------------------------------

  function wrap(text, per) {
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
    return lines.length ? lines : [""];
  }

  function wrapMax(text, per, max) {
    var lines = wrap(text, per).filter(Boolean);
    if (lines.length > max) {
      lines = lines.slice(0, max);
      lines[max - 1] = lines[max - 1].replace(/\s*\S*$/, "") + "…";
    }
    return lines;
  }

  function shapePath(shape, w, h) {
    var r;
    switch (shape) {
      case "store":
      case "cache":
        r = 9;
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

  function nodeSvg(node, selected, fresh) {
    var classes = "node shape-" + esc(node.shape) + " kind-" + esc(node.kind) +
      (node.flagged ? " is-drift" : "") + (selected ? " is-selected" : "") + (fresh ? " is-fresh" : "");
    var w = node.w;
    var h = node.h;
    var body;
    var path = shapePath(node.shape, w, h);
    if (node.kind === "system") body = '<rect class="box" width="' + w + '" height="' + h + '" rx="' + h / 2 + '"/>';
    else if (node.kind === "unmapped") body = '<rect class="box" width="' + w + '" height="' + h + '" rx="4"/>';
    else if (path) body = '<path class="box" d="' + path + '"/>';
    else if (node.shape === "client") body = '<rect class="box" width="' + w + '" height="' + h + '" rx="' + h / 2 + '"/>';
    else if (node.shape === "worker") {
      body = '<rect class="box" width="' + w + '" height="' + h + '"/>' +
        '<line class="rule" x1="8" y1="0" x2="8" y2="' + h + '"/><line class="rule" x1="' + (w - 8) + '" y1="0" x2="' + (w - 8) + '" y2="' + h + '"/>';
    } else body = '<rect class="box" width="' + w + '" height="' + h + '" rx="' + (node.kind === "component" ? 6 : 4) + '"/>';

    var cap = node.shape === "store" || node.shape === "cache" ? 9 : 0;
    var nameLines = node.kind === "unmapped" ? ["Unmapped drift"] : wrapMax(node.name, node.kind === "system" ? 48 : 24, 3);
    var blurbLines = node.kind === "system" || node.kind === "unmapped" ? [] : wrapMax(node.blurb, 30, 2);
    var nameH = node.kind === "system" ? 22 : 19;
    var textH = nameLines.length * nameH + blurbLines.length * 15;
    var top = cap + (h - cap - textH) / 2 + nameH / 2 + 1;
    if (node.kind === "unmapped") top = 22;
    var label = nameLines.map(function (line, i) {
      return '<text class="label" x="' + w / 2 + '" y="' + (top + i * nameH) + '">' + esc(line) + "</text>";
    }).join("") + blurbLines.map(function (line, i) {
      return '<text class="blurb" x="' + w / 2 + '" y="' + (top + nameLines.length * nameH + i * 15 - 2) + '">' + esc(line) + "</text>";
    }).join("");
    if (node.kind === "unmapped") {
      label += wrap(node.what, 30).concat(wrap(node.why, 30)).map(function (line, i) {
        return '<text class="small" x="12" y="' + (44 + i * 16) + '">' + esc(line) + "</text>";
      }).join("");
    }
    var badges = "";
    if (node.flagged) badges += '<g class="badge drift-badge" transform="translate(' + (w - 6) + ',-6)"><circle r="9"/><text y="4">!</text></g>';
    if (node.collapsed) badges += '<g class="badge more-badge" transform="translate(' + (w / 2) + ',' + h + ')"><rect x="-16" y="-8" width="32" height="16" rx="8"/><text y="4">+' + node.hidden + "</text></g>";
    else if (node.notes && node.notes.length) badges += '<g class="badge notes-badge" transform="translate(6,-6)"><circle r="8"/><text y="4">i</text></g>';
    return '<g class="' + classes + '" data-node-id="' + esc(node.id) + '" transform="translate(' + node.x + "," + node.y + ')">' + body + label + badges + "</g>";
  }

  function roundedPath(points, radius) {
    if (!points.length) return "";
    var d = "M" + points[0].x + "," + points[0].y;
    for (var i = 1; i < points.length - 1; i += 1) {
      var prev = points[i - 1];
      var at = points[i];
      var next = points[i + 1];
      var inLen = Math.hypot(at.x - prev.x, at.y - prev.y);
      var outLen = Math.hypot(next.x - at.x, next.y - at.y);
      var r = Math.min(radius, inLen / 2, outLen / 2);
      if (!r) {
        d += " L" + at.x + "," + at.y;
        continue;
      }
      var ax = at.x - ((at.x - prev.x) / inLen) * r;
      var ay = at.y - ((at.y - prev.y) / inLen) * r;
      var bx = at.x + ((next.x - at.x) / outLen) * r;
      var by = at.y + ((next.y - at.y) / outLen) * r;
      d += " L" + ax + "," + ay + " Q" + at.x + "," + at.y + " " + bx + "," + by;
    }
    var last = points[points.length - 1];
    return d + " L" + last.x + "," + last.y;
  }

  function edgeSvg(edge, highlight) {
    var points = edge.points && edge.points.length ? edge.points : [{ x: edge.x1, y: edge.y1 }, { x: edge.x2, y: edge.y2 }];
    var cls = "edge flow-" + esc(edge.kind) + (highlight ? " is-related" : "");
    var d = roundedPath(points, 10);
    var out = '<g class="' + cls + '" data-edge-index="' + edge.index + '"><path class="hit" d="' + d + '"/><path class="line" d="' + d + '" marker-end="url(#arrow-' + esc(edge.kind === "control" ? "control" : "data") + ')"/>';
    if (edge.label) {
      var text = edge.label.length > 34 ? edge.label.slice(0, 33) + "…" : edge.label;
      var w = text.length * 6.6 + 14;
      out += '<g class="edge-label" transform="translate(' + edge.cx + "," + edge.cy + ')"><rect x="' + -w / 2 + '" y="-10" width="' + w + '" height="20" rx="2"/><text y="4">' + esc(text) + "</text></g>";
    }
    return out + "</g>";
  }

  function clusterSvg(group, title) {
    return '<g class="cluster" data-group="' + esc(group.id) + '"><rect x="' + group.x + '" y="' + (group.y - 22) + '" width="' + group.w + '" height="' + (group.h + 22) + '" rx="3"/>' +
      (title ? '<text x="' + (group.x + group.w / 2) + '" y="' + (group.y - 6) + '">' + esc(title) + "</text>" : "") + "</g>";
  }

  function zoneSvg(zone) {
    return '<g class="zone" data-zone="' + esc(zone.id) + '"><rect x="' + zone.x + '" y="' + zone.y + '" width="' + zone.w + '" height="' + zone.h + '" rx="10"/>' +
      '<text x="' + (zone.x + 12) + '" y="' + (zone.y + 16) + '">' + esc(zone.name) + "</text></g>";
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
    return '<g class="lane" data-lane="' + esc(lane.name) + '"><text x="' + (left - 36) + '" y="' + ((lane.y + lane.bottom) / 2 + 4) + '">' + esc(lane.name.toUpperCase()) + "</text></g>";
  }

  function systemFrame(scene) {
    var system = scene.nodes.filter(function (node) { return node.kind === "system"; })[0];
    var rest = scene.nodes.filter(function (node) { return node.kind !== "system" && node.kind !== "unmapped"; });
    if (!system || !rest.length) return "";
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    rest.forEach(function (node) {
      minX = Math.min(minX, node.x); minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.w); maxY = Math.max(maxY, node.y + node.h);
    });
    (scene.edges || []).forEach(function (edge) {
      (edge.points || []).forEach(function (p) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
    });
    var pad = 36;
    return '<rect class="system-frame" data-system="' + esc(system.id) + '" x="' + (minX - pad) + '" y="' + (minY - pad - 12) + '" width="' + (maxX - minX + pad * 2) + '" height="' + (maxY - minY + pad * 2 + 12) + '" rx="6"/>';
  }

  // ---- App -------------------------------------------------------------------

  function shell() {
    return (
      '<div id="viewport">' +
      '<svg id="surface" xmlns="' + SVG_NS + '"><defs>' +
      '<marker id="arrow-data" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker>' +
      '<marker id="arrow-control" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker>' +
      '</defs><g id="world"><g id="layer-frames"></g><g id="layer-edges"></g><g id="layer-nodes"></g></g></svg>' +
      "</div>" +
      '<header id="hud">' +
      '<div class="pill brand"><strong>Smartypants</strong><span id="level-label"></span><span id="busy" hidden>thinking…</span></div>' +
      '<input id="search" class="pill search" placeholder="Find a part  ( / )" autocomplete="off" />' +
      '<div class="pill tools">' +
      '<button id="zoom-out" title="Zoom out (-)">−</button><span id="zoom-label">100%</span><button id="zoom-in" title="Zoom in (+)">+</button>' +
      '<button id="fit" title="Fit (F)">Fit</button><button id="tidy" title="Forget dragged positions and lay everything out again (T)">Tidy</button><button id="expand-all" title="Expand everything">Expand</button>' +
      '<button id="toggle-layout" title="Switch between tiered layers and a left-to-right flow (L)">Layout: Tiers</button>' +
      '<button id="show-intent" title="Intent memory (I)">Intent</button><button id="copy-mermaid" title="Copy Mermaid source">Mermaid</button>' +
      "</div></header>" +
      '<div class="legend pill"><span><i class="swatch flow-data"></i>data</span><span><i class="swatch flow-control"></i>control</span><span><i class="swatch drift"></i>drift</span>' +
      '<span class="hint">click anything to read · double-click to go deeper · drag boxes, frames, and layers · scroll to zoom</span></div>' +
      '<aside id="panel" hidden><button id="panel-close" title="Close (Esc)">×</button><div id="panel-body"></div></aside>' +
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

    root.__smartypants = {
      get camera() { return { x: camera.x, y: camera.y, scale: camera.scale }; },
      get scene() { return scene; },
      get selected() { return selected; },
    };

    function viewSize() {
      return { w: viewport.clientWidth, h: viewport.clientHeight };
    }

    function applyCamera() {
      var size = viewSize();
      var ox = size.w / 2 - camera.x * camera.scale;
      var oy = size.h / 2 - camera.y * camera.scale;
      world.setAttribute("transform", "translate(" + ox + "," + oy + ") scale(" + camera.scale + ")");
      var grid = 24 * camera.scale;
      viewport.style.backgroundSize = grid + "px " + grid + "px";
      viewport.style.backgroundPosition = ox + "px " + oy + "px";
      zoomLabel.textContent = Math.round(camera.scale * 100) + "%";
      drawMinimap();
    }

    function fit() {
      var b = scene.bounds;
      // Leave room for the layer labels on the left.
      if (b && b.w && scene.mode === "tiers") b = { x: b.x - 170, y: b.y, w: b.w + 170, h: b.h };
      var size = viewSize();
      if (!b || !b.w || !b.h) return;
      var open = panel.hidden ? 0 : Math.min(380, size.w * 0.4);
      var scale = Math.min((size.w - open - 80) / b.w, (size.h - 140) / b.h);
      camera.scale = Math.max(0.1, Math.min(scale, 1.4));
      camera.x = b.x + b.w / 2 + open / 2 / camera.scale;
      camera.y = b.y + b.h / 2 - 20 / camera.scale;
      applyCamera();
    }

    function zoomAt(factor, sx, sy) {
      var size = viewSize();
      if (sx == null) { sx = size.w / 2; sy = size.h / 2; }
      var wx = (sx - size.w / 2) / camera.scale + camera.x;
      var wy = (sy - size.h / 2) / camera.scale + camera.y;
      camera.scale = Math.max(0.05, Math.min(5, camera.scale * factor));
      camera.x = wx - (sx - size.w / 2) / camera.scale;
      camera.y = wy - (sy - size.h / 2) / camera.scale;
      applyCamera();
    }

    function centerOn(node) {
      camera.x = node.x + node.w / 2 + (panel.hidden ? 0 : 160 / camera.scale);
      camera.y = node.y + node.h / 2;
      applyCamera();
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
      (scene.nodes || []).forEach(function (node) { if (node.kind !== "system") left = Math.min(left, node.x); });
      (scene.zones || []).forEach(function (zone) { left = Math.min(left, zone.x); });
      scene.lanesNow = lanes;
      layerFrames.innerHTML = systemFrame(scene) + (scene.zones || []).map(zoneSvg).join("") +
        (scene.groups || []).map(function (group) { return clusterSvg(group, titleFor(group)); }).join("") +
        lanes.map(function (lane) { return laneSvg(lane, left); }).join("");
      layerEdges.innerHTML = (scene.edges || []).map(function (edge, i) { edge.index = i; return edgeSvg(edge, related[i]); }).join("");
      layerNodes.innerHTML = (scene.nodes || []).map(function (node) { return nodeSvg(node, node.id === selected, fresh[node.id]); }).join("");
      applyCamera();
    }

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
      levelLabel.textContent = next.level ? " · level " + next.level : next.floor ? " · " + next.floor : "";
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

    function flowRow(edge, direction) {
      var other = direction === "out" ? edge.toId : edge.fromId;
      var node = sourceById(other);
      return '<li><button class="link" data-goto="' + esc(other) + '">' + (direction === "out" ? "→ " : "← ") + esc(node ? node.name : other) +
        '</button><span class="muted"> ' + esc(edge.label) + (edge.kind === "control" ? " (control)" : "") + "</span></li>";
    }

    function openPanel(id, quiet) {
      var node = sourceById(id) || nodeById(id);
      if (!node) {
        closePanel();
        return;
      }
      selected = id;
      var parent = node.parentId ? sourceById(node.parentId) : null;
      var children = (model.nodes || []).filter(function (item) { return item.parentId === node.id; });
      var outgoing = (model.connections || []).filter(function (edge) { return edge.fromId === node.id; });
      var incoming = (model.connections || []).filter(function (edge) { return edge.toId === node.id; });
      var isCollapsed = collapsed.indexOf(node.id) !== -1;
      var html =
        '<p class="eyebrow">' + esc(KIND_LABEL[node.kind] || node.kind) + (node.shape ? " · " + esc(node.shape) : "") +
        (parent ? ' · in <button class="link" data-goto="' + esc(parent.id) + '">' + esc(parent.name) + "</button>" : "") + "</p>" +
        "<h2>" + esc(node.name) + "</h2>" +
        (node.blurb ? '<p class="lede">' + esc(node.blurb) + "</p>" : "") +
        ((node.tier || node.zone) ? '<p class="chips">' + (node.tier ? '<span class="chip">' + esc(node.tier) + "</span>" : "") + (node.zone ? '<span class="chip zone-chip">' + esc(node.zone) + "</span>" : "") + "</p>" : "") +
        '<h3>What</h3><p>' + esc(node.what) + "</p>" +
        '<h3>Why</h3><p>' + esc(node.why) + "</p>";
      if (node.notes && node.notes.length) {
        html += "<h3>Deep dive</h3><ul class=\"notes\">" + node.notes.map(function (note) { return "<li>" + esc(note) + "</li>"; }).join("") + "</ul>";
      }
      (node.flags || []).forEach(function (flag) {
        html += '<div class="flag"><p class="eyebrow">Drift</p><p><strong>Intent:</strong> ' + esc(flag.intent) + '</p><p><strong>Code:</strong> ' + esc(flag.difference) + "</p></div>";
      });
      if (children.length) {
        html += "<h3>Inside</h3><ul>" + children.map(function (child) {
          return '<li><button class="link" data-goto="' + esc(child.id) + '">' + esc(child.name) + '</button><span class="muted"> ' + esc(child.what) + "</span></li>";
        }).join("") + "</ul>";
      }
      if (outgoing.length || incoming.length) {
        html += "<h3>Flows</h3><ul>" + outgoing.map(function (e) { return flowRow(e, "out"); }).join("") + incoming.map(function (e) { return flowRow(e, "in"); }).join("") + "</ul>";
      }
      html += '<div id="panel-intent"></div>';
      html += '<div class="actions">' +
        (node.kind !== "unmapped" ? '<button id="go-deeper" class="primary">Go deeper</button>' : "") +
        (children.length ? '<button id="toggle-collapse">' + (isCollapsed ? "Expand" : "Collapse") + "</button>" : "") +
        '<button id="center-node">Center</button></div>';
      panelBody.innerHTML = html;
      panel.hidden = false;
      if (!quiet) paint();
      intent().then(function (data) {
        var mine = (data.atoms || []).filter(function (atom) {
          var head = String(atom.s).split(".")[0];
          return head === node.id || head.split(">").indexOf(node.id) !== -1;
        });
        var target = document.getElementById("panel-intent");
        if (!target || !mine.length) return;
        target.innerHTML = "<h3>Intent</h3><pre class=\"intent\">" + mine.map(function (a) { return esc(a.k + " " + a.s + " " + a.v); }).join("\n") + "</pre>";
      });
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
        var html = '<p class="eyebrow">Memory</p><h2>Intent</h2><p class="muted">' + (data.atoms || []).length + " atoms · ~" + (data.tokens || 0) +
          ' tokens. <code>K subject value</code>: G goal, F function, N constraint, D decision, X excluded, E flow, Q question, ! drift.</p>' +
          '<pre class="intent">' + esc(data.text || "(nothing recorded yet)") + "</pre>";
        if (stats && stats.turns) {
          html += "<h3>Efficiency</h3><p>" + stats.turns + " turns · " + (stats.actions.skip || 0) + " skipped free · " + (stats.actions.remember || 0) +
            " remembered without a builder · " + stats.calls.builder + " builder calls · $" + Number(stats.cost || 0).toFixed(4) + "</p>";
        }
        panelBody.innerHTML = html;
        panel.hidden = false;
        paint();
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
      var b = scene.bounds;
      if (!b || !b.w || !b.h) {
        minimap.innerHTML = "";
        return;
      }
      var size = viewSize();
      var mw = 180;
      var mh = 120;
      var s = Math.min(mw / b.w, mh / b.h);
      var ox = (mw - b.w * s) / 2 - b.x * s;
      var oy = (mh - b.h * s) / 2 - b.y * s;
      var view = {
        x: camera.x - size.w / 2 / camera.scale,
        y: camera.y - size.h / 2 / camera.scale,
        w: size.w / camera.scale,
        h: size.h / camera.scale,
      };
      minimap.innerHTML = (scene.nodes || []).map(function (node) {
        return '<rect class="' + (node.flagged ? "mm-drift" : "mm-node") + '" x="' + (node.x * s + ox) + '" y="' + (node.y * s + oy) + '" width="' + Math.max(2, node.w * s) + '" height="' + Math.max(2, node.h * s) + '"/>';
      }).join("") + '<rect class="mm-view" x="' + (view.x * s + ox) + '" y="' + (view.y * s + oy) + '" width="' + view.w * s + '" height="' + view.h * s + '"/>';
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

    /** What the pointer is on: a box, a subgraph, a zone, a tier lane, an arrow, the system frame, or empty canvas. */
    function targetOf(event) {
      var el = event.target;
      while (el && el !== viewport) {
        if (el.getAttribute) {
          var id = el.getAttribute("data-node-id");
          if (id) return { kind: "node", id: id, members: [id] };
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
          if (system) return { kind: "system-frame", id: system, members: (scene.nodes || []).filter(function (n) { return n.kind !== "system" && n.kind !== "unmapped"; }).map(function (n) { return n.id; }) };
        }
        el = el.parentNode;
      }
      return null;
    }

    function nodeFromEvent(event) {
      var hit = targetOf(event);
      return hit && hit.kind === "node" ? hit.id : null;
    }

    function groupMembers(id) {
      return (scene.nodes || []).filter(function (node) { return node.id === id || node.parentId === id; }).map(function (node) { return node.id; });
    }

    viewport.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
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
        return;
      }
      if (drag.kind === "target") {
        if (!drag.moved && Math.hypot(event.clientX - drag.sx, event.clientY - drag.sy) < 4) return;
        if (!Object.keys(drag.start).length) return;
        drag.moved = true;
        var point = toWorld(event);
        var dx = point.x - drag.px;
        var dy = point.y - drag.py;
        Object.keys(drag.start).forEach(function (id) {
          var to = { x: drag.start[id].x + dx, y: drag.start[id].y + dy };
          SmartypantsScene.moveNode(scene, id, to.x, to.y);
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
      panelBody.innerHTML =
        '<p class="eyebrow">Flow · ' + esc(edge.kind === "control" ? "control" : edge.kind === "dependency" ? "dependency" : "data") + "</p>" +
        "<h2>" + esc(edge.label || "(unlabeled)") + "</h2>" +
        '<p><button class="link" data-goto="' + esc(edge.from) + '">' + esc(from ? from.name : edge.from) + '</button> → <button class="link" data-goto="' + esc(edge.to) + '">' + esc(to ? to.name : edge.to) + "</button></p>" +
        (crossing ? '<p class="muted">Crosses the boundary from <strong>' + esc(from.zone) + "</strong> to <strong>" + esc(to.zone) + "</strong>.</p>" : "") +
        (reply ? '<h3>Reply</h3><p><button class="link" data-goto="' + esc(edge.from) + '">' + esc(reply.label) + "</button> comes back to the caller.</p>" : "") +
        (from ? "<h3>From</h3><p>" + esc(from.what) + "</p>" : "") +
        (to ? "<h3>To</h3><p>" + esc(to.what) + "</p>" : "");
      panel.hidden = false;
      paint();
    }

    function memberList(ids) {
      return "<ul>" + ids.map(function (id) {
        var node = sourceById(id) || nodeById(id);
        return node ? '<li><button class="link" data-goto="' + esc(id) + '">' + esc(node.name) + '</button><span class="muted"> ' + esc(node.blurb || node.what || "") + "</span></li>" : "";
      }).join("") + "</ul>";
    }

    function openZone(id) {
      var zone = (scene.zones || []).filter(function (z) { return z.id === id; })[0];
      if (!zone) return;
      selected = null;
      panelBody.innerHTML = '<p class="eyebrow">Boundary</p><h2>' + esc(zone.name) + "</h2>" +
        '<p class="muted">A network or trust boundary. Arrows that leave it cross a firewall, a namespace, or a subnet. Drag the frame to move everything inside.</p>' +
        "<h3>Inside</h3>" + memberList(zone.members);
      panel.hidden = false;
      paint();
    }

    function openLane(name) {
      var lane = (scene.lanesNow || []).filter(function (l) { return l.name === name; })[0];
      if (!lane) return;
      selected = null;
      panelBody.innerHTML = '<p class="eyebrow">Layer</p><h2>' + esc(name) + "</h2><p>" + esc(TIER_TEXT[name] || "") + "</p>" +
        '<p class="muted">Layers run top to bottom: users, edge, frontend, API, services, async (messaging then workers), data (cache then databases), storage. Drag the label to move the whole layer.</p>' +
        "<h3>In this layer</h3>" + memberList(lane.members);
      panel.hidden = false;
      paint();
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
      var target = event.target;
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
          collapsed = collapsed.filter(function (id) { return id !== sourceById(go)?.parentId; });
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
