// Startpunkt des Dashboards: Session laden, UI initialisieren und Daten abrufen.
import { appState, incomeState, expenseState } from "./state.js";
import {
  initThemeSwitcher,
  initSectionTabs,
  initEntryTabs,
  loadDashboardSettings,
  setCurrentUser,
} from "./runtime.js";
import {
  refreshCategoryData,
  refreshDashboardData,
  initDashboardAccountFilter,
} from "./dashboard-api.js";
import { initConfirmModal } from "./modal.js";
import { initSettingsMenu } from "./settings-menu.js";
import { initIncomeForm, initIncomeListActions } from "./income.js";
import { initExpenseForm, initExpenseListActions } from "./expense.js";
import { initOverviewPieControls } from "./overview-cashflow.js";
import { initCategoryManagerActions, initListSearch } from "./categories-search.js";
import { requestJsonMerged } from "@shared/js/api-client.js";
import { clearCurrentUserFromStorage } from "@shared/js/session-utils.js";
import { getLocale } from "@shared/js/language-utils.js";

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

  if (window.innerWidth <= 960) {
    applyMobileLayout();
  }

  initThemeSwitcher();
  initSectionTabs();
  initEntryTabs();
  initSettingsMenu();

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

// Sortiert die DOM-Elemente auf Mobile physisch um:
// Cashflow-Panel → Hero → Budget-Alerts → KPI-Grid → Pie-Panel
function applyMobileLayout() {
  const panel = document.getElementById("panel-overview");
  if (!panel) return;

  const detailGrid = panel.querySelector(".detail-grid");
  const heroCard = panel.querySelector(".hero-card");
  const budgetAlerts = panel.querySelector(".budget-alerts");
  const kpiGrid = panel.querySelector(".kpi-grid");
  if (!detailGrid || !heroCard || !kpiGrid) return;

  const cashflowPanel = detailGrid.querySelector("article:first-child");
  const piePanel = detailGrid.querySelector("article:last-child");
  if (!cashflowPanel || !piePanel) return;

  // Cashflow-Panel aus detail-grid herauslösen und ganz oben einfügen
  panel.insertBefore(cashflowPanel, panel.firstChild);

  // Hero direkt nach Cashflow
  panel.insertBefore(heroCard, cashflowPanel.nextSibling);

  // Budget-Alerts nach Hero (falls vorhanden)
  if (budgetAlerts) {
    panel.insertBefore(budgetAlerts, heroCard.nextSibling);
  }

  // KPI-Grid danach
  const afterHero = budgetAlerts ? budgetAlerts.nextSibling : heroCard.nextSibling;
  panel.insertBefore(kpiGrid, afterHero);

  // Pie-Panel aus detail-grid herauslösen und ans Ende
  panel.appendChild(piePanel);

  // Leeres detail-grid entfernen
  if (!detailGrid.children.length) detailGrid.remove();
}
