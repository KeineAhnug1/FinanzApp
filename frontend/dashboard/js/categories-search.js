// Aktionen fuer Kategorie-Loeschen und Event-Bindings fuer die Listen-Suche.
function initCategoryManagerActions() {
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
        confirmText: "Kategorie loeschen"
      });
      if (!confirmDelete) return;

      const result = await handleDeleteCategory(kind, category);
      if (!result.ok) {
        setStatus(statusId, "error", result.message || "Kategorie konnte nicht geloescht werden.");
        return;
      }

      setStatus(statusId, "success", `Kategorie geloescht. ${result.updated_entries || 0} Eintraege aktualisiert.`);
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

function initListSearch() {
  const incomeSearch = document.getElementById("income-search");
  const expenseSearch = document.getElementById("expense-search");

  if (incomeSearch) {
    incomeSearch.addEventListener("input", () => {
      listState.incomeSearch = incomeSearch.value;
      renderIncomeList(appState.incomeEntries);
    });
  }

  if (expenseSearch) {
    expenseSearch.addEventListener("input", () => {
      listState.expenseSearch = expenseSearch.value;
      renderExpenseList(appState.expenseEntries);
    });
  }
}
