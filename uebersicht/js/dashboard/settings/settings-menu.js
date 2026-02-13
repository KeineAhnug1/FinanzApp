// Einstellungsmenue fuer Waehrung, Locale und Default-Werte.
function populateSettingsForm() {
  const currency = document.getElementById("settings-currency");
  const locale = document.getElementById("settings-locale");
  const startView = document.getElementById("settings-start-view");
  const defaultIncomeRecurrence = document.getElementById("settings-default-income-recurrence");
  const defaultExpenseRecurrence = document.getElementById("settings-default-expense-recurrence");

  if (currency) currency.value = appState.settings.currency;
  if (locale) locale.value = appState.settings.locale;
  if (startView) startView.value = appState.settings.startView;
  if (defaultIncomeRecurrence) defaultIncomeRecurrence.value = appState.settings.defaultIncomeRecurrence;
  if (defaultExpenseRecurrence) defaultExpenseRecurrence.value = appState.settings.defaultExpenseRecurrence;
}

function initSettingsMenu() {
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
    const nextSettings = normalizeDashboardSettings({
      currency: formData.get("currency"),
      locale: formData.get("locale"),
      startView: formData.get("start_view"),
      defaultIncomeRecurrence: formData.get("default_income_recurrence"),
      defaultExpenseRecurrence: formData.get("default_expense_recurrence")
    });

    applyDashboardSettings(nextSettings, { persist: true, rerender: true });
    setIncomeFormModeCreate();
    setExpenseFormModeCreate();
    setStatus("settings-status", "success", "Einstellungen gespeichert.");
  });

  resetBtn.addEventListener("click", () => {
    applyDashboardSettings({ ...DEFAULT_DASHBOARD_SETTINGS }, { persist: true, rerender: true });
    populateSettingsForm();
    setIncomeFormModeCreate();
    setExpenseFormModeCreate();
    setStatus("settings-status", "success", "Einstellungen zurueckgesetzt.");
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

  populateSettingsForm();
}
