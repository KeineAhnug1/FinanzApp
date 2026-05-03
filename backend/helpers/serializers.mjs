import { toNumber } from "../utils/data.mjs";

export function resolveEntryDate(entry, ...dateFields) {
  for (const field of dateFields) {
    if (entry[field] instanceof Date) return entry[field];
  }
  return null;
}

export function serializeEntryBase(entry, userId) {
  return {
    id: String(entry._id),
    user_id: String(userId || entry.user_id || ""),
    bank_account_id: entry.bank_account_id ? String(entry.bank_account_id) : null,
    source: entry.source || entry.info || "",
    category: entry.category || "",
    amount: toNumber(entry.amount),
    recurrence: entry.recurrence || entry.cycle || "once",
    is_active: typeof entry.is_active === "boolean" ? entry.is_active : entry.state !== "paused",
    note: entry.note || entry.info || "",
    created_at: entry.created_at instanceof Date ? entry.created_at.toISOString() : null,
    updated_at: entry.updated_at instanceof Date ? entry.updated_at.toISOString() : null
  };
}

export function serializeIncomeEntry(entry, userId = null) {
  const date = resolveEntryDate(entry, "received_at", "pay_date", "created_at");
  return { ...serializeEntryBase(entry, userId), received_at: date ? date.toISOString() : null };
}

export function serializeExpenseEntry(entry, userId = null) {
  const date = resolveEntryDate(entry, "spent_at", "pay_date", "due_date", "created_at");
  return { ...serializeEntryBase(entry, userId), category: entry.category || "other", spent_at: date ? date.toISOString() : null };
}
