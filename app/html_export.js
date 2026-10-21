const fs = require("node:fs");
const path = require("node:path");
const { writeFileAtomic } = require("./safe_write.js");

const DEFAULT_MAX_EMBED_BYTES = 100 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 200 * 1024 * 1024;

const MIME_TYPES = {
  ".aac": "audio/aac",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".m4a": "audio/mp4",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp"
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function localPath(source, baseDir) {
  if (!source || /^(data:|https?:|blob:)/i.test(source)) return null;
  if (/^file:/i.test(source)) {
    try {
      return decodeURIComponent(new URL(source).pathname).replace(/^\/([A-Za-z]:)/, "$1");
    } catch (_error) {
      return null;
    }
  }
  return path.isAbsolute(source) ? source : path.resolve(baseDir || ".", source);
}

function isInsideFolder(filePath, baseDir) {
  const relative = path.relative(path.resolve(baseDir), path.resolve(filePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function hasExpectedSignature(data, extension) {
  const hex = data.subarray(0, 16).toString("hex").toLowerCase();
  if (extension === ".png") return hex.startsWith("89504e47");
  if (extension === ".jpg" || extension === ".jpeg") return hex.startsWith("ffd8ff");
  if (extension === ".gif") return data.subarray(0, 4).toString("ascii") === "GIF8";
  if (extension === ".webp") {
    return data.subarray(0, 4).toString("ascii") === "RIFF" &&
      data.subarray(8, 12).toString("ascii") === "WEBP";
  }
  if (extension === ".svg") {
    const text = data.subarray(0, 512).toString("utf8").trim().toLowerCase();
    return text.startsWith("<svg") || (text.startsWith("<?xml") && text.includes("<svg"));
  }
  if ([".mp4", ".mov", ".m4a"].includes(extension)) {
    return data.subarray(4, 8).toString("ascii") === "ftyp";
  }
  if (extension === ".webm") return hex.startsWith("1a45dfa3");
  if (extension === ".mp3") return data.subarray(0, 3).toString("ascii") === "ID3" || /^ff[ef]/.test(hex);
  if (extension === ".wav") {
    return data.subarray(0, 4).toString("ascii") === "RIFF" &&
      data.subarray(8, 12).toString("ascii") === "WAVE";
  }
  if (extension === ".ogg") return data.subarray(0, 4).toString("ascii") === "OggS";
  if (extension === ".aac") return /^fff[19]/.test(hex);
  return false;
}

function embedFile(source, baseDir, kind, context) {
  const filePath = localPath(source, baseDir);
  if (!filePath) return source;
  if (!isInsideFolder(filePath, baseDir) && !context.allowedExternalPaths.has(path.resolve(filePath))) {
    throw new Error("資料フォルダ外のメディアは単一HTMLへ埋め込めません: " + source);
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error("メディアファイルが見つかりません: " + source);
  }
  const extension = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[extension];
  if (!mime) return source;
  const expectedType = kind === "background" ? "image" : kind;
  if (expectedType && !mime.startsWith(expectedType + "/")) return source;
  const size = fs.statSync(filePath).size;
  if (size > context.maxEmbedBytes) {
    throw new Error("メディアのサイズ上限を超えています: " + source);
  }
  if (context.totalBytes + size > context.maxTotalBytes) {
    throw new Error("埋め込むメディアの合計サイズ上限を超えています。");
  }
  const data = fs.readFileSync(filePath);
  if (!hasExpectedSignature(data, extension)) {
    throw new Error("拡張子と実際のファイル形式が一致しません: " + source);
  }
  context.totalBytes += size;
  return "data:" + mime + ";base64," + data.toString("base64");
}

function embedLocalMedia(document, baseDir, options) {
  const embedded = clone(document);
  const context = {
    maxEmbedBytes: Number.isFinite(options && options.maxEmbedBytes) ?
      options.maxEmbedBytes : DEFAULT_MAX_EMBED_BYTES,
    maxTotalBytes: Number.isFinite(options && options.maxTotalBytes) ?
      options.maxTotalBytes : DEFAULT_MAX_TOTAL_BYTES,
    allowedExternalPaths: new Set(
      (options && options.allowedExternalPaths || []).map(filePath => path.resolve(filePath))
    ),
    totalBytes: 0
  };
  for (const slide of embedded.slides || []) {
    if (slide.meta && slide.meta.bg && !/^#|^rgb/i.test(String(slide.meta.bg))) {
      slide.meta.bg = embedFile(slide.meta.bg, baseDir, "background", context);
    }
    for (const object of slide.objects || []) {
      if (["image", "video", "audio"].includes(object.kind) && object.src) {
        object.src = embedFile(object.src, baseDir, object.kind, context);
      }
    }
  }
  return embedded;
}

function findExternalMediaPaths(document, baseDir) {
  const root = path.resolve(baseDir || ".");
  const found = new Set();
  for (const slide of document && document.slides || []) {
    const sources = [];
    if (slide.meta && slide.meta.bg && !/^#|^rgb/i.test(String(slide.meta.bg))) {
      sources.push(slide.meta.bg);
    }
    for (const object of slide.objects || []) {
      if (["image", "video", "audio"].includes(object.kind) && object.src) sources.push(object.src);
    }
    for (const source of sources) {
      const filePath = localPath(source, root);
      if (filePath && !isInsideFolder(filePath, root)) found.add(path.resolve(filePath));
    }
  }
  return Array.from(found);
}

function safeScriptJSON(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function readAppFile(name) {
  return fs.readFileSync(path.join(__dirname, name), "utf8");
}

function buildStandaloneHTML(document, options) {
  const settings = options || {};
  const baseDir = path.resolve(settings.baseDir || ".");
  const embedded = embedLocalMedia(document, baseDir, settings);
  const css = [
    readAppFile("theme/base.css"),
    readAppFile("theme/custom.css"),
    readAppFile("viewer.css")
  ].join("\n");
  const scripts = [
    readAppFile("document_format.js"),
    readAppFile("parser.js"),
    readAppFile("effects.js"),
    readAppFile("som.js"),
    readAppFile("viewer.js")
  ];

  return [
    "<!DOCTYPE html>",
    '<html lang="ja"><head><meta charset="UTF-8">',
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
    "<title>SlideForge Presentation</title>",
    "<style>", css, "</style></head><body>",
    '<button id="menuBtn" title="メニュー">☰</button>',
    '<div id="sidebar"></div><div id="stage"></div><div id="pageInfo"></div>',
    '<div id="overlay"><div class="viewer-title">SlideForge Viewer</div></div>',
    '<input type="file" id="vfile" accept=".md,.sf.json" hidden>',
    '<div id="printArea"></div>',
    "<script>window.SLIDEFORGE_DOCUMENT=" + safeScriptJSON(embedded) + ";</script>",
    ...scripts.flatMap(function (script) { return ["<script>", script, "</script>"]; }),
    "</body></html>"
  ].join("\n");
}

function exportStandaloneHTML(document, outputPath, options) {
  writeFileAtomic(outputPath, buildStandaloneHTML(document, options));
  return outputPath;
}

module.exports = {
  buildStandaloneHTML,
  embedLocalMedia,
  exportStandaloneHTML,
  findExternalMediaPaths
};
