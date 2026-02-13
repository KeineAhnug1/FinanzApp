// Laufzeit-Helfer: Theme, Settings-Speicherung, View-Wechsel und Session-Zugriff.
function getStoredThemeMode() {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored && THEME_OPTIONS.has(stored)) return stored;
  return "auto";
}

function resolveTheme(mode) {
  return mode === "auto" ? (prefersDarkQuery.matches ? "dark" : "light") : mode;
}

function updateThemeButtons(mode) {
  const buttons = document.querySelectorAll(".theme-option");
  for (const button of buttons) {
    const isActive = button.dataset.themeChoice === mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
}

function applyTheme(mode) {
  document.documentElement.dataset.theme = resolveTheme(mode);
  document.documentElement.dataset.themeMode = mode;
  updateThemeButtons(mode);
}

function initThemeSwitcher() {
  applyTheme(getStoredThemeMode());

  const buttons = document.querySelectorAll(".theme-option");
  for (const button of buttons) {
    button.addEventListener("click", () => {
      const mode = button.dataset.themeChoice;
      if (!mode || !THEME_OPTIONS.has(mode)) return;
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
      applyTheme(mode);
    });
  }

  const handleSchemeChange = () => {
    if (getStoredThemeMode() === "auto") applyTheme("auto");
  };
  if (typeof prefersDarkQuery.addEventListener === "function") {
    prefersDarkQuery.addEventListener("change", handleSchemeChange);
  } else if (typeof prefersDarkQuery.addListener === "function") {
    prefersDarkQuery.addListener(handleSchemeChange);
  }
}

function sanitizeSettingChoice(value, allowedValues, fallback) {
  const normalized = String(value || "").trim();
  return allowedValues.has(normalized) ? normalized : fallback;
}

function normalizeDashboardSettings(raw) {
  const base = raw && typeof raw === "object" ? raw : {};
  return {
    currency: sanitizeSettingChoice(base.currency, SETTINGS_CURRENCY_OPTIONS, DEFAULT_DASHBOARD_SETTINGS.currency),
    locale: sanitizeSettingChoice(base.locale, SETTINGS_LOCALE_OPTIONS, DEFAULT_DASHBOARD_SETTINGS.locale),
    startView: sanitizeSettingChoice(base.startView, VIEW_OPTIONS, DEFAULT_DASHBOARD_SETTINGS.startView),
    defaultIncomeRecurrence: sanitizeSettingChoice(
      base.defaultIncomeRecurrence,
      SETTINGS_RECURRENCE_OPTIONS,
      DEFAULT_DASHBOARD_SETTINGS.defaultIncomeRecurrence
    ),
    defaultExpenseRecurrence: sanitizeSettingChoice(
      base.defaultExpenseRecurrence,
      SETTINGS_RECURRENCE_OPTIONS,
      DEFAULT_DASHBOARD_SETTINGS.defaultExpenseRecurrence
    )
  };
}

function settingsStorageKey(userId) {
  return `${SETTINGS_STORAGE_PREFIX}.${userId || "anonymous"}`;
}

function loadDashboardSettings(userId) {
  const raw = window.localStorage.getItem(settingsStorageKey(userId));
  if (!raw) return { ...DEFAULT_DASHBOARD_SETTINGS };
  try {
    return normalizeDashboardSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_DASHBOARD_SETTINGS };
  }
}

function saveDashboardSettings(userId, settings) {
  window.localStorage.setItem(settingsStorageKey(userId), JSON.stringify(normalizeDashboardSettings(settings)));
}

function getLocale() {
  return appState.settings?.locale || DEFAULT_DASHBOARD_SETTINGS.locale;
}

function getCurrency() {
  return appState.settings?.currency || DEFAULT_DASHBOARD_SETTINGS.currency;
}

function applyDashboardSettings(nextSettings, options = {}) {
  const { persist = false, rerender = true } = options;
  const normalized = normalizeDashboardSettings(nextSettings);
  appState.settings = normalized;

  if (persist && appState.user?.id) {
    saveDashboardSettings(appState.user.id, normalized);
  }

  if (rerender) {
    renderIncomeList(appState.incomeEntries);
    renderExpenseList(appState.expenseEntries);
    if (appState.user) {
      updateFinanceCards(appState.user, appState.incomeEntries, appState.expenseEntries);
    }
    setActiveView(normalized.startView);
  }
}

function getStoredView(fallbackView = "overview") {
  const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
  if (stored && VIEW_OPTIONS.has(stored)) return stored;
  return VIEW_OPTIONS.has(fallbackView) ? fallbackView : "overview";
}

function setActiveView(view) {
  const nextView = VIEW_OPTIONS.has(view) ? view : "overview";

  const tabs = document.querySelectorAll("[data-view-tab]");
  for (const tab of tabs) {
    const isActive = tab.dataset.viewTab === nextView;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  }

  const panels = document.querySelectorAll("[data-view-panel]");
  for (const panel of panels) {
    panel.hidden = panel.dataset.viewPanel !== nextView;
  }

  window.localStorage.setItem(VIEW_STORAGE_KEY, nextView);
}

function initSectionTabs() {
  setActiveView(appState.settings?.startView || "overview");

  const tabs = document.querySelectorAll("[data-view-tab]");
  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const targetView = tab.dataset.viewTab;
      if (!targetView) return;
      setActiveView(targetView);
    });
  }
}

function getCurrentUser() {
  const raw = window.sessionStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setCurrentUser(nextUser) {
  if (!nextUser) return;
  const current = getCurrentUser() || {};
  const merged = { ...current, ...nextUser };
  window.sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(merged));
  appState.user = merged;
}
