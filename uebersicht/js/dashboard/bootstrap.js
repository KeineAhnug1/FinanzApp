// Startpunkt des Dashboards: Session laden, UI initialisieren und Daten abrufen.
async function bootstrap() {
  const user = getCurrentUser();
  if (!user) {
    window.location.assign("/");
    return;
  }

  appState.user = user;
  appState.settings = loadDashboardSettings(user.id);

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
