// Startpunkt des Dashboards: Session laden, UI initialisieren und Daten abrufen.
import { appState, incomeState, expenseState } from './state.js';
import {
  initThemeSwitcher,
  initSectionTabs,
  initEntryTabs,
  loadDashboardSettings,
  setCurrentUser
} from './runtime.js';
import {
  refreshCategoryData,
  refreshDashboardData,
  initDashboardAccountFilter
} from './dashboard-api.js';
import { initConfirmModal } from './modal.js';
import { initSettingsMenu } from './settings-menu.js';
import { hydrateProfile, initProfileMenu, initDashboardMobileNav } from './profile-menu.js';
import { initIncomeForm, initIncomeListActions } from './income.js';
import { initExpenseForm, initExpenseListActions } from './expense.js';
import { initOverviewPieControls } from './overview-cashflow.js';
import { initCategoryManagerActions, initListSearch } from './categories-search.js';
import { requestJsonMerged } from '@shared/js/api-client.js';
import { clearCurrentUserFromStorage } from '@shared/js/session-utils.js';
import { getLocale } from '@shared/js/language-utils.js';

export async function bootstrap() {
  let sessionUser = null;
  try {
    const payload = await requestJsonMerged("/api/session", { credentials: "same-origin" });
    if (payload?.ok && payload.session_user) {
      sessionUser = payload.session_user;
    }
  } catch {
    sessionUser = null;
  }

  if (!sessionUser) {
    clearCurrentUserFromStorage();
    window.location.assign("/");
    return;
  }

  setCurrentUser(sessionUser);
  appState.settings = loadDashboardSettings(sessionUser.id);
  appState.settings.locale = getLocale(sessionUser.id);

  initThemeSwitcher();
  initSectionTabs();
  initEntryTabs();
  const bUseSharedTopbar = true;
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
