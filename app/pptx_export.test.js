const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

function loadExporter() {
  return require('./pptx_export.js');
}

class FakeSlide {
  constructor() {
    this.background = null;
    this.texts = [];
    this.images = [];
    this.shapes = [];
    this.media = [];
    this.tables = [];
    this.charts = [];
    this.notes = [];
    this.calls = [];
  }

  addText(text, options) {
    this.texts.push({ text, options });
    this.calls.push({ method: 'addText', value: text });
    return this;
  }

  addImage(options) {
    this.images.push(options);
    this.calls.push({ method: 'addImage', value: options });
    return this;
  }

  addShape(shapeType, options) {
    this.shapes.push({ shapeType, options });
    this.calls.push({ method: 'addShape', value: { shapeType, options } });
    return this;
  }

  addMedia(options) {
    this.media.push(options);
    this.calls.push({ method: 'addMedia', value: options });
    return this;
  }

  addTable(rows, options) {
    this.tables.push({ rows, options });
    this.calls.push({ method: 'addTable', value: { rows, options } });
    return this;
  }

  addChart(chartType, data, options) {
    this.charts.push({ chartType, data, options });
    this.calls.push({ method: 'addChart', value: { chartType, data, options } });
    return this;
  }

  addNotes(notes) {
    this.notes.push(notes);
    return this;
  }
}

class FakePptxGenJS {
  static instances = [];

  constructor() {
    this.layout = null;
    this.ShapeType = { rect: 'rect', ellipse: 'ellipse' };
    this.ChartType = { bar: 'bar', line: 'line' };
    this.slides = [];
    this.writes = [];
    FakePptxGenJS.instances.push(this);
  }

  addSlide() {
    const slide = new FakeSlide();
    this.slides.push(slide);
    return slide;
  }

  async writeFile(options) {
    this.writes.push(options);
    return options.fileName;
  }
}

function resetFake() {
  FakePptxGenJS.instances.length = 0;
}

function readableText(value) {
  if (Array.isArray(value)) {
    return value
      .map((run) => run.text + (run.options && run.options.breakLine ? '\n' : ''))
      .join('')
      .replace(/\n$/, '');
  }
  return String(value);
}

test('pixelsToInches and pixelsToPoints convert SlideForge coordinates', () => {
  const { pixelsToInches, pixelsToPoints } = loadExporter();

  assert.strictEqual(pixelsToInches(144), 1);
  assert.strictEqual(pixelsToInches(1920), 1920 / 144);
  assert.strictEqual(pixelsToPoints(32), 24);
});

test('fixPresentationXml places the notes master before the slide list', () => {
  const { fixPresentationXml } = loadExporter();
  const source = [
    '<p:presentation>',
    '<p:sldMasterIdLst></p:sldMasterIdLst>',
    '<p:sldIdLst></p:sldIdLst>',
    '<p:notesMasterIdLst></p:notesMasterIdLst>',
    '<p:sldSz/>',
    '</p:presentation>'
  ].join('');

  const fixed = fixPresentationXml(source);

  assert.ok(fixed.indexOf('<p:notesMasterIdLst>') < fixed.indexOf('<p:sldIdLst>'));
});

test('exportPPTX creates slides with background, plain text, and converted geometry', async () => {
  resetFake();
  const { exportPPTX } = loadExporter();
  const document = {
    slides: [
      {
        meta: { bg: '#112233' },
        objects: [
          {
            kind: 'textbox',
            meta: {
              x: 144,
              y: 288,
              w: 720,
              h: 360,
              fontFamily: 'Noto Sans JP',
              fontSize: 32,
              color: '#445566',
              align: 'center'
            },
            content: 'Plain slide text'
          }
        ]
      },
      { meta: { bg: '#FFFFFF' }, objects: [] }
    ]
  };

  await exportPPTX(document, 'deck.pptx', { PptxGenJS: FakePptxGenJS });

  assert.strictEqual(FakePptxGenJS.instances.length, 1);
  const presentation = FakePptxGenJS.instances[0];
  assert.strictEqual(presentation.layout, 'LAYOUT_WIDE');
  assert.strictEqual(presentation.slides.length, 2);
  assert.deepStrictEqual(presentation.slides[0].background, { color: '112233' });
  assert.deepStrictEqual(presentation.slides[0].texts, [
    {
      text: 'Plain slide text',
      options: {
        x: 1,
        y: 2,
        w: 5,
        h: 2.5,
        fontFace: 'Noto Sans JP',
        fontSize: 24,
        color: '445566',
        align: 'center'
      }
    }
  ]);
});

test('exportPPTX adds speaker notes and a resolved image before writing the file', async () => {
  resetFake();
  const { exportPPTX } = loadExporter();
  const baseDir = path.join('C:', 'presentations', 'lesson');
  const outputPath = path.join(baseDir, 'lesson.pptx');
  const document = {
    slides: [
      {
        meta: { notes: 'Presenter script' },
        objects: [
          {
            kind: 'image',
            src: 'images/picture.png',
            meta: { x: 0, y: 144, w: 288, h: 432 }
          }
        ]
      }
    ]
  };

  await exportPPTX(document, outputPath, {
    PptxGenJS: FakePptxGenJS,
    baseDir
  });

  const presentation = FakePptxGenJS.instances[0];
  assert.deepStrictEqual(presentation.slides[0].notes, ['Presenter script']);
  assert.deepStrictEqual(presentation.slides[0].images, [
    {
      path: path.resolve(baseDir, 'images/picture.png'),
      x: 0,
      y: 1,
      w: 2,
      h: 3
    }
  ]);
  assert.deepStrictEqual(presentation.writes, [{ fileName: outputPath }]);
});

test('exportPPTX keeps decorated textbox content as plain readable text', async () => {
  resetFake();
  const { exportPPTX } = loadExporter();
  const document = {
    slides: [
      {
        meta: {},
        objects: [
          {
            kind: 'textbox',
            meta: { x: 0, y: 0, w: 720, h: 360 },
            content: '# 見出し\n**太字**と<span style="color:#f00">色付き</span>'
          }
        ]
      }
    ]
  };

  await exportPPTX(document, 'decorated.pptx', { PptxGenJS: FakePptxGenJS });

  assert.strictEqual(
    readableText(FakePptxGenJS.instances[0].slides[0].texts[0].text),
    '見出し\n太字と色付き'
  );
});

test('exportPPTX renders animate content as a static textbox at the same geometry', async () => {
  resetFake();
  const { exportPPTX } = loadExporter();
  const document = {
    slides: [
      {
        meta: {},
        objects: [
          {
            kind: 'animate',
            meta: { x: 144, y: 288, w: 432, h: 576, type: 'fade-in' },
            content: 'Static fallback text'
          }
        ]
      }
    ]
  };

  await exportPPTX(document, 'animation.pptx', { PptxGenJS: FakePptxGenJS });

  const texts = FakePptxGenJS.instances[0].slides[0].texts;
  assert.strictEqual(texts.length, 1);
  assert.strictEqual(texts[0].text, 'Static fallback text');
  assert.deepStrictEqual(
    { x: texts[0].options.x, y: texts[0].options.y, w: texts[0].options.w, h: texts[0].options.h },
    { x: 1, y: 2, w: 3, h: 4 }
  );
});

test('exportPPTX converts Markdown and span styling into rich text runs', async () => {
  resetFake();
  const { exportPPTX } = loadExporter();
  const document = {
    slides: [
      {
        meta: {},
        objects: [
          {
            kind: 'textbox',
            meta: { x: 0, y: 0, w: 720, h: 360, fontSize: 32 },
            content: '# 見出し\n通常 **太字** <span style="color:#ff0000">赤字</span>'
          }
        ]
      }
    ]
  };

  await exportPPTX(document, 'rich-text.pptx', { PptxGenJS: FakePptxGenJS });

  const text = FakePptxGenJS.instances[0].slides[0].texts[0].text;
  assert.deepStrictEqual(text, [
    { text: '見出し', options: { fontSize: 36, breakLine: true } },
    { text: '通常 ', options: { fontSize: 24 } },
    { text: '太字', options: { fontSize: 24, bold: true } },
    { text: ' ', options: { fontSize: 24 } },
    { text: '赤字', options: { fontSize: 24, color: 'FF0000' } }
  ]);
  assert.strictEqual(readableText(text), '見出し\n通常 太字 赤字');
});

test('exportPPTX normalizes named and three-digit red span colors', async () => {
  resetFake();
  const { exportPPTX } = loadExporter();
  const document = {
    slides: [
      {
        meta: {},
        objects: [
          {
            kind: 'textbox',
            meta: { x: 0, y: 0, w: 720, h: 360, fontSize: 32 },
            content: '名前付き <span style="color:red;">赤字</span> 短縮 <span style="color:#f00">赤色</span>'
          }
        ]
      }
    ]
  };

  await exportPPTX(document, 'span-colors.pptx', { PptxGenJS: FakePptxGenJS });

  const text = FakePptxGenJS.instances[0].slides[0].texts[0].text;
  assert.deepStrictEqual(text, [
    { text: '名前付き ', options: { fontSize: 24 } },
    { text: '赤字', options: { fontSize: 24, color: 'FF0000' } },
    { text: ' 短縮 ', options: { fontSize: 24 } },
    { text: '赤色', options: { fontSize: 24, color: 'FF0000' } }
  ]);
  assert.strictEqual(readableText(text), '名前付き 赤字 短縮 赤色');
});

test('exportPPTX maps imported theme color names to PptxGenJS scheme colors', async () => {
  resetFake();
  const { exportPPTX } = loadExporter();
  const document = {
    slides: [
      {
        meta: { bg: 'background1' },
        objects: [
          {
            kind: 'textbox',
            meta: { x: 0, y: 0, w: 720, h: 360, color: 'text1' },
            content: 'Theme color text'
          }
        ]
      }
    ]
  };

  await exportPPTX(document, 'theme-colors.pptx', { PptxGenJS: FakePptxGenJS });

  const slide = FakePptxGenJS.instances[0].slides[0];
  assert.deepStrictEqual(
    {
      backgroundColor: slide.background.color,
      textColor: slide.texts[0].options.color
    },
    {
      backgroundColor: 'bg1',
      textColor: 'tx1'
    }
  );
});

test('exportPPTX converts rect and ellipse objects into positioned shapes', async () => {
  resetFake();
  const { exportPPTX } = loadExporter();
  const document = {
    slides: [
      {
        meta: {},
        objects: [
          {
            kind: 'shape',
            meta: {
              type: 'rect', x: 144, y: 288, w: 432, h: 576,
              fill: '#112233', stroke: '#445566', strokeWidth: 2
            }
          },
          {
            kind: 'shape',
            meta: {
              type: 'ellipse', x: 0, y: 144, w: 288, h: 288,
              fill: '#abcdef', stroke: '#010203', strokeWidth: 3
            }
          }
        ]
      }
    ]
  };

  await exportPPTX(document, 'shapes.pptx', { PptxGenJS: FakePptxGenJS });

  assert.deepStrictEqual(FakePptxGenJS.instances[0].slides[0].shapes, [
    {
      shapeType: 'rect',
      options: {
        x: 1, y: 2, w: 3, h: 4,
        fill: { color: '112233' },
        line: { color: '445566', width: 2 }
      }
    },
    {
      shapeType: 'ellipse',
      options: {
        x: 0, y: 1, w: 2, h: 2,
        fill: { color: 'ABCDEF' },
        line: { color: '010203', width: 3 }
      }
    }
  ]);
});

test('exportPPTX adds video and audio media in document order with resolved paths', async () => {
  resetFake();
  const { exportPPTX } = loadExporter();
  const baseDir = path.resolve('fixtures', 'lesson');
  const document = {
    slides: [
      {
        meta: {},
        objects: [
          {
            kind: 'video',
            src: 'media/intro.mp4',
            meta: { x: 144, y: 288, w: 576, h: 432 }
          },
          {
            kind: 'audio',
            src: 'media/narration.mp3',
            meta: { x: 720, y: 144, w: 144, h: 144 }
          }
        ]
      }
    ]
  };

  await exportPPTX(document, 'media.pptx', {
    PptxGenJS: FakePptxGenJS,
    baseDir
  });

  const slide = FakePptxGenJS.instances[0].slides[0];
  assert.deepStrictEqual(slide.media, [
    {
      type: 'video',
      path: path.resolve(baseDir, 'media/intro.mp4'),
      x: 1, y: 2, w: 4, h: 3
    },
    {
      type: 'audio',
      path: path.resolve(baseDir, 'media/narration.mp3'),
      x: 5, y: 1, w: 1, h: 1
    }
  ]);
  assert.deepStrictEqual(slide.calls.map((call) => call.method), ['addMedia', 'addMedia']);
  assert.deepStrictEqual(slide.calls.map((call) => call.value.type), ['video', 'audio']);
});

test('exportPPTX keeps tables and renders charts with editable PowerPoint shapes', async () => {
  resetFake();
  const { exportPPTX } = loadExporter();
  const document = {
    slides: [
      {
        meta: {},
        objects: [
          {
            kind: 'table',
            meta: { x: 144, y: 288, w: 720, h: 360, fontSize: 28 },
            content: '| 項目 | 値 |\n|---|---|\n| A | 10 |\n| B | 20 |'
          },
          {
            kind: 'chart',
            meta: { type: 'line', x: 720, y: 144, w: 864, h: 576, color: '#2563eb', showValues: true },
            content: 'A,10\nB,20'
          }
        ]
      }
    ]
  };

  await exportPPTX(document, 'data-objects.pptx', { PptxGenJS: FakePptxGenJS });

  const slide = FakePptxGenJS.instances[0].slides[0];
  assert.deepStrictEqual(slide.tables[0].rows, [
    ['項目', '値'],
    ['A', '10'],
    ['B', '20']
  ]);
  assert.strictEqual(slide.charts.length, 0);
  assert.deepStrictEqual(
    slide.shapes.map((shape) => shape.shapeType),
    ['line', 'line', 'ellipse', 'ellipse']
  );
  assert.deepStrictEqual(
    slide.texts.map((entry) => readableText(entry.text)),
    ['10', 'A', '20', 'B']
  );
});

test('exportPPTX renders bar charts with rectangle shapes', async () => {
  resetFake();
  const { exportPPTX } = loadExporter();
  const document = {
    slides: [
      {
        meta: {},
        objects: [
          {
            kind: 'chart',
            meta: { type: 'bar', x: 0, y: 0, w: 864, h: 576 },
            content: 'A,10\nB,20'
          }
        ]
      }
    ]
  };

  await exportPPTX(document, 'bar-chart.pptx', { PptxGenJS: FakePptxGenJS });

  assert.deepStrictEqual(
    FakePptxGenJS.instances[0].slides[0].shapes.map((shape) => shape.shapeType),
    ['line', 'rect', 'rect']
  );
});
