const path = require("node:path");

function isExternalOrAbsolute(source) {
  const value = String(source || "");
  return /^(data:|https?:|file:|blob:)/i.test(value) || path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value);
}

function isRelativeBackgroundImage(source) {
  const value = String(source || "").trim();
  if (!value || isExternalOrAbsolute(value)) return false;
  if (/^(#|(?:rgb|hsl)a?\(|(?:linear|radial)-gradient\()/i.test(value)) return false;
  return /[\\/]|\.(?:png|jpe?g|gif|webp|svg|bmp|avif)(?:[?#].*)?$/i.test(value);
}

function rebaseRelativePath(source, sourceBaseDir, targetBaseDir) {
  return path.relative(targetBaseDir, path.resolve(sourceBaseDir, source)).replace(/\\/g, "/");
}

function rebaseLocalMedia(document, sourceBaseDir, targetBaseDir) {
  const copy = JSON.parse(JSON.stringify(document));
  if (!sourceBaseDir || !targetBaseDir) return copy;
  (copy.slides || []).forEach(function (slide) {
    if (slide && slide.meta && isRelativeBackgroundImage(slide.meta.bg)) {
      slide.meta.bg = rebaseRelativePath(slide.meta.bg, sourceBaseDir, targetBaseDir);
    }
    (slide.objects || []).forEach(function (object) {
      if (!object || !["image", "video", "audio"].includes(object.kind) || !String(object.src || "").trim() || isExternalOrAbsolute(object.src)) return;
      object.src = rebaseRelativePath(object.src, sourceBaseDir, targetBaseDir);
    });
  });
  return copy;
}

module.exports = { rebaseLocalMedia, isExternalOrAbsolute, isRelativeBackgroundImage };
