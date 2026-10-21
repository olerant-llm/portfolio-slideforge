const test = require('node:test');
const assert = require('node:assert');
const { ensureSfJsonPath, isSlideForgeJsonPath } = require('./file_operations.js');

test('normal editor saves always use the .sf.json extension', () => {
  assert.strictEqual(ensureSfJsonPath('C:/slides/lesson'), 'C:/slides/lesson.sf.json');
  assert.strictEqual(ensureSfJsonPath('C:/slides/lesson.md'), 'C:/slides/lesson.sf.json');
  assert.strictEqual(ensureSfJsonPath('C:/slides/lesson.sf.json'), 'C:/slides/lesson.sf.json');
  assert.strictEqual(isSlideForgeJsonPath('C:/slides/lesson.sf.json'), true);
  assert.strictEqual(isSlideForgeJsonPath('C:/slides/lesson.json'), false);
});
