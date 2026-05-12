// Einnahmen-Logik: Listenaktionen und Formularablauf.
import { appState, incomeState, listState } from './state.js';
import { setActiveView } from './runtime.js';
import { setStatus, setButtonLoading, initInlineValidation } from './helpers.js';
import {
  handleDeleteIncome,
  handleUpdateIncome,
  handleCreateIncome,
  refreshDashboardData,
  refreshCategoryData,
  setIncomeFormModeCreate,
  setIncomeFormModeEdit,
  getIncomeFormElements,
  initRecurrenceToggle
} from './dashboard-api.js';
import { initCategorySelector, resolveCategoryFromForm } from './categories-controls.js';
import { t as sharedT } from '/shared/js/language-utils.js';
import { convertAmount } from '/shared/js/currency-utils.js';

function incomeT(key, fallback, params = {}) {
  const translated = sharedT(key, params);
  if (translated && translated !== key) return translated;
  if (!params || !Object.keys(params).length) return fallback;
  return String(fallback || "").replaceAll(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
}

export function initIncomeListActions() {
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
export function initIncomeForm() {
  const { form, submitBtn, cancelBtn } = getIncomeFormElements();
  if (!form) return;

  setIncomeFormModeCreate();
  initRecurrenceToggle("income-cycle", "income-recurrence-row");
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
    const inputCurrency = String(formData.get("input_currency") || "EUR").trim().toUpperCase();
    const rawAmount = Number(formData.get("amount"));
    const amountInEur = convertAmount(rawAmount, inputCurrency, "EUR");

    const recurrenceRaw = Number(formData.get("recurrence") || 0);

    const payload = {
      source: String(formData.get("source") || "").trim(),
      category: resolveCategoryFromForm(formData),
      amount: Number.isFinite(amountInEur) ? amountInEur : rawAmount,
      received_at: String(formData.get("received_at") || "").trim(),
      bank_account_id: String(formData.get("bank_account_id") || "").trim(),
      note: String(formData.get("note") || "").trim(),
      cycle: String(formData.get("cycle") || "once").trim(),
      recurrence: recurrenceRaw > 0 ? recurrenceRaw : null,
      is_active: true
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
