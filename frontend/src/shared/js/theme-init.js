(function () {
  try {
    var stored = window.localStorage.getItem("finanzapp.themeMode");
    var mode = stored === "light" || stored === "dark" || stored === "auto" ? stored : "auto";
    var resolved =
      mode === "auto"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : mode;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themeMode = mode;
    var c = window.localStorage.getItem("finanzapp.contrast");
    if (c === "high") document.documentElement.dataset.contrast = "high";
  } catch {
    /* prevent errors from blocking render */
  }
})();
