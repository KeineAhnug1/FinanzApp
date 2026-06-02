// API-Aufrufe und Formularstatus fuer Einnahmen, Ausgaben und Kategorien.
import { appState, categoryState, incomeState, expenseState } from './state.js';
import { getCurrency } from './runtime.js';
import { formatMoney, escapeHtml } from './helpers.js';
import { renderIncomeList, renderExpenseList, updateFinanceCards } from './overview-cashflow.js';
import {
  applyCategoryOptions,
  setCategoryValue
} from './categories-controls.js';
import { requestJsonMerged } from '/shared/js/api-client.js';
import { convertFromEur } from '/shared/js/currency-utils.js';

export async function requestJson(url, options) {
  const result = await requestJsonMerged(url, {
    credentials: "same-origin",
    ...(options || {})
  });
  return result;
}

// Laedt die serverseitig gespeicherten Einnahmen fuer den aktiven User.
export async function loadIncomeEntries() {
  const endpoint = appState.selectedBankAccountId
    ? `/api/income-entries?bank_account_id=${encodeURIComponent(appState.selectedBankAccountId)}`
    : "/api/income-entries";
  const result = await requestJson(endpoint);
  if (!result.ok) return [];
  return Array.isArray(result.entries) ? result.entries : [];
}

// Laedt die serverseitig gespeicherten Ausgaben fuer den aktiven User.
export async function loadExpenseEntries() {
  const endpoint = appState.selectedBankAccountId
    ? `/api/expense-entries?bank_account_id=${encodeURIComponent(appState.selectedBankAccountId)}`
    : "/api/expense-entries";
  const result = await requestJson(endpoint);
  if (!result.ok) return [];
  return Array.isArray(result.entries) ? result.entries : [];
}

// Laedt kombinierte Transaktionen (Einnahmen und Ausgaben) und splittet sie für bestehendes UI.
export async function loadTransactions() {
  const params = new URLSearchParams();
  if (appState.selectedBankAccountId) params.set("bank_account_id", appState.selectedBankAccountId);
  const endpoint = params.toString() ? `/api/transactions?${params.toString()}` : "/api/transactions";
  const result = await requestJson(endpoint);
  if (!result.ok) return { income: [], expense: [] };
  const entries = Array.isArray(result.entries) ? result.entries : [];
  const income = entries.filter((e) => e?.type === "income").map(({ type, ...rest }) => rest);
  const expense = entries.filter((e) => e?.type === "expense").map(({ type, ...rest }) => rest);
  return { income, expense };
}

export async function loadBankAccounts() {
  const result = await requestJson("/api/bank-accounts");
  if (!result || (result.ok === false)) return [];
  return Array.isArray(result.accounts) ? result.accounts : [];
}

// Laedt die kombinierte Kategorienliste (Preset + benutzerdefiniert).
export async function loadUserCategories() {
  const result = await requestJson("/api/categories");
  if (!result.ok) return { income: [], expense: [] };
  return {
    income: Array.isArray(result.income) ? result.income : [],
    expense: Array.isArray(result.expense) ? result.expense : []
  };
}

// Aktualisiert die Kategorie-Selects im UI.
export async function refreshCategoryData() {
  if (!appState.user?.id) return;
  const categories = await loadUserCategories(appState.user.id);
  categoryState.income = categories.income;
  categoryState.expense = categories.expense;
  applyCategoryOptions();
}

// Holt Einnahmen/Ausgaben neu und rendert alle abhängigen UI-Bausteine.
export async function refreshDashboardData() {
  if (!appState.user?.id) return;
  appState.bankAccounts = await loadBankAccounts(appState.user.id);
  if (
    appState.selectedBankAccountId &&
    !appState.bankAccounts.some((account) => String(account.id) === String(appState.selectedBankAccountId))
  ) {
    appState.selectedBankAccountId = "";
  }
  renderBankAccountSelectors();

  const tx = await loadTransactions();
  appState.incomeEntries = tx.income;
  appState.expenseEntries = tx.expense;
  renderIncomeList(appState.incomeEntries);
  renderExpenseList(appState.expenseEntries);
  updateFinanceCards(appState.user, appState.incomeEntries, appState.expenseEntries);

  appState.budgetAlerts = await loadBudgetStatus();
  renderBudgetAlerts();
}

export function formatBankAccountLabel(account) {
  const name = String(account?.label || account?.name || "Bankkonto").trim();
  const balance = Number(account?.balance || 0);
  return `${name} (${formatMoney(balance)})`;
}

export function buildAccountOptionsMarkup({ includeAll = false } = {}) {
  const parts = [];
  if (includeAll) {
    parts.push('<option value="">Alle Konten</option>');
  }
  for (const account of appState.bankAccounts) {
    const id = String(account?.id || "").trim();
    if (!id) continue;
    const selected = String(appState.selectedBankAccountId) === id ? " selected" : "";
    parts.push(`<option value="${escapeHtml(id)}"${selected}>${escapeHtml(formatBankAccountLabel(account))}</option>`);
  }
  return parts.join("");
}

export function renderBankAccountSelectors() {
  const incomeSelect = document.getElementById("income-bank-account");
  const expenseSelect = document.getElementById("expense-bank-account");
  const dashboardFilterWrap = document.getElementById("dashboard-account-filter-wrap");
  const dashboardFilterSelect = document.getElementById("dashboard-bank-account-filter");
  const hasMultipleAccounts = appState.bankAccounts.length > 1;
  const firstAccountId = String(appState.bankAccounts[0]?.id || "");

  if (!hasMultipleAccounts) {
    appState.selectedBankAccountId = "";
  }

  if (incomeSelect) {
    incomeSelect.innerHTML = buildAccountOptionsMarkup({ includeAll: false });
    const selected = String(appState.selectedBankAccountId || firstAccountId || "");
    if (selected) incomeSelect.value = selected;
  }
  if (expenseSelect) {
    expenseSelect.innerHTML = buildAccountOptionsMarkup({ includeAll: false });
    const selected = String(appState.selectedBankAccountId || firstAccountId || "");
    if (selected) expenseSelect.value = selected;
  }
  if (dashboardFilterWrap) {
    dashboardFilterWrap.hidden = !hasMultipleAccounts;
    dashboardFilterWrap.style.display = hasMultipleAccounts ? "" : "none";
  }
  if (dashboardFilterSelect) {
    if (!hasMultipleAccounts) {
      dashboardFilterSelect.innerHTML = "";
      dashboardFilterSelect.value = "";
    } else {
      dashboardFilterSelect.innerHTML = buildAccountOptionsMarkup({ includeAll: true });
      dashboardFilterSelect.value = appState.selectedBankAccountId || "";
    }
  }
}

export function initDashboardAccountFilter() {
  const dashboardFilterSelect = document.getElementById("dashboard-bank-account-filter");
  if (!dashboardFilterSelect) return;

  dashboardFilterSelect.addEventListener("change", async () => {
    appState.selectedBankAccountId = String(dashboardFilterSelect.value || "").trim();
    await refreshDashboardData();
  });
}

export function formatDateTimeLocalInputValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Schaltet den Aktiv-Checkbox-Status passend zur Wiederholung.
export function initRecurrenceToggle(cycleId, recurrenceRowClass) {
  const cycleEl = document.getElementById(cycleId);
  const recurrenceRow = document.querySelector(`.${recurrenceRowClass}`);
  if (!cycleEl) return;

  const sync = () => {
    const isOnce = cycleEl.value === "once";
    if (recurrenceRow) recurrenceRow.style.display = isOnce ? "none" : "";
  };

  cycleEl.addEventListener("change", sync);
  sync();
}

// Kapselt das Lesen aller Income-Formular-Elemente.
export function getIncomeFormElements() {
  const form = document.getElementById("income-form");
  const submitBtn = document.getElementById("income-submit-btn");
  const cancelBtn = document.getElementById("income-cancel-btn");
  const source = document.getElementById("income-source");
  const amount = document.getElementById("income-amount");
  const currency = document.getElementById("income-currency");
  const date = document.getElementById("income-date");
  const cycle = document.getElementById("income-cycle");
  const recurrence = document.getElementById("income-recurrence");
  const recurrenceRow = document.querySelector(".income-recurrence-row");
  const category = document.getElementById("income-category");
  const categoryCustomWrap = document.getElementById("income-custom-wrap");
  const categoryCustom = document.getElementById("income-category-custom");
  const note = document.getElementById("income-note");
  const bankAccount = document.getElementById("income-bank-account");
  return { form, submitBtn, cancelBtn, source, amount, currency, date, cycle, recurrence, recurrenceRow, category, categoryCustomWrap, categoryCustom, note, bankAccount };
}

// Setzt das Income-Formular auf "neu anlegen".
export function setIncomeFormModeCreate() {
  incomeState.editingId = null;
  const { form, submitBtn, cancelBtn, date, cycle, recurrence, recurrenceRow, bankAccount, currency } = getIncomeFormElements();
  if (!form) return;
  form.reset();
  setCategoryValue("income-category", "income-custom-wrap", "income-category-custom", "", "salary");
  if (date) date.value = formatDateTimeLocalInputValue(new Date());
  if (cycle) cycle.value = appState.settings?.defaultIncomeRecurrence || "once";
  if (recurrence) recurrence.value = "0";
  if (recurrenceRow) recurrenceRow.style.display = !cycle || cycle.value === "once" ? "none" : "";
  if (currency) currency.value = getCurrency();
  if (submitBtn) submitBtn.textContent = "Einnahme speichern";
  if (cancelBtn) cancelBtn.hidden = true;
  if (bankAccount && appState.bankAccounts.length) {
    bankAccount.value = String(appState.selectedBankAccountId || appState.bankAccounts[0].id || "");
  }
}

// Fuellt das Income-Formular fuer die Bearbeitung eines vorhandenen Eintrags.
export function setIncomeFormModeEdit(entry) {
  incomeState.editingId = entry.id;
  const { source, amount, currency, date, cycle, recurrence, recurrenceRow, note, submitBtn, cancelBtn, bankAccount } = getIncomeFormElements();
  if (source) source.value = entry.source || "";
  setCategoryValue("income-category", "income-custom-wrap", "income-category-custom", entry.category, "salary");
  const preferredCurrency = getCurrency();
  if (currency) currency.value = preferredCurrency;
  if (amount) {
    const converted = convertFromEur(Number(entry.amount) || 0, preferredCurrency);
    amount.value = Math.round(converted * 100) / 100;
  }
  if (date) date.value = formatDateTimeLocalInputValue(entry.received_at || entry.created_at || new Date());
  if (cycle) cycle.value = entry.cycle || "once";
  const isOnce = !cycle || cycle.value === "once";
  if (recurrenceRow) recurrenceRow.style.display = isOnce ? "none" : "";
  if (recurrence) recurrence.value = entry.recurrence != null ? String(entry.recurrence) : "0";
  if (note) note.value = entry.note || "";
  if (submitBtn) submitBtn.textContent = "Aenderung speichern";
  if (cancelBtn) cancelBtn.hidden = false;
  if (bankAccount) {
    bankAccount.value = String(entry.bank_account_id || appState.selectedBankAccountId || appState.bankAccounts[0]?.id || "");
  }
}

// Kapselt das Lesen aller Expense-Formular-Elemente.
export function getExpenseFormElements() {
  const form = document.getElementById("expense-form");
  const submitBtn = document.getElementById("expense-submit-btn");
  const cancelBtn = document.getElementById("expense-cancel-btn");
  const source = document.getElementById("expense-source");
  const category = document.getElementById("expense-category");
  const categoryCustomWrap = document.getElementById("expense-custom-wrap");
  const categoryCustom = document.getElementById("expense-category-custom");
  const amount = document.getElementById("expense-amount");
  const currency = document.getElementById("expense-currency");
  const date = document.getElementById("expense-date");
  const cycle = document.getElementById("expense-cycle");
  const recurrence = document.getElementById("expense-recurrence");
  const recurrenceRow = document.querySelector(".expense-recurrence-row");
  const note = document.getElementById("expense-note");
  const bankAccount = document.getElementById("expense-bank-account");
  return { form, submitBtn, cancelBtn, source, category, categoryCustomWrap, categoryCustom, amount, currency, date, cycle, recurrence, recurrenceRow, note, bankAccount };
}

// Setzt das Expense-Formular auf "neu anlegen".
export function setExpenseFormModeCreate() {
  expenseState.editingId = null;
  const { form, submitBtn, cancelBtn, date, cycle, recurrence, recurrenceRow, bankAccount, currency } = getExpenseFormElements();
  if (!form) return;
  form.reset();
  setCategoryValue("expense-category", "expense-custom-wrap", "expense-category-custom", "", "rent");
  if (date) date.value = formatDateTimeLocalInputValue(new Date());
  if (cycle) cycle.value = appState.settings?.defaultExpenseRecurrence || "once";
  if (recurrence) recurrence.value = "0";
  if (recurrenceRow) recurrenceRow.style.display = !cycle || cycle.value === "once" ? "none" : "";
  if (currency) currency.value = getCurrency();
  if (submitBtn) submitBtn.textContent = "Ausgabe speichern";
  if (cancelBtn) cancelBtn.hidden = true;
  if (bankAccount && appState.bankAccounts.length) {
    bankAccount.value = String(appState.selectedBankAccountId || appState.bankAccounts[0].id || "");
  }
}

// Fuellt das Expense-Formular fuer die Bearbeitung eines vorhandenen Eintrags.
export function setExpenseFormModeEdit(entry) {
  expenseState.editingId = entry.id;
  const { source, amount, currency, date, cycle, recurrence, recurrenceRow, note, submitBtn, cancelBtn, bankAccount } = getExpenseFormElements();
  if (source) source.value = entry.source || "";
  setCategoryValue("expense-category", "expense-custom-wrap", "expense-category-custom", entry.category, "rent");
  const preferredCurrency = getCurrency();
  if (currency) currency.value = preferredCurrency;
  if (amount) {
    const converted = convertFromEur(Number(entry.amount) || 0, preferredCurrency);
    amount.value = Math.round(converted * 100) / 100;
  }
  if (date) date.value = formatDateTimeLocalInputValue(entry.spent_at || entry.created_at || new Date());
  if (cycle) cycle.value = entry.cycle || "once";
  const isOnce = !cycle || cycle.value === "once";
  if (recurrenceRow) recurrenceRow.style.display = isOnce ? "none" : "";
  if (recurrence) recurrence.value = entry.recurrence != null ? String(entry.recurrence) : "0";
  if (note) note.value = entry.note || "";
  if (submitBtn) submitBtn.textContent = "Aenderung speichern";
  if (cancelBtn) cancelBtn.hidden = false;
  if (bankAccount) {
    bankAccount.value = String(entry.bank_account_id || appState.selectedBankAccountId || appState.bankAccounts[0]?.id || "");
  }
}

export async function handleCreateIncome(payload) {
  return await requestJson("/api/income-entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function handleUpdateIncome(entryId, payload) {
  return await requestJson(`/api/income-entries/${encodeURIComponent(entryId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function handleDeleteIncome(entryId) {
  return await requestJson(`/api/income-entries/${encodeURIComponent(entryId)}`, {
    method: "DELETE"
  });
}

export async function handleCreateExpense(payload) {
  return await requestJson("/api/expense-entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function handleUpdateExpense(entryId, payload) {
  return await requestJson(`/api/expense-entries/${encodeURIComponent(entryId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function handleDeleteExpense(entryId) {
  return await requestJson(`/api/expense-entries/${encodeURIComponent(entryId)}`, {
    method: "DELETE"
  });
}

export async function handleDeleteCategory(kind, category) {
  return await requestJson("/api/categories", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind,
      category,
      replace_with: "other"
    })
  });
}

export async function loadBudgetStatus() {
  const result = await requestJson("/api/budgets/status");
  if (!result.ok) return [];
  return Array.isArray(result.alerts) ? result.alerts : [];
}

export function renderBudgetAlerts() {
  const section = document.getElementById("budget-alerts-section");
  const list = document.getElementById("budget-alerts-list");
  if (!section || !list) return;

  const exceeded = appState.budgetAlerts.filter((a) => a.percentage >= 80);
  if (exceeded.length === 0) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  list.innerHTML = exceeded.map((alert) => {
    const tone = alert.exceeded ? "danger" : "warning";
    const icon = alert.exceeded ? "⚠️" : "⚡";
    const label = alert.exceeded
      ? `${escapeHtml(alert.category)}: Budget ueberschritten (${formatMoney(alert.spent)} / ${formatMoney(alert.target)})`
      : `${escapeHtml(alert.category)}: ${alert.percentage}% des Budgets erreicht (${formatMoney(alert.spent)} / ${formatMoney(alert.target)})`;
    return `<li class="budget-alert-item is-${tone}">${icon} ${label}</li>`;
  }).join("");
}
