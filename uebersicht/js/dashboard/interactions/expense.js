// Ausgaben-Logik: Listenaktionen und Speichern/Bearbeiten im Formular.
function initExpenseListActions() {
  const list = document.getElementById("expense-list");
  if (!list) return;

  list.addEventListener("toggle", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLDetailsElement)) return;
    const key = target.dataset.groupKey;
    if (!key) return;
    if (target.open) {
      listState.expenseExpandedGroups.add(key);
    } else {
      listState.expenseExpandedGroups.delete(key);
    }
  }, true);

  list.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.expenseAction;
    const entryId = target.dataset.entryId;
    if (!action || !entryId) return;

    const entry = appState.expenseEntries.find((item) => item.id === entryId);
    if (!entry) return;

    if (action === "edit") {
      setExpenseFormModeEdit(entry);
      setStatus("expense-form-status", "", "Bearbeitung aktiv. Aendere Werte und speichere.");
      setActiveView("expense");
      return;
    }

    if (action === "delete") {
      const confirmDelete = await expenseState.askConfirm({
        title: "Ausgabe loeschen?",
        message: `Der Eintrag "${entry.source || entry.category || "Ausgabe"}" wird dauerhaft entfernt.`,
        confirmText: "Ja, loeschen"
      });
      if (!confirmDelete) return;

      const result = await handleDeleteExpense(entryId);
      if (!result.ok) {
        setStatus("expense-form-status", "error", result.message || "Eintrag konnte nicht geloescht werden.");
        return;
      }

      setStatus("expense-form-status", "success", "Ausgabe geloescht.");
      if (expenseState.editingId === entryId) setExpenseFormModeCreate();
      await refreshDashboardData();
    }
  });
}

// Verarbeitet Formular-Submit fuer Anlegen/Aktualisieren von Ausgaben.
function initExpenseForm() {
  const { form, submitBtn, cancelBtn } = getExpenseFormElements();
  if (!form) return;

  setExpenseFormModeCreate();
  initRecurrenceToggle("expense-recurrence", "expense-active");
  initCategorySelector("expense-category", "expense-custom-wrap", "expense-category-custom");

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      setExpenseFormModeCreate();
      setStatus("expense-form-status", "", "Bearbeitung abgebrochen.");
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!appState.user?.id) return;
    if (submitBtn) submitBtn.disabled = true;

    const formData = new FormData(form);
    const payload = {
      source: String(formData.get("source") || "").trim(),
      category: resolveCategoryFromForm(formData),
      amount: Number(formData.get("amount")),
      spent_at: String(formData.get("spent_at") || "").trim(),
      note: String(formData.get("note") || "").trim(),
      recurrence: String(formData.get("recurrence") || "once").trim(),
      is_active: formData.get("is_active") === "on"
    };

    setStatus("expense-form-status", "", expenseState.editingId ? "Aktualisiere Ausgabe..." : "Speichere Ausgabe...");

    const result = expenseState.editingId
      ? await handleUpdateExpense(expenseState.editingId, payload)
      : await handleCreateExpense(payload);

    if (!result.ok) {
      setStatus("expense-form-status", "error", result.message || "Speichern fehlgeschlagen.");
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    setStatus("expense-form-status", "success", expenseState.editingId ? "Ausgabe aktualisiert." : "Ausgabe gespeichert.");
    await refreshCategoryData();
    setExpenseFormModeCreate();
    await refreshDashboardData();
    if (submitBtn) submitBtn.disabled = false;
  });
}
