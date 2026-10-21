const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { importPPTX } = require('./pptx_import.js');

test('importPPTX - simple.pptx conversion', async (t) => {
  const pptxPath = path.join(__dirname, '..', 'samples', 'simple.pptx');
  const outDir = path.join(__dirname, '..', 'samples', 'output_test');
  
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  try {
    const result = await importPPTX(pptxPath, outDir);
    
    assert.ok(typeof result === 'string', '戻り値は文字列であるべき');
    assert.ok(result.includes(':::textbox') || result.includes(':::shape'), 'Markdown形式にtextboxまたはshapeブロックが含まれるべき');
    
    // 自作パース時の固定フォールバック座標 (x: 120, y: 70) がタイトルで使用されていないことを検証
    // OfficeCLIはレイアウトから正しい座標を解き明かすため、この固定値にはならないはず
    const hasFallbackTitleCoordinates = result.includes('x: 120\ny: 70');
    assert.strictEqual(hasFallbackTitleCoordinates, false, 'タイトル座標に固定のフォールバック値 (x: 120, y: 70) が使われていないべき');
  } finally {
    // クリーンアップ
    if (fs.existsSync(outDir)) {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  }
});
