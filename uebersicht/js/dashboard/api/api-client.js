// API-Aufrufe und Formularstatus fuer Einnahmen, Ausgaben und Kategorien.
async function requestJson(url, options) {
  try {
    const response = await fetch(url, options);
    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }
    return { ok: response.ok && Boolean(data.ok), status: response.status, ...data };
  } catch {
    return { ok: false, status: 0, message: "Server nicht erreichbar." };
  }
}

// Laedt die serverseitig gespeicherten Einnahmen fuer den aktiven User.
async function loadIncomeEntries(userId) {
  const result = await requestJson(`/api/income-entries?user_id=${encodeURIComponent(userId)}`);
  if (!result.ok) return [];
  return Array.isArray(result.entries) ? result.entries : [];
}

// Laedt die serverseitig gespeicherten Ausgaben fuer den aktiven User.
async function loadExpenseEntries(userId) {
  const result = await requestJson(`/api/expense-entries?user_id=${encodeURIComponent(userId)}`);
  if (!result.ok) return [];
  return Array.isArray(result.entries) ? result.entries : [];
}

// Laedt die kombinierte Kategorienliste (Preset + benutzerdefiniert).
async function loadUserCategories(userId) {
  const result = await requestJson(`/api/categories?user_id=${encodeURIComponent(userId)}`);
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
  const date = document.getElementById("income-date");
  const recurrence = document.getElementById("income-recurrence");
  const category = document.getElementById("income-category");
  const categoryCustomWrap = document.getElementById("income-custom-wrap");
  const categoryCustom = document.getElementById("income-category-custom");
  const active = document.getElementById("income-active");
  const note = document.getElementById("income-note");
  return { form, submitBtn, cancelBtn, source, amount, date, recurrence, category, categoryCustomWrap, categoryCustom, active, note };
}

// Setzt das Income-Formular auf "neu anlegen".
function setIncomeFormModeCreate() {
  incomeState.editingId = null;
  const { form, submitBtn, cancelBtn, date, recurrence, active } = getIncomeFormElements();
  if (!form) return;
  form.reset();
  setCategoryValue("income-category", "income-custom-wrap", "income-category-custom", "", "salary");
  if (date) date.value = new Date().toISOString().slice(0, 10);
  if (recurrence) recurrence.value = appState.settings?.defaultIncomeRecurrence || "once";
  if (active) {
    active.checked = true;
    active.disabled = !recurrence || recurrence.value === "once";
  }
  if (submitBtn) submitBtn.textContent = "Einnahme speichern";
  if (cancelBtn) cancelBtn.hidden = true;
}

// Fuellt das Income-Formular fuer die Bearbeitung eines vorhandenen Eintrags.
function setIncomeFormModeEdit(entry) {
  incomeState.editingId = entry.id;
  const { source, amount, date, recurrence, active, note, submitBtn, cancelBtn } = getIncomeFormElements();
  if (source) source.value = entry.source || "";
  setCategoryValue("income-category", "income-custom-wrap", "income-category-custom", entry.category, "salary");
  if (amount) amount.value = Number(entry.amount) || 0;
  if (date) date.value = String(entry.received_at || "").slice(0, 10);
  if (recurrence) recurrence.value = entry.recurrence || "once";
  if (active) {
    active.checked = entry.recurrence === "once" ? true : Boolean(entry.is_active);
    active.disabled = entry.recurrence === "once";
  }
  if (note) note.value = entry.note || "";
  if (submitBtn) submitBtn.textContent = "Aenderung speichern";
  if (cancelBtn) cancelBtn.hidden = false;
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
  const date = document.getElementById("expense-date");
  const recurrence = document.getElementById("expense-recurrence");
  const active = document.getElementById("expense-active");
  const note = document.getElementById("expense-note");
  return { form, submitBtn, cancelBtn, source, category, categoryCustomWrap, categoryCustom, amount, date, recurrence, active, note };
}

// Setzt das Expense-Formular auf "neu anlegen".
function setExpenseFormModeCreate() {
  expenseState.editingId = null;
  const { form, submitBtn, cancelBtn, date, recurrence, active } = getExpenseFormElements();
  if (!form) return;
  form.reset();
  setCategoryValue("expense-category", "expense-custom-wrap", "expense-category-custom", "", "rent");
  if (date) date.value = new Date().toISOString().slice(0, 10);
  if (recurrence) recurrence.value = appState.settings?.defaultExpenseRecurrence || "once";
  if (active) {
    active.checked = true;
    active.disabled = !recurrence || recurrence.value === "once";
  }
  if (submitBtn) submitBtn.textContent = "Ausgabe speichern";
  if (cancelBtn) cancelBtn.hidden = true;
}

// Fuellt das Expense-Formular fuer die Bearbeitung eines vorhandenen Eintrags.
function setExpenseFormModeEdit(entry) {
  expenseState.editingId = entry.id;
  const { source, amount, date, recurrence, active, note, submitBtn, cancelBtn } = getExpenseFormElements();
  if (source) source.value = entry.source || "";
  setCategoryValue("expense-category", "expense-custom-wrap", "expense-category-custom", entry.category, "rent");
  if (amount) amount.value = Number(entry.amount) || 0;
  if (date) date.value = String(entry.spent_at || "").slice(0, 10);
  if (recurrence) recurrence.value = entry.recurrence || "once";
  if (active) {
    active.checked = entry.recurrence === "once" ? true : Boolean(entry.is_active);
    active.disabled = entry.recurrence === "once";
  }
  if (note) note.value = entry.note || "";
  if (submitBtn) submitBtn.textContent = "Aenderung speichern";
  if (cancelBtn) cancelBtn.hidden = false;
}

async function handleCreateIncome(payload) {
  return await requestJson("/api/income-entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: appState.user.id, ...payload })
  });
}

async function handleUpdateIncome(entryId, payload) {
  return await requestJson(`/api/income-entries/${encodeURIComponent(entryId)}?user_id=${encodeURIComponent(appState.user.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function handleDeleteIncome(entryId) {
  return await requestJson(`/api/income-entries/${encodeURIComponent(entryId)}?user_id=${encodeURIComponent(appState.user.id)}`, {
    method: "DELETE"
  });
}

async function handleCreateExpense(payload) {
  return await requestJson("/api/expense-entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: appState.user.id, ...payload })
  });
}

async function handleUpdateExpense(entryId, payload) {
  return await requestJson(`/api/expense-entries/${encodeURIComponent(entryId)}?user_id=${encodeURIComponent(appState.user.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function handleDeleteExpense(entryId) {
  return await requestJson(`/api/expense-entries/${encodeURIComponent(entryId)}?user_id=${encodeURIComponent(appState.user.id)}`, {
    method: "DELETE"
  });
}

async function handleUpdateBaseIncome(income) {
  return await requestJson("/api/user-income", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: appState.user.id,
      income
    })
  });
}

async function handleDeleteCategory(kind, category) {
  return await requestJson("/api/categories", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: appState.user.id,
      kind,
      category,
      replace_with: "other"
    })
  });
}
