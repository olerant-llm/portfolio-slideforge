const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildStandaloneHTML } = require('./html_export.js');

test('standalone HTML embeds the document and local media in one file', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slideforge-html-'));
  const imagePath = path.join(workDir, 'pixel.png');
  fs.writeFileSync(imagePath, Buffer.from([137, 80, 78, 71]));
  const document = {
    slides: [
      {
        meta: { title: '</script><script>unsafe()</script>' },
        objects: [
          {
            id: 'image1',
            kind: 'image',
            src: 'pixel.png',
            meta: { x: 0, y: 0, w: 100, h: 100 },
            content: ''
          }
        ]
      }
    ]
  };

  const html = buildStandaloneHTML(document, { baseDir: workDir });

  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /data:image\/png;base64,iVBORw==/);
  assert.match(html, /window\.SLIDEFORGE_DOCUMENT/);
  assert.doesNotMatch(html, /src="pixel\.png"/);
  assert.doesNotMatch(html, /<\/script><script>unsafe/);
});

test('standalone HTML does not embed unrelated local file types', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slideforge-html-safe-'));
  fs.writeFileSync(path.join(workDir, 'secret.txt'), 'private text');
  const document = {
    slides: [
      {
        meta: {},
        objects: [{ id: 'bad', kind: 'image', src: 'secret.txt', meta: {}, content: '' }]
      }
    ]
  };

  const html = buildStandaloneHTML(document, { baseDir: workDir });

  assert.doesNotMatch(html, /cHJpdmF0ZSB0ZXh0/);
});

test('standalone HTML rejects media outside the document folder', () => {
  const documentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slideforge-doc-'));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slideforge-outside-'));
  const outsideImage = path.join(outsideDir, 'private.png');
  fs.writeFileSync(outsideImage, Buffer.from([137, 80, 78, 71]));
  const document = {
    slides: [{ meta: {}, objects: [{ id: 'outside', kind: 'image', src: outsideImage, meta: {}, content: '' }] }]
  };

  assert.throws(
    () => buildStandaloneHTML(document, { baseDir: documentDir }),
    /資料フォルダ外/
  );
  assert.match(
    buildStandaloneHTML(document, {
      baseDir: documentDir,
      allowedExternalPaths: [outsideImage]
    }),
    /data:image\/png;base64,iVBORw==/
  );
});

test('standalone HTML checks file signatures and embed size limits', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slideforge-html-limit-'));
  fs.writeFileSync(path.join(workDir, 'fake.png'), 'not a png');
  const fakeDocument = {
    slides: [{ meta: {}, objects: [{ id: 'fake', kind: 'image', src: 'fake.png', meta: {}, content: '' }] }]
  };
  assert.throws(
    () => buildStandaloneHTML(fakeDocument, { baseDir: workDir }),
    /ファイル形式/
  );

  fs.writeFileSync(path.join(workDir, 'large.png'), Buffer.from([137, 80, 78, 71, 1, 2, 3, 4]));
  const largeDocument = {
    slides: [{ meta: {}, objects: [{ id: 'large', kind: 'image', src: 'large.png', meta: {}, content: '' }] }]
  };
  assert.throws(
    () => buildStandaloneHTML(largeDocument, { baseDir: workDir, maxEmbedBytes: 4 }),
    /サイズ上限/
  );
});

test('standalone HTML accepts MP3 files that start directly with an MPEG frame', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slideforge-mp3-'));
  fs.writeFileSync(path.join(workDir, 'sound.mp3'), Buffer.from([0xff, 0xfb, 0x90, 0x64]));
  const document = {
    slides: [{ meta: {}, objects: [{ id: 'audio', kind: 'audio', src: 'sound.mp3', meta: {}, content: '' }] }]
  };

  assert.match(
    buildStandaloneHTML(document, { baseDir: workDir }),
    /data:audio\/mpeg;base64,\/\/uQZA==/
  );
});
