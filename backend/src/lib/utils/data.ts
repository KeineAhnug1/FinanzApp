export function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function parseIncome(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Number(n.toFixed(2));
}

export function parsePositiveAmount(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const normalized = Number(n.toFixed(2));
  return normalized > 0 ? normalized : null;
}

export function parseId(value: unknown): number | null {
  if (!value) return null;
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0 || Math.floor(id) !== id) return null;
  return id;
}

export const parseObjectId = parseId;

export function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function trimString(value: unknown, maxLength?: number): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return maxLength != null ? s.slice(0, maxLength) : s;
}
