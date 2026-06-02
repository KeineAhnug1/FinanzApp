// @ts-check
import { toNumber } from "../utils/data.mjs";

/**
 * @param {Record<string, unknown>} entry
 * @param {string[]} dateFields
 * @returns {Date | null}
 */
export function resolveEntryDate(entry, ...dateFields) {
  for (const field of dateFields) {
    if (entry[field] instanceof Date) return /** @type {Date} */ (entry[field]);
  }
  return null;
}

/**
 * @param {Record<string, unknown>} entry
 * @param {string | number | null} [userId]
 */
export function serializeEntryBase(entry, userId) {
  const recurrenceRaw = entry.recurrence;
  return {
    id: String(entry.id),
    user_id: String(userId || entry.user_id || ""),
    bank_account_id: entry.bank_account_id ? String(entry.bank_account_id) : null,
    source: /** @type {string} */ (entry.source || entry.info || ""),
    category: /** @type {string} */ (entry.category || ""),
    amount: toNumber(entry.amount),
    cycle: entry.cycle || "once",
    recurrence: recurrenceRaw == null ? null : Number(recurrenceRaw),
    is_active: typeof entry.is_active === "boolean" ? entry.is_active : entry.state !== "paused",
    note: /** @type {string} */ (entry.note || entry.info || ""),
    created_at: entry.created_at instanceof Date ? entry.created_at.toISOString() : null,
    updated_at: entry.updated_at instanceof Date ? entry.updated_at.toISOString() : null
  };
}

/**
 * @param {Record<string, unknown>} entry
 * @param {string | number | null} [userId]
 */
export function serializeIncomeEntry(entry, userId = null) {
  const date = resolveEntryDate(entry, "received_at", "pay_date", "created_at");
  return { ...serializeEntryBase(entry, userId), received_at: date ? date.toISOString() : null };
}

/**
 * @param {Record<string, unknown>} entry
 * @param {string | number | null} [userId]
 */
export function serializeExpenseEntry(entry, userId = null) {
  const date = resolveEntryDate(entry, "spent_at", "pay_date", "due_date", "created_at");
  return { ...serializeEntryBase(entry, userId), category: /** @type {string} */ (entry.category || "other"), spent_at: date ? date.toISOString() : null };
}
