const THEME_STORAGE_KEY = "finanzapp.themeMode";
const THEME_OPTIONS = new Set(["light", "dark", "auto"]);
const USER_STORAGE_KEY = "finanzapp.currentUser";
const VIEW_STORAGE_KEY = "finanzapp.dashboardView";
const VIEW_OPTIONS = new Set(["overview", "income", "expense"]);
const prefersDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");

const appState = {
  user: null,
  incomeEntries: [],
  expenseEntries: []
};

const categoryState = {
  income: [],
  expense: []
};

const listState = {
  incomeSearch: "",
  expenseSearch: "",
  incomeExpandedGroups: new Set(),
  expenseExpandedGroups: new Set()
};

const incomeState = {
  editingId: null,
  askConfirm: null
};

const expenseState = {
  editingId: null,
  askConfirm: null
};

const INCOME_CATEGORY_OPTIONS = [
  { value: "salary", label: "Gehalt" },
  { value: "freelance", label: "Freelance" },
  { value: "bonus", label: "Bonus" },
  { value: "refund", label: "Rueckzahlung" },
  { value: "investment", label: "Kapitalertraege" },
  { value: "other", label: "Sonstiges" }
];
const EXPENSE_CATEGORY_OPTIONS = [
  { value: "rent", label: "Miete" },
  { value: "groceries", label: "Lebensmittel" },
  { value: "utilities", label: "Nebenkosten" },
  { value: "transport", label: "Mobilitaet" },
  { value: "health", label: "Gesundheit" },
  { value: "entertainment", label: "Freizeit" },
  { value: "other", label: "Sonstiges" }
];
const PRESET_INCOME_CATEGORY_KEYS = new Set(INCOME_CATEGORY_OPTIONS.map((item) => item.value.toLowerCase()));
const PRESET_EXPENSE_CATEGORY_KEYS = new Set(EXPENSE_CATEGORY_OPTIONS.map((item) => item.value.toLowerCase()));
const CATEGORY_LABELS = {
  salary: "Gehalt",
  freelance: "Freelance",
  bonus: "Bonus",
  refund: "Rueckzahlung",
  investment: "Kapitalertraege",
  rent: "Miete",
  groceries: "Lebensmittel",
  utilities: "Nebenkosten",
  transport: "Mobilitaet",
  health: "Gesundheit",
  entertainment: "Freizeit",
  other: "Sonstiges"
};

function getStoredThemeMode() {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored && THEME_OPTIONS.has(stored)) return stored;
  return "auto";
}

function resolveTheme(mode) {
  return mode === "auto" ? (prefersDarkQuery.matches ? "dark" : "light") : mode;
}

function updateThemeButtons(mode) {
  const buttons = document.querySelectorAll(".theme-option");
  for (const button of buttons) {
    const isActive = button.dataset.themeChoice === mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
}

function applyTheme(mode) {
  document.documentElement.dataset.theme = resolveTheme(mode);
  document.documentElement.dataset.themeMode = mode;
  updateThemeButtons(mode);
}

function initThemeSwitcher() {
  applyTheme(getStoredThemeMode());

  const buttons = document.querySelectorAll(".theme-option");
  for (const button of buttons) {
    button.addEventListener("click", () => {
      const mode = button.dataset.themeChoice;
      if (!mode || !THEME_OPTIONS.has(mode)) return;
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
      applyTheme(mode);
    });
  }

  const handleSchemeChange = () => {
    if (getStoredThemeMode() === "auto") applyTheme("auto");
  };
  if (typeof prefersDarkQuery.addEventListener === "function") {
    prefersDarkQuery.addEventListener("change", handleSchemeChange);
  } else if (typeof prefersDarkQuery.addListener === "function") {
    prefersDarkQuery.addListener(handleSchemeChange);
  }
}

function getStoredView() {
  const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
  if (stored && VIEW_OPTIONS.has(stored)) return stored;
  return "overview";
}

function setActiveView(view) {
  const nextView = VIEW_OPTIONS.has(view) ? view : "overview";

  const tabs = document.querySelectorAll("[data-view-tab]");
  for (const tab of tabs) {
    const isActive = tab.dataset.viewTab === nextView;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  }

  const panels = document.querySelectorAll("[data-view-panel]");
  for (const panel of panels) {
    panel.hidden = panel.dataset.viewPanel !== nextView;
  }

  window.localStorage.setItem(VIEW_STORAGE_KEY, nextView);
}

function initSectionTabs() {
  setActiveView(getStoredView());

  const tabs = document.querySelectorAll("[data-view-tab]");
  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const targetView = tab.dataset.viewTab;
      if (!targetView) return;
      setActiveView(targetView);
    });
  }
}

function getCurrentUser() {
  const raw = window.sessionStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setCurrentUser(nextUser) {
  if (!nextUser) return;
  const current = getCurrentUser() || {};
  const merged = { ...current, ...nextUser };
  window.sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(merged));
  appState.user = merged;
}

function formatMoney(value) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(date);
}

function categoryLabel(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "Ohne Kategorie";
  return CATEGORY_LABELS[normalized.toLowerCase()] || normalized;
}

function syncCustomCategoryField(selectNode, customWrap, customInput) {
  if (!selectNode || !customWrap || !customInput) return;
  const useCustom = selectNode.value === "custom";
  customWrap.hidden = !useCustom;
  customInput.required = useCustom;
  if (!useCustom) customInput.value = "";
}

function initCategorySelector(selectId, wrapId, customInputId) {
  const selectNode = document.getElementById(selectId);
  const customWrap = document.getElementById(wrapId);
  const customInput = document.getElementById(customInputId);
  if (!selectNode || !customWrap || !customInput) return;
  selectNode.addEventListener("change", () => syncCustomCategoryField(selectNode, customWrap, customInput));
  syncCustomCategoryField(selectNode, customWrap, customInput);
}

function resolveCategoryFromForm(formData) {
  const selected = String(formData.get("category") || "").trim();
  const custom = String(formData.get("category_custom") || "").trim();
  return selected === "custom" ? custom : selected;
}

function optionValues(selectNode) {
  if (!selectNode) return new Set();
  return new Set(Array.from(selectNode.options).map((option) => option.value));
}

function renderCategoryOptions(selectNode, presetOptions, storedCategories) {
  if (!selectNode) return;

  const existing = optionValues(selectNode);
  const current = selectNode.value;
  const customSelected = current === "custom";

  const normalizedPreset = new Set(presetOptions.map((item) => item.value.toLowerCase()));
  const normalizedStored = [];
  for (const raw of storedCategories || []) {
    const value = String(raw || "").trim();
    if (!value) continue;
    const lowered = value.toLowerCase();
    if (lowered === "custom") continue;
    if (normalizedPreset.has(lowered)) continue;
    if (normalizedStored.includes(lowered)) continue;
    normalizedStored.push(lowered);
  }

  selectNode.innerHTML = "";
  for (const item of presetOptions) {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    selectNode.append(option);
  }
  for (const lowered of normalizedStored) {
    const original = (storedCategories || []).find((value) => String(value || "").trim().toLowerCase() === lowered) || lowered;
    const option = document.createElement("option");
    option.value = String(original).trim();
    option.textContent = String(original).trim();
    selectNode.append(option);
  }
  const customOption = document.createElement("option");
  customOption.value = "custom";
  customOption.textContent = "Eigene Kategorie...";
  selectNode.append(customOption);

  if (customSelected || current === "custom") {
    selectNode.value = "custom";
    return;
  }
  if (existing.has(current) && optionValues(selectNode).has(current)) {
    selectNode.value = current;
  }
}

function applyCategoryOptions() {
  const incomeSelect = document.getElementById("income-category");
  const expenseSelect = document.getElementById("expense-category");
  renderCategoryOptions(incomeSelect, INCOME_CATEGORY_OPTIONS, categoryState.income);
  renderCategoryOptions(expenseSelect, EXPENSE_CATEGORY_OPTIONS, categoryState.expense);
  renderCategoryManagers();
}

function customCategories(kind) {
  const rawValues = kind === "income" ? categoryState.income : categoryState.expense;
  const presetSet = kind === "income" ? PRESET_INCOME_CATEGORY_KEYS : PRESET_EXPENSE_CATEGORY_KEYS;
  const unique = [];
  for (const raw of rawValues || []) {
    const value = String(raw || "").trim();
    if (!value) continue;
    if (presetSet.has(value.toLowerCase())) continue;
    if (!unique.find((item) => item.toLowerCase() === value.toLowerCase())) {
      unique.push(value);
    }
  }
  return unique;
}

function renderCategoryManager(kind, listId) {
  const list = document.getElementById(listId);
  if (!list) return;
  const categories = customCategories(kind);
  if (!categories.length) {
    list.innerHTML = '<li><p class="category-empty">Keine eigenen Kategorien vorhanden.</p></li>';
    return;
  }
  list.innerHTML = categories
    .map((category) => `
      <li class="category-item">
        <span class="category-name">${escapeHtml(category)}</span>
        <button type="button" class="category-delete" data-category-delete="${escapeHtml(category)}" data-category-kind="${kind}">
          Loeschen
        </button>
      </li>
    `)
    .join("");
}

function renderCategoryManagers() {
  renderCategoryManager("income", "income-category-list");
  renderCategoryManager("expense", "expense-category-list");
}

function setCategoryValue(selectId, wrapId, customInputId, value, fallback) {
  const selectNode = document.getElementById(selectId);
  const customWrap = document.getElementById(wrapId);
  const customInput = document.getElementById(customInputId);
  if (!selectNode || !customWrap || !customInput) return;

  const options = optionValues(selectNode);
  const normalized = String(value || "").trim();
  if (normalized && options.has(normalized)) {
    selectNode.value = normalized;
    customInput.value = "";
  } else if (normalized) {
    selectNode.value = "custom";
    customInput.value = normalized;
  } else {
    selectNode.value = fallback;
    customInput.value = "";
  }

  syncCustomCategoryField(selectNode, customWrap, customInput);
}

function initialsFromUser(user) {
  const first = String(user.first_name || user.username || "U").charAt(0).toUpperCase();
  const last = String(user.last_name || "").charAt(0).toUpperCase();
  return `${first}${last}`.trim();
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function setTrend(id, text, tone = "neutral") {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = text;
  node.classList.remove("positive", "neutral");
  node.classList.add(tone === "positive" ? "positive" : "neutral");
}

function setStatus(statusId, type, text) {
  const node = document.getElementById(statusId);
  if (!node) return;
  node.textContent = text;
  node.classList.remove("is-success", "is-error");
  if (type === "success") node.classList.add("is-success");
  if (type === "error") node.classList.add("is-error");
}

function recurrenceLabel(recurrence) {
  if (recurrence === "weekly") return "Woechentlich";
  if (recurrence === "monthly") return "Monatlich";
  return "Einmalig";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function entryMatchesQuery(entry, query, dateField) {
  if (!query) return true;
  const haystack = [
    entry.source,
    entry.category,
    entry.note,
    entry[dateField] ? formatDate(entry[dateField]) : "",
    recurrenceLabel(entry.recurrence)
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function compareDescKey(a, b) {
  if (a === "unknown") return 1;
  if (b === "unknown") return -1;
  return b.localeCompare(a);
}

function buildHierarchicalGroups(entries, dateField) {
  const yearMap = new Map();

  for (const entry of entries) {
    const date = new Date(entry[dateField]);
    const yearKey = Number.isNaN(date.getTime()) ? "unknown" : String(date.getFullYear());
    const monthKey = Number.isNaN(date.getTime()) ? "unknown" : monthKeyFromDate(new Date(date.getFullYear(), date.getMonth(), 1));
    const dayKey = Number.isNaN(date.getTime()) ? "unknown" : dayKeyFromValue(entry[dateField]) || "unknown";

    if (!yearMap.has(yearKey)) {
      yearMap.set(yearKey, new Map());
    }
    const monthMap = yearMap.get(yearKey);

    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, new Map());
    }
    const dayMap = monthMap.get(monthKey);

    if (!dayMap.has(dayKey)) {
      dayMap.set(dayKey, []);
    }
    dayMap.get(dayKey).push(entry);
  }

  return Array.from(yearMap.entries())
    .sort((a, b) => compareDescKey(a[0], b[0]))
    .map(([yearKey, monthMap]) => {
      const months = Array.from(monthMap.entries())
        .sort((a, b) => compareDescKey(a[0], b[0]))
        .map(([monthKey, dayMap]) => {
          const days = Array.from(dayMap.entries())
            .sort((a, b) => compareDescKey(a[0], b[0]))
            .map(([dayKey, dayEntries]) => ({
              key: dayKey,
              label: dayKey === "unknown" ? "Ohne Datum" : dayLabelFromKey(dayKey),
              entries: dayEntries,
              count: dayEntries.length,
              total: dayEntries.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
            }));
          const monthEntries = days.flatMap((day) => day.entries);
          return {
            key: monthKey,
            label: monthKey === "unknown" ? "Ohne Monat" : monthLongLabelFromKey(monthKey),
            days,
            count: monthEntries.length,
            total: monthEntries.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
          };
        });
      const yearEntries = months.flatMap((month) => month.days.flatMap((day) => day.entries));
      return {
        key: yearKey,
        label: yearKey === "unknown" ? "Ohne Jahr" : yearKey,
        months,
        count: yearEntries.length,
        total: yearEntries.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
      };
    });
}

function renderIncomeItem(entry) {
  return `
    <li class="income-item" data-entry-id="${entry.id}">
      <div class="income-topline">
        <div>
          <span class="income-source">${escapeHtml(entry.source)}</span>
          <div class="income-tags">
            <span class="income-tag">${escapeHtml(categoryLabel(entry.category))}</span>
            <span class="income-tag">${recurrenceLabel(entry.recurrence)}</span>
            ${
              entry.recurrence !== "once"
                ? `<span class="income-tag">${entry.is_active ? "Aktiv" : "Pausiert"}</span>`
                : ""
            }
          </div>
        </div>
        <span class="income-amount">${formatMoney(entry.amount)}</span>
      </div>
      <p class="income-meta">${formatDate(entry.received_at)}</p>
      ${entry.note ? `<p class="income-note">${escapeHtml(entry.note)}</p>` : ""}
      <div class="income-actions-inline">
        <button class="inline-action" type="button" data-action="edit" data-entry-id="${entry.id}">Bearbeiten</button>
        <button class="inline-action delete" type="button" data-action="delete" data-entry-id="${entry.id}">Loeschen</button>
      </div>
    </li>
  `;
}

function renderExpenseItem(entry) {
  return `
    <li class="income-item" data-entry-id="${entry.id}">
      <div class="income-topline">
        <div>
          <span class="income-source">${escapeHtml(entry.source || entry.category || "Ausgabe")}</span>
          <div class="income-tags">
            <span class="income-tag">${escapeHtml(categoryLabel(entry.category))}</span>
            <span class="income-tag">${recurrenceLabel(entry.recurrence)}</span>
            ${
              entry.recurrence !== "once"
                ? `<span class="income-tag">${entry.is_active ? "Aktiv" : "Pausiert"}</span>`
                : ""
            }
          </div>
        </div>
        <span class="income-amount is-expense">${formatMoney(entry.amount)}</span>
      </div>
      <p class="income-meta">${formatDate(entry.spent_at)}</p>
      ${entry.note ? `<p class="income-note">${escapeHtml(entry.note)}</p>` : ""}
      <div class="income-actions-inline">
        <button class="inline-action" type="button" data-expense-action="edit" data-entry-id="${entry.id}">Bearbeiten</button>
        <button class="inline-action delete" type="button" data-expense-action="delete" data-entry-id="${entry.id}">Loeschen</button>
      </div>
    </li>
  `;
}

function renderGroupedEntryList(list, grouped, expandedSet, renderer, emptyMessage) {
  if (!list) return;
  if (!grouped.length) {
    list.innerHTML = `<li><p class="income-empty">${emptyMessage}</p></li>`;
    return;
  }

  list.innerHTML = grouped
    .map((yearGroup) => {
      const yearOpen = expandedSet.has(`year:${yearGroup.key}`);
      return `
        <li class="month-group-item">
          <details class="year-group" data-group-key="year:${yearGroup.key}" ${yearOpen ? "open" : ""}>
            <summary class="month-summary">
              <span class="month-title">${escapeHtml(yearGroup.label)}</span>
              <span class="month-meta">${yearGroup.count} Eintraege • ${escapeHtml(formatMoney(yearGroup.total))}</span>
            </summary>
            <div class="year-content">
              ${yearGroup.months
                .map((monthGroup) => {
                  const monthOpen = expandedSet.has(`month:${monthGroup.key}`);
                  return `
                    <details class="month-group" data-group-key="month:${monthGroup.key}" ${monthOpen ? "open" : ""}>
                      <summary class="month-summary">
                        <span class="month-title">${escapeHtml(monthGroup.label)}</span>
                        <span class="month-meta">${monthGroup.count} Eintraege • ${escapeHtml(formatMoney(monthGroup.total))}</span>
                      </summary>
                      <ul class="month-entry-list">
                        ${monthGroup.days
                          .map((dayGroup) => {
                            const dayOpen = expandedSet.has(`day:${dayGroup.key}`);
                            return `
                              <li>
                                <details class="day-group" data-group-key="day:${dayGroup.key}" ${dayOpen ? "open" : ""}>
                                  <summary class="day-summary">
                                    <span class="day-title">${escapeHtml(dayGroup.label)}</span>
                                    <span class="month-meta">${dayGroup.count} Eintraege • ${escapeHtml(formatMoney(dayGroup.total))}</span>
                                  </summary>
                                  <ul class="month-entry-list">
                                    ${dayGroup.entries.map((entry) => renderer(entry)).join("")}
                                  </ul>
                                </details>
                              </li>
                            `;
                          })
                          .join("")}
                      </ul>
                    </details>
                  `;
                })
                .join("")}
            </div>
          </details>
        </li>
      `;
    })
    .join("");
}

function renderIncomeList(entries) {
  const list = document.getElementById("income-list");
  if (!list) return;
  const query = normalizeSearch(listState.incomeSearch);
  const filtered = entries.filter((entry) => entryMatchesQuery(entry, query, "received_at"));
  const grouped = buildHierarchicalGroups(filtered, "received_at");
  const emptyMessage = query
    ? "Keine Einnahmen fuer diese Suche gefunden."
    : "Noch keine Einnahmen eingetragen.";
  renderGroupedEntryList(list, grouped, listState.incomeExpandedGroups, renderIncomeItem, emptyMessage);
}

function renderExpenseList(entries) {
  const list = document.getElementById("expense-list");
  if (!list) return;
  const query = normalizeSearch(listState.expenseSearch);
  const filtered = entries.filter((entry) => entryMatchesQuery(entry, query, "spent_at"));
  const grouped = buildHierarchicalGroups(filtered, "spent_at");
  const emptyMessage = query
    ? "Keine Ausgaben fuer diese Suche gefunden."
    : "Noch keine Ausgaben eingetragen.";
  renderGroupedEntryList(list, grouped, listState.expenseExpandedGroups, renderExpenseItem, emptyMessage);
}

function recurrenceMonthlyContribution(entry) {
  const amount = Number(entry.amount) || 0;
  if (entry.recurrence === "monthly") return entry.is_active ? amount : 0;
  if (entry.recurrence === "weekly") return entry.is_active ? amount * 4.33 : 0;
  return 0;
}

function isDateInCurrentMonth(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

function monthKeyFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthKeyFromValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return monthKeyFromDate(date);
}

function monthLabelFromKey(key) {
  const [yearRaw, monthRaw] = String(key).split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const date = new Date(year, month - 1, 1);
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat("de-DE", { month: "short" }).format(date).replace(".", "");
}

function monthLongLabelFromKey(key) {
  const [yearRaw, monthRaw] = String(key).split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const date = new Date(year, month - 1, 1);
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(date);
}

function monthShortYearLabelFromKey(key) {
  const [yearRaw, monthRaw] = String(key).split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const date = new Date(year, month - 1, 1);
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat("de-DE", { month: "short", year: "numeric" }).format(date).replace(".", "");
}

function dayKeyFromValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayLabelFromKey(key) {
  const [yearRaw, monthRaw, dayRaw] = String(key).split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

function recentMonthKeys(count) {
  const now = new Date();
  const keys = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    keys.push(monthKeyFromDate(date));
  }
  return keys;
}

function monthDateFromKey(key) {
  const [yearRaw, monthRaw] = String(key).split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const date = new Date(year, month - 1, 1);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildMonthRangeKeys(startDate, endDate) {
  const keys = [];
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  while (cursor <= end) {
    keys.push(monthKeyFromDate(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

function timelineKeysForChart(incomeEntries, expenseEntries) {
  const points = [];
  for (const entry of incomeEntries) {
    const date = new Date(entry.received_at);
    if (!Number.isNaN(date.getTime())) points.push(date);
  }
  for (const entry of expenseEntries) {
    const date = new Date(entry.spent_at);
    if (!Number.isNaN(date.getTime())) points.push(date);
  }

  if (!points.length) return recentMonthKeys(12);

  const now = new Date();
  const endDate = new Date(
    Math.max(
      ...points.map((date) => new Date(date.getFullYear(), date.getMonth(), 1).getTime()),
      new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    )
  );
  let startDate = new Date(
    Math.min(...points.map((date) => new Date(date.getFullYear(), date.getMonth(), 1).getTime()))
  );

  let keys = buildMonthRangeKeys(startDate, endDate);
  if (keys.length < 12) {
    startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 11, 1);
    keys = buildMonthRangeKeys(startDate, endDate);
  }
  if (keys.length > 48) {
    startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 47, 1);
    keys = buildMonthRangeKeys(startDate, endDate);
  }
  return keys;
}

function niceStep(range, targetTicks = 5) {
  const rough = Math.max(1, range / targetTicks);
  const power = 10 ** Math.floor(Math.log10(rough));
  const scaled = rough / power;
  if (scaled <= 1) return 1 * power;
  if (scaled <= 2) return 2 * power;
  if (scaled <= 5) return 5 * power;
  return 10 * power;
}

function formatAxisMoney(value) {
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(value)} €`;
}

function buildMonthlyTotals(entries, keys, dateField) {
  const totals = Object.fromEntries(keys.map((key) => [key, 0]));

  for (const entry of entries) {
    const amount = Number(entry.amount) || 0;
    if (amount <= 0) continue;

    if (entry.recurrence === "once") {
      const key = monthKeyFromValue(entry[dateField]);
      if (key && Object.prototype.hasOwnProperty.call(totals, key)) {
        totals[key] += amount;
      }
      continue;
    }

    const monthlyEquivalent = recurrenceMonthlyContribution(entry);
    if (monthlyEquivalent <= 0) continue;

    const startKey = monthKeyFromValue(entry[dateField]) || keys[0];
    for (const key of keys) {
      if (key >= startKey) totals[key] += monthlyEquivalent;
    }
  }

  return totals;
}

function getMonthlyTotal(entries, dateField) {
  const oneTime = entries
    .filter((entry) => entry.recurrence === "once" && isDateInCurrentMonth(entry[dateField]))
    .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

  const recurring = entries.reduce((sum, entry) => sum + recurrenceMonthlyContribution(entry), 0);
  return Number((oneTime + recurring).toFixed(2));
}

function buildIncomeSeries(keys, incomeEntries, baseIncome) {
  const totals = buildMonthlyTotals(incomeEntries, keys, "received_at");
  if (!incomeEntries.length && baseIncome > 0) {
    for (const key of keys) {
      totals[key] = baseIncome;
    }
  }
  return totals;
}

function polylinePoints(values, xForIndex, yForValue) {
  return values
    .map((value, index) => `${xForIndex(index)},${yForValue(value)}`)
    .join(" ");
}

function renderCashflowBars(incomeEntries, expenseEntries, baseIncome) {
  const container = document.getElementById("cashflow-bars");
  if (!container) return;

  const keys = timelineKeysForChart(incomeEntries, expenseEntries);
  const incomeTotals = buildIncomeSeries(keys, incomeEntries, baseIncome);
  const expenseTotals = buildMonthlyTotals(expenseEntries, keys, "spent_at");
  const incomeValues = keys.map((key) => Number((incomeTotals[key] || 0).toFixed(2)));
  const expenseValues = keys.map((key) => Number((expenseTotals[key] || 0).toFixed(2)));
  const savingsValues = keys.map((key, index) => Number((incomeValues[index] - expenseValues[index]).toFixed(2)));
  const allValues = incomeValues.concat(expenseValues).concat(savingsValues);
  const maxValue = Math.max(...allValues, 0);
  const minValue = Math.min(...allValues, 0);
  const range = Math.max(1, maxValue - minValue);

  if (maxValue === 0 && minValue === 0) {
    container.innerHTML = '<p class="bars-empty">Noch keine Verlaufsdaten vorhanden.</p>';
    return;
  }

  const height = 280;
  const padLeft = 86;
  const padRight = 28;
  const padTop = 18;
  const padBottom = 44;
  const slotWidth = 84;
  const width = Math.max(900, padLeft + padRight + Math.max(keys.length - 1, 1) * slotWidth);
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const yStep = niceStep(range, 6);
  let yMin = Math.floor(minValue / yStep) * yStep;
  let yMax = Math.ceil(maxValue / yStep) * yStep;
  yMin = Math.min(yMin, 0);
  yMax = Math.max(yMax, 0);
  if (yMin === yMax) yMax = yMin + yStep;
  const yRange = Math.max(1, yMax - yMin);

  const xForIndex = (index) => padLeft + (index * plotWidth) / Math.max(keys.length - 1, 1);
  const yForValue = (value) => padTop + ((yMax - value) / yRange) * plotHeight;
  const zeroY = yForValue(0);

  const ticks = [];
  for (let tick = yMin; tick <= yMax + yStep / 2; tick += yStep) {
    ticks.push(Number(tick.toFixed(2)));
  }

  const yGridLines = ticks
    .map((tick) => {
      const y = yForValue(tick);
      return `
        <line class="cashflow-grid" x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}"></line>
        <text class="cashflow-y-label" x="${padLeft - 10}" y="${y}" text-anchor="end" dominant-baseline="central">${escapeHtml(formatAxisMoney(tick))}</text>
      `;
    })
    .join("");

  const incomePolyline = polylinePoints(incomeValues, xForIndex, yForValue);
  const expensePolyline = polylinePoints(expenseValues, xForIndex, yForValue);
  const savingsPolyline = polylinePoints(savingsValues, xForIndex, yForValue);

  const labels = keys
    .map((key, index) => `
      <text class="cashflow-x-label" x="${xForIndex(index)}" y="${height - 10}" text-anchor="middle">
        ${escapeHtml(monthShortYearLabelFromKey(key))}
      </text>
    `)
    .join("");

  const incomeDots = incomeValues
    .map((value, index) => `<circle class="cashflow-point-income" cx="${xForIndex(index)}" cy="${yForValue(value)}" r="2.8"></circle>`)
    .join("");
  const expenseDots = expenseValues
    .map((value, index) => `<circle class="cashflow-point-expense" cx="${xForIndex(index)}" cy="${yForValue(value)}" r="2.8"></circle>`)
    .join("");
  const savingsDots = savingsValues
    .map((value, index) => `<circle class="cashflow-point-savings" cx="${xForIndex(index)}" cy="${yForValue(value)}" r="2.8"></circle>`)
    .join("");

  const firstLabel = monthLongLabelFromKey(keys[0]);
  const lastLabel = monthLongLabelFromKey(keys[keys.length - 1]);
  container.setAttribute("aria-label", `Cashflow Verlauf von ${firstLabel} bis ${lastLabel}`);

  container.innerHTML = `
    <svg class="cashflow-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Linienverlauf fuer Einnahmen, Ausgaben und Erspartes">
      ${yGridLines}
      <line class="cashflow-axis" x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}"></line>
      <line class="cashflow-axis" x1="${padLeft}" y1="${zeroY}" x2="${width - padRight}" y2="${zeroY}"></line>
      <polyline class="cashflow-line-income" points="${incomePolyline}"></polyline>
      <polyline class="cashflow-line-expense" points="${expensePolyline}"></polyline>
      <polyline class="cashflow-line-savings" points="${savingsPolyline}"></polyline>
      ${incomeDots}
      ${expenseDots}
      ${savingsDots}
      ${labels}
    </svg>
    <div class="cashflow-legend" aria-hidden="true">
      <span class="cashflow-legend-item"><span class="cashflow-legend-dot income"></span>Einnahmen</span>
      <span class="cashflow-legend-item"><span class="cashflow-legend-dot expense"></span>Ausgaben</span>
      <span class="cashflow-legend-item"><span class="cashflow-legend-dot savings"></span>Erspartes</span>
    </div>
  `;
}

function updateFinanceCards(user, incomeEntries, expenseEntries) {
  const baseIncome = Number(user.income) || 0;
  const hasIncomeEntries = incomeEntries.length > 0;
  const monthlyIncomeFromEntries = getMonthlyTotal(incomeEntries, "received_at");
  const monthlyIncome = Number((hasIncomeEntries ? monthlyIncomeFromEntries : (baseIncome > 0 ? baseIncome : 0)).toFixed(2));
  const monthlyExpense = getMonthlyTotal(expenseEntries, "spent_at");
  const netLiquidity = Number((monthlyIncome - monthlyExpense).toFixed(2));
  const savingRate = monthlyIncome > 0
    ? Math.round((netLiquidity / monthlyIncome) * 100)
    : 0;

  const keys = recentMonthKeys(2);
  const incomeTotals = buildIncomeSeries(keys, incomeEntries, baseIncome);
  const expenseTotals = buildMonthlyTotals(expenseEntries, keys, "spent_at");
  const currentIncome = Number((incomeTotals[keys[1]] || 0).toFixed(2));
  const previousIncome = Number((incomeTotals[keys[0]] || 0).toFixed(2));
  const currentExpense = Number((expenseTotals[keys[1]] || 0).toFixed(2));
  const previousExpense = Number((expenseTotals[keys[0]] || 0).toFixed(2));

  const pausedRecurring = incomeEntries
    .concat(expenseEntries)
    .filter((entry) => entry.recurrence !== "once" && !entry.is_active)
    .length;

  setText("kpi-income", formatMoney(monthlyIncome));
  setTrend(
    "kpi-income-trend",
    currentIncome > previousIncome ? "ueber Vormonat" : currentIncome < previousIncome ? "unter Vormonat" : "wie Vormonat",
    currentIncome > previousIncome ? "positive" : "neutral"
  );

  setText("kpi-expenses", formatMoney(monthlyExpense));
  setTrend(
    "kpi-expenses-trend",
    currentExpense > previousExpense ? "ueber Vormonat" : currentExpense < previousExpense ? "unter Vormonat" : "wie Vormonat",
    "neutral"
  );

  setText("kpi-saving-rate", `${savingRate}%`);
  setTrend("kpi-saving-rate-trend", savingRate >= 0 ? "nach Abzug der Ausgaben" : "mehr Ausgaben als Einnahmen", savingRate >= 0 ? "positive" : "neutral");

  setText("kpi-liquid", formatMoney(netLiquidity));
  setTrend("kpi-liquid-trend", netLiquidity >= 0 ? "positiver Monatsabschluss" : "negativer Monatsabschluss", netLiquidity >= 0 ? "positive" : "neutral");

  setText("total-assets", formatMoney(netLiquidity));
  setText("focus-paused", String(pausedRecurring));
  setText("focus-month-income", formatMoney(monthlyIncome));
  setText("focus-month-expense", formatMoney(monthlyExpense));

  const totalEntries = incomeEntries.length + expenseEntries.length;
  setText(
    "hero-sub",
    totalEntries
      ? `${incomeEntries.length} Einnahmen und ${expenseEntries.length} Ausgaben erfasst`
      : "Noch keine Buchungen erfasst. Lege Einnahmen oder Ausgaben an."
  );

  renderCashflowBars(incomeEntries, expenseEntries, baseIncome);
}

function hydrateProfile(user) {
  const profileName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.username || "Nutzer";
  setText("profile-name", profileName);
  setText("menu-name", profileName);
  setText("menu-mail", user.email || "-");
  const avatar = document.getElementById("profile-avatar");
  if (avatar) avatar.textContent = initialsFromUser(user);
}

function initProfileMenu() {
  const profileBtn = document.getElementById("profile-btn");
  const profileMenu = document.getElementById("profile-menu");
  const logoutBtn = document.getElementById("logout-btn");
  if (!profileBtn || !profileMenu || !logoutBtn) return;

  profileBtn.addEventListener("click", () => {
    const willOpen = profileMenu.hidden;
    profileMenu.hidden = !willOpen;
    profileBtn.setAttribute("aria-expanded", String(willOpen));
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!profileMenu.contains(target) && !profileBtn.contains(target)) {
      profileMenu.hidden = true;
      profileBtn.setAttribute("aria-expanded", "false");
    }
  });

  logoutBtn.addEventListener("click", () => {
    window.sessionStorage.removeItem(USER_STORAGE_KEY);
    window.location.assign("/");
  });
}

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

async function loadIncomeEntries(userId) {
  const result = await requestJson(`/api/income-entries?user_id=${encodeURIComponent(userId)}`);
  if (!result.ok) return [];
  return Array.isArray(result.entries) ? result.entries : [];
}

async function loadExpenseEntries(userId) {
  const result = await requestJson(`/api/expense-entries?user_id=${encodeURIComponent(userId)}`);
  if (!result.ok) return [];
  return Array.isArray(result.entries) ? result.entries : [];
}

async function loadUserCategories(userId) {
  const result = await requestJson(`/api/categories?user_id=${encodeURIComponent(userId)}`);
  if (!result.ok) return { income: [], expense: [] };
  return {
    income: Array.isArray(result.income) ? result.income : [],
    expense: Array.isArray(result.expense) ? result.expense : []
  };
}

async function refreshCategoryData() {
  if (!appState.user?.id) return;
  const categories = await loadUserCategories(appState.user.id);
  categoryState.income = categories.income;
  categoryState.expense = categories.expense;
  applyCategoryOptions();
}

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

function setIncomeFormModeCreate() {
  incomeState.editingId = null;
  const { form, submitBtn, cancelBtn, date, recurrence, active } = getIncomeFormElements();
  if (!form) return;
  form.reset();
  setCategoryValue("income-category", "income-custom-wrap", "income-category-custom", "", "salary");
  if (date) date.value = new Date().toISOString().slice(0, 10);
  if (recurrence) recurrence.value = "once";
  if (active) {
    active.checked = true;
    active.disabled = true;
  }
  if (submitBtn) submitBtn.textContent = "Einnahme speichern";
  if (cancelBtn) cancelBtn.hidden = true;
}

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

function setExpenseFormModeCreate() {
  expenseState.editingId = null;
  const { form, submitBtn, cancelBtn, date, recurrence, active } = getExpenseFormElements();
  if (!form) return;
  form.reset();
  setCategoryValue("expense-category", "expense-custom-wrap", "expense-category-custom", "", "rent");
  if (date) date.value = new Date().toISOString().slice(0, 10);
  if (recurrence) recurrence.value = "once";
  if (active) {
    active.checked = true;
    active.disabled = true;
  }
  if (submitBtn) submitBtn.textContent = "Ausgabe speichern";
  if (cancelBtn) cancelBtn.hidden = true;
}

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

function initConfirmModal() {
  const backdrop = document.getElementById("confirm-modal");
  const titleNode = document.getElementById("confirm-title");
  const messageNode = document.getElementById("confirm-message");
  const cancelBtn = document.getElementById("confirm-cancel-btn");
  const okBtn = document.getElementById("confirm-ok-btn");
  if (!backdrop || !titleNode || !messageNode || !cancelBtn || !okBtn) {
    return async () => false;
  }

  let resolver = null;

  const close = (value) => {
    backdrop.hidden = true;
    if (resolver) {
      const fn = resolver;
      resolver = null;
      fn(value);
    }
  };

  cancelBtn.addEventListener("click", () => close(false));
  okBtn.addEventListener("click", () => close(true));
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      close(false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (!backdrop.hidden && event.key === "Escape") {
      close(false);
    }
  });

  return ({ title, message, confirmText }) =>
    new Promise((resolve) => {
      resolver = resolve;
      titleNode.textContent = title;
      messageNode.textContent = message;
      okBtn.textContent = confirmText || "Loeschen";
      backdrop.hidden = false;
      okBtn.focus();
    });
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

async function bootstrap() {
  const user = getCurrentUser();
  if (!user) {
    window.location.assign("/");
    return;
  }

  appState.user = user;

  initThemeSwitcher();
  initSectionTabs();
  hydrateProfile(appState.user);
  initProfileMenu();

  const askConfirm = initConfirmModal();
  incomeState.askConfirm = askConfirm;
  expenseState.askConfirm = askConfirm;

  await refreshCategoryData();
  initBaseIncomeForm();
  initIncomeForm();
  initExpenseForm();
  initListSearch();
  initCategoryManagerActions();
  initIncomeListActions();
  initExpenseListActions();

  await refreshDashboardData();
}

bootstrap();
