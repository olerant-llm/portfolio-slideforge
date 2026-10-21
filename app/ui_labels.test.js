const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const editor = fs.readFileSync(path.join(__dirname, 'editor.js'), 'utf8');

test('source editing and saved JSON labels explain their different roles', () => {
  assert.match(html, /id="btnMd">原稿（Markdown）<\/button>/);
  assert.match(html, /変更はJSON本体へ自動反映されます/);
  assert.match(editor, /保存データを確認（書き換え不可）/);
});
