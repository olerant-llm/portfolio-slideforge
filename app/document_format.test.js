const test = require('node:test');
const assert = require('node:assert');
const {
  FORMAT_NAME,
  SCHEMA_VERSION,
  createDocumentFile,
  migrateDocumentFile,
  parseDocumentFile,
  serializeDocument
} = require('./document_format.js');

test('SlideForge JSON wraps the editable document with format information', () => {
  const source = {
    slides: [
      {
        meta: {
          title: '授業案',
          comments: [{ id: 'c1', text: '導入を短くする', resolved: false }]
        },
        objects: [
          {
            id: 'chart1',
            kind: 'chart',
            meta: { type: 'bar', x: 10, y: 20, w: 800, h: 420 },
            content: '国語,12\n数学,18'
          }
        ]
      }
    ]
  };

  const file = createDocumentFile(source);

  assert.strictEqual(file.format, FORMAT_NAME);
  assert.strictEqual(file.version, SCHEMA_VERSION);
  assert.deepStrictEqual(file.document, source);
});

test('SlideForge JSON round trip preserves comments and chart data', () => {
  const source = {
    slides: [
      {
        meta: { comments: [{ id: 'c1', text: '確認', resolved: true }] },
        objects: [{ id: 'chart1', kind: 'chart', meta: { type: 'line' }, content: 'A,1\nB,2' }]
      }
    ]
  };

  const restored = parseDocumentFile(serializeDocument(source));

  assert.deepStrictEqual(restored, source);
});

test('invalid SlideForge JSON is rejected with a readable error', () => {
  assert.throws(
    () => parseDocumentFile('{"format":"slideforge","version":1,"document":{"slides":"bad"}}'),
    /slides/
  );
});

test('an older SlideForge JSON is passed through the version migration entry point', () => {
  const oldFile = {
    format: FORMAT_NAME,
    version: 0,
    document: {
      slides: [{ meta: { title: '旧資料' }, objects: [] }]
    }
  };

  const migrated = migrateDocumentFile(oldFile);

  assert.strictEqual(migrated.version, SCHEMA_VERSION);
  assert.deepStrictEqual(parseDocumentFile(JSON.stringify(oldFile)), oldFile.document);
});

test('empty or incomplete documents are rejected before autosave', () => {
  assert.throws(
    () => parseDocumentFile('{"format":"slideforge","version":1,"document":{"slides":[]}}'),
    /at least one slide/
  );
  assert.throws(
    () => parseDocumentFile('{"format":"slideforge","version":1,"document":{"slides":[{"meta":[],"objects":[]}]}}'),
    /meta/
  );
  assert.throws(
    () => parseDocumentFile('{"format":"slideforge","version":1,"document":{"slides":[{"meta":{},"objects":[{"kind":"","meta":{}}]}]}}'),
    /kind/
  );
});
