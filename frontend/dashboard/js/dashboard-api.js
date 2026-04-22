// API-Aufrufe und Formularstatus fuer Einnahmen, Ausgaben und Kategorien.
async function requestJson(url, options) {
  const request = window.FinanzAppApi?.requestJsonMerged;
  if (typeof request !== "function") {
    return { ok: false, status: 0, message: "Server nicht erreichbar." };
  }
  const result = await request(url, {
    credentials: "same-origin",
    ...(options || {})
  });
  return result;
}

// Laedt die serverseitig gespeicherten Einnahmen fuer den aktiven User.
async function loadIncomeEntries(userId) {
  const endpoint = appState.selectedBankAccountId
    ? `/api/income-entries?bank_account_id=${encodeURIComponent(appState.selectedBankAccountId)}`
    : "/api/income-entries";
  const result = await requestJson(endpoint);
  if (!result.ok) return [];
  return Array.isArray(result.entries) ? result.entries : [];
}

// Laedt die serverseitig gespeicherten Ausgaben fuer den aktiven User.
async function loadExpenseEntries(userId) {
  const endpoint = appState.selectedBankAccountId
    ? `/api/expense-entries?bank_account_id=${encodeURIComponent(appState.selectedBankAccountId)}`
    : "/api/expense-entries";
  const result = await requestJson(endpoint);
  if (!result.ok) return [];
  return Array.isArray(result.entries) ? result.entries : [];
}

async function loadBankAccounts(userId) {
  const result = await requestJson("/api/bank-accounts");
  if (!result || (result.ok === false)) return [];
  return Array.isArray(result.accounts) ? result.accounts : [];
}

// Laedt die kombinierte Kategorienliste (Preset + benutzerdefiniert).
async function loadUserCategories(userId) {
  const result = await requestJson("/api/categories");
  if (!result.ok) return { income: [], expense: [] };
  return {
    income: Array.isArray(result.income) ? result.income : [],
    expense: Array.isArray(result.expense) ? result.expense : []
  };
}

// Aktualisiert die Kategorie-Selects im UI.
async function refreshCategoryData() {
  if (!appState.user?.id) return;
  const categories = await loadUserCategories(appState.user.id);
  categoryState.income = categories.income;
  categoryState.expense = categories.expense;
  applyCategoryOptions();
}

// Holt Einnahmen/Ausgaben neu und rendert alle abhängigen UI-Bausteine.
async function refreshDashboardData() {
  if (!appState.user?.id) return;
  appState.bankAccounts = await loadBankAccounts(appState.user.id);
  if (
    appState.selectedBankAccountId &&
    !appState.bankAccounts.some((account) => String(account.id) === String(appState.selectedBankAccountId))
  ) {
    appState.selectedBankAccountId = "";
  }
  renderBankAccountSelectors();

  const [incomeEntries, expenseEntries] = await Promise.all([
    loadIncomeEntries(appState.user.id),
    loadExpenseEntries(appState.user.id)
  ]);

  appState.incomeEntries = incomeEntries;
  appState.expenseEntries = expenseEntries;
  renderIncomeList(appState.incomeEntries);
  renderExpenseList(appState.expenseEntries);
  updateFinanceCards(appState.user, appState.incomeEntries, appState.expenseEntries);
}

function formatBankAccountLabel(account) {
  const name = String(account?.label || account?.name || "Bankkonto").trim();
  const balance = Number(account?.balance || 0);
  return `${name} (${formatMoney(balance)})`;
}

function buildAccountOptionsMarkup({ includeAll = false } = {}) {
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

function renderBankAccountSelectors() {
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

function initDashboardAccountFilter() {
  const dashboardFilterSelect = document.getElementById("dashboard-bank-account-filter");
  if (!dashboardFilterSelect) return;

  dashboardFilterSelect.addEventListener("change", async () => {
    appState.selectedBankAccountId = String(dashboardFilterSelect.value || "").trim();
    await refreshDashboardData();
  });
}

function formatDateTimeLocalInputValue(value = new Date()) {
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
function initRecurrenceToggle(recurrenceId, activeId) {
  const recurrence = document.getElementById(recurrenceId);
  const active = document.getElementById(activeId);
  if (!recurrence || !active) return;

  const sync = () => {
    const isOnce = recurrence.value === "once";
    active.disabled = isOnce;
    if (isOnce) active.checked = true;
  };

  recurrence.addEventListener("change", sync);
  sync();
}

// Kapselt das Lesen aller Income-Formular-Elemente.
function getIncomeFormElements() {
  const form = document.getElementById("income-form");
  const submitBtn = document.getElementById("income-submit-btn");
  const cancelBtn = document.getElementById("income-cancel-btn");
  const source = document.getElementById("income-source");
  const amount = document.getElementById("income-amount");
  const currency = document.getElementById("income-currency");
  const date = document.getElementById("income-date");
  const recurrence = document.getElementById("income-recurrence");
  const category = document.getElementById("income-category");
  const categoryCustomWrap = document.getElementById("income-custom-wrap");
  const categoryCustom = document.getElementById("income-category-custom");
  const active = document.getElementById("income-active");
  const note = document.getElementById("income-note");
  const bankAccount = document.getElementById("income-bank-account");
  return { form, submitBtn, cancelBtn, source, amount, currency, date, recurrence, category, categoryCustomWrap, categoryCustom, active, note, bankAccount };
}

// Setzt das Income-Formular auf "neu anlegen".
function setIncomeFormModeCreate() {
  incomeState.editingId = null;
  const { form, submitBtn, cancelBtn, date, recurrence, active, bankAccount, currency } = getIncomeFormElements();
  if (!form) return;
  form.reset();
  setCategoryValue("income-category", "income-custom-wrap", "income-category-custom", "", "salary");
  if (date) date.value = formatDateTimeLocalInputValue(new Date());
  if (recurrence) recurrence.value = appState.settings?.defaultIncomeRecurrence || "once";
  if (active) {
    active.checked = true;
    active.disabled = !recurrence || recurrence.value === "once";
  }
  if (currency) currency.value = getCurrency();
  if (submitBtn) submitBtn.textContent = "Einnahme speichern";
  if (cancelBtn) cancelBtn.hidden = true;
  if (bankAccount && appState.bankAccounts.length) {
    bankAccount.value = String(appState.selectedBankAccountId || appState.bankAccounts[0].id || "");
  }
}

// Fuellt das Income-Formular fuer die Bearbeitung eines vorhandenen Eintrags.
function setIncomeFormModeEdit(entry) {
  incomeState.editingId = entry.id;
  const { source, amount, currency, date, recurrence, active, note, submitBtn, cancelBtn, bankAccount } = getIncomeFormElements();
  if (source) source.value = entry.source || "";
  setCategoryValue("income-category", "income-custom-wrap", "income-category-custom", entry.category, "salary");
  const preferredCurrency = getCurrency();
  if (currency) currency.value = preferredCurrency;
  if (amount) {
    const converted = window.FinanzAppCurrency?.convertFromEur
      ? window.FinanzAppCurrency.convertFromEur(Number(entry.amount) || 0, preferredCurrency)
      : Number(entry.amount) || 0;
    amount.value = Math.round(converted * 100) / 100;
  }
  if (date) date.value = formatDateTimeLocalInputValue(entry.received_at || entry.created_at || new Date());
  if (recurrence) recurrence.value = entry.recurrence || "once";
  if (active) {
    active.checked = entry.recurrence === "once" ? true : Boolean(entry.is_active);
    active.disabled = entry.recurrence === "once";
  }
  if (note) note.value = entry.note || "";
  if (submitBtn) submitBtn.textContent = "Aenderung speichern";
  if (cancelBtn) cancelBtn.hidden = false;
  if (bankAccount) {
    bankAccount.value = String(entry.bank_account_id || appState.selectedBankAccountId || appState.bankAccounts[0]?.id || "");
  }
}

// Kapselt das Lesen aller Expense-Formular-Elemente.
function getExpenseFormElements() {
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
  const recurrence = document.getElementById("expense-recurrence");
  const active = document.getElementById("expense-active");
  const note = document.getElementById("expense-note");
  const bankAccount = document.getElementById("expense-bank-account");
  return { form, submitBtn, cancelBtn, source, category, categoryCustomWrap, categoryCustom, amount, currency, date, recurrence, active, note, bankAccount };
}

// Setzt das Expense-Formular auf "neu anlegen".
function setExpenseFormModeCreate() {
  expenseState.editingId = null;
  const { form, submitBtn, cancelBtn, date, recurrence, active, bankAccount, currency } = getExpenseFormElements();
  if (!form) return;
  form.reset();
  setCategoryValue("expense-category", "expense-custom-wrap", "expense-category-custom", "", "rent");
  if (date) date.value = formatDateTimeLocalInputValue(new Date());
  if (recurrence) recurrence.value = appState.settings?.defaultExpenseRecurrence || "once";
  if (active) {
    active.checked = true;
    active.disabled = !recurrence || recurrence.value === "once";
  }
  if (currency) currency.value = getCurrency();
  if (submitBtn) submitBtn.textContent = "Ausgabe speichern";
  if (cancelBtn) cancelBtn.hidden = true;
  if (bankAccount && appState.bankAccounts.length) {
    bankAccount.value = String(appState.selectedBankAccountId || appState.bankAccounts[0].id || "");
  }
}

// Fuellt das Expense-Formular fuer die Bearbeitung eines vorhandenen Eintrags.
function setExpenseFormModeEdit(entry) {
  expenseState.editingId = entry.id;
  const { source, amount, currency, date, recurrence, active, note, submitBtn, cancelBtn, bankAccount } = getExpenseFormElements();
  if (source) source.value = entry.source || "";
  setCategoryValue("expense-category", "expense-custom-wrap", "expense-category-custom", entry.category, "rent");
  const preferredCurrency = getCurrency();
  if (currency) currency.value = preferredCurrency;
  if (amount) {
    const converted = window.FinanzAppCurrency?.convertFromEur
      ? window.FinanzAppCurrency.convertFromEur(Number(entry.amount) || 0, preferredCurrency)
      : Number(entry.amount) || 0;
    amount.value = Math.round(converted * 100) / 100;
  }
  if (date) date.value = formatDateTimeLocalInputValue(entry.spent_at || entry.created_at || new Date());
  if (recurrence) recurrence.value = entry.recurrence || "once";
  if (active) {
    active.checked = entry.recurrence === "once" ? true : Boolean(entry.is_active);
    active.disabled = entry.recurrence === "once";
  }
  if (note) note.value = entry.note || "";
  if (submitBtn) submitBtn.textContent = "Aenderung speichern";
  if (cancelBtn) cancelBtn.hidden = false;
  if (bankAccount) {
    bankAccount.value = String(entry.bank_account_id || appState.selectedBankAccountId || appState.bankAccounts[0]?.id || "");
  }
}

async function handleCreateIncome(payload) {
  return await requestJson("/api/income-entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function handleUpdateIncome(entryId, payload) {
  return await requestJson(`/api/income-entries/${encodeURIComponent(entryId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function handleDeleteIncome(entryId) {
  return await requestJson(`/api/income-entries/${encodeURIComponent(entryId)}`, {
    method: "DELETE"
  });
}

async function handleCreateExpense(payload) {
  return await requestJson("/api/expense-entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function handleUpdateExpense(entryId, payload) {
  return await requestJson(`/api/expense-entries/${encodeURIComponent(entryId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function handleDeleteExpense(entryId) {
  return await requestJson(`/api/expense-entries/${encodeURIComponent(entryId)}`, {
    method: "DELETE"
  });
}

async function handleDeleteCategory(kind, category) {
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
