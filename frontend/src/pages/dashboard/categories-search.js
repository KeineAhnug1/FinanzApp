// Aktionen fuer Kategorie-Loeschen und Event-Bindings fuer die Listen-Suche.
import { appState, incomeState, listState } from "./state.js";
import { setStatus } from "./helpers.js";
import { renderIncomeList, renderExpenseList } from "./overview-cashflow.js";
import {
  handleDeleteCategory,
  refreshCategoryData,
  refreshDashboardData,
  setIncomeFormModeCreate,
  setExpenseFormModeCreate,
} from "./dashboard-api.js";

export function initCategoryManagerActions() {
  const incomeList = document.getElementById("income-category-list");
  const expenseList = document.getElementById("expense-category-list");

  const bindDelete = (listNode, kind, statusId) => {
    if (!listNode) return;
    listNode.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const category = target.dataset.categoryDelete;
      const deleteKind = target.dataset.categoryKind;
      if (!category || !deleteKind || deleteKind !== kind) return;

      const confirmDelete = await incomeState.askConfirm({
        title: "Kategorie loeschen?",
        message: `Die Kategorie "${category}" wird aus der Auswahl entfernt. Zugehoerige Eintraege werden auf "Sonstiges" gesetzt.`,
        confirmText: "Kategorie loeschen",
      });
      if (!confirmDelete) return;

      const result = await handleDeleteCategory(kind, category);
      if (!result.ok) {
        setStatus(statusId, "error", result.message || "Kategorie konnte nicht geloescht werden.");
        return;
      }

      setStatus(
        statusId,
        "success",
        `Kategorie geloescht. ${result.updated_entries || 0} Eintraege aktualisiert.`
      );
      await refreshCategoryData();
      if (kind === "income") {
        setIncomeFormModeCreate();
      } else {
        setExpenseFormModeCreate();
      }
      await refreshDashboardData();
    });
  };

  bindDelete(incomeList, "income", "income-category-status");
  bindDelete(expenseList, "expense", "expense-category-status");
}

export function initListSearch() {
  const incomeSearch = document.getElementById("income-search");
  const expenseSearch = document.getElementById("expense-search");

  let incomeSearchTimer;
  let expenseSearchTimer;

  if (incomeSearch) {
    incomeSearch.addEventListener("input", () => {
      listState.incomeSearch = incomeSearch.value;
      clearTimeout(incomeSearchTimer);
      incomeSearchTimer = setTimeout(() => renderIncomeList(appState.incomeEntries), 180);
    });
  }

  if (expenseSearch) {
    expenseSearch.addEventListener("input", () => {
      listState.expenseSearch = expenseSearch.value;
      clearTimeout(expenseSearchTimer);
      expenseSearchTimer = setTimeout(() => renderExpenseList(appState.expenseEntries), 180);
    });
  }
}
