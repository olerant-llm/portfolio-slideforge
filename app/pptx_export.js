const path = require('path');
const fs = require('fs');
const { fileURLToPath } = require('url');

const SLIDE_WIDTH_PX = 1920;
const SLIDE_HEIGHT_PX = 1080;

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function pixelsToInches(px) {
  return finiteNumber(px, 0) / 144;
}

function pixelsToPoints(px) {
  return finiteNumber(px, 0) * 0.75;
}

function pptxColor(value, fallback) {
  const color = String(value || fallback || '').trim().replace(/^#/, '');
  const lower = color.toLowerCase();
  const schemeColors = {
    text1: 'tx1',
    text2: 'tx2',
    background1: 'bg1',
    background2: 'bg2'
  };
  if (schemeColors[lower]) return schemeColors[lower];
  if (/^accent[1-6]$/.test(lower)) return lower;
  if (/^[0-9a-f]{6}$/i.test(color)) return color.toUpperCase();
  return color;
}

function cssColor(value) {
  const color = String(value || '').trim().replace(/;$/, '').trim().toLowerCase();
  const shortHex = color.match(/^#([0-9a-f]{3})$/);
  if (shortHex) {
    return shortHex[1].split('').map((digit) => digit + digit).join('').toUpperCase();
  }
  const longHex = color.match(/^#([0-9a-f]{6})$/);
  if (longHex) return longHex[1].toUpperCase();

  const namedColors = {
    red: 'FF0000',
    black: '000000',
    white: 'FFFFFF',
    blue: '0000FF',
    green: '008000',
    yellow: 'FFFF00',
    gray: '808080',
    grey: '808080'
  };
  return namedColors[color] || null;
}

function plainText(content) {
  return String(content || '')
    .replace(/<[^>]*>/g, '')
    .replace(/^#{1,6}[ \t]+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2')
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1$2')
    .replace(/`([^`\n]+)`/g, '$1');
}

function richText(content, meta) {
  const source = String(content || '');
  const colorSpanPattern = /<span\b[^>]*style=["'][^"']*color\s*:\s*([^;"']+)\s*;?[^"']*["'][^>]*>(.*?)<\/span>/gis;
  const withoutColorSpans = source.replace(colorSpanPattern, '$2');
  const hasUnsupportedTag = /<[^>]+>/.test(withoutColorSpans);
  const recognizedSpans = Array.from(source.matchAll(new RegExp(colorSpanPattern.source, colorSpanPattern.flags)))
    .some((match) => cssColor(match[1]));
  const hasRichFormatting = /^#{1,6}[ \t]+/m.test(source) || /\*\*[^*]+\*\*/.test(source) || recognizedSpans;

  if (hasUnsupportedTag || !hasRichFormatting) return plainText(source);

  const baseSize = pixelsToPoints(finiteNumber(meta && meta.fontSize, 24));
  const headingScale = [1, 1.5, 1.3, 1.15, 1, 1, 1];
  const lines = source.split(/\r?\n/);
  const runs = [];

  lines.forEach((line, lineIndex) => {
    const heading = line.match(/^(#{1,6})[ \t]+(.*)$/);
    const level = heading ? heading[1].length : 0;
    const lineText = heading ? heading[2] : line;
    const fontSize = baseSize * headingScale[level];
    const tokenPattern = /(\*\*([^*\n]+)\*\*|<span\b[^>]*style=["'][^"']*color\s*:\s*([^;"']+)\s*;?[^"']*["'][^>]*>(.*?)<\/span>)/gi;
    let cursor = 0;
    let match;

    while ((match = tokenPattern.exec(lineText))) {
      if (match.index > cursor) {
        runs.push({ text: plainText(lineText.slice(cursor, match.index)), options: { fontSize } });
      }
      if (match[2] !== undefined) {
        runs.push({ text: plainText(match[2]), options: { fontSize, bold: true } });
      } else {
        const color = cssColor(match[3]);
        const options = { fontSize };
        if (color) options.color = color;
        runs.push({ text: plainText(match[4]), options });
      }
      cursor = tokenPattern.lastIndex;
    }

    if (cursor < lineText.length) {
      runs.push({ text: plainText(lineText.slice(cursor)), options: { fontSize } });
    }
    if (cursor === 0 && lineText.length === 0) {
      runs.push({ text: '', options: { fontSize } });
    }
    if (lineIndex < lines.length - 1 && runs.length) {
      runs[runs.length - 1].options.breakLine = true;
    }
  });

  return runs;
}

function resolveImagePath(src, baseDir, kind = 'image') {
  const value = String(src || '').trim();
  if (!value) {
    throw new Error(`PPTX export: ${kind} source is empty`);
  }
  if (/^(https?:|data:|blob:)/i.test(value)) {
    throw new Error(`PPTX export: offline export does not support ${kind} source "${value}"`);
  }
  if (/^file:/i.test(value)) {
    return fileURLToPath(value);
  }
  if (path.isAbsolute(value)) {
    return value;
  }
  return path.resolve(baseDir, value);
}

function textOptions(meta) {
  const source = meta || {};
  return {
    x: pixelsToInches(finiteNumber(source.x, 0)),
    y: pixelsToInches(finiteNumber(source.y, 0)),
    w: pixelsToInches(finiteNumber(source.w, SLIDE_WIDTH_PX)),
    h: pixelsToInches(finiteNumber(source.h, SLIDE_HEIGHT_PX)),
    fontFace: String(source.fontFamily || 'Arial'),
    fontSize: pixelsToPoints(finiteNumber(source.fontSize, 24)),
    color: pptxColor(source.color, '000000'),
    align: String(source.align || 'left')
  };
}

function imageOptions(object, baseDir) {
  const meta = object.meta || {};
  return {
    path: resolveImagePath(object.src, baseDir, object.kind || 'image'),
    x: pixelsToInches(finiteNumber(meta.x, 0)),
    y: pixelsToInches(finiteNumber(meta.y, 0)),
    w: pixelsToInches(finiteNumber(meta.w, SLIDE_WIDTH_PX)),
    h: pixelsToInches(finiteNumber(meta.h, SLIDE_HEIGHT_PX))
  };
}

function shapeOptions(meta) {
  const source = meta || {};
  const options = {
    x: pixelsToInches(finiteNumber(source.x, 0)),
    y: pixelsToInches(finiteNumber(source.y, 0)),
    w: pixelsToInches(finiteNumber(source.w, SLIDE_WIDTH_PX)),
    h: pixelsToInches(finiteNumber(source.h, SLIDE_HEIGHT_PX))
  };
  if (source.fill) {
    options.fill = { color: pptxColor(source.fill) };
  }
  if (source.stroke || source.strokeWidth !== undefined) {
    options.line = {};
    if (source.stroke) options.line.color = pptxColor(source.stroke);
    if (source.strokeWidth !== undefined) {
      options.line.width = finiteNumber(source.strokeWidth, 0);
    }
  }
  return options;
}

function mediaOptions(object, baseDir) {
  const options = imageOptions(object, baseDir);
  return { type: object.kind, ...options };
}

function objectGeometry(meta) {
  const source = meta || {};
  return {
    x: pixelsToInches(finiteNumber(source.x, 0)),
    y: pixelsToInches(finiteNumber(source.y, 0)),
    w: pixelsToInches(finiteNumber(source.w, SLIDE_WIDTH_PX)),
    h: pixelsToInches(finiteNumber(source.h, SLIDE_HEIGHT_PX))
  };
}

function tableRows(content) {
  return String(content || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && line.endsWith('|'))
    .filter((line) => !/^\|[\s:|-]+\|$/.test(line))
    .map((line) => line.slice(1, -1).split('|').map((cell) => plainText(cell.trim())));
}

function chartRows(content) {
  const rows = [];
  for (const line of String(content || '').split(/\r?\n/)) {
    const parts = line.trim().split(/\s*(?:,|\||:|\t)\s*/);
    if (parts.length < 2) continue;
    const value = Number(parts[parts.length - 1]);
    if (!Number.isFinite(value)) continue;
    rows.push({ label: parts.slice(0, -1).join(' '), value });
  }
  return rows;
}

function addChartShapes(slide, presentation, object) {
  const rows = chartRows(object.content);
  if (!rows.length) return;
  const geometry = objectGeometry(object.meta);
  const shapeTypes = presentation.ShapeType || {};
  const lineType = shapeTypes.line || 'line';
  const rectType = shapeTypes.rect || 'rect';
  const ellipseType = shapeTypes.ellipse || 'ellipse';
  const color = pptxColor(object.meta && object.meta.color, '2563EB');
  const max = Math.max(...rows.map((row) => Math.max(0, row.value))) || 1;
  const left = geometry.x + geometry.w * 0.1;
  const plotWidth = geometry.w * 0.8;
  const plotHeight = geometry.h * 0.68;
  const baseY = geometry.y + geometry.h * 0.78;
  const slot = plotWidth / rows.length;

  slide.addShape(lineType, {
    x: left,
    y: baseY,
    w: plotWidth,
    h: 0,
    line: { color: '94A3B8', width: 1.5 }
  });

  const isLine = object.meta && object.meta.type === 'line';
  const points = rows.map((row, index) => ({
    x: left + slot * index + slot / 2,
    y: baseY - (Math.max(0, row.value) / max) * plotHeight
  }));

  if (isLine) {
    for (let index = 0; index < points.length - 1; index++) {
      const from = points[index];
      const to = points[index + 1];
      slide.addShape(lineType, {
        x: from.x,
        y: Math.min(from.y, to.y),
        w: to.x - from.x,
        h: Math.abs(to.y - from.y),
        flipV: to.y < from.y,
        line: { color, width: 2.5 }
      });
    }
    points.forEach((point) => {
      slide.addShape(ellipseType, {
        x: point.x - 0.07,
        y: point.y - 0.07,
        w: 0.14,
        h: 0.14,
        fill: { color },
        line: { color, transparency: 100 }
      });
    });
  } else {
    rows.forEach((row, index) => {
      const barHeight = (Math.max(0, row.value) / max) * plotHeight;
      const barWidth = Math.max(0.08, slot * 0.58);
      slide.addShape(rectType, {
        x: left + slot * index + (slot - barWidth) / 2,
        y: baseY - barHeight,
        w: barWidth,
        h: barHeight,
        fill: { color },
        line: { color, transparency: 100 }
      });
    });
  }

  rows.forEach((row, index) => {
    if (!object.meta || object.meta.showValues !== false) {
      slide.addText(String(row.value), {
        x: left + slot * index,
        y: Math.max(geometry.y, points[index].y - 0.28),
        w: slot,
        h: 0.25,
        align: 'center',
        fontSize: 12,
        color: '0F172A',
        margin: 0
      });
    }
    slide.addText(row.label, {
      x: left + slot * index,
      y: baseY + 0.04,
      w: slot,
      h: Math.max(0.25, geometry.h * 0.12),
      align: 'center',
      fontSize: 12,
      color: '334155',
      margin: 0
    });
  });
}

function fixPresentationXml(xml) {
  const source = String(xml || '');
  const notesMatch = source.match(/<p:notesMasterIdLst>[\s\S]*?<\/p:notesMasterIdLst>/);
  const slideListIndex = source.indexOf('<p:sldIdLst>');
  if (!notesMatch || slideListIndex < 0 || notesMatch.index < slideListIndex) return source;
  const withoutNotes = source.slice(0, notesMatch.index) +
    source.slice(notesMatch.index + notesMatch[0].length);
  const insertAt = withoutNotes.indexOf('<p:sldIdLst>');
  return withoutNotes.slice(0, insertAt) + notesMatch[0] + withoutNotes.slice(insertAt);
}

function repairPresentationOrder(outputPath) {
  if (!fs.existsSync(outputPath)) return;
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(outputPath);
  const entryName = 'ppt/presentation.xml';
  const entry = zip.getEntry(entryName);
  if (!entry) return;
  const source = entry.getData().toString('utf8');
  const fixed = fixPresentationXml(source);
  if (fixed === source) return;
  zip.updateFile(entryName, Buffer.from(fixed, 'utf8'));
  zip.writeZip(outputPath);
}

async function exportPPTX(document, outputPath, options = {}) {
  const PptxGenJS = options.PptxGenJS || require('pptxgenjs');
  const presentation = new PptxGenJS();
  const slides = document && Array.isArray(document.slides) ? document.slides : [];
  const baseDir = options.baseDir || path.dirname(path.resolve(outputPath));

  presentation.layout = 'LAYOUT_WIDE';

  for (const sourceSlide of slides) {
    const slideData = sourceSlide || {};
    const meta = slideData.meta || {};
    const slide = presentation.addSlide();

    slide.background = { color: pptxColor(meta.bg, 'FFFFFF') };

    for (const object of Array.isArray(slideData.objects) ? slideData.objects : []) {
      if (object && (object.kind === 'textbox' || object.kind === 'animate')) {
        slide.addText(richText(object.content, object.meta), textOptions(object.meta));
      } else if (object && object.kind === 'image') {
        slide.addImage(imageOptions(object, baseDir));
      } else if (object && object.kind === 'shape') {
        const shapeTypes = presentation.ShapeType || {};
        const shapeType = shapeTypes[object.meta && object.meta.type] || shapeTypes.rect || 'rect';
        slide.addShape(shapeType, shapeOptions(object.meta));
      } else if (object && (object.kind === 'video' || object.kind === 'audio')) {
        slide.addMedia(mediaOptions(object, baseDir));
      } else if (object && object.kind === 'table') {
        const rows = tableRows(object.content);
        if (rows.length) {
          slide.addTable(rows, {
            ...objectGeometry(object.meta),
            fontFace: String((object.meta && object.meta.fontFamily) || 'Arial'),
            fontSize: pixelsToPoints(finiteNumber(object.meta && object.meta.fontSize, 24)),
            border: { type: 'solid', color: 'CBD5E1', pt: 1 },
            fill: 'FFFFFF',
            color: '1F2937'
          });
        }
      } else if (object && object.kind === 'chart') {
        addChartShapes(slide, presentation, object);
      }
    }

    if (meta.notes !== undefined && meta.notes !== null && String(meta.notes).trim()) {
      slide.addNotes(String(meta.notes));
    }
  }

  await presentation.writeFile({ fileName: outputPath });
  repairPresentationOrder(outputPath);
  return outputPath;
}

module.exports = {
  pixelsToInches,
  pixelsToPoints,
  fixPresentationXml,
  exportPPTX
};
