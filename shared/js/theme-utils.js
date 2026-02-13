/**
 * Shared Theme Utilities fuer alle FinanzApp-Seiten.
 * Alle Funktionen sind bewusst zentralisiert, damit Theme-Logik nur einmal existiert.
 */
(function initSharedThemeUtilities() {
  const sThemeStorageKey = "finanzapp.themeMode";
  const oThemeOptions = new Set(["light", "dark", "auto"]);
  const oPrefersDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");

  /**
   * Liest den gespeicherten Theme-Modus aus localStorage.
   * @returns {"light"|"dark"|"auto"} Gespeicherter oder fallback Modus.
   */
  function fnGetStoredThemeMode() {
    const sStoredMode = window.localStorage.getItem(sThemeStorageKey);
    if (sStoredMode && oThemeOptions.has(sStoredMode)) return sStoredMode;
    return "auto";
  }

  /**
   * Loest den effektiven Theme-Wert auf.
   * @param {"light"|"dark"|"auto"} sThemeMode Gewuenschter Modus.
   * @returns {"light"|"dark"} Effektiver Modus fuer das DOM.
   */
  function fnResolveThemeMode(sThemeMode) {
    if (sThemeMode === "auto") return oPrefersDarkQuery.matches ? "dark" : "light";
    return sThemeMode;
  }

  /**
   * Aktualisiert alle Theme-Buttons (active state + aria-pressed).
   * @param {"light"|"dark"|"auto"} sThemeMode Aktiver Modus.
   */
  function fnUpdateThemeButtons(sThemeMode) {
    const aThemeButtons = document.querySelectorAll(".theme-option");
    for (const oThemeButton of aThemeButtons) {
      const bIsActive = oThemeButton.dataset.themeChoice === sThemeMode;
      oThemeButton.classList.toggle("is-active", bIsActive);
      oThemeButton.setAttribute("aria-pressed", String(bIsActive));
    }
  }

  /**
   * Setzt Theme-Attribute am `documentElement` und synchronisiert die Buttons.
   * @param {"light"|"dark"|"auto"} sThemeMode Gewuenschter Modus.
   * @returns {"light"|"dark"} Effektiv gesetzter Modus.
   */
  function fnApplyThemeMode(sThemeMode) {
    const sResolvedThemeMode = fnResolveThemeMode(sThemeMode);
    document.documentElement.dataset.theme = sResolvedThemeMode;
    document.documentElement.dataset.themeMode = sThemeMode;
    fnUpdateThemeButtons(sThemeMode);
    return sResolvedThemeMode;
  }

  /**
   * Speichert den Theme-Modus persistent und setzt ihn sofort.
   * @param {"light"|"dark"|"auto"} sThemeMode Neuer Modus.
   * @returns {"light"|"dark"} Effektiv gesetzter Modus.
   */
  function fnSaveAndApplyThemeMode(sThemeMode) {
    if (!oThemeOptions.has(sThemeMode)) return fnApplyThemeMode(fnGetStoredThemeMode());
    window.localStorage.setItem(sThemeStorageKey, sThemeMode);
    return fnApplyThemeMode(sThemeMode);
  }

  /**
   * Initialisiert den Theme-Switcher auf der aktuellen Seite.
   * - Setzt den gespeicherten Modus.
   * - Bindet Click-Events an `.theme-option`.
   * - Reagiert auf OS-Theme-Wechsel bei `auto`.
   */
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

  window.FinanzAppTheme = {
    getStoredThemeMode: fnGetStoredThemeMode,
    resolveThemeMode: fnResolveThemeMode,
    updateThemeButtons: fnUpdateThemeButtons,
    applyThemeMode: fnApplyThemeMode,
    saveAndApplyThemeMode: fnSaveAndApplyThemeMode,
    initThemeSwitcher: fnInitThemeSwitcher
  };
})();
