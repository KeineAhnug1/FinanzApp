// Kategorien: Labels, Select-Optionen und Darstellung der verwaltbaren Kategorien.
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
