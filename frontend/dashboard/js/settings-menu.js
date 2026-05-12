// Einstellungsmenue fuer Waehrung, Locale und Default-Werte.
import { appState, DEFAULT_DASHBOARD_SETTINGS } from './state.js';
import { normalizeDashboardSettings, applyDashboardSettings } from './runtime.js';
import { setStatus } from './helpers.js';
import { setIncomeFormModeCreate, setExpenseFormModeCreate } from './dashboard-api.js';

function populateSettingsForm() {
  const currency = document.getElementById("settings-currency");
  const locale = document.getElementById("settings-locale");
  const themeMode = document.getElementById("settings-theme-mode");
  const startView = document.getElementById("settings-start-view");
  const defaultIncomeRecurrence = document.getElementById("settings-default-income-recurrence");
  const defaultExpenseRecurrence = document.getElementById("settings-default-expense-recurrence");

  if (currency) currency.value = appState.settings.currency;
  if (locale) locale.value = appState.settings.locale;
  if (themeMode) themeMode.value = window.FinanzAppTheme?.getStoredThemeMode?.() || "auto";
  if (startView) startView.value = appState.settings.startView;
  if (defaultIncomeRecurrence) defaultIncomeRecurrence.value = appState.settings.defaultIncomeRecurrence;
  if (defaultExpenseRecurrence) defaultExpenseRecurrence.value = appState.settings.defaultExpenseRecurrence;
}

export function initSettingsMenu() {
  const settingsBtn = document.getElementById("settings-btn");
  const settingsPanel = document.getElementById("settings-panel");
  const settingsForm = document.getElementById("settings-form");
  const resetBtn = document.getElementById("settings-reset-btn");
  if (!settingsBtn || !settingsPanel || !settingsForm || !resetBtn) return;

  const closeSettings = () => {
    settingsPanel.hidden = true;
    settingsBtn.setAttribute("aria-expanded", "false");
  };

  settingsBtn.addEventListener("click", () => {
    const willOpen = settingsPanel.hidden;
    if (willOpen) {
      populateSettingsForm();
      setStatus("settings-status", "", "");
      const profileMenu = document.getElementById("profile-menu");
      const profileBtn = document.getElementById("profile-btn");
      if (profileMenu) profileMenu.hidden = true;
      if (profileBtn) profileBtn.setAttribute("aria-expanded", "false");
    }
    settingsPanel.hidden = !willOpen;
    settingsBtn.setAttribute("aria-expanded", String(willOpen));
  });

  settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(settingsForm);
    const pick = (name, fallback) => formData.get(name) ?? fallback;
    const themeMode = String(pick("theme_mode", "auto"));
    const currentLocale = String(window.FinanzAppLanguage?.getLocale?.(appState.user?.id) || appState.settings.locale || DEFAULT_DASHBOARD_SETTINGS.locale);
    const nextSettings = normalizeDashboardSettings({
      currency: pick("currency", appState.settings.currency),
      locale: pick("locale", appState.settings.locale),
      startView: pick("start_view", appState.settings.startView),
      defaultIncomeRecurrence: pick("default_income_recurrence", appState.settings.defaultIncomeRecurrence),
      defaultExpenseRecurrence: pick("default_expense_recurrence", appState.settings.defaultExpenseRecurrence)
    });

    applyDashboardSettings(nextSettings, { persist: true, rerender: true });
    if (window.FinanzAppTheme?.saveAndApplyThemeMode) {
      window.FinanzAppTheme.saveAndApplyThemeMode(themeMode);
    }
    if (window.FinanzAppLanguage?.setLocale) {
      window.FinanzAppLanguage.setLocale(nextSettings.locale, { userId: appState.user?.id });
    }
    setIncomeFormModeCreate();
    setExpenseFormModeCreate();
    const savedMessage = window.FinanzAppLanguage?.t?.("settings.saved") || "settings.saved";
    setStatus("settings-status", "success", savedMessage);
    if (nextSettings.locale !== currentLocale) {
      window.location.reload();
    }
  });

  resetBtn.addEventListener("click", () => {
    applyDashboardSettings({ ...DEFAULT_DASHBOARD_SETTINGS }, { persist: true, rerender: true });
    if (window.FinanzAppTheme?.saveAndApplyThemeMode) {
      window.FinanzAppTheme.saveAndApplyThemeMode("auto");
    }
    if (window.FinanzAppLanguage?.setLocale) {
      window.FinanzAppLanguage.setLocale(DEFAULT_DASHBOARD_SETTINGS.locale, { userId: appState.user?.id });
    }
    populateSettingsForm();
    setIncomeFormModeCreate();
    setExpenseFormModeCreate();
    const resetMessage = window.FinanzAppLanguage?.t?.("settings.reset_done") || "settings.reset_done";
    setStatus("settings-status", "success", resetMessage);
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!settingsPanel.contains(target) && !settingsBtn.contains(target)) {
      closeSettings();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSettings();
  });

  window.addEventListener("finanzapp:locale-changed", (event) => {
    const nextLocale = event?.detail?.locale;
    if (!nextLocale || appState.settings.locale === nextLocale) return;
    applyDashboardSettings({ ...appState.settings, locale: nextLocale }, { persist: true, rerender: true });
    populateSettingsForm();
  });

  populateSettingsForm();
}
