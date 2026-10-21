/* SlideForge Viewer (スライドショー) */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const num = SF.num;

  let doc = null;       /* SOM */
  let cur = 0;          /* 現在スライド */
  let baseDir = "";
  let muted = false;
  let queue = [];       /* 現在スライドのアニメーションキュー [{node, anim}] */
  let qi = 0;           /* 次に再生するキュー位置 */

  /* ============ 初期化 ============ */
  function init() {
    baseDir = localStorage.getItem("sf_basedir") || "";
    if (window.SLIDEFORGE_DOCUMENT) {
      doc = window.SLIDEFORGE_DOCUMENT;
    } else {
      const json = localStorage.getItem("sf_doc_json") || localStorage.getItem("sf_document");
      const md = localStorage.getItem("sf_doc") || localStorage.getItem("sf_autosave");
      try {
        doc = json ? SF.parseDocumentFile(json) : (md ? SF.parseDocument(md) : null);
      } catch (_error) {
        doc = md ? SF.parseDocument(md) : null;
      }
    }
    if (doc) {
      cur = parseInt(localStorage.getItem("sf_start") || "0", 10) || 0;
      if (cur >= doc.slides.length) cur = 0;
      $("#overlay").style.display = "none";
      show(cur, false);
    }
  }

  $("#vfile").addEventListener("change", () => {
    const f = $("#vfile").files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        doc = /\.json$/i.test(f.name) ? SF.parseDocumentFile(rd.result) : SF.parseDocument(rd.result);
        cur = 0;
        $("#overlay").style.display = "none";
        show(0, false);
      } catch (error) {
        alert("ファイルを開けませんでした:\n" + String((error && error.message) || error));
      }
    };
    rd.readAsText(f);
  });

  /* ============ スライド構築 ============ */
  function buildSlide(i) {
    const s = doc.slides[i];
    const el = document.createElement("div");
    SF.applySlideStyle(el, s.meta, baseDir);
    s.objects.forEach(o => el.appendChild(SF.buildObjectEl(o, { baseDir, mode: "view" })));
    return el;
  }

  function fit() {
    const layer = $("#stage .sf-transition-layer");
    if (!layer) return;
    const sc = Math.min(innerWidth / 1920, innerHeight / 1080);
    layer.style.transform = "scale(" + sc + ")";
  }
  window.addEventListener("resize", fit);

  /* ============ メディア統括制御 ============ */
  function stopMedia() {
    /* 遷移時: 必ず pause し currentTime を先頭(trimStart)へ戻す */
    document.querySelectorAll("#stage video, #stage audio").forEach(m => {
      try {
        m.pause();
        const ts = parseFloat(m.dataset.trimStart || "0") || 0;
        if (m.readyState > 0) m.currentTime = ts;
      } catch (e) { /* noop */ }
    });
  }

  function setupMedia(slideEl, s) {
    s.objects.forEach((o, idx) => {
      const node = slideEl.children[idx];
      if (!node) return;
      const m = o.meta || {};
      const media = node.querySelector("video, audio");
      if (!media) return;

      const ts = num(m.trimStart, 0), te = num(m.trimEnd, 0);
      media.dataset.trimStart = String(ts);
      media.muted = muted;
      media.loop = !!m.loop;
      media.volume = Math.min(1, Math.max(0, num(m.volume, 1)));

      const applyTrimStart = () => { if (ts > 0) { try { media.currentTime = ts; } catch (e) {} } };
      if (media.readyState > 0) applyTrimStart();
      else media.addEventListener("loadedmetadata", applyTrimStart);

      if (te > 0) {
        media.addEventListener("timeupdate", () => {
          if (media.currentTime >= te) {
            media.pause();
            if (media.loop) { applyTrimStart(); media.play().catch(() => {}); }
          }
        });
      }
      if (m.autoplay) media.play().catch(() => {});

      /* クリックで再生/停止 (スライド送りクリックとは分離) */
      node.style.cursor = "pointer";
      node.addEventListener("click", (e) => {
        e.stopPropagation();
        if (media.paused) media.play().catch(() => {}); else media.pause();
      });

      /* 音声アイコンの状態表示 */
      if (o.kind === "audio") {
        const g = node.querySelector(".sf-audio-glyph");
        const updateIcon = () => { if (g) g.textContent = media.paused ? "🔊" : "⏸"; };
        media.addEventListener("play", updateIcon);
        media.addEventListener("pause", updateIcon);
        updateIcon();
      }
    });
  }

  /* ============ アニメーション(ステップ式) ============ */
  /* Markdown記述順 = 実行順。初期状態を設定し、next操作で1つずつ消化する */
  function buildAnimQueue(slideEl, s) {
    queue = [];
    qi = 0;
    s.objects.forEach((o, idx) => {
      const a = SF.getAnim(o);
      if (!a) return;
      const node = slideEl.children[idx];
      if (!node) return;
      const initial = SF.animationInitialStyle(a.type);
      node.style.opacity = initial.opacity;
      node.style.transform = initial.transform;
      queue.push({ node, anim: a });
    });
  }

  function playNextAnim() {
    if (qi >= queue.length) return false;
    const item = queue[qi++];
    const a = item.anim;
    const delay = Math.max(0, a.delay * 1000);
    const dur = Math.max(50, a.duration * 1000);
    item.node.animate(SF.animationFrames(a.type), {
      delay,
      duration: dur,
      fill: "forwards",
      easing: a.type === "pulse" ? "ease-in-out" : "ease-out"
    });
    return true;
  }

  /* ============ スライド表示 ============ */
  function show(i, withTransition) {
    if (!doc) return;
    stopMedia();
    cur = Math.max(0, Math.min(i, doc.slides.length - 1));
    const stage = $("#stage");
    stage.innerHTML = "";
    const s = doc.slides[cur];
    const el = buildSlide(cur);
    const layer = document.createElement("div");
    layer.className = "sf-transition-layer";
    layer.appendChild(el);
    stage.appendChild(layer);
    fit();
    const transition = s.meta.transition || "fade";
    const frames = SF.transitionFrames(transition);
    if (withTransition !== false && frames) {
      const transitionDuration = Math.max(0, num(s.meta.transitionDuration, 0.3) * 1000);
      el.animate(frames, { duration: transitionDuration, easing: "ease-out" });
    }
    buildAnimQueue(el, s);   /* アニメ状態リセット&キュー再構築 */
    setupMedia(el, s);
    $("#pageInfo").textContent = (cur + 1) + " / " + doc.slides.length;
    buildSidebar();
  }

  function next() {
    if (!doc) return;
    if (playNextAnim()) return;          /* 残アニメがあれば1つ進める */
    if (cur < doc.slides.length - 1) show(cur + 1);
  }
  function prev() {
    if (!doc) return;
    if (cur > 0) show(cur - 1);
  }

  /* ============ サイドバー(スライド一覧) ============ */
  function buildSidebar() {
    const sb = $("#sidebar");
    sb.innerHTML = "";
    if (!doc) return;
    doc.slides.forEach((s, i) => {
      const b = document.createElement("button");
      b.textContent = (i + 1) + ". " + (s.meta.title || "スライド" + (i + 1));
      if (i === cur) b.classList.add("cur");
      b.addEventListener("click", () => { sb.classList.remove("open"); show(i); });
      sb.appendChild(b);
    });
    const act = document.createElement("div");
    act.className = "act";
    const pr = document.createElement("button");
    pr.textContent = "🖨 PDF出力（印刷）";
    pr.addEventListener("click", () => window.print());
    act.appendChild(pr);
    sb.appendChild(act);
  }
  $("#menuBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    $("#sidebar").classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (!$("#sidebar").contains(e.target) && e.target.id !== "menuBtn") {
      $("#sidebar").classList.remove("open");
    }
  });

  /* ============ 印刷: 全スライドを1枚1ページで展開 ============ */
  window.addEventListener("beforeprint", () => {
    const pa = $("#printArea");
    pa.innerHTML = "";
    if (!doc) return;
    doc.slides.forEach((s, i) => {
      const el = buildSlide(i);
      /* 印刷時はアニメ対象も含め全て可視化 */
      Array.prototype.forEach.call(el.children, c => { c.style.opacity = "1"; });
      pa.appendChild(el);
    });
  });
  window.addEventListener("afterprint", () => { $("#printArea").innerHTML = ""; });

  /* ============ キーボード / クリック ============ */
  document.addEventListener("keydown", (e) => {
    if (!doc) return;
    if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); prev(); }
    else if (e.key === "Escape") {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (window.opener) window.close();
      else show(0);
    }
    else if (e.key.toLowerCase() === "f") {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    }
    else if (e.key.toLowerCase() === "m") {
      muted = !muted;
      document.querySelectorAll("#stage video, #stage audio").forEach(m => { m.muted = muted; });
    }
    else if (e.key === "Home") show(0);
    else if (e.key === "End") show(doc.slides.length - 1);
  });

  $("#stage").addEventListener("click", (e) => {
    if (!doc) return;
    /* メディア要素のクリックは再生制御に譲る */
    if (e.target.closest(".sf-video") || e.target.closest(".sf-audio-icon")) return;
    next();
  });

  init();
})();
