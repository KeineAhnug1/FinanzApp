/**
 * Shared Theme Utilities fuer alle FinanzApp-Seiten.
 * Alle Funktionen sind bewusst zentralisiert, damit Theme-Logik nur einmal existiert.
 */
(function initSharedThemeUtilities() {
  const sThemeStorageKey = "finanzapp.themeMode";
  const sDesignStorageKey = "finanzapp.designTheme";
  const sContrastStorageKey = "finanzapp.contrast";
  const oThemeOptions = new Set(["light", "dark", "auto"]);
  const oDesignOptions = new Set(["classic", "forest"]);
  const oContrastOptions = new Set(["normal", "high"]);
  const oPrefersDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");

  function fnGetStoredThemeMode() {
    const sStoredMode = window.localStorage.getItem(sThemeStorageKey);
    if (sStoredMode && oThemeOptions.has(sStoredMode)) return sStoredMode;
    return "auto";
  }

  function fnResolveThemeMode(sThemeMode) {
    if (sThemeMode === "auto") return oPrefersDarkQuery.matches ? "dark" : "light";
    return sThemeMode;
  }

  function fnUpdateThemeButtons(sThemeMode) {
    const aThemeButtons = document.querySelectorAll(".theme-option");
    for (const oThemeButton of aThemeButtons) {
      const bIsActive = oThemeButton.dataset.themeChoice === sThemeMode;
      oThemeButton.classList.toggle("is-active", bIsActive);
      oThemeButton.setAttribute("aria-pressed", String(bIsActive));
    }
  }

  function fnApplyThemeMode(sThemeMode) {
    const sResolvedThemeMode = fnResolveThemeMode(sThemeMode);
    document.documentElement.dataset.theme = sResolvedThemeMode;
    document.documentElement.dataset.themeMode = sThemeMode;
    fnUpdateThemeButtons(sThemeMode);
    window.dispatchEvent(new CustomEvent("finanzapp:theme-changed", { detail: { theme: sResolvedThemeMode, themeMode: sThemeMode } }));
    return sResolvedThemeMode;
  }

  function fnSaveAndApplyThemeMode(sThemeMode) {
    if (!oThemeOptions.has(sThemeMode)) return fnApplyThemeMode(fnGetStoredThemeMode());
    window.localStorage.setItem(sThemeStorageKey, sThemeMode);
    return fnApplyThemeMode(sThemeMode);
  }

  function fnInitThemeSwitcher() {
    fnApplyThemeMode(fnGetStoredThemeMode());

    const aThemeButtons = document.querySelectorAll(".theme-option");
    for (const oThemeButton of aThemeButtons) {
      oThemeButton.addEventListener("click", () => {
        const sThemeMode = oThemeButton.dataset.themeChoice;
        if (!sThemeMode || !oThemeOptions.has(sThemeMode)) return;
        fnSaveAndApplyThemeMode(sThemeMode);
      });
    }

    const fnHandleSystemThemeChange = () => {
      const sStoredThemeMode = fnGetStoredThemeMode();
      if (sStoredThemeMode === "auto") fnApplyThemeMode("auto");
    };

    if (typeof oPrefersDarkQuery.addEventListener === "function") {
      oPrefersDarkQuery.addEventListener("change", fnHandleSystemThemeChange);
    } else if (typeof oPrefersDarkQuery.addListener === "function") {
      oPrefersDarkQuery.addListener(fnHandleSystemThemeChange);
    }
  }

  /* ── Design-Theme-Funktionen ── */

  function fnGetStoredDesign() {
    const sStored = window.localStorage.getItem(sDesignStorageKey);
    if (sStored && oDesignOptions.has(sStored)) return sStored;
    return "classic";
  }

  function fnApplyDesign(sDesign) {
    const sResolved = oDesignOptions.has(sDesign) ? sDesign : "classic";
    if (sResolved === "classic") {
      delete document.documentElement.dataset.design;
    } else {
      document.documentElement.dataset.design = sResolved;
    }
    const aDesignCards = document.querySelectorAll(".design-card");
    for (const oCard of aDesignCards) {
      oCard.classList.toggle("is-active", oCard.dataset.design === sResolved);
      oCard.setAttribute("aria-pressed", String(oCard.dataset.design === sResolved));
    }
    window.dispatchEvent(new CustomEvent("finanzapp:design-changed", { detail: { design: sResolved } }));
    return sResolved;
  }

  function fnSaveAndApplyDesign(sDesign) {
    const sResolved = oDesignOptions.has(sDesign) ? sDesign : "classic";
    window.localStorage.setItem(sDesignStorageKey, sResolved);
    return fnApplyDesign(sResolved);
  }

  function fnInitDesign() {
    fnApplyDesign(fnGetStoredDesign());
  }

  /* ── Kontrast-Funktionen ── */

  function fnGetStoredContrast() {
    const sStored = window.localStorage.getItem(sContrastStorageKey);
    if (sStored && oContrastOptions.has(sStored)) return sStored;
    return "normal";
  }

  function fnApplyContrast(sContrast) {
    const sResolved = oContrastOptions.has(sContrast) ? sContrast : "normal";
    if (sResolved === "normal") {
      delete document.documentElement.dataset.contrast;
    } else {
      document.documentElement.dataset.contrast = sResolved;
    }
    const aContrastButtons = document.querySelectorAll(".contrast-option");
    for (const oBtn of aContrastButtons) {
      const bIsActive = oBtn.dataset.contrastChoice === sResolved;
      oBtn.classList.toggle("is-active", bIsActive);
      oBtn.setAttribute("aria-pressed", String(bIsActive));
    }
    window.dispatchEvent(new CustomEvent("finanzapp:contrast-changed", { detail: { contrast: sResolved } }));
    return sResolved;
  }

  function fnSaveAndApplyContrast(sContrast) {
    const sResolved = oContrastOptions.has(sContrast) ? sContrast : "normal";
    window.localStorage.setItem(sContrastStorageKey, sResolved);
    return fnApplyContrast(sResolved);
  }

  function fnInitContrast() {
    fnApplyContrast(fnGetStoredContrast());

    const aContrastButtons = document.querySelectorAll(".contrast-option");
    for (const oBtn of aContrastButtons) {
      oBtn.addEventListener("click", () => {
        const sContrast = oBtn.dataset.contrastChoice;
        if (!sContrast || !oContrastOptions.has(sContrast)) return;
        fnSaveAndApplyContrast(sContrast);
      });
    }
  }

  window.FinanzAppTheme = {
    getStoredThemeMode: fnGetStoredThemeMode,
    resolveThemeMode: fnResolveThemeMode,
    updateThemeButtons: fnUpdateThemeButtons,
    applyThemeMode: fnApplyThemeMode,
    saveAndApplyThemeMode: fnSaveAndApplyThemeMode,
    initThemeSwitcher: fnInitThemeSwitcher,
    getStoredDesign: fnGetStoredDesign,
    applyDesign: fnApplyDesign,
    saveAndApplyDesign: fnSaveAndApplyDesign,
    initDesign: fnInitDesign,
    getStoredContrast: fnGetStoredContrast,
    applyContrast: fnApplyContrast,
    saveAndApplyContrast: fnSaveAndApplyContrast,
    initContrast: fnInitContrast
  };
})();
