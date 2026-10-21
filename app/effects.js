/* SlideForge presentation effect definitions (browser and Node.js) */
(function (global, factory) {
  const api = factory();
  const SF = global.SF || (global.SF = {});
  Object.assign(SF, api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function transitionFrames(type) {
    if (type === "slide-left") {
      return [
        { opacity: 0, transform: "translateX(10%)" },
        { opacity: 1, transform: "translateX(0)" }
      ];
    }
    if (type === "zoom") {
      return [
        { opacity: 0, transform: "scale(0.92)" },
        { opacity: 1, transform: "scale(1)" }
      ];
    }
    if (type === "fade") return [{ opacity: 0 }, { opacity: 1 }];
    return null;
  }

  function animationInitialStyle(type) {
    if (type === "fade-out") return { opacity: "1", transform: "none" };
    if (type === "slide-in-left") return { opacity: "0", transform: "translateX(-80px)" };
    if (type === "slide-in-right") return { opacity: "0", transform: "translateX(80px)" };
    if (type === "zoom-in") return { opacity: "0", transform: "scale(0.72)" };
    if (type === "pulse") return { opacity: "1", transform: "scale(1)" };
    return { opacity: "0", transform: "none" };
  }

  function animationFrames(type) {
    if (type === "fade-out") return [{ opacity: 1 }, { opacity: 0 }];
    if (type === "slide-in-left") {
      return [
        { opacity: 0, transform: "translateX(-80px)" },
        { opacity: 1, transform: "translateX(0)" }
      ];
    }
    if (type === "slide-in-right") {
      return [
        { opacity: 0, transform: "translateX(80px)" },
        { opacity: 1, transform: "translateX(0)" }
      ];
    }
    if (type === "zoom-in") {
      return [
        { opacity: 0, transform: "scale(0.72)" },
        { opacity: 1, transform: "scale(1)" }
      ];
    }
    if (type === "pulse") {
      return [
        { opacity: 1, transform: "scale(1)" },
        { opacity: 1, transform: "scale(1.08)", offset: 0.5 },
        { opacity: 1, transform: "scale(1)" }
      ];
    }
    return [{ opacity: 0 }, { opacity: 1 }];
  }

  return { transitionFrames, animationInitialStyle, animationFrames };
});
