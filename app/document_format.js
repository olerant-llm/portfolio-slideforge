/* SlideForge document file format (browser and Node.js) */
(function (global, factory) {
  const api = factory();
  const SF = global.SF || (global.SF = {});
  Object.assign(SF, api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const FORMAT_NAME = "slideforge";
  const SCHEMA_VERSION = 1;
  const MIGRATIONS = {
    // Version 0 was the first wrapper used during development. Keeping this
    // explicit makes future format upgrades a safe, single entry point.
    0: function (file) { return { format: FORMAT_NAME, version: 1, document: file.document }; }
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function validateDocument(document) {
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      throw new Error("SlideForge document must be an object.");
    }
    if (!Array.isArray(document.slides)) {
      throw new Error("SlideForge document.slides must be an array.");
    }
    if (!document.slides.length) {
      throw new Error("SlideForge document must contain at least one slide.");
    }
    document.slides.forEach(function (slide, slideIndex) {
      if (!slide || typeof slide !== "object" || Array.isArray(slide)) {
        throw new Error("SlideForge slide " + slideIndex + " must be an object.");
      }
      if (!Array.isArray(slide.objects)) {
        throw new Error("SlideForge slide " + slideIndex + ".objects must be an array.");
      }
      if (!slide.meta || typeof slide.meta !== "object" || Array.isArray(slide.meta)) {
        throw new Error("SlideForge slide " + slideIndex + ".meta must be an object.");
      }
      slide.objects.forEach(function (object, objectIndex) {
        const label = "SlideForge slide " + slideIndex + " object " + objectIndex;
        if (!object || typeof object !== "object" || Array.isArray(object)) {
          throw new Error(label + " must be an object.");
        }
        if (typeof object.kind !== "string" || !object.kind.trim()) {
          throw new Error(label + ".kind must be a non-empty string.");
        }
        if (!object.meta || typeof object.meta !== "object" || Array.isArray(object.meta)) {
          throw new Error(label + ".meta must be an object.");
        }
      });
    });
    return document;
  }

  function createDocumentFile(document) {
    return {
      format: FORMAT_NAME,
      version: SCHEMA_VERSION,
      document: clone(validateDocument(document))
    };
  }

  function serializeDocument(document) {
    return JSON.stringify(createDocumentFile(document), null, 2);
  }

  function migrateDocumentFile(file) {
    let current = clone(file);
    while (current.version !== SCHEMA_VERSION) {
      const migrate = MIGRATIONS[current.version];
      if (!migrate) throw new Error("未対応のSlideForge JSON版です: " + current.version + "。この版を読み込める更新版で移行してください。");
      current = migrate(current);
    }
    return current;
  }

  function parseDocumentFile(text) {
    let parsed;
    try {
      parsed = JSON.parse(String(text));
    } catch (error) {
      throw new Error("SlideForge JSONを読み取れません: " + error.message);
    }

    if (parsed && parsed.format === FORMAT_NAME) {
      const migrated = migrateDocumentFile(parsed);
      return clone(validateDocument(migrated.document));
    }

    // Early development builds sometimes saved the raw document object.
    return clone(validateDocument(parsed));
  }

  function isDocumentFileName(fileName) {
    return /\.sf\.json$/i.test(String(fileName || ""));
  }

  return {
    FORMAT_NAME,
    SCHEMA_VERSION,
    createDocumentFile,
    serializeDocument,
    migrateDocumentFile,
    parseDocumentFile,
    validateDocument,
    isDocumentFileName
  };
});
