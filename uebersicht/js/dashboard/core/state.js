// Globaler Dashboard-Zustand: Konstanten, Optionen und veraenderbare Laufzeitdaten.
const THEME_STORAGE_KEY = "finanzapp.themeMode";
const THEME_OPTIONS = new Set(["light", "dark", "auto"]);
const USER_STORAGE_KEY = "finanzapp.currentUser";
const VIEW_STORAGE_KEY = "finanzapp.dashboardView";
const VIEW_OPTIONS = new Set(["overview", "income", "expense"]);
const SETTINGS_STORAGE_PREFIX = "finanzapp.dashboardSettings";
const SETTINGS_LOCALE_OPTIONS = new Set(["de-DE", "en-US", "en-GB", "fr-FR"]);
const SETTINGS_CURRENCY_OPTIONS = new Set(["EUR", "USD", "GBP", "CHF"]);
const SETTINGS_RECURRENCE_OPTIONS = new Set(["once", "weekly", "monthly"]);
const prefersDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");
const DEFAULT_DASHBOARD_SETTINGS = {
  currency: "EUR",
  locale: "de-DE",
  startView: "overview",
  defaultIncomeRecurrence: "once",
  defaultExpenseRecurrence: "once"
};

const appState = {
  user: null,
  incomeEntries: [],
  expenseEntries: [],
  settings: { ...DEFAULT_DASHBOARD_SETTINGS }
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
