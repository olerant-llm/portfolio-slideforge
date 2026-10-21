/* SlideForge SOM helpers + shared object renderer (editor/viewer 共用) */
(function (global) {
  const SF = global.SF || (global.SF = {});
  const num = SF.num;
  let c = 0;
  function nid() { return "n" + (++c) + "_" + Date.now().toString(36); }

  SF.newSlide = function (n) {
    return { meta: { title: "スライド" + (n || 1), transition: "fade" }, objects: [] };
  };
  SF.newObject = function (kind, extra) {
    const base = { id: nid(), kind, meta: {}, content: "" };
    if (kind === "textbox") {
      base.meta = { x: 560, y: 420, w: 800, h: 220, fontFamily: "Noto Sans JP", fontSize: 40, color: "#222222", align: "left" };
      base.content = "テキストを入力";
    } else if (kind === "shape") {
      base.meta = { type: "rect", x: 760, y: 420, w: 400, h: 240, fill: "#3b82f6", stroke: "#1e293b", strokeWidth: 2 };
    } else if (kind === "animate") {
      base.meta = { type: "fade-in", delay: 0.3, duration: 0.6, x: 560, y: 420, w: 800, h: 220, fontSize: 40 };
      base.content = "フェードインするテキスト";
    } else if (kind === "image") {
      base.meta = { x: 660, y: 290, w: 600, h: 450 };
    } else if (kind === "video") {
      base.meta = { x: 640, y: 360, w: 640, h: 360, autoplay: false, loop: false, volume: 1.0, trimStart: 0, trimEnd: 0 };
    } else if (kind === "audio") {
      base.meta = { x: 1820, y: 40, w: 64, h: 64, autoplay: false, loop: false, volume: 1.0, trimStart: 0, trimEnd: 0 };
    } else if (kind === "table") {
      base.meta = { x: 260, y: 250, w: 1400, h: 560, fontSize: 30, headerFill: "#2563eb", stripeFill: "#eff6ff" };
      base.content = "| 項目 | 内容 |\n|---|---|\n| A | 1 |\n| B | 2 |";
    } else if (kind === "chart") {
      base.meta = { type: "bar", x: 360, y: 220, w: 1200, h: 650, color: "#2563eb", showValues: true };
      base.content = "国語,12\n数学,18\n理科,15";
    }
    if (extra) Object.assign(base.meta, extra);
    return base;
  };
  SF.clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  /* ---------- shared DOM renderer ---------- */
  /* ctx: { baseDir, mode: "edit" | "view" } */
  SF.buildObjectEl = function (o, ctx) {
    ctx = ctx || {};
    const m = o.meta || {};
    const el = document.createElement("div");
    el.className = "sf-obj sf-" + o.kind;
    el.dataset.kind = o.kind;
    const x = num(m.x, 100), y = num(m.y, 100), w = num(m.w, 400), h = num(m.h, 200);
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.width = w + "px";
    el.style.height = h + "px";

    if (o.kind === "textbox" || o.kind === "animate") {
      const inner = document.createElement("div");
      inner.className = "sf-content";
      inner.innerHTML = SF.renderMarkdown(o.content);
      if (m.fontFamily) el.style.fontFamily = "'" + m.fontFamily + "', sans-serif";
      if (m.fontSize) el.style.fontSize = num(m.fontSize, 40) + "px";
      if (m.color) el.style.color = m.color;
      if (m.align) el.style.textAlign = m.align;
      if (m.lineHeight) el.style.lineHeight = String(m.lineHeight);
      if (m.bg) el.style.background = m.bg;
      el.appendChild(inner);
    } else if (o.kind === "shape") {
      el.style.background = m.fill || "#cccccc";
      const sw = num(m.strokeWidth, 0);
      if (sw > 0) el.style.border = sw + "px solid " + (m.stroke || "#000");
      el.style.borderRadius = m.type === "ellipse" ? "50%" : num(m.radius, 0) + "px";
    } else if (o.kind === "image") {
      const img = document.createElement("img");
      img.src = SF.resolveSrc(o.src, ctx.baseDir);
      img.draggable = false;
      el.appendChild(img);
      const bw = num(m.borderWidth, 0);
      if (bw > 0) el.style.border = bw + "px solid " + (m.borderColor || "#000");
      if (m.shadow) el.style.boxShadow = "8px 8px 24px rgba(0,0,0,.35)";
    } else if (o.kind === "video") {
      const v = document.createElement("video");
      v.src = SF.resolveSrc(o.src, ctx.baseDir);
      v.preload = "metadata";
      v.loop = !!m.loop;
      v.volume = Math.min(1, Math.max(0, num(m.volume, 1)));
      el.appendChild(v);
      if (ctx.mode === "edit") {
        const badge = document.createElement("div");
        badge.className = "sf-badge";
        badge.textContent = "▶ video";
        el.appendChild(badge);
      }
    } else if (o.kind === "audio") {
      el.classList.add("sf-audio-icon");
      el.innerHTML = '<span class="sf-audio-glyph">🔊</span>';
      const a = document.createElement("audio");
      a.src = SF.resolveSrc(o.src, ctx.baseDir);
      a.preload = "metadata";
      a.loop = !!m.loop;
      a.volume = Math.min(1, Math.max(0, num(m.volume, 1)));
      el.appendChild(a);
    } else if (o.kind === "table") {
      el.classList.add("sf-table");
      el.style.setProperty("--table-header", m.headerFill || "#2563eb");
      el.style.setProperty("--table-stripe", m.stripeFill || "#eff6ff");
      el.style.fontSize = num(m.fontSize, 30) + "px";
      el.innerHTML = SF.renderMarkdown(o.content);
    } else if (o.kind === "chart") {
      el.classList.add("sf-chart");
      el.appendChild(buildChart(o));
    }
    return el;
  };

  function svgEl(name, attrs) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.keys(attrs || {}).forEach(k => node.setAttribute(k, attrs[k]));
    return node;
  }

  function buildChart(o) {
    const m = o.meta || {};
    const data = SF.parseChartData(o.content);
    const svg = svgEl("svg", { viewBox: "0 0 1000 500", role: "img", "aria-label": "グラフ" });
    if (!data.length) {
      const empty = svgEl("text", { x: 500, y: 250, "text-anchor": "middle", fill: "#64748b", "font-size": 32 });
      empty.textContent = "グラフデータがありません";
      svg.appendChild(empty);
      return svg;
    }
    const color = m.color || "#2563eb";
    const max = Math.max.apply(null, data.map(row => Math.max(0, row.value))) || 1;
    const baseY = 420;
    const plotHeight = 330;
    const slot = 880 / data.length;

    svg.appendChild(svgEl("line", { x1: 70, y1: baseY, x2: 960, y2: baseY, stroke: "#94a3b8", "stroke-width": 2 }));
    if ((m.type || "bar") === "line") {
      const points = data.map(function (row, index) {
        const x = 100 + slot * index + slot * 0.4;
        const y = baseY - (Math.max(0, row.value) / max) * plotHeight;
        return x + "," + y;
      }).join(" ");
      svg.appendChild(svgEl("polyline", { points, fill: "none", stroke: color, "stroke-width": 10, "stroke-linejoin": "round" }));
    }
    data.forEach(function (row, index) {
      const x = 100 + slot * index;
      const valueHeight = (Math.max(0, row.value) / max) * plotHeight;
      const centerX = x + slot * 0.4;
      const topY = baseY - valueHeight;
      if ((m.type || "bar") === "line") {
        svg.appendChild(svgEl("circle", { cx: centerX, cy: topY, r: 12, fill: color }));
      } else {
        svg.appendChild(svgEl("rect", {
          x,
          y: topY,
          width: Math.max(12, slot * 0.8),
          height: valueHeight,
          rx: 8,
          fill: color
        }));
      }
      const label = svgEl("text", { x: centerX, y: 465, "text-anchor": "middle", fill: "#334155", "font-size": 24 });
      label.textContent = row.label;
      svg.appendChild(label);
      if (m.showValues !== false) {
        const value = svgEl("text", { x: centerX, y: Math.max(28, topY - 12), "text-anchor": "middle", fill: "#0f172a", "font-size": 24 });
        value.textContent = String(row.value);
        svg.appendChild(value);
      }
    });
    return svg;
  }

  SF.applySlideStyle = function (el, meta, baseDir) {
    el.className = "slide theme-" + ((meta && meta.theme) || "white");
    el.style.background = "";
    el.style.backgroundImage = "";
    if (meta && meta.bg) {
      if (String(meta.bg).startsWith("#") || String(meta.bg).startsWith("rgb")) {
        el.style.background = meta.bg;
      } else {
        el.style.backgroundImage = "url('" + SF.resolveSrc(meta.bg, baseDir) + "')";
        el.style.backgroundSize = "cover";
        el.style.backgroundPosition = "center";
      }
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
