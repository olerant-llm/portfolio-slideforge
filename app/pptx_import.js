"use strict";
const AdmZip = require("adm-zip");
const { XMLParser } = require("fast-xml-parser");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

const plainParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function getOfficeCliPath() {
  const exeName = process.platform === 'win32' ? 'officecli.exe' : 'officecli';
  const devPath = path.join(__dirname, '..', 'bin', exeName);
  const unpackedPath = __dirname.replace('app.asar', 'app.asar.unpacked');
  const prodPath = path.join(unpackedPath, '..', 'bin', exeName);
  
  if (fs.existsSync(prodPath)) {
    return prodPath;
  }
  return devPath;
}

function runOfficeCli(args) {
  return new Promise((resolve, reject) => {
    const cliPath = getOfficeCliPath();
    execFile(cliPath, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(stderr || error.message));
      }
      resolve(stdout);
    });
  });
}

function parseToEMU(valueStr) {
  if (valueStr === undefined || valueStr === null) return 0;
  const str = String(valueStr).trim();
  const val = parseFloat(str);
  if (isNaN(val)) return 0;
  
  if (str.endsWith('cm')) return val * 360000;
  if (str.endsWith('in')) return val * 914400;
  if (str.endsWith('pt')) return val * 12700;
  if (str.endsWith('mm')) return val * 36000;
  return val;
}

function toPixelX(valStr, SX) {
  const emu = parseToEMU(valStr);
  return Math.round((emu / 9525) * SX);
}
function toPixelY(valStr, SY) {
  const emu = parseToEMU(valStr);
  return Math.round((emu / 9525) * SY);
}
function toPixelW(valStr, SX) {
  const emu = parseToEMU(valStr);
  return Math.max(1, Math.round((emu / 9525) * SX));
}
function toPixelH(valStr, SY) {
  const emu = parseToEMU(valStr);
  return Math.max(1, Math.round((emu / 9525) * SY));
}

function yv(v) {
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return '"' + String(v).replace(/"/g, '\\"').replace(/\r?\n/g, "\\n") + '"';
}

async function importPPTX(pptxPath, outDir) {
  const zip = new AdmZip(pptxPath);
  const getEntryText = (name) => {
    const e = zip.getEntry(name);
    return e ? e.getData().toString("utf-8") : null;
  };

  const mediaDir = path.join(outDir, "media");
  fs.mkdirSync(mediaDir, { recursive: true });
  const extracted = new Set();
  function extractMedia(entryName) {
    const base = path.basename(entryName);
    if (!extracted.has(base)) {
      const data = zip.readFile(entryName);
      if (data) fs.writeFileSync(path.join(mediaDir, base), data);
      extracted.add(base);
    }
    return "media/" + base;
  }

  // OfficeCLIからJSON構造を取得
  const stdout = await runOfficeCli(['get', pptxPath, '/', '--json']);
  let res;
  try {
    res = JSON.parse(stdout);
  } catch (e) {
    throw new Error("JSONパースエラー: " + e.message + ". stdout: " + stdout);
  }
  const results = res.data.Results || res.data.results;
  if (!res.data || !results || !results.length) {
    throw new Error("PPTXの解析に失敗しました。stdout: " + stdout);
  }
  const deck = results[0];

  const slideWidth = deck.format.slideWidth || '12192000';
  const slideHeight = deck.format.slideHeight || '6858000';
  const cxEMU = slideWidth.endsWith('pt') ? parseFloat(slideWidth) * 12700 : parseFloat(slideWidth);
  const cyEMU = slideHeight.endsWith('pt') ? parseFloat(slideHeight) * 12700 : parseFloat(slideHeight);
  const SX = 1920 / (cxEMU / 9525);
  const SY = 1080 / (cyEMU / 9525);

  const out = [];
  const slides = deck.children.filter(c => c.type === 'slide');

  slides.forEach((slide, si) => {
    const n = slide.path.match(/slide\[(\d+)\]/)[1];

    /* リレーション関係の抽出 (ノート、画像などの元データ探索用) */
    const relsText = getEntryText("ppt/slides/_rels/slide" + n + ".xml.rels");
    const relMap = {};
    let notesTarget = null;
    if (relsText) {
      const rj = plainParser.parse(relsText);
      let rels = rj && rj.Relationships && rj.Relationships.Relationship;
      if (rels && !Array.isArray(rels)) rels = [rels];
      (rels || []).forEach(r => {
        relMap[r["@_Id"]] = r["@_Target"];
        if (String(r["@_Type"]).indexOf("notesSlide") >= 0) notesTarget = r["@_Target"];
      });
    }
    const relToEntry = (target) => "ppt/" + String(target).replace(/^(\.\.\/)+/, "");

    /* Frontmatter (背景色・ノート) */
    const meta = { title: "スライド" + (si + 1) };
    if (slide.format.bg) {
      meta.bg = slide.format.bg;
    }
    if (notesTarget) {
      const noteRaw = getEntryText(relToEntry(notesTarget));
      if (noteRaw) {
        const matches = noteRaw.match(/<a:t>([^<]*)<\/a:t>/g) || [];
        const texts = matches.map(m => m.replace(/<\/?a:t>/g, "")).join("\n").trim();
        if (texts) meta.notes = texts;
      }
    }
    meta.transition = "fade";

    const blocks = [];

    // スライド直下の要素を Z-order 順（zorder プロパティ）でソートして処理する
    const elements = (slide.children || []).sort((a, b) => {
      const az = a.format.zorder || 0;
      const bz = b.format.zorder || 0;
      return az - bz;
    });

    elements.forEach(node => {
      const type = node.type;
      
      const pos = {
        x: toPixelX(node.format.x, SX),
        y: toPixelY(node.format.y, SY),
        w: toPixelW(node.format.width, SX),
        h: toPixelH(node.format.height, SY)
      };

      if (type === 'textbox' || type === 'title' || type === 'subtitle') {
        const text = node.text || '';
        // 空のテキストボックスはスキップ
        if (!text.trim()) return;

        const isTitle = type === 'title' || node.format.isTitle;
        const fontSizeStr = node.format['effective.size'] || (isTitle ? '44pt' : '18pt');
        const fontSize = Math.round((parseFloat(fontSizeStr) * (96 / 72) * SX)); // pt -> px
        const color = node.format['effective.color'] || '#000000';
        const align = node.format['effective.align'] || 'left';
        
        let md = ":::textbox\n";
        md += "x: " + pos.x + "\ny: " + pos.y + "\nw: " + pos.w + "\nh: " + pos.h + "\n";
        md += 'fontFamily: "Noto Sans JP"\n';
        md += "fontSize: " + fontSize + "\n";
        md += "color: " + yv(color) + "\n";
        md += "align: " + yv(align) + "\n---\n";
        
        const lines = text.split('\n').map(l => {
          if (isTitle) return '# ' + l;
          return l;
        });
        md += lines.join("\n") + "\n:::";
        blocks.push(md);

      } else if (type === 'shape') {
        const geom = node.format.geometry || 'rect';
        const shapeType = (geom === 'ellipse' || geom === 'circle') ? 'ellipse' : 'rect';
        const fill = node.format.fill || '#cccccc';
        const stroke = node.format.line || '#000000';
        const strokeWidthStr = node.format.lineWidth || '0pt';
        const strokeWidth = Math.round(parseFloat(strokeWidthStr) * SX) || 0;

        let md = ":::shape\n";
        md += "type: " + yv(shapeType) + "\n";
        md += "x: " + pos.x + "\ny: " + pos.y + "\nw: " + pos.w + "\nh: " + pos.h + "\n";
        md += "fill: " + yv(fill) + "\nstroke: " + yv(stroke) + "\nstrokeWidth: " + strokeWidth + "\n";
        md += "---\n\n:::";
        blocks.push(md);

        // shapeの中にテキストがあれば、そのテキストボックスも重ねて追加する
        if (node.text && node.text.trim()) {
          const fontSizeStr = node.format['effective.size'] || '18pt';
          const fontSize = Math.round((parseFloat(fontSizeStr) * (96 / 72) * SX));
          const color = node.format['effective.color'] || '#000000';
          const align = node.format['effective.align'] || 'center';

          let txMd = ":::textbox\n";
          txMd += "x: " + pos.x + "\ny: " + pos.y + "\nw: " + pos.w + "\nh: " + pos.h + "\n";
          txMd += 'fontFamily: "Noto Sans JP"\n';
          txMd += "fontSize: " + fontSize + "\n";
          txMd += "color: " + yv(color) + "\n";
          txMd += "align: " + yv(align) + "\n---\n";
          txMd += node.text.split('\n').join('\n') + "\n:::";
          blocks.push(txMd);
        }

      } else if (type === 'picture') {
        const mediaType = node.format.mediaType || 'picture';
        const relId = node.format.relId;
        const target = relId && relMap[relId];
        
        if (!target) return;
        const src = extractMedia(relToEntry(target));

        if (mediaType === 'video') {
          blocks.push("![video](" + src + "){x=" + pos.x + " y=" + pos.y + " w=" + pos.w + " h=" + pos.h +
            " autoplay=false loop=false trimStart=0.0 trimEnd=0.0}");
        } else if (mediaType === 'audio') {
          blocks.push("![audio](" + src + "){x=1820 y=40 w=64 h=64 autoplay=false loop=false volume=1.0}");
        } else {
          blocks.push("![image](" + src + "){x=" + pos.x + " y=" + pos.y + " w=" + pos.w + " h=" + pos.h + "}");
        }
      }
    });

    let md = "---\n";
    for (const k of Object.keys(meta)) md += k + ": " + yv(meta[k]) + "\n";
    md += "---\n\n";
    md += blocks.filter(Boolean).join("\n\n");
    out.push(md.replace(/\n+$/, "") + "\n");
  });

  return out.join("\n");
}

module.exports = { importPPTX };
