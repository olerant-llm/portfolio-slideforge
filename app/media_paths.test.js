const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { rebaseLocalMedia } = require('./media_paths.js');

test('saving to another folder rebases local media while preserving URL, data, and absolute sources', () => {
  const sourceDir = path.join(process.cwd(), 'source-deck');
  const targetDir = path.join(process.cwd(), 'saved-deck');
  const document = {
    slides: [{ meta: {}, objects: [
      { kind: 'image', src: 'media/photo.png', meta: {} },
      { kind: 'video', src: '../video/clip.mp4', meta: {} },
      { kind: 'audio', src: 'https://example.test/track.mp3', meta: {} },
      { kind: 'image', src: 'data:image/png;base64,AAAA', meta: {} },
      { kind: 'video', src: '', meta: {} },
      { kind: 'image', src: path.join(sourceDir, 'absolute.png'), meta: {} }
    ] }]
  };

  const rebased = rebaseLocalMedia(document, sourceDir, targetDir);
  const objects = rebased.slides[0].objects;
  assert.strictEqual(objects[0].src, path.relative(targetDir, path.join(sourceDir, 'media/photo.png')).replace(/\\/g, '/'));
  assert.strictEqual(objects[1].src, path.relative(targetDir, path.resolve(sourceDir, '../video/clip.mp4')).replace(/\\/g, '/'));
  assert.strictEqual(objects[2].src, 'https://example.test/track.mp3');
  assert.strictEqual(objects[3].src, 'data:image/png;base64,AAAA');
  assert.strictEqual(objects[4].src, '');
  assert.strictEqual(objects[5].src, path.join(sourceDir, 'absolute.png'));
});

test('rebased JSON can be saved and read with the new JSON folder as its base directory', () => {
  const sourceDir = path.join(process.cwd(), 'markdown-source');
  const targetDir = path.join(process.cwd(), 'json-target');
  const document = { slides: [{ meta: {}, objects: [{ kind: 'image', src: 'assets/a.png', meta: {} }] }] };
  const rebased = rebaseLocalMedia(document, sourceDir, targetDir);
  const resolvedFromNewJson = path.resolve(targetDir, rebased.slides[0].objects[0].src);
  assert.strictEqual(resolvedFromNewJson, path.join(sourceDir, 'assets/a.png'));
});

test('a relative Markdown background image is rebased without changing CSS colors or external backgrounds', () => {
  const sourceDir = path.join(process.cwd(), 'markdown-background-source');
  const targetDir = path.join(process.cwd(), 'json-background-target');
  const document = {
    slides: [
      { meta: { bg: 'images/background.jpg' }, objects: [] },
      { meta: { bg: '#102030' }, objects: [] },
      { meta: { bg: 'rgb(1, 2, 3)' }, objects: [] },
      { meta: { bg: 'https://example.test/background.png' }, objects: [] },
      { meta: { bg: '' }, objects: [] }
    ]
  };

  const rebased = rebaseLocalMedia(document, sourceDir, targetDir);
  assert.strictEqual(rebased.slides[0].meta.bg, path.relative(targetDir, path.join(sourceDir, 'images/background.jpg')).replace(/\\/g, '/'));
  assert.strictEqual(rebased.slides[1].meta.bg, '#102030');
  assert.strictEqual(rebased.slides[2].meta.bg, 'rgb(1, 2, 3)');
  assert.strictEqual(rebased.slides[3].meta.bg, 'https://example.test/background.png');
  assert.strictEqual(rebased.slides[4].meta.bg, '');
  assert.strictEqual(path.resolve(targetDir, rebased.slides[0].meta.bg), path.join(sourceDir, 'images/background.jpg'));
});
