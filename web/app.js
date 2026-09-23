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

  function kindLabel(kind) {
    if (kind === "system") return "System";
    if (kind === "component") return "Component";
    if (kind === "module") return "Module";
    return "Drift";
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
          "<p><span>Intent</span> " +
          esc(flag.intent) +
          "</p>" +
          "<p><span>Differs</span> " +
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
      '<p class="eyebrow">' +
      kindLabel(node.kind) +
      "</p>" +
      "<h2>" +
      esc(node.name) +
      "</h2>" +
      '<p class="field what"><span>What</span> ' +
      esc(node.what) +
      "</p>" +
      '<p class="field why"><span>Why</span> ' +
      esc(node.why) +
      "</p>" +
      flags +
      "</article>"
    );
  }

  function fitCamera(bounds, viewW, viewH) {
    if (!bounds || bounds.w <= 0 || bounds.h <= 0) return { x: 0, y: 0, scale: 1 };
    var pad = Math.max(48, Math.min(viewW, viewH) * 0.06);
    var scale = Math.min((viewW - pad * 2) / bounds.w, (viewH - pad * 2) / bounds.h);
    scale = Math.max(0.35, Math.min(scale, 1.35));
    return {
      x: bounds.x + bounds.w / 2,
      y: bounds.y + bounds.h / 2,
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
    var sky = ctx.createLinearGradient(0, 0, viewW, viewH);
    sky.addColorStop(0, "#1a2233");
    sky.addColorStop(0.45, "#10151e");
    sky.addColorStop(1, "#243044");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, viewW, viewH);
    var inset = Math.max(18, Math.min(viewW, viewH) * 0.04);
    ctx.fillStyle = "#182232";
    fillRound(ctx, inset, inset, Math.max(0, viewW - inset * 2), Math.max(0, viewH - inset * 2), 28);
    ctx.fill();

    ctx.save();
    ctx.strokeStyle = "rgba(168, 184, 210, 0.08)";
    ctx.lineWidth = 1;
    var spacing = 56 * camera.scale;
    if (spacing < 16) spacing = 16;
    var origin = screenOf(camera, viewW, viewH, 0, 0);
    var startX = origin.x % spacing;
    var startY = origin.y % spacing;
    for (var x = startX; x < viewW; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, viewH);
      ctx.stroke();
    }
    for (var y = startY; y < viewH; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(viewW, y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.lineWidth = 1.5;
    (scene.edges || []).forEach(function (line) {
      var a = screenOf(camera, viewW, viewH, line.x1, line.y1);
      var b = screenOf(camera, viewW, viewH, line.x2, line.y2);
      ctx.strokeStyle = "rgba(180, 196, 220, 0.55)";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });

    (scene.nodes || []).forEach(function (node) {
      var at = screenOf(camera, viewW, viewH, node.x, node.y);
      var w = node.w * camera.scale;
      var h = node.h * camera.scale;
      ctx.fillStyle = node.flagged ? "#2a2116" : "#141b27";
      ctx.strokeStyle = node.flagged
        ? "#e3b15a"
        : node.kind === "system"
          ? "#8b97ff"
          : node.kind === "component"
            ? "#3ecfb0"
            : node.kind === "unmapped"
              ? "#e3b15a"
              : "#9eb0cc";
      ctx.lineWidth = node.flagged ? 2.5 : 1.5;
      fillRound(ctx, at.x, at.y, w, h, 18 * camera.scale);
      ctx.fill();
      ctx.stroke();
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
      '<span><i class="swatch system"></i>System</span>' +
      '<span><i class="swatch component"></i>Component</span>' +
      '<span><i class="swatch module"></i>Module</span>' +
      '<span><i class="swatch drift"></i>Drift</span>' +
      "</div>" +
      '<div class="pill">Drag to pan · Scroll to zoom</div>' +
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

    function render(model) {
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
          if (text === lastPayload) return;
          lastPayload = text;
          render(JSON.parse(text));
        })
        .catch(function () {
          empty.hidden = false;
        });
    }

    viewport.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        camX: camera.x,
        camY: camera.y,
      };
      viewport.classList.add("is-panning");
      viewport.setPointerCapture(event.pointerId);
    });
    viewport.addEventListener("pointermove", function (event) {
      if (!drag || drag.id !== event.pointerId) return;
      camera.x = drag.camX - (event.clientX - drag.x) / camera.scale;
      camera.y = drag.camY - (event.clientY - drag.y) / camera.scale;
      draw();
    });
    function endDrag(event) {
      if (!drag || (event && drag.id !== event.pointerId)) return;
      drag = null;
      viewport.classList.remove("is-panning");
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
