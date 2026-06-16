/**
 * i18n.ts — Internationalization utilities (SSR-safe).
 *
 * Migrated from frontend/src/shared/js/language-utils.js
 *
 * Differences from the legacy implementation:
 * - No MutationObserver / DOM walker in SSR context.
 * - Locale files are loaded from `@/lib/i18n/<locale>.json` (bundled at build time).
 * - The `applyTranslations` DOM walker is stripped — Next.js uses React for rendering.
 * - `initI18n()` returns a Promise<void> for async initialization in Client Components.
 */

import deDe from './i18n/de-DE.json';
import enUs from './i18n/en-US.json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Locale = 'de-DE' | 'en-US';

export interface LocaleFile {
  locale: string;
  translations: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'finanzapp.locale';
const DASHBOARD_SETTINGS_PREFIX = 'finanzapp.dashboardSettings';
const DEFAULT_LOCALE: Locale = 'de-DE';
const SUPPORTED_LOCALES = new Set<Locale>(['de-DE', 'en-US']);

// ---------------------------------------------------------------------------
// Static locale bundles (bundled at build time — no fetch needed)
// ---------------------------------------------------------------------------

const BUNDLES: Record<Locale, Record<string, string>> = {
  'de-DE': (deDe as LocaleFile).translations,
  'en-US': (enUs as LocaleFile).translations,
};

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let _activeLocale: Locale = DEFAULT_LOCALE;
let activeDictionary: Record<string, string> = BUNDLES[DEFAULT_LOCALE];
let isReady = false;
/** Tracks whether the browser-side setup (storage listener) has run. */
let isBrowserReady = false;

// ---------------------------------------------------------------------------
// SSR guard
// ---------------------------------------------------------------------------

const isBrowser = (): boolean => typeof window !== 'undefined';

// ---------------------------------------------------------------------------
// Dashboard settings helpers (per-user locale preference)
// ---------------------------------------------------------------------------

function dashboardSettingsKey(userId: string | number): string {
  return `${DASHBOARD_SETTINGS_PREFIX}.${userId ?? 'anonymous'}`;
}

function getCurrentUserId(): string | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem('finanzapp.currentUser');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string | number } | null;
    return parsed?.id != null ? String(parsed.id) : null;
  } catch {
    return null;
  }
}

function readDashboardLocale(userId: string | null): Locale | null {
  if (!isBrowser() || !userId) return null;
  try {
    const raw = window.localStorage.getItem(dashboardSettingsKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { locale?: string } | null;
    const locale = String(parsed?.locale ?? '').trim();
    return SUPPORTED_LOCALES.has(locale as Locale) ? (locale as Locale) : null;
  } catch {
    return null;
  }
}

function writeDashboardLocale(userId: string, locale: Locale): void {
  if (!isBrowser()) return;
  try {
    const key = dashboardSettingsKey(userId);
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    parsed.locale = locale;
    window.localStorage.setItem(key, JSON.stringify(parsed));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Locale resolution
// ---------------------------------------------------------------------------

function normalizeLocale(value: string | null | undefined): Locale {
  const locale = String(value ?? '').trim();
  return SUPPORTED_LOCALES.has(locale as Locale) ? (locale as Locale) : DEFAULT_LOCALE;
}

/**
 * Get the current locale.
 * Priority: per-user dashboard setting → global localStorage → default.
 */
export function getLocale(userId?: string | null): Locale {
  if (!isBrowser()) return DEFAULT_LOCALE;
  const uid = userId ?? getCurrentUserId();
  const dashboardLocale = readDashboardLocale(uid);
  if (dashboardLocale) return dashboardLocale;
  const stored = String(window.localStorage.getItem(STORAGE_KEY) ?? '').trim();
  if (stored && SUPPORTED_LOCALES.has(stored as Locale)) return stored as Locale;
  return DEFAULT_LOCALE;
}

/** Return a copy of the supported locales set. */
export function getLocales(): Set<Locale> {
  return new Set(SUPPORTED_LOCALES);
}

// ---------------------------------------------------------------------------
// Dictionary management
// ---------------------------------------------------------------------------

function loadDictionary(locale: Locale): Record<string, string> {
  return BUNDLES[locale] ?? BUNDLES[DEFAULT_LOCALE];
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

function format(template: string, params: Record<string, string> = {}): string {
  return String(template).replace(/\{(\w+)\}/g, (_, name: string) =>
    String(params[name] ?? ''),
  );
}

/**
 * Translate a key with optional interpolation params.
 *
 * Falls back to the default locale dictionary, then to the raw key.
 *
 * @example
 * t('auth.title_login')
 * t('auth.login_success', { email: 'user@example.com' })
 */
export function t(key: string, params?: Record<string, string>): string {
  const template =
    activeDictionary[key] ?? BUNDLES[DEFAULT_LOCALE][key] ?? key;
  return params ? format(template, params) : template;
}

/**
 * Create a namespaced translate function.
 *
 * @example
 * const tAuth = createT('auth');
 * tAuth('title_login') // → t('auth.title_login')
 */
export function createT(
  prefix = '',
): (key: string, fallback?: string, params?: Record<string, string>) => string {
  return (key: string, fallback?: string, params?: Record<string, string>): string => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const translated = t(fullKey, params);
    if (translated && translated !== fullKey) return translated;
    if (!params || !Object.keys(params).length) return fallback ?? key;
    return String(fallback ?? '').replace(/\{(\w+)\}/g, (_, name: string) =>
      String(params[name] ?? ''),
    );
  };
}

// ---------------------------------------------------------------------------
// Locale switching
// ---------------------------------------------------------------------------

/**
 * Persist and activate a new locale.
 *
 * Dispatches `finanzapp:locale-changed` unless `options.silent` is true.
 */
export function setLocale(
  nextLocale: string,
  options: { userId?: string | null; silent?: boolean } = {},
): Locale {
  const locale = normalizeLocale(nextLocale);
  _activeLocale = locale;
  activeDictionary = loadDictionary(locale);

  if (isBrowser()) {
    window.localStorage.setItem(STORAGE_KEY, locale);
    const userId = options.userId ?? getCurrentUserId();
    if (userId) writeDashboardLocale(userId, locale);

    if (!options.silent) {
      window.dispatchEvent(
        new CustomEvent('finanzapp:locale-changed', { detail: { locale } }),
      );
    }
  }

  return locale;
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the i18n module.
 *
 * - Resolves the active locale from storage.
 * - Loads the corresponding dictionary.
 * - Sets up a `storage` event listener for cross-tab locale sync.
 *
 * Safe to call on the server — resolves immediately with the default locale.
 */
export async function initI18n(): Promise<void> {
  // Always update locale from storage on the browser, regardless of SSR isReady flag.
  const onBrowser = isBrowser();

  if (!isReady || (onBrowser && !isBrowserReady)) {
    const locale = onBrowser ? getLocale() : DEFAULT_LOCALE;
    _activeLocale = locale;
    activeDictionary = loadDictionary(locale);
    isReady = true;
  }

  if (!onBrowser || isBrowserReady) return;

  isBrowserReady = true;

  // Cross-tab sync
  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    const next = normalizeLocale(event.newValue);
    _activeLocale = next;
    activeDictionary = loadDictionary(next);
    window.dispatchEvent(
      new CustomEvent('finanzapp:locale-changed', { detail: { locale: next } }),
    );
  });
}

/** Resolve when the module is ready (useful after SSR hydration). */
export async function whenReady(): Promise<void> {
  if (isReady && (!isBrowser() || isBrowserReady)) return;
  await initI18n();
}
