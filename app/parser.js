/* SlideForge Parser / shared utilities (V3 Markdown spec) */
(function (global) {
  const SF = global.SF || (global.SF = {});
  const MEDIA_RE = /^!\[(?<alt>.*)\]\((?<src>.*)\)\{(?<props>.*)\}\s*$/;
  let uidc = 0;
  function nid() { return "o" + (++uidc) + "_" + Date.now().toString(36); }
  function num(v, d) { const n = parseFloat(v); return isNaN(n) ? d : n; }
  SF.num = num;

  /* ---------- mini YAML (line-based key: value) ---------- */
  function parseScalar(v) {
    if (v === "") return "";
    if (/^".*"$/.test(v)) return v.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
    if (/^[\[{]/.test(v)) {
      try { return JSON.parse(v); } catch (_error) { /* keep as text */ }
    }
    if (v === "true") return true;
    if (v === "false") return false;
    if (/^-?\d+(\.\d+)?$/.test(v)) return parseFloat(v);
    return v;
  }
  function parseYAML(text) {
    const obj = {};
    for (const raw of String(text).split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf(":");
      if (i < 0) continue;
      obj[line.slice(0, i).trim()] = parseScalar(line.slice(i + 1).trim());
    }
    return obj;
  }
  SF.parseYAML = parseYAML;

  /* ---------- inline props {x=0 y=0 ...} ---------- */
  function parseProps(str) {
    const obj = {};
    const re = /([A-Za-z_][\w-]*)=("([^"]*)"|\S+)/g;
    let m;
    while ((m = re.exec(str))) {
      obj[m[1]] = m[3] !== undefined ? parseScalar('"' + m[3] + '"') : parseScalar(m[2]);
    }
    return obj;
  }
  SF.parseProps = parseProps;

  /* ---------- document ---------- */
  function parseDocument(md) {
    const lines = String(md).replace(/\r\n/g, "\n").split("\n");
    const slides = [];
    let i = 0;
    while (i < lines.length) {
      while (i < lines.length && lines[i].trim() === "") i++;
      if (i >= lines.length) break;
      let meta = {};
      if (lines[i].trim() === "---") {
        i++;
        const y = [];
        while (i < lines.length && lines[i].trim() !== "---") { y.push(lines[i]); i++; }
        i++; /* closing --- */
        meta = parseYAML(y.join("\n"));
      }
      const content = [];
      let inBlock = false;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (!inBlock && /^:::[A-Za-z]/.test(t)) { inBlock = true; content.push(lines[i]); i++; continue; }
        if (inBlock && t === ":::") { inBlock = false; content.push(lines[i]); i++; continue; }
        if (!inBlock && t === "---") break; /* next slide frontmatter */
        content.push(lines[i]); i++;
      }
      slides.push({ meta, objects: parseObjects(content) });
    }
    if (!slides.length) slides.push({ meta: { title: "スライド1" }, objects: [] });
    return { slides };
  }
  SF.parseDocument = parseDocument;

  function parseObjects(lines) {
    const objs = [];
    let i = 0, loose = [];
    function flushLoose() {
      const text = loose.join("\n").trim();
      if (text) {
        objs.push({
          id: nid(), kind: "textbox", loose: true,
          meta: { x: 100, y: 100, w: 1720, h: 880, fontSize: 40, align: "left" },
          content: text
        });
      }
      loose = [];
    }
    while (i < lines.length) {
      const t = lines[i].trim();
      const bm = t.match(/^:::([A-Za-z]+)\s*$/);
      if (bm) {
        flushLoose();
        i++;
        const body = [];
        while (i < lines.length && lines[i].trim() !== ":::") { body.push(lines[i]); i++; }
        i++;
        objs.push(parseBlock(bm[1], body));
        continue;
      }
      const mm = t.match(MEDIA_RE);
      if (mm) { flushLoose(); objs.push(parseMedia(mm)); i++; continue; }
      loose.push(lines[i]); i++;
    }
    flushLoose();
    return objs;
  }

  /* Split Limit = 2: ブロック内で最初に出現した --- のみ境界 */
  function parseBlock(type, body) {
    let idx = -1;
    for (let j = 0; j < body.length; j++) {
      if (body[j].trim() === "---") { idx = j; break; }
    }
    let metaLines, contentLines;
    if (idx >= 0) { metaLines = body.slice(0, idx); contentLines = body.slice(idx + 1); }
    else { metaLines = body; contentLines = []; }
    const meta = parseYAML(metaLines.join("\n"));
    const id = meta.id ? String(meta.id) : nid();
    delete meta.id;
    let content = contentLines.join("\n").replace(/^\n+|\n+$/g, "");
    content = content.replace(/(^|\n)\\:::/g, "$1:::"); /* unescape */
    return { id, kind: type, meta, content };
  }

  function parseMedia(m) {
    const g = m.groups || { alt: m[1], src: m[2], props: m[3] };
    const props = parseProps(g.props || "");
    const id = props.id ? String(props.id) : nid();
    delete props.id;
    let kind = "image";
    const ext = (String(g.src).split("?")[0].split(".").pop() || "").toLowerCase();
    if (g.alt === "video" || ["mp4", "webm", "mov"].includes(ext)) kind = "video";
    else if (g.alt === "audio" || ["mp3", "wav", "ogg", "m4a"].includes(ext)) kind = "audio";
    return { id, kind, src: g.src, alt: g.alt, meta: props, content: "" };
  }

  /* ---------- animation helpers ---------- */
  SF.parseAnim = function (s) {
    if (!s) return null;
    const p = String(s).split(":");
    if (!p[0] || p[0] === "none") return null;
    return { type: p[0], delay: num(p[1], 0), duration: num(p[2], 0.5) };
  };
  SF.getAnim = function (o) {
    if (o.kind === "animate") {
      return { type: o.meta.type || "fade-in", delay: num(o.meta.delay, 0), duration: num(o.meta.duration, 0.5) };
    }
    return SF.parseAnim(o.meta && o.meta.animation);
  };

  SF.parseChartData = function (source) {
    const rows = [];
    String(source || "").split(/\r?\n/).forEach(function (line) {
      const trimmed = line.trim();
      if (!trimmed) return;
      const parts = trimmed.split(/\s*(?:,|\||:|\t)\s*/);
      if (parts.length < 2) return;
      const value = Number(parts[parts.length - 1]);
      if (!Number.isFinite(value)) return;
      rows.push({ label: parts.slice(0, -1).join(" "), value });
    });
    return rows;
  };

  /* ---------- mini markdown renderer ---------- */
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function basicInline(value) {
    return escapeHtml(value)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }
  function inline(s) {
    const spans = [];
    const source = String(s).replace(
      /<span\s+style=["']\s*color\s*:\s*(#[0-9a-f]{3,8}|[a-z]{1,20})\s*;?\s*["']\s*>(.*?)<\/span>/gi,
      function (_match, color, content) {
        const token = "\u0000SFSPAN" + spans.length + "\u0000";
        spans.push('<span style="color:' + color + '">' + basicInline(content) + "</span>");
        return token;
      }
    );
    let rendered = basicInline(source);
    spans.forEach(function (span, index) {
      rendered = rendered.split("\u0000SFSPAN" + index + "\u0000").join(span);
    });
    return rendered;
  }
  function tableHtml(rows) {
    let h = "<table>";
    rows.forEach(function (r, ri) {
      if (/^\|[\s:|-]+\|$/.test(r)) return;
      const cells = r.slice(1, -1).split("|");
      const tg = ri === 0 ? "th" : "td";
      h += "<tr>" + cells.map(c => "<" + tg + ">" + inline(c.trim()) + "</" + tg + ">").join("") + "</tr>";
    });
    return h + "</table>";
  }
  SF.renderMarkdown = function (src) {
    const lines = String(src || "").split(/\r?\n/);
    let html = "", i = 0, list = false;
    const closeList = () => { if (list) { html += "</ul>"; list = false; } };
    while (i < lines.length) {
      const t = lines[i].trim();
      if (t.startsWith("|") && t.endsWith("|") && t.length > 1) {
        closeList();
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(lines[i].trim()); i++; }
        html += tableHtml(rows);
        continue;
      }
      let m;
      if ((m = t.match(/^(#{1,4})\s+(.*)$/))) {
        closeList();
        const l = m[1].length;
        html += "<h" + l + ">" + inline(m[2]) + "</h" + l + ">";
      } else if ((m = t.match(/^[-*]\s+(.*)$/))) {
        if (!list) { html += "<ul>"; list = true; }
        html += "<li>" + inline(m[1]) + "</li>";
      } else if (t === "") {
        closeList();
      } else {
        closeList();
        html += "<p>" + inline(t) + "</p>";
      }
      i++;
    }
    closeList();
    return html;
  };

  /* ---------- media path resolution ---------- */
  SF.resolveSrc = function (src, baseDir) {
    if (!src) return "";
    if (/^(data:|https?:|file:|blob:)/.test(src)) return src;
    if (/^[A-Za-z]:[\\/]/.test(src) || src.startsWith("/")) return "file://" + src.replace(/\\/g, "/");
    if (baseDir) return "file://" + (baseDir.replace(/\\/g, "/") + "/" + src).replace(/([^:])\/{2,}/g, "$1/");
    return src;
  };
})(typeof window !== "undefined" ? window : globalThis);
