// Startpunkt des Dashboards: Session laden, UI initialisieren und Daten abrufen.
async function bootstrap() {
  let sessionUser = null;
  try {
    const request = window.FinanzAppApi?.requestJsonMerged;
    if (typeof request === "function") {
      const payload = await request("/api/session", { credentials: "same-origin" });
      if (payload?.ok && payload.session_user) {
        sessionUser = payload.session_user;
      }
    }
  } catch {
    sessionUser = null;
  }

  if (!sessionUser) {
    window.FinanzAppSession.clearCurrentUserFromStorage();
    window.location.assign("/");
    return;
  }

  setCurrentUser(sessionUser);
  appState.settings = loadDashboardSettings(sessionUser.id);
  if (window.FinanzAppLanguage?.getLocale) {
    appState.settings.locale = window.FinanzAppLanguage.getLocale(sessionUser.id);
  }
  if (window.FinanzAppCurrency?.preloadRates) {
    await window.FinanzAppCurrency.preloadRates({ base: "EUR" });
  }

  initThemeSwitcher();
  initSectionTabs();
  const bUseSharedTopbar = Boolean(window.FinanzAppSharedTopbar);
  if (!bUseSharedTopbar) {
    initDashboardMobileNav();
    hydrateProfile(appState.user);
  }
  initSettingsMenu();
  if (!bUseSharedTopbar) {
    initProfileMenu();
  }

  const askConfirm = initConfirmModal();
  incomeState.askConfirm = askConfirm;
  expenseState.askConfirm = askConfirm;

  await refreshCategoryData();
  initIncomeForm();
  initExpenseForm();
  initDashboardAccountFilter();
  initListSearch();
  initCategoryManagerActions();
  initIncomeListActions();
  initExpenseListActions();
  initOverviewPieControls();

  await refreshDashboardData();
}

bootstrap();
