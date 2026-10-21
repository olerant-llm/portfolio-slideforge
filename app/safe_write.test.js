const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeFileAtomic } = require('./safe_write.js');

test('writeFileAtomic replaces an existing file only after the temporary file is complete', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slideforge-save-'));
  const target = path.join(workDir, 'slides.sf.json');
  fs.writeFileSync(target, 'old', 'utf8');

  writeFileAtomic(target, 'new document');

  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'new document');
  assert.deepStrictEqual(
    fs.readdirSync(workDir).filter((name) => name.endsWith('.tmp')),
    []
  );
});
