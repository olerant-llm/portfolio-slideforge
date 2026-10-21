const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { importPPTX } = require('./pptx_import.js');
const { exportPPTX } = require('./pptx_export.js');

require('./parser.js');

const EXPECTED_TEXTS = [
  'テスト: 游ゴシック',
  'テスト: MS ゴシック',
  'テスト: Arial',
  'テスト: Times New Roman',
  'テスト: メイリオ'
];

function slideEntries(pptxPath) {
  return new AdmZip(pptxPath)
    .getEntries()
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.entryName));
}

test('multitext.pptx survives import, parse, and export round trip', async () => {
  const inputPath = path.join(__dirname, '..', 'samples', 'multitext.pptx');
  const outputDir = path.join(__dirname, '..', 'dist', 'test-roundtrip');
  const outputPath = path.join(outputDir, 'multitext-roundtrip.pptx');
  fs.mkdirSync(outputDir, { recursive: true });

  const inputSlideCount = slideEntries(inputPath).length;
  const markdown = await importPPTX(inputPath, outputDir);
  assert.ok(markdown.includes(':::textbox'), 'インポート結果にtextboxが含まれるべき');

  const parsed = globalThis.SF.parseDocument(markdown);
  assert.strictEqual(parsed.slides.length, inputSlideCount, '解析後のスライド数が入力PPTXと一致するべき');

  const warnings = [];
  const originalWarn = console.warn;
  try {
    console.warn = (...args) => warnings.push(args.map(String).join(' '));
    await exportPPTX(parsed, outputPath, { baseDir: outputDir });
  } finally {
    console.warn = originalWarn;
  }

  assert.ok(
    !warnings.some((warning) => /text1/i.test(warning)),
    `text1を無効色とする警告が出るべきではない: ${warnings.join('\n')}`
  );

  const outputSlides = slideEntries(outputPath);
  assert.strictEqual(outputSlides.length, inputSlideCount, '再出力後のスライド数が入力PPTXと一致するべき');

  const outputXml = outputSlides.map((entry) => entry.getData().toString('utf8')).join('\n');
  for (const expectedText of EXPECTED_TEXTS) {
    assert.ok(outputXml.includes(expectedText), `再出力したPPTXに「${expectedText}」が残るべき`);
  }
});
