(function () {
  var root = typeof globalThis !== "undefined" ? globalThis : this;

  var SERVE_HELP =
    '<main class="serve-help"><div>' +
    "<h1>Smartypants canvas</h1>" +
    "<p>This page reads the persisted design from the project, so open it through the local server.</p>" +
    "<p>From the project root, run <code>node bin/smartypants-serve.mjs</code></p>" +
    "<p>Then open <code>http://127.0.0.1:4173</code></p>" +
    "</div></main>";

  function showServeHelp() {
    if (typeof document === "undefined" || !document.body) return;
    document.body.innerHTML = SERVE_HELP;
  }

  function kindLabel(node) {
    if (node.kind === "module" && node.group) return node.group;
    if (node.kind === "unmapped") return "Drift";
    return "";
  }

  function esc(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function cardHtml(node) {
    var drift = node.flagged ? " is-drift" : "";
    var flags = (node.flags || [])
      .map(function (flag) {
        return (
          '<aside class="flag">' +
          '<p class="eyebrow drift-label">Drift</p>' +
          "<p>" +
          esc(flag.intent) +
          "</p>" +
          "<p class=\"differs\">" +
          esc(flag.difference) +
          "</p></aside>"
        );
      })
      .join("");
    return (
      '<article class="card kind-' +
      esc(node.kind) +
      drift +
      '" data-node-id="' +
      esc(node.id) +
      '" style="left:' +
      node.x +
      "px;top:" +
      node.y +
      "px;width:" +
      node.w +
      "px;height:" +
      node.h +
      'px">' +
      (kindLabel(node)
        ? '<p class="eyebrow">' + esc(kindLabel(node)) + "</p>"
        : "") +
      "<h2>" +
      esc(node.name) +
      "</h2>" +
      '<p class="field what">' +
      esc(node.what) +
      "</p>" +
      '<p class="field why">' +
      esc(node.why) +
      "</p>" +
      flags +
      "</article>"
    );
  }

  function fitCamera(bounds, viewW, viewH) {
    if (!bounds || bounds.w <= 0 || bounds.h <= 0) return { x: 0, y: 0, scale: 1 };
    var padX = 64;
    var padTop = 92;
    var padBottom = 40;
    var scale = Math.min((viewW - padX * 2) / bounds.w, (viewH - padTop - padBottom) / bounds.h);
    scale = Math.max(0.45, Math.min(scale, 1.15));
    var contentMidY = bounds.y + bounds.h / 2;
    var viewMidY = padTop + (viewH - padTop - padBottom) / 2;
    return {
      x: bounds.x + bounds.w / 2,
      y: contentMidY - (viewMidY - viewH / 2) / scale,
      scale: scale,
    };
  }

  function screenOf(camera, viewW, viewH, x, y) {
    return {
      x: (x - camera.x) * camera.scale + viewW / 2,
      y: (y - camera.y) * camera.scale + viewH / 2,
    };
  }

  function fillRound(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  function paint(ctx, scene, camera, viewW, viewH) {
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.fillStyle = "#f4f1ea";
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.save();
    ctx.fillStyle = "rgba(48, 42, 36, 0.22)";
    var spacing = 28 * camera.scale;
    if (spacing < 12) spacing = 12;
    var origin = screenOf(camera, viewW, viewH, 0, 0);
    var startX = ((origin.x % spacing) + spacing) % spacing;
    var startY = ((origin.y % spacing) + spacing) % spacing;
    var dot = Math.max(1.2, 1.4 * camera.scale);
    for (var x = startX; x < viewW; x += spacing) {
      for (var y = startY; y < viewH; y += spacing) {
        ctx.fillRect(x, y, dot, dot);
      }
    }
    ctx.restore();

    (scene.groups || []).forEach(function (group) {
      var originGroup = screenOf(camera, viewW, viewH, group.x, group.y);
      ctx.save();
      ctx.fillStyle = "rgba(36, 48, 74, 0.035)";
      ctx.strokeStyle = "rgba(36, 42, 54, 0.55)";
      ctx.lineWidth = Math.max(1, 1.25 * camera.scale);
      ctx.setLineDash([7 * camera.scale, 6 * camera.scale]);
      fillRound(ctx, originGroup.x, originGroup.y, group.w * camera.scale, group.h * camera.scale, 12 * camera.scale);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    (scene.captions || []).forEach(function (caption) {
      var at = screenOf(camera, viewW, viewH, caption.x, caption.y);
      var nameSize = Math.max(11, 12 * camera.scale);
      ctx.fillStyle = "#1c1915";
      ctx.font = "700 " + nameSize + "px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(caption.name.toUpperCase(), at.x, at.y + 10);
    });

    var colors = { data: "#1e2430", control: "#9a5b12", dependency: "#2c5d8a" };
    (scene.edges || []).forEach(function (line) {
      var raw = line.points && line.points.length ? line.points : [
        { x: line.x1, y: line.y1 },
        { x: line.cx, y: line.cy },
        { x: line.x2, y: line.y2 },
      ];
      var points = raw.map(function (point) {
        return screenOf(camera, viewW, viewH, point.x, point.y);
      });
      ctx.strokeStyle = colors[line.kind] || colors.data;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = Math.max(1.6, 2 * camera.scale);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (var i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
      ctx.stroke();
      var prev = points[points.length - 2];
      var end = points[points.length - 1];
      var angle = Math.atan2(end.y - prev.y, end.x - prev.x);
      var head = Math.max(8, 11 * camera.scale);
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - head * Math.cos(angle - Math.PI / 7), end.y - head * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(end.x - head * Math.cos(angle + Math.PI / 7), end.y - head * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fill();
      if (!line.label) return;
      var labelAt = screenOf(camera, viewW, viewH, line.cx, line.cy);
      var fontSize = Math.max(11, 13 * camera.scale);
      ctx.font = "600 " + fontSize + "px ui-sans-serif, system-ui, sans-serif";
      var maxLabelWidth = 220 * camera.scale;
      var label = line.label;
      while (label.length > 22 && ctx.measureText(label).width > maxLabelWidth) label = label.slice(0, -1);
      if (label !== line.label) label = label.slice(0, -1) + "…";
      var metrics = ctx.measureText(label);
      var padX = 7 * camera.scale;
      var labelW = metrics.width + padX * 2;
      var labelH = fontSize + 8 * camera.scale;
      ctx.fillStyle = "#f4f1ea";
      fillRound(ctx, labelAt.x - labelW / 2, labelAt.y - labelH / 2, labelW, labelH, 4 * camera.scale);
      ctx.fill();
      ctx.fillStyle = colors[line.kind] || colors.data;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, labelAt.x, labelAt.y);
    });
  }

  function shell() {
    return (
      '<div id="viewport">' +
      '<canvas id="surface"></canvas>' +
      '<div id="world"></div>' +
      "</div>" +
      '<header id="hud">' +
      '<div class="pill" id="title"><strong>Smartypants</strong> <span id="floor-label"></span></div>' +
      '<div class="pill legend">' +
      '<span><i class="swatch flow-data"></i>Data</span>' +
      '<span><i class="swatch flow-control"></i>Control</span>' +
      '<span><i class="swatch drift"></i>Drift</span>' +
      "</div>" +
      '<div class="pill">Drag a card · Pan empty space · Scroll to zoom</div>' +
      "</header>" +
      '<div id="empty" class="empty" hidden>' +
      "<div><h2>No system on the canvas yet</h2>" +
      "<p>Describe the application in your coding agent. The diagram appears here once smartypants.config.json is at the project root and the turn is about the design.</p></div>" +
      "</div>"
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
    var canvas = document.getElementById("surface");
    if (!viewport || !canvas || typeof viewport.addEventListener !== "function" || typeof canvas.getContext !== "function") {
      return;
    }
    var world = document.getElementById("world");
    var empty = document.getElementById("empty");
    var floorLabel = document.getElementById("floor-label");
    var ctx = canvas.getContext("2d");
    var camera = { x: 0, y: 0, scale: 1 };
    var scene = { nodes: [], edges: [], unmapped: [], bounds: { x: 0, y: 0, w: 0, h: 0 } };
    var fitted = false;
    var drag = null;
    var held = {};
    var lastPayload = "";

    root.__smartypants = {
      get camera() {
        return { x: camera.x, y: camera.y, scale: camera.scale };
      },
      get scene() {
        return scene;
      },
    };

    function viewSize() {
      return { w: viewport.clientWidth, h: viewport.clientHeight };
    }

    function resize() {
      var size = viewSize();
      canvas.width = size.w;
      canvas.height = size.h;
      draw();
    }

    function applyTransform() {
      var size = viewSize();
      var ox = size.w / 2 - camera.x * camera.scale;
      var oy = size.h / 2 - camera.y * camera.scale;
      world.style.transform = "translate(" + ox + "px," + oy + "px) scale(" + camera.scale + ")";
    }

    function draw() {
      var size = viewSize();
      if (canvas.width !== size.w || canvas.height !== size.h) {
        canvas.width = size.w;
        canvas.height = size.h;
      }
      paint(ctx, scene, camera, size.w, size.h);
      applyTransform();
    }

    function toWorld(event) {
      var size = viewSize();
      var rect = viewport.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left - size.w / 2) / camera.scale + camera.x,
        y: (event.clientY - rect.top - size.h / 2) / camera.scale + camera.y,
      };
    }

    function hitNode(x, y) {
      var list = scene.nodes || [];
      for (var i = list.length - 1; i >= 0; i -= 1) {
        var node = list[i];
        if (x >= node.x && x <= node.x + node.w && y >= node.y && y <= node.y + node.h) return node;
      }
      return null;
    }

    function placeCards() {
      var cards = world.querySelectorAll(".card");
      for (var i = 0; i < cards.length; i += 1) {
        var card = cards[i];
        var node = (scene.nodes || []).find(function (item) { return item.id === card.getAttribute("data-node-id"); });
        if (!node) continue;
        card.style.left = node.x + "px";
        card.style.top = node.y + "px";
      }
    }

    function render(model) {
      (model.nodes || []).forEach(function (node) {
        if (!held[node.id]) return;
        node.x = held[node.id].x;
        node.y = held[node.id].y;
      });
      scene = SmartypantsScene.buildScene(model);
      floorLabel.textContent = model.floor ? "· " + model.floor : "";
      world.innerHTML = scene.nodes.map(cardHtml).join("");
      empty.hidden = scene.nodes.length > 0;
      if (!fitted) {
        var size = viewSize();
        camera = fitCamera(scene.bounds, size.w, size.h);
        fitted = scene.nodes.length > 0;
      }
      draw();
    }

    function load() {
      return fetch("/design.json", { cache: "no-store" })
        .then(function (response) {
          if (!response.ok) throw new Error("design unavailable");
          return response.text();
        })
        .then(function (text) {
          if (drag || text === lastPayload) return;
          lastPayload = text;
          render(JSON.parse(text));
        })
        .catch(function () {
          empty.hidden = false;
        });
    }

    viewport.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      var point = toWorld(event);
      var hit = hitNode(point.x, point.y);
      if (hit) {
        drag = {
          kind: "node",
          id: event.pointerId,
          nodeId: hit.id,
          dx: point.x - hit.x,
          dy: point.y - hit.y,
        };
        viewport.classList.add("is-moving");
      } else {
        drag = {
          kind: "pan",
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          camX: camera.x,
          camY: camera.y,
        };
        viewport.classList.add("is-panning");
      }
      viewport.setPointerCapture(event.pointerId);
    });
    viewport.addEventListener("pointermove", function (event) {
      if (!drag || drag.id !== event.pointerId) {
        var hover = hitNode(toWorld(event).x, toWorld(event).y);
        viewport.classList.toggle("is-over-card", Boolean(hover));
        return;
      }
      if (drag.kind === "node") {
        var point = toWorld(event);
        var nextX = point.x - drag.dx;
        var nextY = point.y - drag.dy;
        SmartypantsScene.moveNode(scene, drag.nodeId, nextX, nextY);
        held[drag.nodeId] = { x: nextX, y: nextY };
        placeCards();
        draw();
        return;
      }
      camera.x = drag.camX - (event.clientX - drag.x) / camera.scale;
      camera.y = drag.camY - (event.clientY - drag.y) / camera.scale;
      draw();
    });
    function endDrag(event) {
      if (!drag || (event && drag.id !== event.pointerId)) return;
      var finished = drag;
      drag = null;
      viewport.classList.remove("is-panning");
      viewport.classList.remove("is-moving");
      if (finished.kind !== "node") return;
      var node = (scene.nodes || []).find(function (item) { return item.id === finished.nodeId; });
      if (!node || typeof fetch !== "function") return;
      fetch("/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: node.id, x: node.x, y: node.y }),
      }).catch(function () {});
    }
    viewport.addEventListener("pointerup", endDrag);
    viewport.addEventListener("pointercancel", endDrag);
    viewport.addEventListener(
      "wheel",
      function (event) {
        event.preventDefault();
        var size = viewSize();
        var rect = viewport.getBoundingClientRect();
        var sx = event.clientX - rect.left;
        var sy = event.clientY - rect.top;
        var worldX = (sx - size.w / 2) / camera.scale + camera.x;
        var worldY = (sy - size.h / 2) / camera.scale + camera.y;
        var next = camera.scale * (event.deltaY < 0 ? 1.08 : 0.92);
        camera.scale = Math.max(0.2, Math.min(2.8, next));
        camera.x = worldX - (sx - size.w / 2) / camera.scale;
        camera.y = worldY - (sy - size.h / 2) / camera.scale;
        draw();
      },
      { passive: false },
    );
    window.addEventListener("resize", resize);
    load();
    setInterval(load, 2000);
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
