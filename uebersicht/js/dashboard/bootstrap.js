// Startpunkt des Dashboards: Session laden, UI initialisieren und Daten abrufen.
async function bootstrap() {
  let sessionUser = null;
  try {
    const response = await fetch("/api/session", { credentials: "same-origin" });
    const payload = await response.json();
    if (response.ok && payload?.ok && payload.session_user) {
      sessionUser = payload.session_user;
    }
  } catch {
    sessionUser = null;
  }

  if (!sessionUser) {
    window.sessionStorage.removeItem(USER_STORAGE_KEY);
    window.location.assign("/");
    return;
  }

  setCurrentUser(sessionUser);
  appState.settings = loadDashboardSettings(sessionUser.id);

  initThemeSwitcher();
  initSectionTabs();
  hydrateProfile(appState.user);
  initSettingsMenu();
  initProfileMenu();

  const askConfirm = initConfirmModal();
  incomeState.askConfirm = askConfirm;
  expenseState.askConfirm = askConfirm;

  await refreshCategoryData();
  initBaseIncomeForm();
  initIncomeForm();
  initExpenseForm();
  initListSearch();
  initCategoryManagerActions();
  initIncomeListActions();
  initExpenseListActions();

  await refreshDashboardData();
}

bootstrap();
