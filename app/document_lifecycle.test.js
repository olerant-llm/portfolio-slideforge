const test = require('node:test');
const assert = require('node:assert');
const {
  createNewState,
  createOpenedState,
  markChanged,
  markSaved,
  hasRecoveryCandidate,
  getStatusText,
  getDocumentInfo
} = require('./document_lifecycle.js');

test('Markdown and PowerPoint sources become unsaved new documents', () => {
  for (const sourceFormat of ['markdown', 'pptx']) {
    const state = createOpenedState({
      sourceFormat,
      filePath: 'C:/source/original.' + (sourceFormat === 'pptx' ? 'pptx' : 'md'),
      baseDir: 'C:/source'
    });

    assert.strictEqual(state.filePath, '');
    assert.strictEqual(state.baseDir, 'C:/source');
    assert.strictEqual(state.dirty, false);
    assert.strictEqual(state.hasAutosave, true);
    assert.strictEqual(hasRecoveryCandidate(state), true);
    assert.match(getStatusText(state), /未保存の新規資料/);
    assert.match(getStatusText(state), /内部自動保存済み/);
  }
});

test('JSON opens as a saved document and edits show internal autosave separately', () => {
  const opened = createOpenedState({
    sourceFormat: 'json',
    filePath: 'C:/slides/lesson.sf.json',
    baseDir: 'C:/slides',
    savedAt: '2026-07-29T10:00:00.000Z'
  });
  assert.match(getStatusText(opened), /保存済み/);

  const changed = markChanged(opened, '2026-07-29T10:01:00.000Z');
  assert.strictEqual(changed.dirty, true);
  assert.strictEqual(changed.hasAutosave, true);
  assert.match(getStatusText(changed), /未保存の変更あり/);
  assert.match(getStatusText(changed), /内部自動保存済み/);

  const saved = markSaved(changed, {
    filePath: 'C:/slides/renamed.sf.json',
    baseDir: 'C:/slides',
    savedAt: '2026-07-29T10:02:00.000Z'
  });
  assert.strictEqual(saved.dirty, false);
  assert.strictEqual(saved.hasAutosave, false);
  assert.strictEqual(hasRecoveryCandidate(saved), false);
  assert.match(getStatusText(saved), /保存済み/);
  assert.match(getStatusText(saved), /renamed\.sf\.json/);
});

test('only unsaved changes remain eligible for startup recovery', () => {
  const fresh = createNewState('C:/slides');
  const changed = markChanged(fresh, '2026-07-29T10:01:00.000Z');
  assert.strictEqual(hasRecoveryCandidate(fresh), false);
  assert.strictEqual(hasRecoveryCandidate(changed), true);
  assert.strictEqual(hasRecoveryCandidate(markSaved(changed, { filePath: 'C:/slides/a.sf.json', baseDir: 'C:/slides' })), false);
});

test('the save result keeps its directory even when it uses the IPC dir field', () => {
  const state = markSaved(createNewState('C:/source'), {
    filePath: 'C:/saved/lesson.sf.json', dir: 'C:/saved', savedAt: '2026-07-29T10:03:00.000Z'
  });
  assert.strictEqual(state.baseDir, 'C:/saved');
});

test('document information counts slides, media, comments, and JSON version', () => {
  const info = getDocumentInfo({
    slides: [
      {
        meta: { comments: [{ text: '確認' }, { text: '完了' }] },
        objects: [{ kind: 'image' }, { kind: 'video' }, { kind: 'audio' }]
      },
      { meta: {}, objects: [{ kind: 'image' }] }
    ]
  }, { filePath: '', lastSavedAt: '' }, 1);

  assert.deepStrictEqual(info, {
    filePath: '', lastSavedAt: '', slides: 2, images: 2, videos: 1, audios: 1,
    comments: 2, jsonVersion: 1
  });
});

test('new state has no inherited path to overwrite', () => {
  const state = createNewState('C:/media');
  assert.deepStrictEqual(state, {
    filePath: '', baseDir: 'C:/media', lastSavedAt: '', dirty: false, hasAutosave: false
  });
});
