/* SlideForge Generator: SOM -> Markdown (round-trip 保証) */
(function (global) {
  const SF = global.SF || (global.SF = {});

  function yamlVal(v) {
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (v && typeof v === "object") return JSON.stringify(v);
    const s = String(v).replace(/"/g, '\\"').replace(/\n/g, "\\n");
    return '"' + s + '"';
  }
  function escContent(c) {
    return String(c).replace(/(^|\n):::/g, "$1\\:::");
  }
  function propVal(v) {
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return '"' + String(v).replace(/"/g, "") + '"';
  }

  function genObject(o) {
    if (o.kind === "image" || o.kind === "video" || o.kind === "audio") {
      const props = [["id", o.id]].concat(Object.entries(o.meta || {}))
        .filter(pair => pair[1] !== undefined && pair[1] !== null && pair[1] !== "")
        .map(pair => pair[0] + "=" + propVal(pair[1]))
        .join(" ");
      return "![" + o.kind + "](" + (o.src || "") + "){" + props + "}";
    }
    let out = ":::" + o.kind + "\n";
    if (o.id) out += "id: " + yamlVal(o.id) + "\n";
    for (const k of Object.keys(o.meta || {})) out += k + ": " + yamlVal(o.meta[k]) + "\n";
    out += "---\n";
    out += (o.content ? escContent(o.content) + "\n" : "\n");
    out += ":::";
    return out;
  }

  function genSlide(s) {
    let out = "---\n";
    for (const k of Object.keys(s.meta || {})) out += k + ": " + yamlVal(s.meta[k]) + "\n";
    out += "---\n\n";
    for (const o of s.objects) out += genObject(o) + "\n\n";
    return out.replace(/\n+$/, "\n");
  }

  SF.generate = function (doc) {
    return doc.slides.map(genSlide).join("\n");
  };
})(typeof window !== "undefined" ? window : globalThis);
