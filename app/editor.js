/* SlideForge Editor */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const num = SF.num;
  const isEl = !!window.slideforge;

  /* ---------- state ---------- */
  let doc = { slides: [SF.newSlide(1)] };
  let cur = 0;        /* current slide index */
  let sel = -1;       /* selected object index (0 = 最背面) */
  let scale = 0.5;
  let undoStack = [], redoStack = [];
  let baseDir = "";
  let filePath = "";
  let documentState = SFDocumentLifecycle.createNewState("");
  let mdTyping = false;
  let mdTimer = null;
  let noteTyping = false;
  let noteTimer = null;
  let textEditing = false;
  let mediaKind = null;

  const SAMPLE = [
    '---', 'title: "SlideForgeへようこそ"', 'theme: "blue"', 'transition: "fade"',
    'notes: "デモ用のサンプルスライドです"', '---', '',
    ':::textbox', 'x: 160', 'y: 320', 'w: 1600', 'h: 300',
    'fontFamily: "Noto Sans JP"', 'fontSize: 72', 'color: "#ffffff"', 'align: "center"', '---',
    '# SlideForge', 'Markdown × PowerPoint風編集 × ブラウザスライドショー', ':::', '',
    ':::animate', 'type: "fade-in"', 'delay: 0.5', 'duration: 0.8',
    'x: 160', 'y: 660', 'w: 1600', 'h: 160', 'fontSize: 36', 'color: "#dbeafe"', 'align: "center"', '---',
    'このテキストはスライドショーでフェードインします', ':::', '',
    '---', 'title: "編集してみよう"', 'theme: "white"', 'transition: "fade"', '---', '',
    ':::shape', 'type: "rect"', 'x: 120', 'y: 96', 'w: 1680', 'h: 10', 'fill: "#3b82f6"', 'strokeWidth: 0', '---', ':::', '',
    ':::textbox', 'x: 120', 'y: 140', 'w: 1680', 'h: 140', 'fontSize: 56', 'color: "#1f2937"', '---',
    '## 基本操作', ':::', '',
    ':::textbox', 'x: 160', 'y: 320', 'w: 1100', 'h: 600', 'fontSize: 38', 'color: "#374151"', '---',
    '- ドラッグで移動、角のハンドルでリサイズ',
    '- ダブルクリックでテキスト編集（Markdown記法OK）',
    '- 右クリックでレイヤー操作・複製・削除',
    '- 「Markdown」ボタンでソースを直接編集',
    '- **太字** や <span style="color:red;">部分装飾</span> に対応', ':::', '',
    ':::shape', 'type: "ellipse"', 'x: 1380', 'y: 420', 'w: 360', 'h: 360', 'fill: "#fbbf24"', 'stroke: "#b45309"', 'strokeWidth: 6', '---', ':::'
  ].join("\n");

  /* ---------- doc access ---------- */
  const cs = () => doc.slides[cur];
  const so = () => (sel >= 0 && sel < cs().objects.length ? cs().objects[sel] : null);
  const genDoc = () => SF.generate(doc);
  const transitionOptions = [
    ["fade", "フェード"],
    ["slide-left", "横から入る"],
    ["zoom", "ズーム"],
    ["none", "なし"]
  ];
  const animationOptions = [
    ["none", "なし"],
    ["fade-in", "フェードイン"],
    ["fade-out", "フェードアウト"],
    ["slide-in-left", "左から入る"],
    ["slide-in-right", "右から入る"],
    ["zoom-in", "ズームイン"],
    ["pulse", "強調（拡大）"]
  ];

  function transitionLabel(type) {
    const hit = transitionOptions.find(pair => pair[0] === type);
    return hit ? hit[1] : type;
  }

  /* ---------- history ---------- */
  function pushHistory() {
    undoStack.push(SF.serializeDocument(doc));
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
  }
  function dropNoopHistory() {
    if (undoStack.length && undoStack[undoStack.length - 1] === SF.serializeDocument(doc)) undoStack.pop();
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(SF.serializeDocument(doc));
    loadDocument(SF.parseDocumentFile(undoStack.pop()), true);
    markDocumentChanged();
    updateStatus();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(SF.serializeDocument(doc));
    loadDocument(SF.parseDocumentFile(redoStack.pop()), true);
    markDocumentChanged();
    updateStatus();
  }
  function storeAutosave() {
    if (!SFDocumentLifecycle.hasRecoveryCandidate(documentState)) {
      clearAutosave();
      return;
    }
    localStorage.setItem("sf_document", SF.serializeDocument(doc));
    localStorage.setItem("sf_autosave", genDoc());
    localStorage.setItem("sf_autosave_meta", JSON.stringify({ autosavedAt: new Date().toISOString() }));
  }
  function clearAutosave() {
    localStorage.removeItem("sf_document");
    localStorage.removeItem("sf_autosave");
    localStorage.removeItem("sf_autosave_meta");
  }
  function applyDocumentState(nextState) {
    documentState = nextState;
    filePath = documentState.filePath;
    baseDir = documentState.baseDir;
  }
  function markDocumentChanged() {
    applyDocumentState(SFDocumentLifecycle.markChanged(documentState));
  }
  function loadDocument(nextDocument, keepPos) {
    doc = SF.validateDocument(nextDocument);
    if (!keepPos) cur = 0;
    cur = Math.min(cur, doc.slides.length - 1);
    sel = -1;
    storeAutosave();
    renderAll();
  }
  function loadMarkdown(md, keepPos) {
    loadDocument(SF.parseDocument(md), keepPos);
  }
  function parseFileContent(content, format) {
    return format === "json" ? SF.parseDocumentFile(content) : SF.parseDocument(content);
  }
  function loadFileContent(content, format, keepPos) {
    loadDocument(parseFileContent(content, format), keepPos);
  }
  function flushPendingMarkdown() {
    if (!mdTyping) return;
    clearTimeout(mdTimer);
    mdTimer = null;
    pushHistory();
    doc = SF.parseDocument($("#mdArea").value);
    cur = Math.min(cur, doc.slides.length - 1);
    sel = -1;
    mdTyping = false;
    markDocumentChanged();
    storeAutosave();
    renderCanvas(); renderSlideList(); renderProps(); updateNotePanel(); updateStatus();
    dropNoopHistory();
  }

  /* ---------- commit ---------- */
  function commit() {
    markDocumentChanged();
    storeAutosave();
    renderAll();
  }

  /* ---------- render ---------- */
  function renderAll() {
    renderCanvas();
    renderSlideList();
    renderProps();
    updateMdPanel();
    updateNotePanel();
    renderComments();
    updateStatus();
  }

  function fitCanvas() {
    const wrap = $("#canvasWrap");
    const r = wrap.getBoundingClientRect();
    scale = Math.max(0.05, Math.min((r.width - 48) / 1920, (r.height - 48) / 1080));
    const cv = $("#canvas");
    cv.style.width = "1920px";
    cv.style.height = "1080px";
    cv.style.transform = "scale(" + scale + ")";
    updateStatus();
  }

  function renderCanvas() {
    const cv = $("#canvas");
    cv.innerHTML = "";
    cv.id = "canvas";
    SF.applySlideStyle(cv, cs().meta, baseDir);
    cs().objects.forEach((o, i) => {
      const el = SF.buildObjectEl(o, { baseDir, mode: "edit" });
      el.dataset.idx = i;
      if (i === sel) {
        el.classList.add("selected");
        ["nw", "n", "ne", "e", "se", "s", "sw", "w"].forEach(d => {
          const h = document.createElement("div");
          h.className = "rh rh-" + d;
          h.dataset.dir = d;
          h.addEventListener("mousedown", (e) => { e.stopPropagation(); startResize(e, i, d); });
          el.appendChild(h);
        });
      }
      el.addEventListener("mousedown", (e) => {
        if (e.button !== 0 || textEditing) return;
        if (e.detail >= 2 && (o.kind === "textbox" || o.kind === "animate")) return;
        e.stopPropagation();
        startMove(e, i);
      });
      el.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        if (["textbox", "animate", "table", "chart"].includes(o.kind)) startTextEdit(i);
      });
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault(); e.stopPropagation();
        select(i);
        showMenu($("#objMenu"), e.clientX, e.clientY);
      });
      cv.appendChild(el);
    });
  }

  function renderSlideList() {
    const list = $("#slideList");
    list.innerHTML = "";
    doc.slides.forEach((s, i) => {
      const t = document.createElement("div");
      t.className = "thumb" + (i === cur ? " sel" : "");
      t.draggable = true;
      const numEl = document.createElement("div");
      numEl.className = "thumb-num";
      numEl.textContent = i + 1;
      const stage = document.createElement("div");
      stage.className = "thumb-stage";
      const inner = document.createElement("div");
      SF.applySlideStyle(inner, s.meta, baseDir);
      inner.classList.add("thumb-inner");
      s.objects.forEach(o => inner.appendChild(SF.buildObjectEl(o, { baseDir, mode: "edit" })));
      stage.appendChild(inner);
      t.appendChild(numEl);
      if ((s.meta.transition || "fade") !== "none") {
        const tr = document.createElement("button");
        tr.type = "button";
        tr.className = "thumb-transition transition-" + (s.meta.transition || "fade");
        tr.title = transitionLabel(s.meta.transition || "fade") + " / " + num(s.meta.transitionDuration, 0.3) + "秒";
        tr.textContent = (s.meta.transition || "fade") === "slide-left" ? "S" :
          (s.meta.transition || "fade") === "zoom" ? "Z" : "F";
        tr.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          cur = i;
          sel = -1;
          renderAll();
          showTransitionDialog(i);
        });
        t.appendChild(tr);
      }
      t.appendChild(stage);
      t.addEventListener("click", () => { cur = i; sel = -1; renderAll(); });
      t.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        cur = i; renderAll();
        showMenu($("#slideMenu"), e.clientX, e.clientY);
      });
      t.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", String(i)));
      t.addEventListener("dragover", (e) => e.preventDefault());
      t.addEventListener("drop", (e) => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData("text/plain"));
        if (isNaN(from) || from === i) return;
        pushHistory();
        const mv = doc.slides.splice(from, 1)[0];
        doc.slides.splice(i, 0, mv);
        cur = i; sel = -1;
        commit();
      });
      list.appendChild(t);
      const sw = stage.clientWidth || 186;
      inner.style.width = "1920px";
      inner.style.height = "1080px";
      inner.style.transform = "scale(" + (sw / 1920) + ")";
    });
    const add = document.createElement("button");
    add.type = "button";
    add.className = "thumb-add";
    add.textContent = "+";
    add.title = "新規スライド";
    add.addEventListener("click", addSlide);
    list.appendChild(add);
  }

  /* ---------- properties panel ---------- */
  function prow(label, input) {
    const d = document.createElement("div");
    d.className = "prow";
    const l = document.createElement("label");
    l.textContent = label;
    d.appendChild(l);
    d.appendChild(input);
    return d;
  }
  function inp(type, value, onchange, attrs) {
    const i = document.createElement("input");
    i.type = type;
    if (type === "checkbox") i.checked = !!value; else i.value = value;
    if (attrs) for (const k in attrs) i.setAttribute(k, attrs[k]);
    i.addEventListener("change", () => {
      pushHistory();
      onchange(type === "checkbox" ? i.checked : (type === "number" ? num(i.value, 0) : i.value));
      const o = so(); if (o) o.loose = false;
      dropNoopHistory();
      commit();
    });
    return i;
  }
  function selBox(options, value, onchange) {
    const s = document.createElement("select");
    options.forEach(pair => {
      const op = document.createElement("option");
      op.value = pair[0]; op.textContent = pair[1];
      if (pair[0] === value) op.selected = true;
      s.appendChild(op);
    });
    s.addEventListener("change", () => {
      pushHistory();
      onchange(s.value);
      const o = so(); if (o) o.loose = false;
      commit();
    });
    return s;
  }
  function propButton(label, onclick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "prop-btn";
    b.textContent = label;
    b.addEventListener("click", onclick);
    return b;
  }
  function renderProps() {
    const p = $("#props");
    p.innerHTML = "";
    const o = so();
    if (!o) {
      const h = document.createElement("h3");
      h.textContent = "スライド設定";
      p.appendChild(h);
      p.appendChild(prow("タイトル", inp("text", cs().meta.title || "", v => cs().meta.title = v)));
      p.appendChild(prow("背景", inp("text", cs().meta.bg || "", v => { if (v) cs().meta.bg = v; else delete cs().meta.bg; }, { placeholder: "#ffffff か 画像パス" })));
      p.appendChild(prow("切り替え", selBox(transitionOptions, cs().meta.transition || "fade", v => cs().meta.transition = v)));
      if ((cs().meta.transition || "fade") !== "none") {
        p.appendChild(prow("効果時間", inp("number", num(cs().meta.transitionDuration, 0.3), v => cs().meta.transitionDuration = v, { step: "0.1", min: "0" })));
      }
      p.appendChild(prow("テーマ", selBox([["white", "ホワイト"], ["dark", "ダーク"], ["blue", "ブルー"]], cs().meta.theme || "white", v => cs().meta.theme = v)));
      return;
    }
    const m = o.meta;
    const titleMap = {
      textbox: "テキストボックス",
      shape: "図形",
      animate: "アニメーショングループ",
      image: "画像",
      video: "動画",
      audio: "音声",
      table: "表",
      chart: "グラフ"
    };
    const h = document.createElement("h3");
    h.textContent = titleMap[o.kind] || o.kind;
    p.appendChild(h);

    [["X", "x"], ["Y", "y"], ["幅", "w"], ["高さ", "h"]].forEach(pair => {
      p.appendChild(prow(pair[0], inp("number", num(m[pair[1]], 0), v => m[pair[1]] = Math.round(v))));
    });

    if (o.kind === "textbox" || o.kind === "animate") {
      p.appendChild(prow("本文", propButton("スライド上で編集", () => startTextEdit(sel))));
      p.appendChild(prow("フォント", selBox(
        [["Noto Sans JP", "Noto Sans JP"], ["Inter", "Inter"], ["serif", "明朝（serif）"], ["monospace", "等幅"]],
        m.fontFamily || "Noto Sans JP", v => m.fontFamily = v)));
      p.appendChild(prow("サイズ", inp("number", num(m.fontSize, 40), v => m.fontSize = v)));
      p.appendChild(prow("文字色", inp("color", m.color || "#222222", v => m.color = v)));
      p.appendChild(prow("背景色", inp("text", m.bg || "", v => { if (v) m.bg = v; else delete m.bg; }, { placeholder: "#fff / 空欄=透明" })));
      p.appendChild(prow("行間", inp("number", num(m.lineHeight, 1.4), v => m.lineHeight = v, { step: "0.1" })));
      p.appendChild(prow("揃え", selBox([["left", "左"], ["center", "中央"], ["right", "右"]], m.align || "left", v => m.align = v)));
    }
    if (o.kind === "shape") {
      p.appendChild(prow("種類", selBox([["rect", "四角"], ["ellipse", "円"]], m.type || "rect", v => m.type = v)));
      p.appendChild(prow("塗り", inp("color", m.fill || "#3b82f6", v => m.fill = v)));
      p.appendChild(prow("枠線色", inp("color", m.stroke || "#000000", v => m.stroke = v)));
      p.appendChild(prow("枠線太さ", inp("number", num(m.strokeWidth, 0), v => m.strokeWidth = v)));
      if ((m.type || "rect") === "rect") {
        p.appendChild(prow("角丸", inp("number", num(m.radius, 0), v => { if (v) m.radius = v; else delete m.radius; })));
      }
    }
    if (o.kind === "image") {
      p.appendChild(prow("枠線太さ", inp("number", num(m.borderWidth, 0), v => { if (v) m.borderWidth = v; else delete m.borderWidth; })));
      p.appendChild(prow("枠線色", inp("color", m.borderColor || "#000000", v => m.borderColor = v)));
      p.appendChild(prow("影", inp("checkbox", m.shadow, v => { if (v) m.shadow = true; else delete m.shadow; })));
    }
    if (o.kind === "video" || o.kind === "audio") {
      p.appendChild(prow("自動再生", inp("checkbox", m.autoplay, v => m.autoplay = v)));
      p.appendChild(prow("ループ", inp("checkbox", m.loop, v => m.loop = v)));
      p.appendChild(prow("音量", inp("number", num(m.volume, 1), v => m.volume = v, { step: "0.1", min: "0", max: "1" })));
      p.appendChild(prow("開始(秒)", inp("number", num(m.trimStart, 0), v => m.trimStart = v, { step: "0.1" })));
      p.appendChild(prow("終了(秒)", inp("number", num(m.trimEnd, 0), v => m.trimEnd = v, { step: "0.1" })));
    }
    if (o.kind === "table") {
      p.appendChild(prow("表データ", propButton("スライド上で編集", () => startTextEdit(sel))));
      p.appendChild(prow("文字サイズ", inp("number", num(m.fontSize, 30), v => m.fontSize = v)));
      p.appendChild(prow("見出し色", inp("color", m.headerFill || "#2563eb", v => m.headerFill = v)));
      p.appendChild(prow("交互の色", inp("color", m.stripeFill || "#eff6ff", v => m.stripeFill = v)));
    }
    if (o.kind === "chart") {
      p.appendChild(prow("グラフ種類", selBox([["bar", "棒グラフ"], ["line", "折れ線"]], m.type || "bar", v => m.type = v)));
      p.appendChild(prow("データ", propButton("スライド上で編集", () => startTextEdit(sel))));
      p.appendChild(prow("色", inp("color", m.color || "#2563eb", v => m.color = v)));
      p.appendChild(prow("数値表示", inp("checkbox", m.showValues !== false, v => m.showValues = v)));
    }

    /* アニメーション */
    if (o.kind === "animate") {
      p.appendChild(prow("効果", selBox(animationOptions.slice(1), m.type || "fade-in", v => m.type = v)));
      p.appendChild(prow("遅延(秒)", inp("number", num(m.delay, 0), v => m.delay = v, { step: "0.1" })));
      p.appendChild(prow("時間(秒)", inp("number", num(m.duration, 0.5), v => m.duration = v, { step: "0.1" })));
    } else {
      const a = SF.parseAnim(m.animation) || { type: "none", delay: 0, duration: 0.5 };
      const setAnim = (t2, d2, du2) => {
        if (t2 === "none") delete m.animation;
        else m.animation = t2 + ":" + d2 + ":" + du2;
      };
      p.appendChild(prow("アニメ", selBox(
        animationOptions,
        a.type, v => setAnim(v, a.delay, a.duration))));
      if (a.type !== "none") {
        p.appendChild(prow("遅延(秒)", inp("number", a.delay, v => setAnim(a.type, v, a.duration), { step: "0.1" })));
        p.appendChild(prow("時間(秒)", inp("number", a.duration, v => setAnim(a.type, a.delay, v), { step: "0.1" })));
      }
    }

    const layerInfo = document.createElement("div");
    layerInfo.className = "layer-info";
    const layerLabel = document.createElement("div");
    layerLabel.className = "layer-label";
    layerLabel.textContent = "レイヤー位置";
    const layerTrack = document.createElement("div");
    layerTrack.className = "layer-track";
    cs().objects.forEach((_obj, i) => {
      const cell = document.createElement("div");
      cell.className = "layer-cell" + (i === sel ? " current" : "");
      cell.title = (i + 1) + "/" + cs().objects.length + (i === 0 ? " 最背面" : i === cs().objects.length - 1 ? " 最前面" : "");
      layerTrack.appendChild(cell);
    });
    const layerHint = document.createElement("div");
    layerHint.className = "layer-hint";
    layerHint.textContent = "左が背面 / 右が前面";
    layerInfo.appendChild(layerLabel);
    layerInfo.appendChild(layerTrack);
    layerInfo.appendChild(layerHint);
    p.appendChild(layerInfo);
    const layerBtns = document.createElement("div");
    layerBtns.className = "layer-buttons";
    [
      ["front", "最前面へ移動"],
      ["forward", "一つ前へ"],
      ["backward", "一つ後ろへ"],
      ["back", "最背面へ移動"]
    ].forEach(pair => layerBtns.appendChild(propButton(pair[1], () => layerOp(pair[0]))));
    p.appendChild(layerBtns);
  }

  function updateStatus() {
    $("#stSlide").textContent = "スライド " + (cur + 1) + "/" + doc.slides.length;
    const o = so();
    $("#stSel").textContent = o ? "選択: " + o.kind + " (" + (sel + 1) + "/" + cs().objects.length + ")" : "";
    $("#stZoom").textContent = "ズーム " + Math.round(scale * 100) + "%";
    $("#stFile").textContent = SFDocumentLifecycle.getStatusText(documentState);
  }

  function updateMdPanel() {
    if (mdTyping) return;
    const ta = $("#mdArea");
    if (document.activeElement !== ta) ta.value = genDoc();
  }
  function updateNotePanel() {
    if (noteTyping) return;
    const ta = $("#noteArea");
    if (document.activeElement !== ta) ta.value = cs().meta.notes || "";
  }
  function renderComments() {
    const list = $("#commentList");
    if (!list) return;
    list.innerHTML = "";
    const comments = Array.isArray(cs().meta.comments) ? cs().meta.comments : [];
    if (!comments.length) {
      const empty = document.createElement("div");
      empty.className = "comment-empty";
      empty.textContent = "このスライドにコメントはありません。";
      list.appendChild(empty);
      return;
    }
    comments.forEach(function (comment, index) {
      const row = document.createElement("div");
      row.className = "comment-item" + (comment.resolved ? " resolved" : "");
      const text = document.createElement("div");
      text.className = "comment-text";
      text.textContent = comment.text || "";
      const actions = document.createElement("div");
      actions.className = "comment-actions";
      const resolveButton = propButton(comment.resolved ? "未解決に戻す" : "解決済みにする", function () {
        pushHistory();
        comment.resolved = !comment.resolved;
        commit();
      });
      const deleteButton = propButton("削除", function () {
        pushHistory();
        cs().meta.comments.splice(index, 1);
        commit();
      });
      actions.appendChild(resolveButton);
      actions.appendChild(deleteButton);
      row.appendChild(text);
      row.appendChild(actions);
      list.appendChild(row);
    });
  }
  function showBottomPanel(kind) {
    const md = $("#mdPanel");
    const notes = $("#notesPanel");
    const comments = $("#commentsPanel");
    const nextMd = kind === "md" && !md.classList.contains("open");
    const nextNotes = kind === "notes" && !notes.classList.contains("open");
    const nextComments = kind === "comments" && !comments.classList.contains("open");
    md.classList.toggle("open", nextMd);
    notes.classList.toggle("open", nextNotes);
    comments.classList.toggle("open", nextComments);
    $("#btnMd").classList.toggle("active", nextMd);
    $("#btnNotes").classList.toggle("active", nextNotes);
    $("#btnComments").classList.toggle("active", nextComments);
    if (nextMd) updateMdPanel();
    if (nextNotes) updateNotePanel();
    if (nextComments) renderComments();
    setTimeout(fitCanvas, 30);
  }

  /* ---------- selection / move / resize ---------- */
  function select(i) {
    sel = i;
    renderCanvas();
    renderProps();
    updateStatus();
  }

  function startMove(e, idx) {
    select(idx);
    const o = cs().objects[idx];
    const m = o.meta;
    const sx = e.clientX, sy = e.clientY;
    const ox = num(m.x, 100), oy = num(m.y, 100);
    pushHistory();
    let moved = false;
    const el = $("#canvas").querySelector('[data-idx="' + idx + '"]');
    function mm(ev) {
      const dx = (ev.clientX - sx) / scale, dy = (ev.clientY - sy) / scale;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      m.x = Math.round(ox + dx);
      m.y = Math.round(oy + dy);
      if (el) { el.style.left = m.x + "px"; el.style.top = m.y + "px"; }
    }
    function mu() {
      document.removeEventListener("mousemove", mm);
      document.removeEventListener("mouseup", mu);
      if (moved) { o.loose = false; commit(); }
      else dropNoopHistory();
    }
    document.addEventListener("mousemove", mm);
    document.addEventListener("mouseup", mu);
  }

  function startResize(e, idx, dir) {
    const o = cs().objects[idx];
    const m = o.meta;
    const sx = e.clientX, sy = e.clientY;
    const ox = num(m.x, 100), oy = num(m.y, 100), ow = num(m.w, 400), oh = num(m.h, 200);
    pushHistory();
    const el = $("#canvas").querySelector('[data-idx="' + idx + '"]');
    function mm(ev) {
      const dx = (ev.clientX - sx) / scale, dy = (ev.clientY - sy) / scale;
      let x = ox, y = oy, w = ow, h = oh;
      if (dir.indexOf("e") >= 0) w = ow + dx;
      if (dir.indexOf("s") >= 0) h = oh + dy;
      if (dir.indexOf("w") >= 0) { x = ox + dx; w = ow - dx; }
      if (dir.indexOf("n") >= 0) { y = oy + dy; h = oh - dy; }
      m.x = Math.round(x); m.y = Math.round(y);
      m.w = Math.max(20, Math.round(w)); m.h = Math.max(20, Math.round(h));
      if (el) {
        el.style.left = m.x + "px"; el.style.top = m.y + "px";
        el.style.width = m.w + "px"; el.style.height = m.h + "px";
      }
    }
    function mu() {
      document.removeEventListener("mousemove", mm);
      document.removeEventListener("mouseup", mu);
      o.loose = false;
      commit();
    }
    document.addEventListener("mousemove", mm);
    document.addEventListener("mouseup", mu);
  }

  /* ---------- text editing (Markdownソースを直接編集) ---------- */
  function startTextEdit(idx) {
    if (textEditing) return;
    textEditing = true;
    select(idx);
    const o = cs().objects[idx];
    const m = o.meta;
    const ta = document.createElement("textarea");
    ta.id = "textEditor";
    ta.value = o.content;
    ta.style.left = num(m.x, 100) + "px";
    ta.style.top = num(m.y, 100) + "px";
    ta.style.width = num(m.w, 400) + "px";
    ta.style.height = Math.max(num(m.h, 200), 80) + "px";
    ta.style.fontSize = num(m.fontSize, 40) + "px";
    ta.style.fontFamily = m.fontFamily || "Noto Sans JP";
    ta.style.color = m.color || "#111111";
    ta.style.background = m.bg || "rgba(255,255,255,.96)";
    ta.style.lineHeight = num(m.lineHeight, 1.4);
    ta.style.textAlign = m.align || "left";
    $("#canvas").appendChild(ta);
    ta.focus();
    ta.select();
    let done = false;
    function finish(cancel) {
      if (done) return;
      done = true;
      const val = ta.value;
      ta.remove();
      textEditing = false;
      if (cancel || val === o.content) { renderCanvas(); return; }
      pushHistory();
      o.content = val;
      commit();
      /* Overflow 自動補正: scrollHeight > h なら h を補正 */
      requestAnimationFrame(() => {
        const el = $("#canvas").querySelector('[data-idx="' + idx + '"] .sf-content');
        if (el && el.scrollHeight > num(m.h, 200)) {
          m.h = Math.ceil(el.scrollHeight);
          commit();
        }
      });
    }
    ta.addEventListener("blur", () => finish(false));
    ta.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") finish(true);
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) finish(false);
    });
  }

  /* ---------- layer ops (= Markdownブロック順入替) ---------- */
  function layerOp(op) {
    const o = so();
    if (!o) return;
    const arr = cs().objects;
    const i = sel;
    pushHistory();
    let j = i;
    if (op === "front") j = arr.length - 1;        /* 前面 = 末尾(最下部) */
    else if (op === "back") j = 0;                  /* 背面 = 先頭(最上部) */
    else if (op === "forward") j = Math.min(arr.length - 1, i + 1);
    else if (op === "backward") j = Math.max(0, i - 1);
    if (j === i) { dropNoopHistory(); return; }
    arr.splice(i, 1);
    arr.splice(j, 0, o);
    sel = j;
    commit();
  }

  /* ---------- object ops ---------- */
  function deleteObj() {
    if (sel < 0) return;
    pushHistory();
    cs().objects.splice(sel, 1);
    sel = -1;
    commit();
  }
  function dupObj() {
    const o = so();
    if (!o) return;
    pushHistory();
    const c = SF.clone(o);
    c.id = o.id + "c";
    c.meta.x = num(c.meta.x, 100) + 40;
    c.meta.y = num(c.meta.y, 100) + 40;
    cs().objects.push(c);
    sel = cs().objects.length - 1;
    commit();
  }
  function addObj(o) {
    pushHistory();
    cs().objects.push(o);
    sel = cs().objects.length - 1;
    commit();
  }

  /* ---------- slide ops ---------- */
  function addSlide() {
    pushHistory();
    const s = SF.newSlide(doc.slides.length + 1);
    s.meta.theme = cs().meta.theme || "white";
    doc.slides.splice(cur + 1, 0, s);
    cur++;
    sel = -1;
    commit();
  }
  function dupSlide() {
    pushHistory();
    doc.slides.splice(cur + 1, 0, SF.clone(cs()));
    cur++;
    commit();
  }
  function delSlide() {
    pushHistory();
    doc.slides.splice(cur, 1);
    if (!doc.slides.length) doc.slides.push(SF.newSlide(1));
    cur = Math.min(cur, doc.slides.length - 1);
    sel = -1;
    commit();
  }

  /* ---------- file io ---------- */
  async function saveFile(forceSaveAs) {
    try {
      flushPendingMarkdown();
    } catch (err) {
      alert("Markdownを保存できる形に読み取れませんでした:\n" + String((err && err.message) || err));
      return;
    }
    const payload = {
      json: SF.serializeDocument(doc),
      markdown: genDoc(),
      baseDir
    };
    if (isEl) {
      try {
        const r = await window.slideforge.saveFile(payload, filePath || null, !!forceSaveAs);
        if (!r) return;
        if (r.error) {
          alert("保存に失敗しました:\n" + r.error);
          return;
        }
        applyDocumentState(SFDocumentLifecycle.markSaved(documentState, r));
        if (r.json) doc = SF.parseDocumentFile(r.json);
        storeAutosave();
        renderAll();
      } catch (err) {
        alert("保存に失敗しました:\n" + String((err && err.message) || err));
      }
    } else {
      const blob = new Blob([payload.json], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "slides.sf.json";
      a.click();
      URL.revokeObjectURL(a.href);
    }
  }
  async function exportMarkdown() {
    const markdown = genDoc();
    if (isEl && typeof window.slideforge.exportMarkdown === "function") {
      try {
        const r = await window.slideforge.exportMarkdown(markdown);
        if (!r) return;
        if (r.error) {
          alert("Markdown書き出しに失敗しました:\n" + r.error);
          return;
        }
        alert("Markdown書き出しが完了しました。\n保存先: " + r.filePath);
      } catch (err) {
        alert("Markdown書き出しに失敗しました:\n" + String((err && err.message) || err));
      }
      return;
    }
    const blob = new Blob([markdown], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "slides.md";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function exportHTML() {
    if (!isEl || typeof window.slideforge.exportHTML !== "function") {
      alert("単一HTML書き出しはデスクトップ版で利用できます。");
      return;
    }
    const r = await window.slideforge.exportHTML(doc, baseDir);
    if (!r) return;
    if (r.error) {
      alert("単一HTML書き出しに失敗しました:\n" + r.error);
      return;
    }
    alert("単一HTML書き出しが完了しました。\n保存先: " + r.filePath);
  }
  async function openFile() {
    if (isEl) {
      const r = await window.slideforge.openFile();
      if (!r) return;
      try {
        const nextDocument = parseFileContent(r.content, r.format);
        pushHistory();
        applyDocumentState(SFDocumentLifecycle.createOpenedState({
          sourceFormat: r.format, filePath: r.filePath, baseDir: r.dir, savedAt: r.modifiedAt
        }));
        loadDocument(nextDocument);
      } catch (err) {
        alert("ファイルを開けませんでした:\n" + String((err && err.message) || err));
      }
    } else {
      $("#fileOpen").click();
    }
  }
  async function importPptx() {
    if (!isEl) { alert("PPTXインポートはデスクトップ版（Electron）で利用できます。"); return; }
    const r = await window.slideforge.importPPTX();
    if (!r) return;
    if (r.error) { alert("インポートに失敗しました:\n" + r.error); return; }
    pushHistory();
    applyDocumentState(SFDocumentLifecycle.createImportedState(r.dir));
    loadMarkdown(r.markdown);
  }
  async function exportPptx() {
    if (!isEl || typeof window.slideforge.exportPPTX !== "function") {
      alert("PPTX書き出しはデスクトップ版で利用できます。");
      return;
    }
    if (!confirm("切り替え効果とアニメーションの動きは再現されず、静止状態で書き出されます。続けますか？")) return;

    const exportDocument = mdTyping ? SF.parseDocument($("#mdArea").value) : doc;
    try {
      const r = await window.slideforge.exportPPTX(exportDocument, baseDir);
      if (!r) return;
      if (r.error) {
        alert("PPTX書き出しに失敗しました:\n" + r.error);
        return;
      }
      alert("PPTX書き出しが完了しました。\n保存先: " + r.filePath);
    } catch (err) {
      alert("PPTX書き出しに失敗しました:\n" + String((err && err.message) || err));
    }
  }

  function openShow() {
    localStorage.setItem("sf_doc", genDoc());
    localStorage.setItem("sf_doc_json", SF.serializeDocument(doc));
    localStorage.setItem("sf_basedir", baseDir);
    localStorage.setItem("sf_start", String(cur));
    window.open("viewer.html", "_blank");
  }

  function showDocumentInfo() {
    let dlg = $("#documentInfoDialog");
    if (dlg) dlg.remove();
    const info = SFDocumentLifecycle.getDocumentInfo(doc, documentState, SF.SCHEMA_VERSION);
    dlg = document.createElement("div");
    dlg.id = "documentInfoDialog";
    const box = document.createElement("div");
    box.className = "find-box";
    const title = document.createElement("h3");
    title.textContent = "資料情報";
    box.appendChild(title);
    const rows = [
      ["保存先", info.filePath || "未保存"],
      ["最終保存", info.lastSavedAt ? new Date(info.lastSavedAt).toLocaleString() : "未保存"],
      ["スライド", info.slides + "枚"],
      ["画像 / 動画 / 音声", info.images + " / " + info.videos + " / " + info.audios],
      ["コメント", info.comments + "件"],
      ["JSON版", String(info.jsonVersion)]
    ];
    rows.forEach(function (row) {
      const line = document.createElement("div");
      line.className = "info-row";
      const label = document.createElement("span");
      label.textContent = row[0];
      const value = document.createElement("span");
      value.textContent = row[1];
      line.appendChild(label); line.appendChild(value); box.appendChild(line);
    });
    const actions = document.createElement("div");
    actions.className = "find-actions";
    const raw = propButton("保存データを確認（書き換え不可）", function () {
      const area = document.createElement("textarea");
      area.className = "raw-json";
      area.readOnly = true;
      area.value = SF.serializeDocument(doc);
      raw.replaceWith(area);
    });
    const close = propButton("閉じる", function () { dlg.remove(); });
    actions.appendChild(raw); actions.appendChild(close); box.appendChild(actions);
    dlg.appendChild(box);
    dlg.addEventListener("mousedown", function (event) { if (event.target === dlg) dlg.remove(); });
    document.body.appendChild(dlg);
  }

  /* ---------- find & replace ---------- */
  function countMatches(find) {
    let count = 0;
    doc.slides.forEach(s => s.objects.forEach(o => {
      count += (String(o.content || "").split(find).length - 1);
    }));
    return count;
  }
  function replaceAll(find, rep) {
    pushHistory();
    doc.slides.forEach(s => s.objects.forEach(o => {
      if (o.content) o.content = o.content.split(find).join(rep);
    }));
    dropNoopHistory();
    commit();
  }
  function findReplace() {
    let dlg = $("#findDialog");
    if (dlg) dlg.remove();
    dlg = document.createElement("div");
    dlg.id = "findDialog";
    const box = document.createElement("div");
    box.className = "find-box";
    const title = document.createElement("h3");
    title.textContent = "検索/置換";
    const findInput = document.createElement("input");
    findInput.placeholder = "検索文字列";
    const repInput = document.createElement("input");
    repInput.placeholder = "置換文字列";
    const msg = document.createElement("div");
    msg.className = "find-message";
    const actions = document.createElement("div");
    actions.className = "find-actions";
    const close = propButton("閉じる", () => dlg.remove());
    const findBtn = propButton("検索", () => {
      const find = findInput.value;
      msg.textContent = find ? '"' + find + '" は ' + countMatches(find) + " 件見つかりました。" : "検索文字列を入力してください。";
    });
    const repBtn = propButton("すべて置換", () => {
      const find = findInput.value;
      if (!find) { msg.textContent = "検索文字列を入力してください。"; return; }
      const count = countMatches(find);
      replaceAll(find, repInput.value);
      msg.textContent = count + " 件置換しました。";
    });
    actions.appendChild(close);
    actions.appendChild(findBtn);
    actions.appendChild(repBtn);
    box.appendChild(title);
    box.appendChild(findInput);
    box.appendChild(repInput);
    box.appendChild(msg);
    box.appendChild(actions);
    dlg.appendChild(box);
    dlg.addEventListener("mousedown", e => { if (e.target === dlg) dlg.remove(); });
    document.body.appendChild(dlg);
    findInput.focus();
  }

  function showTransitionDialog(slideIndex) {
    let dlg = $("#transitionDialog");
    if (dlg) dlg.remove();
    const slide = doc.slides[slideIndex];
    dlg = document.createElement("div");
    dlg.id = "transitionDialog";
    const box = document.createElement("div");
    box.className = "transition-box";
    const title = document.createElement("h3");
    title.textContent = "スライド切り替え";
    const effectRow = document.createElement("div");
    effectRow.className = "dialog-row";
    const effectLabel = document.createElement("label");
    effectLabel.textContent = "効果";
    const effect = document.createElement("select");
    transitionOptions.forEach(pair => {
      const op = document.createElement("option");
      op.value = pair[0];
      op.textContent = pair[1];
      if (pair[0] === (slide.meta.transition || "fade")) op.selected = true;
      effect.appendChild(op);
    });
    effectRow.appendChild(effectLabel);
    effectRow.appendChild(effect);
    const durRow = document.createElement("div");
    durRow.className = "dialog-row";
    const durLabel = document.createElement("label");
    durLabel.textContent = "時間(秒)";
    const duration = document.createElement("input");
    duration.type = "number";
    duration.step = "0.1";
    duration.min = "0";
    duration.value = num(slide.meta.transitionDuration, 0.3);
    durRow.appendChild(durLabel);
    durRow.appendChild(duration);
    const actions = document.createElement("div");
    actions.className = "find-actions";
    const close = propButton("閉じる", () => dlg.remove());
    const save = propButton("保存", () => {
      pushHistory();
      slide.meta.transition = effect.value;
      if (effect.value === "none") delete slide.meta.transitionDuration;
      else slide.meta.transitionDuration = num(duration.value, 0.3);
      dlg.remove();
      commit();
    });
    actions.appendChild(close);
    actions.appendChild(save);
    box.appendChild(title);
    box.appendChild(effectRow);
    box.appendChild(durRow);
    box.appendChild(actions);
    dlg.appendChild(box);
    dlg.addEventListener("mousedown", e => { if (e.target === dlg) dlg.remove(); });
    document.body.appendChild(dlg);
    duration.focus();
  }

  /* ---------- context menus ---------- */
  function showMenu(menu, x, y) {
    menu.style.display = "block";
    menu.style.left = Math.min(x, innerWidth - 200) + "px";
    menu.style.top = Math.min(y, innerHeight - 260) + "px";
  }
  function hideMenus() {
    $("#objMenu").style.display = "none";
    $("#slideMenu").style.display = "none";
  }
  document.addEventListener("click", hideMenus);
  $("#objMenu").addEventListener("click", (e) => {
    const act = e.target.dataset.act;
    if (!act) return;
    hideMenus();
    if (act === "del") deleteObj();
    else if (act === "dup") dupObj();
    else layerOp(act);
  });
  $("#slideMenu").addEventListener("click", (e) => {
    const act = e.target.dataset.act;
    if (!act) return;
    hideMenus();
    if (act === "add") addSlide();
    else if (act === "dup") dupSlide();
    else if (act === "del") delSlide();
    else if (act === "trFade") { pushHistory(); cs().meta.transition = "fade"; commit(); }
    else if (act === "trNone") { pushHistory(); cs().meta.transition = "none"; commit(); }
  });

  /* ---------- menu bar wiring ---------- */
  $("#btnOpen").addEventListener("click", openFile);
  $("#btnSave").addEventListener("click", () => saveFile(false));
  $("#btnSaveAs").addEventListener("click", () => saveFile(true));
  $("#btnInfo").addEventListener("click", showDocumentInfo);
  $("#btnExportMd").addEventListener("click", exportMarkdown);
  $("#btnExportHtml").addEventListener("click", exportHTML);
  $("#btnUndo").addEventListener("click", undo);
  $("#btnRedo").addEventListener("click", redo);
  $("#btnShow").addEventListener("click", openShow);
  const importPptxButton = $("#btnPptx");
  const exportPptxButton = document.createElement("button");
  exportPptxButton.id = "btnExportPptx";
  exportPptxButton.type = "button";
  exportPptxButton.className = importPptxButton.className;
  exportPptxButton.textContent = "PPTX書き出し";
  importPptxButton.insertAdjacentElement("afterend", exportPptxButton);
  importPptxButton.addEventListener("click", importPptx);
  exportPptxButton.addEventListener("click", exportPptx);
  $("#btnReplace").addEventListener("click", findReplace);
  $("#btnMd").addEventListener("click", () => {
    showBottomPanel("md");
  });
  $("#btnNotes").addEventListener("click", () => {
    showBottomPanel("notes");
  });
  $("#btnComments").addEventListener("click", () => {
    showBottomPanel("comments");
  });
  $("#btnAddComment").addEventListener("click", () => {
    const input = $("#commentInput");
    const text = input.value.trim();
    if (!text) return;
    pushHistory();
    if (!Array.isArray(cs().meta.comments)) cs().meta.comments = [];
    cs().meta.comments.push({
      id: "c_" + Date.now().toString(36),
      text,
      resolved: false
    });
    input.value = "";
    commit();
  });

  document.querySelectorAll("[data-ins]").forEach(b => b.addEventListener("click", async () => {
    const k = b.dataset.ins;
    if (k === "textbox") addObj(SF.newObject("textbox"));
    else if (k === "rect") addObj(SF.newObject("shape", { type: "rect" }));
    else if (k === "ellipse") addObj(SF.newObject("shape", { type: "ellipse" }));
    else if (k === "animate") addObj(SF.newObject("animate"));
    else if (k === "table") {
      addObj(SF.newObject("table"));
    } else if (k === "chart") {
      addObj(SF.newObject("chart"));
    } else if (k === "image" || k === "video" || k === "audio") {
      await insertMedia(k);
    }
  }));

  async function insertMedia(kind) {
    if (isEl) {
      const p = await window.slideforge.chooseMedia(kind);
      if (!p) return;
      const o = SF.newObject(kind);
      const norm = p.replace(/\\/g, "/");
      const base = baseDir ? baseDir.replace(/\\/g, "/") : "";
      o.src = (base && norm.startsWith(base + "/")) ? norm.slice(base.length + 1) : norm;
      addObj(o);
    } else {
      mediaKind = kind;
      const fi = $("#fileMedia");
      fi.accept = kind === "image" ? "image/*" : kind === "video" ? "video/*" : "audio/*";
      fi.value = "";
      fi.click();
    }
  }
  $("#fileMedia").addEventListener("change", () => {
    const f = $("#fileMedia").files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const o = SF.newObject(mediaKind);
      o.src = rd.result;
      addObj(o);
    };
    rd.readAsDataURL(f);
  });
  $("#fileOpen").addEventListener("change", () => {
    const f = $("#fileOpen").files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      pushHistory();
      const format = /\.json$/i.test(f.name) ? "json" : "markdown";
      try {
        applyDocumentState(SFDocumentLifecycle.createOpenedState({ sourceFormat: format, baseDir: "" }));
        loadFileContent(rd.result, format);
      } catch (err) {
        alert("ファイルを開けませんでした:\n" + String((err && err.message) || err));
      }
    };
    rd.readAsText(f);
  });

  document.querySelectorAll("[data-theme]").forEach(b =>
    b.addEventListener("click", () => {
      pushHistory();
      cs().meta.theme = b.dataset.theme;
      commit();
    }));

  /* ---------- markdown panel (双方向同期) ---------- */
  $("#mdArea").addEventListener("input", () => {
    mdTyping = true;
    clearTimeout(mdTimer);
    mdTimer = setTimeout(() => {
      flushPendingMarkdown();
    }, 600);
  });
  $("#noteArea").addEventListener("focus", () => {
    if (!noteTyping) pushHistory();
    noteTyping = true;
  });
  $("#noteArea").addEventListener("input", () => {
    clearTimeout(noteTimer);
    cs().meta.notes = $("#noteArea").value;
    markDocumentChanged();
    storeAutosave();
    noteTimer = setTimeout(() => {
      noteTyping = false;
      dropNoopHistory();
      updateMdPanel();
    }, 600);
  });
  $("#noteArea").addEventListener("blur", () => {
    clearTimeout(noteTimer);
    noteTyping = false;
    dropNoopHistory();
    storeAutosave();
    updateMdPanel();
  });

  /* ---------- canvas misc ---------- */
  $("#canvas").addEventListener("mousedown", (e) => {
    if (e.target.id === "canvas") { sel = -1; renderCanvas(); renderProps(); updateStatus(); }
  });
  $("#canvasWrap").addEventListener("contextmenu", (e) => e.preventDefault());

  /* ---------- keyboard ---------- */
  document.addEventListener("keydown", (e) => {
    if (textEditing) return;
    const tg = (document.activeElement && document.activeElement.tagName) || "";
    const typing = tg === "INPUT" || tg === "TEXTAREA" || tg === "SELECT";
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveFile(false); return; }
    if (typing) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); redo(); return; }
    if (e.key === "Delete" || (e.key === "Backspace" && sel >= 0)) {
      e.preventDefault();
      if (sel >= 0) deleteObj();
      else delSlide();
      return;
    }
    if ((e.key === "Enter" || e.key === "F2") && so() && ["textbox", "animate", "table", "chart"].includes(so().kind)) {
      e.preventDefault();
      startTextEdit(sel);
      return;
    }
    const o = so();
    if (o && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(e.key) >= 0) {
      e.preventDefault();
      pushHistory();
      const d = e.shiftKey ? 1 : 10;
      if (e.key === "ArrowUp") o.meta.y = num(o.meta.y, 0) - d;
      if (e.key === "ArrowDown") o.meta.y = num(o.meta.y, 0) + d;
      if (e.key === "ArrowLeft") o.meta.x = num(o.meta.x, 0) - d;
      if (e.key === "ArrowRight") o.meta.x = num(o.meta.x, 0) + d;
      o.loose = false;
      commit();
    }
  });

  /* ---------- init ---------- */
  window.addEventListener("resize", fitCanvas);
  const savedJson = localStorage.getItem("sf_document");
  if (savedJson && confirm("前回の作業内容が内部に自動保存されています。復元しますか？\n保存先は引き継がれず、次の保存で新しいJSONファイルを選びます。")) {
    try {
      doc = SF.parseDocumentFile(savedJson);
      applyDocumentState(SFDocumentLifecycle.markChanged(SFDocumentLifecycle.createNewState("")));
    } catch (_error) {
      clearAutosave();
      doc = SF.parseDocument(SAMPLE);
    }
  } else {
    if (savedJson) clearAutosave();
    doc = SF.parseDocument(SAMPLE);
  }
  fitCanvas();
  renderAll();
  setTimeout(fitCanvas, 50);
})();
