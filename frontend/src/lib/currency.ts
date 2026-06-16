/**
 * currency.ts — Currency formatting utilities.
 *
 * Migrated from frontend/src/shared/js/currency-utils.js
 *
 * All amounts are treated as EUR (the app's single currency).
 * Locale-aware formatting is powered by the Intl API.
 */

import { getLocale } from './i18n';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FormatAmountOptions {
  /** BCP 47 locale string. Falls back to the active app locale. */
  locale?: string;
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
}

// ---------------------------------------------------------------------------
// Currency meta helpers
// ---------------------------------------------------------------------------

/** Returns the preferred display currency for the app (always EUR). */
export function getPreferredCurrency(): string {
  return 'EUR';
}

/** Stub — exchange rates are 1:1 (single-currency app). */
export async function preloadRates(): Promise<{ base_code: string; rates: Record<string, number> }> {
  return { base_code: 'EUR', rates: { EUR: 1 } };
}

/** Convert an amount from any currency to EUR (1:1 for this app). */
export function convertAmount(amount: number | string): number {
  return Number(amount);
}

/** Convert from EUR to display currency (1:1 for this app). */
export function convertFromEur(amount: number | string): number {
  return Number(amount);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format a numeric amount as a localized EUR currency string.
 *
 * Returns `"—"` for non-finite values.
 *
 * @example
 * formatCurrency(1234.5)          // "1.234,50 €"  (de-DE)
 * formatCurrency(1234.5, 'EUR')   // "€1,234.50"   (en-US, if locale is en-US)
 */
export function formatCurrency(amount: number, _currency?: string): string {
  return formatAmount(amount);
}

/**
 * Format a numeric amount with full Intl options.
 *
 * @example
 * formatAmount(1234, { locale: 'en-US', maximumFractionDigits: 0 }) // "$1,234"
 */
export function formatAmount(
  amount: number | string,
  {
    locale,
    maximumFractionDigits = 2,
    minimumFractionDigits,
  }: FormatAmountOptions = {},
): string {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return '—';

  const opts: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits,
  };
  if (Number.isFinite(minimumFractionDigits) && minimumFractionDigits !== undefined) {
    opts.minimumFractionDigits = minimumFractionDigits;
  }

  const resolvedLocale = locale ?? (typeof window !== 'undefined' ? getLocale() : 'de-DE');

  try {
    return new Intl.NumberFormat(resolvedLocale || 'de-DE', opts).format(numeric);
  } catch {
    return new Intl.NumberFormat('de-DE', opts).format(numeric);
  }
}

/** Alias kept for parity with legacy `formatFromEur`. */
export function formatFromEur(amount: number | string, options: FormatAmountOptions = {}): string {
  return formatAmount(amount, options);
}

/**
 * Parse a localized currency string back to a number.
 *
 * Handles European (`,` decimal) and US (`.` decimal) formats.
 *
 * @example
 * parseCurrency("1.234,50 €") // 1234.5
 * parseCurrency("$1,234.50")  // 1234.5
 */
export function parseCurrency(value: string): number {
  if (!value || typeof value !== 'string') return NaN;

  // Remove currency symbols and whitespace
  let cleaned = value.replace(/[^\d.,-]/g, '').trim();

  // Detect European format:
  // - Last separator is ',' (decimal comma)
  // - Thousands are separated by '.' (if present, must be groups of exactly 3 digits)
  // Matches: "1234,56"  "1.234,56"  "1.234.567,89"
  const hasCommaDecimal = /,\d+$/.test(cleaned);
  const hasDotThousands = /\.\d{3}/.test(cleaned);
  const hasDotDecimal = /\.\d+$/.test(cleaned) && !hasCommaDecimal;

  if (hasCommaDecimal) {
    // European: remove dot thousands separators, replace comma decimal with dot
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasDotDecimal) {
    // US/standard: remove comma thousands separators
    cleaned = cleaned.replace(/,/g, '');
  } else if (hasDotThousands) {
    // Dot-only thousands (e.g. "1.234") — ambiguous, treat as European integer
    cleaned = cleaned.replace(/\./g, '');
  } else {
    // Plain integer or already clean — just remove commas
    cleaned = cleaned.replace(/,/g, '');
  }

  return parseFloat(cleaned);
}
