import { COLLECTIONS } from "../config/runtime.mjs";
import {
  categoryKey,
  normalizeCategoryValue,
  normalizeRecurrence,
  parseObjectId,
  toDecimal,
  toNumber
} from "../utils/data.mjs";

export async function listUserBankAccounts(db, userId) {
  return await db.collection(COLLECTIONS.bankAccounts)
    .find({ user_id: userId }, { projection: { _id: 1, label: 1, name: 1, balance: 1, created_at: 1 } })
    .sort({ created_at: 1, _id: 1 })
    .toArray();
}

export async function listUserShareAccounts(db, userId) {
  const [shareAccounts, depots] = await Promise.all([
    db.collection(COLLECTIONS.shareAccounts)
      .find({ user_id: userId }, { projection: { _id: 1, label: 1, name: 1, created_at: 1 } })
      .sort({ created_at: 1, _id: 1 })
      .toArray(),
    db.collection(COLLECTIONS.depots)
      .find({ user_id: userId }, { projection: { _id: 1, label: 1, name: 1, created_at: 1 } })
      .sort({ created_at: 1, _id: 1 })
      .toArray()
  ]);

  const merged = new Map();
  for (const account of [...shareAccounts, ...depots]) {
    const key = String(account?._id || "");
    if (!key || merged.has(key)) continue;
    merged.set(key, account);
  }
  return Array.from(merged.values());
}

export async function ensureUserFinanceRoots(db, userId) {
  let bankAccounts = await listUserBankAccounts(db, userId);
  if (bankAccounts.length === 0) {
    const createdAt = new Date();
    const insert = await db.collection(COLLECTIONS.bankAccounts).insertOne({
      user_id: userId,
      label: "Bankkonto 1",
      balance: toDecimal(0),
      created_at: createdAt
    });
    bankAccounts = [{ _id: insert.insertedId, label: "Bankkonto 1", balance: toDecimal(0), created_at: createdAt }];
  }

  const shareAccounts = await listUserShareAccounts(db, userId);
  if (shareAccounts.length === 0) {
    const createdAt = new Date();
    await db.collection(COLLECTIONS.shareAccounts).insertOne({
      user_id: userId,
      label: "Aktienkonto 1",
      created_at: createdAt
    });
  }

  return bankAccounts;
}

export async function incrementBankAccountBalance(db, accountId, deltaAmount) {
  const normalizedDelta = Number(Number(deltaAmount || 0).toFixed(2));
  if (!Number.isFinite(normalizedDelta) || normalizedDelta === 0) return;
  await db.collection(COLLECTIONS.bankAccounts).updateOne(
    { _id: accountId },
    { $inc: { balance: toDecimal(normalizedDelta) } }
  );
}

export async function deleteBankAccountAssociations(db, accountId) {
  await Promise.all([
    db.collection(COLLECTIONS.incomeEntries).deleteMany({ bank_account_id: accountId }),
    db.collection(COLLECTIONS.expenseEntries).deleteMany({ bank_account_id: accountId }),
    db.collection(COLLECTIONS.fundingParticipants).deleteMany({ bank_account_id: accountId }),
    db.collection(COLLECTIONS.shares).deleteMany({ bank_account_id: accountId }),
    db.collection(COLLECTIONS.transactions).deleteMany({
      $or: [{ from_bank_account_id: accountId }, { to_bank_account_id: accountId }, { bank_account_id: accountId }]
    }),
    db.collection("requests").deleteMany({ $or: [{ from_bank_account_id: accountId }, { to_bank_account_id: accountId }] })
  ]);
}

export async function rememberUserCategory(db, userId, kind, categoryValue) {
  const normalized = normalizeCategoryValue(categoryValue);
  if (!normalized) return;
  const key = categoryKey(normalized);
  await db.collection(COLLECTIONS.userCategories).updateOne(
    { user_id: userId, kind, key },
    {
      $setOnInsert: { user_id: userId, kind, key, created_at: new Date() },
      $set: { value: normalized, updated_at: new Date() }
    },
    { upsert: true }
  );
}

export function resolveRequestedBankAccountFilter(req, accountIds) {
  const requestUrl = new URL(req.url || "/", "http://localhost");
  const rawBankAccountId = String(requestUrl.searchParams.get("bank_account_id") || "").trim();
  if (!rawBankAccountId) return { ok: true, filter: { bank_account_id: { $in: accountIds } } };

  const selectedId = parseObjectId(rawBankAccountId);
  if (!selectedId) {
    return { ok: false, status: 400, message: "bank_account_id ist ungueltig" };
  }

  const isAllowed = accountIds.some((accountId) => String(accountId) === String(selectedId));
  if (!isAllowed) {
    return { ok: false, status: 403, message: "Bankkonto gehoert nicht zum User" };
  }

  return { ok: true, filter: { bank_account_id: selectedId } };
}

function toNullableNumber(value) {
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function recurrenceMonthlyContribution(entry) {
  const amount = toNullableNumber(entry?.amount) ?? 0;
  if (amount <= 0) return 0;

  const recurrence = normalizeRecurrence(entry?.recurrence ?? entry?.cycle ?? "once") ?? "once";
  const isActive = typeof entry?.is_active === "boolean" ? entry.is_active : entry?.state !== "paused";

  if (recurrence === "monthly") return isActive ? amount : 0;
  if (recurrence === "weekly") return isActive ? amount * 4.33 : 0;
  return 0;
}

function resolveEntryDateForFilter(entry, dateField) {
  if (dateField === "received_at") return entry?.received_at ?? entry?.pay_date ?? entry?.created_at ?? null;
  if (dateField === "spent_at") return entry?.spent_at ?? entry?.pay_date ?? entry?.due_date ?? entry?.created_at ?? null;
  return entry?.[dateField] ?? null;
}

function isDateInCurrentMonth(value) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

export function calculateCurrentMonthTotal(entries, dateField) {
  const oneTime = entries
    .filter((entry) => (normalizeRecurrence(entry?.recurrence ?? entry?.cycle ?? "once") ?? "once") === "once")
    .filter((entry) => isDateInCurrentMonth(resolveEntryDateForFilter(entry, dateField)))
    .reduce((sum, entry) => sum + (toNullableNumber(entry?.amount) ?? 0), 0);

  const recurring = entries.reduce((sum, entry) => sum + recurrenceMonthlyContribution(entry), 0);
  return Number((oneTime + recurring).toFixed(2));
}

export async function calculateDashboardStyleDonationBalance(db, userId) {
  const userAccounts = await ensureUserFinanceRoots(db, userId);
  const accountIds = userAccounts.map((account) => account._id);
  const accountFilter = accountIds.length ? { bank_account_id: { $in: accountIds } } : { _id: { $exists: false } };

  const [incomeEntries, expenseEntries] = await Promise.all([
    db.collection(COLLECTIONS.incomeEntries).find(
      accountFilter,
      { projection: { amount: 1, recurrence: 1, cycle: 1, is_active: 1, state: 1, received_at: 1, pay_date: 1, created_at: 1 } }
    ).toArray(),
    db.collection(COLLECTIONS.expenseEntries).find(
      accountFilter,
      { projection: { amount: 1, recurrence: 1, cycle: 1, is_active: 1, state: 1, spent_at: 1, pay_date: 1, due_date: 1, created_at: 1 } }
    ).toArray()
  ]);

  const monthlyIncome = Number(calculateCurrentMonthTotal(incomeEntries, "received_at").toFixed(2));
  const monthlyExpense = calculateCurrentMonthTotal(expenseEntries, "spent_at");
  const dashboardNetLiquidity = Number((monthlyIncome - monthlyExpense).toFixed(2));

  return {
    availableDonationBalance: dashboardNetLiquidity,
    dashboardNetLiquidity,
    monthlyIncome,
    monthlyExpense,
    userAccounts
  };
}
