import { Decimal128, ObjectId } from "mongodb";

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

export function toDecimal(value) {
  return Decimal128.fromString(Number(value).toFixed(2));
}

export function parseObjectId(value) {
  if (!value) return null;
  try {
    return new ObjectId(String(value));
  } catch {
    return null;
  }
}

export function toNumber(value) {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value.toString === "function") return Number(value.toString());
  return Number(value);
}

export function normalizeRecurrence(value) {
  const normalized = String(value || "once").trim().toLowerCase();
  if (normalized === "weekly" || normalized === "monthly" || normalized === "once") return normalized;
  return null;
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
