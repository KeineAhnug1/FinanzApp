(function () {
  try {
    var stored = window.localStorage.getItem("finanzapp.themeMode");
    var mode = (stored === "light" || stored === "dark" || stored === "auto") ? stored : "auto";
    var resolved = mode === "auto" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : mode;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themeMode = mode;
    var d = window.localStorage.getItem("finanzapp.designTheme");
    if (d === "forest") document.documentElement.dataset.design = d;
    var c = window.localStorage.getItem("finanzapp.contrast");
    if (c === "high") document.documentElement.dataset.contrast = "high";
  } catch { /* prevent errors from blocking render */ }
})();
