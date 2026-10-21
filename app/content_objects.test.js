const test = require('node:test');
const assert = require('node:assert');

require('./parser.js');

test('chart data accepts comma, pipe, and colon separated rows', () => {
  assert.deepStrictEqual(globalThis.SF.parseChartData('国語,12\n数学 | 18\n理科: 15'), [
    { label: '国語', value: 12 },
    { label: '数学', value: 18 },
    { label: '理科', value: 15 }
  ]);
});

test('Markdown round trip preserves structured comments', () => {
  require('./generator.js');
  const source = {
    slides: [
      {
        meta: { comments: [{ id: 'c1', text: '確認してください', resolved: false }] },
        objects: []
      }
    ]
  };

  const markdown = globalThis.SF.generate(source);
  const restored = globalThis.SF.parseDocument(markdown);

  assert.deepStrictEqual(restored.slides[0].meta.comments, source.slides[0].meta.comments);
});

test('Markdown rendering escapes active HTML while keeping safe color spans', () => {
  const html = globalThis.SF.renderMarkdown(
    '<img src=x onerror="unsafe()"> <span style="color:#ff0000">赤字</span>'
  );

  assert.match(html, /&lt;img src=x onerror=&quot;unsafe\(\)&quot;&gt;/);
  assert.match(html, /<span style="color:#ff0000">赤字<\/span>/);
  assert.doesNotMatch(html, /<img /);
});

test('Markdown round trip preserves object ids for blocks, media, and loose text', () => {
  require('./generator.js');
  const source = {
    slides: [
      {
        meta: {},
        objects: [
          { id: 'text-1', kind: 'textbox', loose: true, meta: { x: 10 }, content: '本文' },
          { id: 'chart-1', kind: 'chart', meta: { type: 'bar' }, content: 'A,1' },
          { id: 'image-1', kind: 'image', src: 'image.png', meta: { x: 20 }, content: '' }
        ]
      }
    ]
  };

  const restored = globalThis.SF.parseDocument(globalThis.SF.generate(source));

  assert.deepStrictEqual(
    restored.slides[0].objects.map((object) => object.id),
    ['text-1', 'chart-1', 'image-1']
  );
});
