const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { importPPTX } = require("./app/pptx_import.js");
const { exportPPTX } = require("./app/pptx_export.js");
const { exportStandaloneHTML, findExternalMediaPaths } = require("./app/html_export.js");
const { writeFileAtomic } = require("./app/safe_write.js");
const { ensureSfJsonPath } = require("./app/file_operations.js");
const { parseDocumentFile, serializeDocument } = require("./app/document_format.js");
const { rebaseLocalMedia } = require("./app/media_paths.js");

function createWindow() {
  const win = new BrowserWindow({
    width: 1380,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile("app/index.html");
  /* viewer.html を window.open で開けるようにする(file:のみ許可) */
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith("file:")) return { action: "deny" };
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        autoHideMenuBar: true,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
      }
    };
  });
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.handle("open-file", async () => {
  const r = await dialog.showOpenDialog({
    filters: [
      { name: "SlideForge", extensions: ["json", "md"] },
      { name: "SlideForge JSON", extensions: ["json"] },
      { name: "Markdown", extensions: ["md"] }
    ],
    properties: ["openFile"]
  });
  if (r.canceled || !r.filePaths.length) return null;
  const p = r.filePaths[0];
  const modifiedAt = fs.statSync(p).mtime.toISOString();
  return {
    filePath: p,
    dir: path.dirname(p),
    modifiedAt,
    format: /\.json$/i.test(p) ? "json" : "markdown",
    content: fs.readFileSync(p, "utf-8")
  };
});

ipcMain.handle("save-file", async (_e, payload, existingPath, forceSaveAs) => {
  try {
    let p = forceSaveAs ? null : (existingPath || null);
    if (!p) {
      const r = await dialog.showSaveDialog({
        defaultPath: "slides.sf.json",
        filters: [{ name: "SlideForge JSON", extensions: ["json"] }]
      });
      if (r.canceled || !r.filePath) return null;
      p = r.filePath;
    }
    p = ensureSfJsonPath(p);
    const editableDocument = parseDocumentFile(payload.json);
    const data = serializeDocument(rebaseLocalMedia(editableDocument, payload.baseDir, path.dirname(p)));
    if (typeof data !== "string") throw new Error("保存する内容が不正です。");
    writeFileAtomic(p, data);
    return { filePath: p, baseDir: path.dirname(p), format: "json", savedAt: new Date().toISOString(), json: data };
  } catch (err) {
    return { error: String((err && err.message) || err) };
  }
});

ipcMain.handle("export-markdown", async (_e, markdown) => {
  try {
    const result = await dialog.showSaveDialog({
      defaultPath: "slides.md",
      filters: [{ name: "Markdown", extensions: ["md"] }]
    });
    if (result.canceled || !result.filePath) return null;
    writeFileAtomic(result.filePath, markdown);
    return { filePath: result.filePath };
  } catch (err) {
    return { error: String((err && err.message) || err) };
  }
});

ipcMain.handle("export-html", async (_e, document, baseDir) => {
  try {
    const result = await dialog.showSaveDialog({
      defaultPath: "slides.html",
      filters: [{ name: "単一HTMLスライド", extensions: ["html"] }]
    });
    if (result.canceled || !result.filePath) return null;
    const documentBaseDir = baseDir || path.dirname(result.filePath);
    const externalPaths = findExternalMediaPaths(document, documentBaseDir);
    if (externalPaths.length) {
      const confirmation = await dialog.showMessageBox({
        type: "warning",
        buttons: ["キャンセル", "確認して含める"],
        defaultId: 0,
        cancelId: 0,
        title: "資料フォルダ外のメディア",
        message: "次のファイルは資料フォルダ外にあります。単一HTMLへ含めますか？",
        detail: externalPaths.slice(0, 10).join("\n") +
          (externalPaths.length > 10 ? "\nほか " + (externalPaths.length - 10) + " 件" : "")
      });
      if (confirmation.response !== 1) return null;
    }
    exportStandaloneHTML(document, result.filePath, {
      baseDir: documentBaseDir,
      allowedExternalPaths: externalPaths
    });
    return { filePath: result.filePath };
  } catch (err) {
    return { error: String((err && err.message) || err) };
  }
});

ipcMain.handle("choose-media", async (_e, kind) => {
  const filters =
    kind === "image" ? [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }] :
    kind === "video" ? [{ name: "Video", extensions: ["mp4", "webm"] }] :
                       [{ name: "Audio", extensions: ["mp3", "wav", "ogg", "m4a"] }];
  const r = await dialog.showOpenDialog({ filters, properties: ["openFile"] });
  if (r.canceled || !r.filePaths.length) return null;
  return r.filePaths[0];
});

ipcMain.handle("import-pptx", async () => {
  const r = await dialog.showOpenDialog({
    filters: [{ name: "PowerPoint", extensions: ["pptx"] }],
    properties: ["openFile"]
  });
  if (r.canceled || !r.filePaths.length) return null;
  const out = await dialog.showOpenDialog({
    title: "変換結果の出力フォルダを選択",
    properties: ["openDirectory", "createDirectory"]
  });
  if (out.canceled || !out.filePaths.length) return null;
  const dir = out.filePaths[0];
  try {
    const md = await importPPTX(r.filePaths[0], dir);
    return { markdown: md, dir };
  } catch (err) {
    return { error: String((err && err.message) || err) };
  }
});

ipcMain.handle("export-pptx", async (_e, document, baseDir) => {
  try {
    const result = await dialog.showSaveDialog({
      defaultPath: "slides.pptx",
      filters: [{ name: "PowerPoint", extensions: ["pptx"] }]
    });
    if (result.canceled || !result.filePath) return null;

    await exportPPTX(document, result.filePath, {
      baseDir: baseDir || path.dirname(result.filePath)
    });
    return { filePath: result.filePath };
  } catch (err) {
    return { error: String((err && err.message) || err) };
  }
});
