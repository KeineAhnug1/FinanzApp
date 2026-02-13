// Income flows: list actions, form handling and base income form.
function initIncomeListActions() {
  const list = document.getElementById("income-list");
  if (!list) return;

  list.addEventListener("toggle", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLDetailsElement)) return;
    const key = target.dataset.groupKey;
    if (!key) return;
    if (target.open) {
      listState.incomeExpandedGroups.add(key);
    } else {
      listState.incomeExpandedGroups.delete(key);
    }
  }, true);

  list.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    const entryId = target.dataset.entryId;
    if (!action || !entryId) return;

    const entry = appState.incomeEntries.find((item) => item.id === entryId);
    if (!entry) return;

    if (action === "edit") {
      setIncomeFormModeEdit(entry);
      setStatus("income-form-status", "", "Bearbeitung aktiv. Aendere Werte und speichere.");
      setActiveView("income");
      return;
    }

    if (action === "delete") {
      const confirmDelete = await incomeState.askConfirm({
        title: "Einnahme loeschen?",
        message: `Der Eintrag "${entry.source}" wird dauerhaft entfernt.`,
        confirmText: "Ja, loeschen"
      });
      if (!confirmDelete) return;

      const result = await handleDeleteIncome(entryId);
      if (!result.ok) {
        setStatus("income-form-status", "error", result.message || "Eintrag konnte nicht geloescht werden.");
        return;
      }

      setStatus("income-form-status", "success", "Einnahme geloescht.");
      if (incomeState.editingId === entryId) setIncomeFormModeCreate();
      await refreshDashboardData();
    }
  });
}
function initIncomeForm() {
  const { form, submitBtn, cancelBtn } = getIncomeFormElements();
  if (!form) return;

  setIncomeFormModeCreate();
  initRecurrenceToggle("income-recurrence", "income-active");
  initCategorySelector("income-category", "income-custom-wrap", "income-category-custom");

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      setIncomeFormModeCreate();
      setStatus("income-form-status", "", "Bearbeitung abgebrochen.");
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
      received_at: String(formData.get("received_at") || "").trim(),
      note: String(formData.get("note") || "").trim(),
      recurrence: String(formData.get("recurrence") || "once").trim(),
      is_active: formData.get("is_active") === "on"
    };

    setStatus("income-form-status", "", incomeState.editingId ? "Aktualisiere Einnahme..." : "Speichere Einnahme...");

    const result = incomeState.editingId
      ? await handleUpdateIncome(incomeState.editingId, payload)
      : await handleCreateIncome(payload);

    if (!result.ok) {
      setStatus("income-form-status", "error", result.message || "Speichern fehlgeschlagen.");
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    setStatus("income-form-status", "success", incomeState.editingId ? "Einnahme aktualisiert." : "Einnahme gespeichert.");
    await refreshCategoryData();
    setIncomeFormModeCreate();
    await refreshDashboardData();
    if (submitBtn) submitBtn.disabled = false;
  });
}
function initBaseIncomeForm() {
  const form = document.getElementById("base-income-form");
  const input = document.getElementById("base-income");
  const submitBtn = document.getElementById("base-income-submit-btn");
  if (!form || !input) return;

  input.value = Number(appState.user?.income || 0).toFixed(2);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!appState.user?.id) return;

    const incomeValue = Number(input.value);
    if (!Number.isFinite(incomeValue) || incomeValue < 0) {
      setStatus("base-income-status", "error", "Bitte eine Zahl >= 0 eingeben.");
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    setStatus("base-income-status", "", "Speichere Monatseinnahme...");

    const result = await handleUpdateBaseIncome(incomeValue);
    if (!result.ok || !result.user) {
      setStatus("base-income-status", "error", result.message || "Monatseinnahme konnte nicht gespeichert werden.");
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    setCurrentUser(result.user);
    hydrateProfile(appState.user);
    input.value = Number(appState.user.income || 0).toFixed(2);
    setStatus("base-income-status", "success", "Monatseinnahme aktualisiert.");
    updateFinanceCards(appState.user, appState.incomeEntries, appState.expenseEntries);
    if (submitBtn) submitBtn.disabled = false;
  });
}
