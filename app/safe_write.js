const fs = require("node:fs");
const path = require("node:path");

function writeFileAtomic(filePath, data) {
  const target = path.resolve(filePath);
  const temp = path.join(
    path.dirname(target),
    "." + path.basename(target) + "." + process.pid + "." + Date.now() + ".tmp"
  );
  try {
    fs.writeFileSync(temp, data, "utf8");
    if (fs.readFileSync(temp, "utf8") !== String(data)) {
      throw new Error("一時保存した内容を確認できませんでした。");
    }
    fs.renameSync(temp, target);
  } catch (error) {
    try {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    } catch (_cleanupError) {
      // The original write error is more useful than a cleanup failure.
    }
    throw error;
  }
}

module.exports = { writeFileAtomic };
