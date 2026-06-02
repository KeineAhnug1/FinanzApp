// Laufzeit-Helfer: Theme, Settings-Speicherung, View-Wechsel und Session-Zugriff.
import {
  appState,
  VIEW_STORAGE_KEY,
  VIEW_OPTIONS,
  SETTINGS_STORAGE_PREFIX,
  SETTINGS_LOCALE_OPTIONS,
  SETTINGS_CURRENCY_OPTIONS,
  SETTINGS_RECURRENCE_OPTIONS,
  DEFAULT_DASHBOARD_SETTINGS
} from './state.js';
import { renderIncomeList, renderExpenseList, updateFinanceCards } from './overview-cashflow.js';
import { initThemeSwitcher as sharedInitThemeSwitcher } from '@shared/js/theme-utils.js';
import { getLocale as sharedGetLocale } from '@shared/js/language-utils.js';
import { getCurrentUserFromStorage, setCurrentUserInStorage } from '@shared/js/session-utils.js';

export function initThemeSwitcher() {
  sharedInitThemeSwitcher();
}

function sanitizeSettingChoice(value, allowedValues, fallback) {
  const normalized = String(value || "").trim();
  return allowedValues.has(normalized) ? normalized : fallback;
}

export function normalizeDashboardSettings(raw) {
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

export function loadDashboardSettings(userId) {
  const raw = window.localStorage.getItem(settingsStorageKey(userId));
  if (!raw) return { ...DEFAULT_DASHBOARD_SETTINGS };
  try {
    return normalizeDashboardSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_DASHBOARD_SETTINGS };
  }
}

export function saveDashboardSettings(userId, settings) {
  window.localStorage.setItem(settingsStorageKey(userId), JSON.stringify(normalizeDashboardSettings(settings)));
}

export function getLocale() {
  return sharedGetLocale(appState.user?.id) || appState.settings?.locale || DEFAULT_DASHBOARD_SETTINGS.locale;
}

export function getCurrency() {
  return appState.settings?.currency || DEFAULT_DASHBOARD_SETTINGS.currency;
}

export function applyDashboardSettings(nextSettings, options = {}) {
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

export function getStoredView(fallbackView = "overview") {
  const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
  if (stored && VIEW_OPTIONS.has(stored)) return stored;
  return VIEW_OPTIONS.has(fallbackView) ? fallbackView : "overview";
}

function getViewFromHash() {
  const raw = String(window.location.hash || "").trim().replace(/^#/, "");
  if (raw && VIEW_OPTIONS.has(raw)) return raw;
  return null;
}

export function setActiveView(view) {
  const nextView = VIEW_OPTIONS.has(view) ? view : "overview";

  const tabs = document.querySelectorAll("[data-view-tab]");
  for (const tab of tabs) {
    const isActive = tab.dataset.viewTab === nextView;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  }

  const panels = document.querySelectorAll("[data-view-panel]");
  for (const panel of panels) {
    const isNext = panel.dataset.viewPanel === nextView;
    if (isNext) {
      panel.hidden = false;
      panel.classList.remove("is-entering");
      void panel.offsetWidth;
      panel.classList.add("is-entering");
    } else {
      panel.hidden = true;
      panel.classList.remove("is-entering");
    }
  }

  window.localStorage.setItem(VIEW_STORAGE_KEY, nextView);
}

export function initEntryTabs() {
  // no-op: entry sub-tabs removed, top-level view tabs handle switching
}

export function initSectionTabs() {
  setActiveView(getViewFromHash() || getStoredView(appState.settings?.startView || "overview"));
  document.documentElement.classList.remove("dashboard-view-preload");

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

export function getCurrentUser() {
  return getCurrentUserFromStorage();
}

export function setCurrentUser(nextUser) {
  const merged = setCurrentUserInStorage(nextUser);
  if (!merged) return;
  appState.user = merged;
}
