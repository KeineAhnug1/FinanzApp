// Globaler Dashboard-Zustand: Konstanten, Optionen und veraenderbare Laufzeitdaten.
export const VIEW_STORAGE_KEY = "finanzapp.dashboardView";
export const VIEW_OPTIONS = new Set(["overview", "income", "expense"]);
export const SETTINGS_STORAGE_PREFIX = "finanzapp.dashboardSettings";
export const SETTINGS_LOCALE_OPTIONS = new Set(["de-DE", "en-US"]);
export const SETTINGS_RECURRENCE_OPTIONS = new Set(["once", "weekly", "monthly"]);
export const DEFAULT_DASHBOARD_SETTINGS = {
  locale: "de-DE",
  startView: "overview",
  defaultIncomeRecurrence: "once",
  defaultExpenseRecurrence: "once"
};

export const appState = {
  user: null,
  bankAccounts: [],
  selectedBankAccountId: "",
  incomeEntries: [],
  expenseEntries: [],
  budgetAlerts: [],
  settings: { ...DEFAULT_DASHBOARD_SETTINGS }
};

export const categoryState = {
  income: [],
  expense: []
};

export const listState = {
  incomeSearch: "",
  expenseSearch: "",
  incomeExpandedGroups: new Set(),
  expenseExpandedGroups: new Set()
};

export const cashflowChartState = {
  level: "timeline",
  selectedYear: "",
  selectedMonthKey: "",
  selectedDayKey: ""
};

export const overviewDistributionState = {
  mode: "income"
};

export const incomeState = {
  editingId: null,
  askConfirm: null
};

export const expenseState = {
  editingId: null,
  askConfirm: null
};

export const INCOME_CATEGORY_OPTIONS = [
  { value: "salary", label: "Gehalt" },
  { value: "freelance", label: "Freelance" },
  { value: "bonus", label: "Bonus" },
  { value: "refund", label: "Rueckzahlung" },
  { value: "investment", label: "Kapitalertraege" },
  { value: "other", label: "Sonstiges" }
];
export const EXPENSE_CATEGORY_OPTIONS = [
  { value: "rent", label: "Miete" },
  { value: "groceries", label: "Lebensmittel" },
  { value: "utilities", label: "Nebenkosten" },
  { value: "transport", label: "Mobilitaet" },
  { value: "health", label: "Gesundheit" },
  { value: "entertainment", label: "Freizeit" },
  { value: "other", label: "Sonstiges" }
];
export const PRESET_INCOME_CATEGORY_KEYS = new Set(INCOME_CATEGORY_OPTIONS.map((item) => item.value.toLowerCase()));
export const PRESET_EXPENSE_CATEGORY_KEYS = new Set(EXPENSE_CATEGORY_OPTIONS.map((item) => item.value.toLowerCase()));
export const CATEGORY_LABELS = Object.fromEntries(
  [...INCOME_CATEGORY_OPTIONS, ...EXPENSE_CATEGORY_OPTIONS].map(({ value, label }) => [value, label])
);
