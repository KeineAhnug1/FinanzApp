// Ausgaben-Logik: Listenaktionen und Speichern/Bearbeiten im Formular.
import { appState, expenseState, listState } from './state.js';
import { setActiveView } from './runtime.js';
import { setStatus, setButtonLoading, initInlineValidation } from './helpers.js';
import {
  handleDeleteExpense,
  handleUpdateExpense,
  handleCreateExpense,
  refreshDashboardData,
  refreshCategoryData,
  setExpenseFormModeCreate,
  setExpenseFormModeEdit,
  getExpenseFormElements,
  initRecurrenceToggle
} from './dashboard-api.js';
import { initCategorySelector, resolveCategoryFromForm } from './categories-controls.js';

function expenseT(key, fallback, params = {}) {
  const translated = window.FinanzAppLanguage?.t?.(key, params);
  if (translated && translated !== key) return translated;
  if (!params || !Object.keys(params).length) return fallback;
  return String(fallback || "").replaceAll(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
}

export function initExpenseListActions() {
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
      setStatus("expense-form-status", "", expenseT("edit_active_message", "Bearbeitung aktiv. Aendere Werte und speichere."));
      setActiveView("expense");
      return;
    }

    if (action === "delete") {
      const confirmDelete = await expenseState.askConfirm({
        title: expenseT("expense_delete_confirm", "Ausgabe loeschen?"),
        message: `Der Eintrag "${entry.source || entry.category || "Ausgabe"}" wird dauerhaft entfernt.`,
        confirmText: expenseT("confirm_delete_yes", "Ja, loeschen")
      });
      if (!confirmDelete) return;

      const result = await handleDeleteExpense(entryId);
      if (!result.ok) {
        setStatus("expense-form-status", "error", result.message || expenseT("entry_could_not_be_deleted", "Eintrag konnte nicht geloescht werden."));
        return;
      }

      setStatus("expense-form-status", "success", expenseT("expense_deleted", "Ausgabe geloescht."));
      if (expenseState.editingId === entryId) setExpenseFormModeCreate();
      await refreshDashboardData();
    }
  });
}

// Verarbeitet Formular-Submit fuer Anlegen/Aktualisieren von Ausgaben.
export function initExpenseForm() {
  const { form, submitBtn, cancelBtn } = getExpenseFormElements();
  if (!form) return;

  setExpenseFormModeCreate();
  initRecurrenceToggle("expense-cycle", "expense-recurrence-row");
  initCategorySelector("expense-category", "expense-custom-wrap", "expense-category-custom");
  initInlineValidation(form);

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      setExpenseFormModeCreate();
      setStatus("expense-form-status", "", expenseT("editing_cancelled", "Bearbeitung abgebrochen."));
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!appState.user?.id) return;
    setButtonLoading(submitBtn, true);

    const formData = new FormData(form);
    const inputCurrency = String(formData.get("input_currency") || "EUR").trim().toUpperCase();
    const rawAmount = Number(formData.get("amount"));
    const amountInEur = window.FinanzAppCurrency?.convertAmount
      ? window.FinanzAppCurrency.convertAmount(rawAmount, inputCurrency, "EUR")
      : rawAmount;

    const recurrenceRaw = Number(formData.get("recurrence") || 0);

    const payload = {
      source: String(formData.get("source") || "").trim(),
      category: resolveCategoryFromForm(formData),
      amount: Number.isFinite(amountInEur) ? amountInEur : rawAmount,
      spent_at: String(formData.get("spent_at") || "").trim(),
      bank_account_id: String(formData.get("bank_account_id") || "").trim(),
      note: String(formData.get("note") || "").trim(),
      cycle: String(formData.get("cycle") || "once").trim(),
      recurrence: recurrenceRaw > 0 ? recurrenceRaw : null,
      is_active: true
    };

    setStatus("expense-form-status", "", expenseState.editingId ? expenseT("updating_expense", "Aktualisiere Ausgabe...") : expenseT("saving_expense", "Speichere Ausgabe..."));

    const result = expenseState.editingId
      ? await handleUpdateExpense(expenseState.editingId, payload)
      : await handleCreateExpense(payload);

    if (!result.ok) {
      setStatus("expense-form-status", "error", result.message || expenseT("save_failed", "Speichern fehlgeschlagen."));
      setButtonLoading(submitBtn, false);
      return;
    }

    setStatus("expense-form-status", "success", expenseState.editingId ? expenseT("expense_updated", "Ausgabe aktualisiert.") : expenseT("expense_saved", "Ausgabe gespeichert."));
    await refreshCategoryData();
    setExpenseFormModeCreate();
    await refreshDashboardData();
    setButtonLoading(submitBtn, false);
  });
}
