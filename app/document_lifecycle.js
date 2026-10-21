/* Editable-document save state shared by the browser UI and Node.js tests. */
(function (global, factory) {
  const api = factory();
  global.SFDocumentLifecycle = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function createNewState(baseDir) {
    return { filePath: "", baseDir: baseDir || "", lastSavedAt: "", dirty: false, hasAutosave: false };
  }

  function createImportedState(baseDir) {
    return Object.assign(createNewState(baseDir), { hasAutosave: true });
  }

  function createOpenedState(source) {
    const value = source || {};
    if (value.sourceFormat !== "json") return createImportedState(value.baseDir);
    return {
      filePath: value.filePath || "",
      baseDir: value.baseDir || value.dir || "",
      lastSavedAt: value.savedAt || "",
      dirty: false,
      hasAutosave: false
    };
  }

  function markChanged(state, savedAt) {
    return Object.assign({}, state, { dirty: true, hasAutosave: true, autosavedAt: savedAt || new Date().toISOString() });
  }

  function markSaved(state, saved) {
    const value = saved || {};
    return Object.assign({}, state, {
      filePath: value.filePath || "",
      baseDir: value.baseDir || value.dir || "",
      lastSavedAt: value.savedAt || new Date().toISOString(),
      dirty: false,
      hasAutosave: false
    });
  }

  function getStatusText(state) {
    if (state.dirty) return "未保存の変更あり（内部自動保存済み）";
    if (!state.filePath) return state.hasAutosave ? "未保存の新規資料（内部自動保存済み）" : "未保存の新規資料";
    return "保存済み: " + state.filePath;
  }

  function hasRecoveryCandidate(state) {
    return !!(state && state.hasAutosave && (state.dirty || !state.filePath));
  }

  function getDocumentInfo(document, state, jsonVersion) {
    const result = {
      filePath: state.filePath || "", lastSavedAt: state.lastSavedAt || "", slides: 0,
      images: 0, videos: 0, audios: 0, comments: 0, jsonVersion: jsonVersion
    };
    const slides = document && Array.isArray(document.slides) ? document.slides : [];
    result.slides = slides.length;
    slides.forEach(function (slide) {
      const meta = slide && slide.meta || {};
      result.comments += Array.isArray(meta.comments) ? meta.comments.length : 0;
      (slide && Array.isArray(slide.objects) ? slide.objects : []).forEach(function (object) {
        if (object.kind === "image") result.images++;
        if (object.kind === "video") result.videos++;
        if (object.kind === "audio") result.audios++;
      });
    });
    return result;
  }

  return { createNewState, createImportedState, createOpenedState, markChanged, markSaved, hasRecoveryCandidate, getStatusText, getDocumentInfo };
});
