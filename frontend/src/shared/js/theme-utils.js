// @ts-check
const sThemeStorageKey = "finanzapp.themeMode";
const sDesignStorageKey = "finanzapp.designTheme";
const sContrastStorageKey = "finanzapp.contrast";
const oThemeOptions = new Set(["light", "dark", "auto"]);
const oDesignOptions = new Set(["classic", "forest"]);
const oContrastOptions = new Set(["normal", "high"]);
const oPrefersDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");

export function getStoredThemeMode() {
  const sStoredMode = window.localStorage.getItem(sThemeStorageKey);
  if (sStoredMode && oThemeOptions.has(sStoredMode)) return sStoredMode;
  return "auto";
}

export function resolveThemeMode(sThemeMode) {
  if (sThemeMode === "auto") return oPrefersDarkQuery.matches ? "dark" : "light";
  return sThemeMode;
}

function updateThemeButtons(sThemeMode) {
  const aThemeButtons = document.querySelectorAll(".theme-option");
  for (const oThemeButton of aThemeButtons) {
    const bIsActive = oThemeButton.dataset.themeChoice === sThemeMode;
    oThemeButton.classList.toggle("is-active", bIsActive);
    oThemeButton.setAttribute("aria-pressed", String(bIsActive));
  }
}

export function applyThemeMode(sThemeMode) {
  const sResolvedThemeMode = resolveThemeMode(sThemeMode);
  document.documentElement.dataset.theme = sResolvedThemeMode;
  document.documentElement.dataset.themeMode = sThemeMode;
  updateThemeButtons(sThemeMode);
  window.dispatchEvent(new CustomEvent("finanzapp:theme-changed", { detail: { theme: sResolvedThemeMode, themeMode: sThemeMode } }));
  return sResolvedThemeMode;
}

export function saveAndApplyThemeMode(sThemeMode) {
  if (!oThemeOptions.has(sThemeMode)) return applyThemeMode(getStoredThemeMode());
  window.localStorage.setItem(sThemeStorageKey, sThemeMode);
  return applyThemeMode(sThemeMode);
}

export function initThemeSwitcher() {
  applyThemeMode(getStoredThemeMode());

  const aThemeButtons = document.querySelectorAll(".theme-option");
  for (const oThemeButton of aThemeButtons) {
    oThemeButton.addEventListener("click", () => {
      const sThemeMode = oThemeButton.dataset.themeChoice;
      if (!sThemeMode || !oThemeOptions.has(sThemeMode)) return;
      saveAndApplyThemeMode(sThemeMode);
    });
  }

  const fnHandleSystemThemeChange = () => {
    const sStoredThemeMode = getStoredThemeMode();
    if (sStoredThemeMode === "auto") applyThemeMode("auto");
  };

  if (typeof oPrefersDarkQuery.addEventListener === "function") {
    oPrefersDarkQuery.addEventListener("change", fnHandleSystemThemeChange);
  } else if (typeof oPrefersDarkQuery.addListener === "function") {
    oPrefersDarkQuery.addListener(fnHandleSystemThemeChange);
  }
}

export function getStoredDesign() {
  const sStored = window.localStorage.getItem(sDesignStorageKey);
  if (sStored && oDesignOptions.has(sStored)) return sStored;
  return "classic";
}

export function applyDesign(sDesign) {
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

export function saveAndApplyDesign(sDesign) {
  const sResolved = oDesignOptions.has(sDesign) ? sDesign : "classic";
  window.localStorage.setItem(sDesignStorageKey, sResolved);
  return applyDesign(sResolved);
}

export function initDesign() {
  applyDesign(getStoredDesign());
}

export function getStoredContrast() {
  const sStored = window.localStorage.getItem(sContrastStorageKey);
  if (sStored && oContrastOptions.has(sStored)) return sStored;
  return "normal";
}

export function applyContrast(sContrast) {
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

export function saveAndApplyContrast(sContrast) {
  const sResolved = oContrastOptions.has(sContrast) ? sContrast : "normal";
  window.localStorage.setItem(sContrastStorageKey, sResolved);
  return applyContrast(sResolved);
}

export function initContrast() {
  applyContrast(getStoredContrast());

  const aContrastButtons = document.querySelectorAll(".contrast-option");
  for (const oBtn of aContrastButtons) {
    oBtn.addEventListener("click", () => {
      const sContrast = oBtn.dataset.contrastChoice;
      if (!sContrast || !oContrastOptions.has(sContrast)) return;
      saveAndApplyContrast(sContrast);
    });
  }
}

