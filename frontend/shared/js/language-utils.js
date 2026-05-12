const STORAGE_KEY = "finanzapp.locale";
const DASHBOARD_SETTINGS_PREFIX = "finanzapp.dashboardSettings";
const INDEX_URL = "/shared/i18n/index.json";
const DEFAULT_LOCALE = "de-DE";
const FALLBACK_LOCALES = ["de-DE", "en-US"];

let defaultLocale = DEFAULT_LOCALE;
let LOCALES = new Set(FALLBACK_LOCALES);
const dictionaryCache = new Map();

let sourceLocale = DEFAULT_LOCALE;
let sourceDictionary = {};
let activeDictionary = {};
let activeLocale = DEFAULT_LOCALE;
let tokenLookup = new Map();
let normalizedTokenLookup = new Map();
let isReady = false;
let initPromise = null;

const textSourceMap = new WeakMap();
const attrSourceMap = new WeakMap();

function format(template, params = {}) {
  return String(template).replaceAll(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
}

function normalizeToken(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

function dashboardSettingsKey(userId) {
  return `${DASHBOARD_SETTINGS_PREFIX}.${userId || "anonymous"}`;
}

function getCurrentUserId() {
  try {
    const raw = window.sessionStorage.getItem("finanzapp.currentUser");
    if (!raw) return null;
    return JSON.parse(raw)?.id || null;
  } catch {
    return null;
  }
}

function readDashboardLocale(userId) {
  try {
    const raw = window.localStorage.getItem(dashboardSettingsKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return String(parsed?.locale || "").trim() || null;
  } catch {
    return null;
  }
}

function writeDashboardLocale(userId, locale) {
  try {
    const key = dashboardSettingsKey(userId);
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed.locale = locale;
    window.localStorage.setItem(key, JSON.stringify(parsed));
  } catch {
    // ignore
  }
}

function normalizeLocale(value) {
  const locale = String(value || "").trim();
  return LOCALES.has(locale) ? locale : defaultLocale;
}

export function getLocale(userId) {
  const dashboardLocale = readDashboardLocale(userId || getCurrentUserId());
  if (dashboardLocale && LOCALES.has(dashboardLocale)) return dashboardLocale;
  const stored = String(window.localStorage.getItem(STORAGE_KEY) || "").trim();
  if (stored && LOCALES.has(stored)) return stored;
  return normalizeLocale(dashboardLocale || defaultLocale);
}

function fetchJsonSync(url) {
  const xhr = new XMLHttpRequest();
  xhr.open("GET", url, false);
  xhr.send();
  if (xhr.status < 200 || xhr.status >= 300) {
    throw new Error(`HTTP ${xhr.status} for ${url}`);
  }
  return JSON.parse(xhr.responseText || "{}");
}

function rebuildTokenLookup() {
  tokenLookup = new Map();
  normalizedTokenLookup = new Map();
  for (const [key, value] of Object.entries(sourceDictionary || {})) {
    const normalized = String(value || "").trim();
    if (!normalized) continue;
    tokenLookup.set(normalized, key);
    const folded = normalizeToken(normalized);
    if (folded && !normalizedTokenLookup.has(folded)) {
      normalizedTokenLookup.set(folded, key);
    }
  }
}

function localeFileUrl(locale) {
  return `/shared/i18n/${locale}.json`;
}

function setDictionary(locale, payload) {
  const translations = payload?.translations && typeof payload.translations === "object"
    ? payload.translations
    : {};
  dictionaryCache.set(locale, translations);
  if (locale === sourceLocale) {
    sourceDictionary = translations;
    rebuildTokenLookup();
  }
  if (locale === activeLocale) {
    activeDictionary = translations;
  }
}

function loadLocaleSync(locale) {
  if (dictionaryCache.has(locale)) return dictionaryCache.get(locale);
  const payload = fetchJsonSync(localeFileUrl(locale));
  setDictionary(locale, payload);
  return dictionaryCache.get(locale) || {};
}

function loadIndexSync() {
  try {
    const index = fetchJsonSync(INDEX_URL);
    const locales = Array.isArray(index?.locales)
      ? index.locales.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    defaultLocale = String(index?.defaultLocale || DEFAULT_LOCALE).trim() || DEFAULT_LOCALE;
    LOCALES = new Set(locales.length ? locales : FALLBACK_LOCALES);
    sourceLocale = defaultLocale;
  } catch (error) {
    console.warn("FinanzAppLanguage: i18n index konnte nicht geladen werden.", error);
    defaultLocale = DEFAULT_LOCALE;
    LOCALES = new Set(FALLBACK_LOCALES);
    sourceLocale = DEFAULT_LOCALE;
  }
}

function resolveTranslation(sourceText) {
  const raw = String(sourceText || "");
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  const key =
    tokenLookup.get(trimmed) ||
    normalizedTokenLookup.get(normalizeToken(trimmed)) ||
    (activeDictionary[trimmed] ? trimmed : null) ||
    (activeDictionary[normalizeToken(trimmed)] ? normalizeToken(trimmed) : null);
  if (!key) return raw;
  const translated = activeDictionary[key] || sourceDictionary[key] || trimmed;
  return raw.replace(trimmed, translated);
}

export function t(key, params = {}) {
  const template = activeDictionary[key] || sourceDictionary[key] || key;
  return format(template, params);
}

export function createT(prefix = "") {
  return (key, fallback, params = {}) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const translated = t(fullKey, params);
    if (translated && translated !== fullKey) return translated;
    if (!params || !Object.keys(params).length) return fallback;
    return String(fallback || "").replaceAll(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
  };
}

export function applyTranslations(root = document.documentElement) {
  if (!root) return;
  const locale = activeLocale || getLocale();
  document.documentElement.lang = locale;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parentName = node.parentElement?.tagName;
    if (parentName !== "SCRIPT" && parentName !== "STYLE") {
      const source = textSourceMap.has(node) ? textSourceMap.get(node) : node.nodeValue;
      if (!textSourceMap.has(node)) textSourceMap.set(node, source);
      const translated = resolveTranslation(source);
      if (translated !== node.nodeValue) node.nodeValue = translated;
    }
    node = walker.nextNode();
  }

  const attrNames = ["placeholder", "aria-label", "title"];
  const elements = root.querySelectorAll("*");
  for (const element of elements) {
    let sourceAttrs = attrSourceMap.get(element);
    if (!sourceAttrs) {
      sourceAttrs = new Map();
      attrSourceMap.set(element, sourceAttrs);
    }
    for (const attr of attrNames) {
      const current = element.getAttribute(attr);
      if (!current) continue;
      if (!sourceAttrs.has(attr)) sourceAttrs.set(attr, current);
      const translated = resolveTranslation(sourceAttrs.get(attr));
      if (translated !== current) element.setAttribute(attr, translated);
    }
  }
}

let applying = false;
function safeApply(root) {
  if (applying) return;
  applying = true;
  try {
    applyTranslations(root);
  } finally {
    applying = false;
  }
}

function setActiveLocale(nextLocale) {
  activeLocale = normalizeLocale(nextLocale);
  try {
    loadLocaleSync(activeLocale);
  } catch (error) {
    console.warn(`FinanzAppLanguage: Locale ${activeLocale} konnte nicht geladen werden.`, error);
    activeLocale = defaultLocale;
    activeDictionary = sourceDictionary;
  }
}

export function setLocale(nextLocale, options = {}) {
  const userId = options.userId || getCurrentUserId();
  const locale = normalizeLocale(nextLocale);
  window.localStorage.setItem(STORAGE_KEY, locale);
  if (userId) writeDashboardLocale(userId, locale);
  setActiveLocale(locale);
  safeApply(document.documentElement);
  if (!options.silent) {
    window.dispatchEvent(new CustomEvent("finanzapp:locale-changed", { detail: { locale } }));
  }
  return locale;
}

export function getLocales() {
  return new Set(LOCALES);
}

export async function whenReady() {
  if (isReady) return;
  await init();
}

async function runInit() {
  loadIndexSync();
  try {
    loadLocaleSync(sourceLocale);
  } catch (error) {
    console.warn(`FinanzAppLanguage: Source-Locale ${sourceLocale} konnte nicht geladen werden.`, error);
    sourceDictionary = {};
    rebuildTokenLookup();
  }
  setActiveLocale(getLocale());
  safeApply(document.documentElement);
  isReady = true;

  const observer = new MutationObserver(() => {
    safeApply(document.documentElement);
  });
  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder", "aria-label", "title"]
    });
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    setActiveLocale(getLocale());
    safeApply(document.body);
    window.dispatchEvent(new CustomEvent("finanzapp:locale-changed", { detail: { locale: activeLocale } }));
  });

  window.addEventListener("finanzapp:locale-changed", () => {
    safeApply(document.body);
  });
}

async function init() {
  if (initPromise) return initPromise;
  initPromise = runInit();
  return initPromise;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
