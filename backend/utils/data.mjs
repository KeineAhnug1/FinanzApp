// @ts-check

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function parseIncome(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Number(numeric.toFixed(2));
}

export function parsePositiveAmount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const normalized = Number(numeric.toFixed(2));
  if (normalized <= 0) return null;
  return normalized;
}

export function parseId(value) {
  if (!value) return null;
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0 || Math.floor(id) !== id) return null;
  return id;
}

export const parseObjectId = parseId;

export function toNumber(value) {
  if (value == null) return null;
  if (typeof value === "number") return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toDecimal(value) {
  return Number(Number(value).toFixed(2));
}

export function normalizeCycle(value) {
  const normalized = String(value || "once").trim().toLowerCase();
  if (normalized === "weekly" || normalized === "monthly" || normalized === "yearly" || normalized === "once") return normalized;
  return null;
}

export function parseRecurrence(value) {
  if (value == null || value === "" || value === "null") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) return undefined;
  return n;
}

export function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
}

export function normalizeCategoryValue(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function categoryKey(value) {
  return normalizeCategoryValue(value).toLowerCase();
}

export function uniqueCategoryList(values) {
  const map = new Map();
  for (const value of values || []) {
    const normalized = normalizeCategoryValue(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (!map.has(key)) map.set(key, normalized);
  }
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b, "de"));
}

export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseLongText(value, maxLength) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.length > maxLength) return null;
  return text;
}

export function toNullableDate(value) {
  if (value == null || value === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function toNullableNumber(value) {
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toFixedAmount(value) {
  return Number((toNumber(value) || 0).toFixed(2));
}
