// Laufzeit-Helfer: Theme, Settings-Speicherung, View-Wechsel und Session-Zugriff.
function getStoredThemeMode() {
  return window.FinanzAppTheme.getStoredThemeMode();
}

function resolveTheme(mode) {
  return window.FinanzAppTheme.resolveThemeMode(mode);
}

function updateThemeButtons(mode) {
  window.FinanzAppTheme.updateThemeButtons(mode);
}

function applyTheme(mode) {
  window.FinanzAppTheme.applyThemeMode(mode);
}

function initThemeSwitcher() {
  window.FinanzAppTheme.initThemeSwitcher();
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
  if (window.FinanzAppLanguage?.getLocale) {
    return window.FinanzAppLanguage.getLocale(appState.user?.id);
  }
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

function getViewFromHash() {
  const raw = String(window.location.hash || "").trim().replace(/^#/, "");
  if (raw && VIEW_OPTIONS.has(raw)) return raw;
  return null;
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
  setActiveView(getViewFromHash() || appState.settings?.startView || "overview");

  window.addEventListener("hashchange", () => {
    const viewFromHash = getViewFromHash();
    if (!viewFromHash) return;
    setActiveView(viewFromHash);
  });

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
  return window.FinanzAppSession.getCurrentUserFromStorage();
}

function setCurrentUser(nextUser) {
  const merged = window.FinanzAppSession.setCurrentUserInStorage(nextUser);
  if (!merged) return;
  appState.user = merged;
}
