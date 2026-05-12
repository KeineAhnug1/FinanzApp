import { getCurrentUserFromStorage } from './session-utils.js';
import { getLocale } from './language-utils.js';

const DEFAULT_CURRENCY = "EUR";
const SETTINGS_STORAGE_PREFIX = "finanzapp.dashboardSettings";
const SUPPORTED_CURRENCIES = new Set(["EUR", "USD", "GBP", "CHF"]);

let rates = { EUR: 1 };
let baseCurrency = "EUR";
let lastUpdateUnix = null;
let preloadPromise = null;

function resolveUserId(userId) {
  if (userId != null && String(userId).trim()) return String(userId).trim();
  const sessionUser = getCurrentUserFromStorage();
  const sessionId = String(sessionUser?.id || "").trim();
  return sessionId || "anonymous";
}

function sanitizeCurrency(value, fallback = DEFAULT_CURRENCY) {
  const normalized = String(value || "").trim().toUpperCase();
  return SUPPORTED_CURRENCIES.has(normalized) ? normalized : fallback;
}

function settingsStorageKey(userId) {
  return `${SETTINGS_STORAGE_PREFIX}.${resolveUserId(userId)}`;
}

export function getPreferredCurrency(userId) {
  try {
    const raw = window.localStorage.getItem(settingsStorageKey(userId));
    if (!raw) return DEFAULT_CURRENCY;
    const parsed = JSON.parse(raw);
    return sanitizeCurrency(parsed?.currency, DEFAULT_CURRENCY);
  } catch {
    return DEFAULT_CURRENCY;
  }
}

function normalizeRates(rawRates, base) {
  const out = {};
  if (rawRates && typeof rawRates === "object") {
    for (const [code, value] of Object.entries(rawRates)) {
      const normalizedCode = String(code || "").trim().toUpperCase();
      const numeric = Number(value);
      if (!normalizedCode || !Number.isFinite(numeric) || numeric <= 0) continue;
      out[normalizedCode] = numeric;
    }
  }
  out[base] = 1;
  out.EUR = out.EUR || (base === "EUR" ? 1 : out.EUR);
  return out;
}

export async function preloadRates({ base = "EUR" } = {}) {
  if (preloadPromise) return preloadPromise;

  const requestedBase = sanitizeCurrency(base, "EUR");
  preloadPromise = (async () => {
    try {
      const response = await fetch(`/api/exchange-rates/latest?base=${encodeURIComponent(requestedBase)}`, {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }

      const apiBase = sanitizeCurrency(payload.base_code, requestedBase);
      rates = normalizeRates(payload.rates, apiBase);
      baseCurrency = apiBase;
      lastUpdateUnix = Number(payload.time_last_update_unix) || null;
    } catch (error) {
      console.warn("[currency-utils] exchange rates unavailable, fallback to EUR only:", error);
      rates = { EUR: 1 };
      baseCurrency = "EUR";
      lastUpdateUnix = null;
    }

    return {
      base_code: baseCurrency,
      rates: { ...rates },
      time_last_update_unix: lastUpdateUnix
    };
  })();

  return preloadPromise;
}

export function convertAmount(amount, fromCurrency = "EUR", toCurrency = "EUR") {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return Number.NaN;

  const from = sanitizeCurrency(fromCurrency, DEFAULT_CURRENCY);
  const to = sanitizeCurrency(toCurrency, DEFAULT_CURRENCY);
  if (from === to) return numeric;

  const fromRate = rates[from];
  const toRate = rates[to];
  if (!Number.isFinite(fromRate) || fromRate <= 0 || !Number.isFinite(toRate) || toRate <= 0) {
    return numeric;
  }

  if (baseCurrency === from) {
    return numeric * toRate;
  }

  const inBase = numeric / fromRate;
  return inBase * toRate;
}

export function convertFromEur(amount, targetCurrency) {
  return convertAmount(amount, "EUR", targetCurrency);
}

export function formatAmount(
  amount,
  {
    locale = getLocale(),
    sourceCurrency = "EUR",
    currency = getPreferredCurrency(),
    maximumFractionDigits = 2,
    minimumFractionDigits
  } = {}
) {
  const source = sanitizeCurrency(sourceCurrency, DEFAULT_CURRENCY);
  const target = sanitizeCurrency(currency, DEFAULT_CURRENCY);
  const converted = convertAmount(amount, source, target);
  if (!Number.isFinite(converted)) return "—";

  const formatOptions = {
    style: "currency",
    currency: target,
    maximumFractionDigits: Number.isFinite(maximumFractionDigits) ? maximumFractionDigits : 2
  };
  if (Number.isFinite(minimumFractionDigits)) {
    formatOptions.minimumFractionDigits = minimumFractionDigits;
  }

  try {
    return new Intl.NumberFormat(locale || "de-DE", formatOptions).format(converted);
  } catch {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(
      Number(amount) || 0
    );
  }
}

export function formatFromEur(amount, options = {}) {
  return formatAmount(amount, { ...options, sourceCurrency: "EUR" });
}

export { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES };
