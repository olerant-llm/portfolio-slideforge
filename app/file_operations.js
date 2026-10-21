const path = require("node:path");

function isSlideForgeJsonPath(filePath) {
  return /\.sf\.json$/i.test(String(filePath || ""));
}

function ensureSfJsonPath(filePath) {
  const value = String(filePath || "");
  if (isSlideForgeJsonPath(value)) return value;
  const extension = path.extname(value);
  return (extension ? value.slice(0, -extension.length) : value) + ".sf.json";
}

module.exports = { ensureSfJsonPath, isSlideForgeJsonPath };
