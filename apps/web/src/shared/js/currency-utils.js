// @ts-check
import { getLocale } from './language-utils.js';

export function getPreferredCurrency() { return "EUR"; }
export async function preloadRates() { return { base_code: "EUR", rates: { EUR: 1 } }; }
export function convertAmount(amount) { return Number(amount); }
export function convertFromEur(amount) { return Number(amount); }

export function formatAmount(amount, { locale, maximumFractionDigits = 2, minimumFractionDigits } = {}) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return "—";
  const opts = { style: "currency", currency: "EUR", maximumFractionDigits };
  if (Number.isFinite(minimumFractionDigits)) opts.minimumFractionDigits = minimumFractionDigits;
  try {
    return new Intl.NumberFormat(locale || getLocale() || "de-DE", opts).format(numeric);
  } catch {
    return new Intl.NumberFormat("de-DE", opts).format(numeric);
  }
}

export function formatFromEur(amount, options = {}) {
  return formatAmount(amount, options);
}
