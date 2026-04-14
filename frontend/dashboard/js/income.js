// Einnahmen-Logik: Listenaktionen und Formularablauf.
function incomeT(key, fallback, params = {}) {
  const translated = window.FinanzAppLanguage?.t?.(key, params);
  if (translated && translated !== key) return translated;
  if (!params || !Object.keys(params).length) return fallback;
  return String(fallback || "").replaceAll(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
}

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
      setStatus("income-form-status", "", incomeT("edit_active_message", "Bearbeitung aktiv. Aendere Werte und speichere."));
      setActiveView("income");
      return;
    }

    if (action === "delete") {
      const confirmDelete = await incomeState.askConfirm({
        title: incomeT("income_delete_confirm", "Einnahme loeschen?"),
        message: `Der Eintrag "${entry.source}" wird dauerhaft entfernt.`,
        confirmText: incomeT("confirm_delete_yes", "Ja, loeschen")
      });
      if (!confirmDelete) return;

      const result = await handleDeleteIncome(entryId);
      if (!result.ok) {
        setStatus("income-form-status", "error", result.message || incomeT("entry_could_not_be_deleted", "Eintrag konnte nicht geloescht werden."));
        return;
      }

      setStatus("income-form-status", "success", incomeT("income_deleted", "Einnahme geloescht."));
      if (incomeState.editingId === entryId) setIncomeFormModeCreate();
      await refreshDashboardData();
    }
  });
}

// Verarbeitet Formular-Submit fuer Anlegen/Aktualisieren von Einnahmen.
function initIncomeForm() {
  const { form, submitBtn, cancelBtn } = getIncomeFormElements();
  if (!form) return;

  setIncomeFormModeCreate();
  initRecurrenceToggle("income-recurrence", "income-active");
  initCategorySelector("income-category", "income-custom-wrap", "income-category-custom");
  initInlineValidation(form);

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      setIncomeFormModeCreate();
      setStatus("income-form-status", "", incomeT("editing_cancelled", "Bearbeitung abgebrochen."));
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!appState.user?.id) return;
    setButtonLoading(submitBtn, true);

    const formData = new FormData(form);
    const payload = {
      source: String(formData.get("source") || "").trim(),
      category: resolveCategoryFromForm(formData),
      amount: Number(formData.get("amount")),
      received_at: String(formData.get("received_at") || "").trim(),
      bank_account_id: String(formData.get("bank_account_id") || "").trim(),
      note: String(formData.get("note") || "").trim(),
      recurrence: String(formData.get("recurrence") || "once").trim(),
      is_active: formData.get("is_active") === "on"
    };

    setStatus("income-form-status", "", incomeState.editingId ? incomeT("updating_income", "Aktualisiere Einnahme...") : incomeT("saving_income", "Speichere Einnahme..."));

    const result = incomeState.editingId
      ? await handleUpdateIncome(incomeState.editingId, payload)
      : await handleCreateIncome(payload);

    if (!result.ok) {
      setStatus("income-form-status", "error", result.message || incomeT("save_failed", "Speichern fehlgeschlagen."));
      setButtonLoading(submitBtn, false);
      return;
    }

    setStatus("income-form-status", "success", incomeState.editingId ? incomeT("income_updated", "Einnahme aktualisiert.") : incomeT("income_saved", "Einnahme gespeichert."));
    await refreshCategoryData();
    setIncomeFormModeCreate();
    await refreshDashboardData();
    setButtonLoading(submitBtn, false);
  });
}
