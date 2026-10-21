const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("slideforge", {
  openFile: () => ipcRenderer.invoke("open-file"),
  saveFile: (payload, filePath, forceSaveAs) => ipcRenderer.invoke("save-file", payload, filePath, forceSaveAs),
  exportMarkdown: (markdown) => ipcRenderer.invoke("export-markdown", markdown),
  exportHTML: (document, baseDir) => ipcRenderer.invoke("export-html", document, baseDir),
  chooseMedia: (kind) => ipcRenderer.invoke("choose-media", kind),
  importPPTX: () => ipcRenderer.invoke("import-pptx"),
  exportPPTX: (document, baseDir) => ipcRenderer.invoke("export-pptx", document, baseDir)
});
