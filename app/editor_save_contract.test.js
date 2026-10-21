const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'editor.js'), 'utf8');

test('normal Save and Ctrl+S never pass their browser event as Save As', () => {
  assert.match(source, /\$\("#btnSave"\)\.addEventListener\("click", \(\) => saveFile\(false\)\)/);
  assert.match(source, /e\.preventDefault\(\); saveFile\(false\); return/);
  assert.match(source, /\$\("#btnSaveAs"\)\.addEventListener\("click", \(\) => saveFile\(true\)\)/);
});

test('Save flushes typed Markdown before serializing JSON', () => {
  const saveStart = source.indexOf('async function saveFile');
  const payloadStart = source.indexOf('const payload', saveStart);
  assert.ok(source.indexOf('flushPendingMarkdown()', saveStart) >= saveStart);
  assert.ok(source.indexOf('flushPendingMarkdown()', saveStart) < payloadStart);
});

test('PPTX import is an autosaved unsaved document until its first JSON save', () => {
  const importStart = source.indexOf('async function importPptx');
  const importEnd = source.indexOf('async function exportPptx', importStart);
  const importSource = source.slice(importStart, importEnd);
  assert.match(importSource, /SFDocumentLifecycle\.createImportedState\(r\.dir\)/);
});
