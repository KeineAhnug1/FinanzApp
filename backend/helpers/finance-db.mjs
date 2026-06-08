// @ts-check
// @ts-check
import {
  categoryKey,
  normalizeCategoryValue,
  normalizeCycle,
  parseId,
  toNumber
} from "../utils/data.mjs";

/**
 * @param {Pool} pool
 * @param {number | string} userId
 */
export async function listUserBankAccounts(pool, userId) {
  const { rows } = await pool.query(
    `SELECT id, label, balance, created_at FROM bank_accounts WHERE user_id = $1 ORDER BY created_at ASC, id ASC`,
    [userId]
  );
  return rows;
}

/**
 * @param {Pool} pool
 * @param {number | string} userId
 */
export async function listUserShareAccounts(pool, userId) {
  const { rows } = await pool.query(
    `SELECT id, label, created_at FROM share_accounts WHERE user_id = $1 ORDER BY created_at ASC, id ASC`,
    [userId]
  );
  return rows;
}

/**
 * @param {Pool} pool
 * @param {number | string} userId
 */
export async function ensureUserFinanceRoots(pool, userId) {
  let bankAccounts = await listUserBankAccounts(pool, userId);
  if (bankAccounts.length === 0) {
    const { rows } = await pool.query(
      `INSERT INTO bank_accounts (user_id, label, balance, created_at) VALUES ($1, 'Bankkonto 1', 0, NOW()) RETURNING id, label, balance, created_at`,
      [userId]
    );
    bankAccounts = rows;
  }

  const shareAccounts = await listUserShareAccounts(pool, userId);
  if (shareAccounts.length === 0) {
    await pool.query(
      `INSERT INTO share_accounts (user_id, label, created_at) VALUES ($1, 'Aktienkonto 1', NOW())`,
      [userId]
    );
  }

  return bankAccounts;
}

/**
 * @param {Pool} pool
 * @param {number} accountId
 * @param {number} deltaAmount
 */
export async function incrementBankAccountBalance(pool, accountId, deltaAmount) {
  const normalizedDelta = Number(Number(deltaAmount || 0).toFixed(2));
  if (!Number.isFinite(normalizedDelta) || normalizedDelta === 0) return;
  await pool.query(
    `UPDATE bank_accounts SET balance = balance + $1 WHERE id = $2`,
    [normalizedDelta, accountId]
  );
}

/**
 * @param {Pool} pool
 * @param {number} accountId
 */
export async function deleteBankAccountAssociations(pool, accountId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM income WHERE bank_account_id = $1`, [accountId]);
    await client.query(`DELETE FROM private_expenses WHERE bank_account_id = $1`, [accountId]);
    await client.query(`DELETE FROM funding_participants WHERE bank_account_id = $1`, [accountId]);
    await client.query(`DELETE FROM shares WHERE share_account_id = $1 OR depot_id = $1 OR bank_account_id = $1`, [accountId]);
    await client.query(`DELETE FROM transactions WHERE from_bank_account_id = $1 OR to_bank_account_id = $1 OR bank_account_id = $1`, [accountId]);
    await client.query(`DELETE FROM requests WHERE from_bank_account_id = $1 OR to_bank_account_id = $1`, [accountId]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * @param {Pool} pool
 * @param {number | string} userId
 * @param {string} kind
 * @param {string} categoryValue
 */
export async function rememberUserCategory(pool, userId, kind, categoryValue) {
  const normalized = normalizeCategoryValue(categoryValue);
  if (!normalized) return;
  const key = categoryKey(normalized);
  await pool.query(
    `INSERT INTO user_categories (user_id, kind, key, value, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (user_id, kind, key) DO UPDATE SET value = $4, updated_at = NOW()`,
    [userId, kind, key, normalized]
  );
}

/**
 * @param {URL} requestUrl
 * @param {number[]} accountIds
 * @returns {{ ok: true; accountIds: number[] } | { ok: false; status: number; message: string }}
 */
export function resolveRequestedBankAccountFilter(requestUrl, accountIds) {
  const rawBankAccountId = String(requestUrl.searchParams.get("bank_account_id") || "").trim();
  if (!rawBankAccountId) return { ok: true, accountIds };

  const selectedId = parseId(rawBankAccountId);
  if (!selectedId) {
    return { ok: false, status: 400, message: "bank_account_id ist ungueltig" };
  }

  const isAllowed = accountIds.some((id) => id === selectedId);
  if (!isAllowed) {
    return { ok: false, status: 403, message: "Bankkonto gehoert nicht zum User" };
  }

  return { ok: true, accountIds: [selectedId] };
}

/** @param {unknown} value */
function toNullableNumber(value) {
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** @param {Record<string, unknown>} entry */
function recurrenceMonthlyContribution(entry) {
  const amount = toNullableNumber(entry?.amount) ?? 0;
  if (amount <= 0) return 0;

  const cycle = normalizeCycle(entry?.cycle ?? "once") ?? "once";
  const isActive = typeof entry?.is_active === "boolean" ? entry.is_active : entry?.state !== "paused";
  if (entry?.state === "completed") return 0;

  if (cycle === "monthly") return isActive ? amount : 0;
  if (cycle === "weekly") return isActive ? amount * 4.33 : 0;
  if (cycle === "yearly") return isActive ? amount / 12 : 0;
  return 0;
}

/**
 * @param {Record<string, unknown>} entry
 * @param {string} dateField
 */
function resolveEntryDateForFilter(entry, dateField) {
  if (dateField === "received_at") return entry?.received_at ?? entry?.pay_date ?? entry?.created_at ?? null;
  if (dateField === "spent_at") return entry?.spent_at ?? entry?.pay_date ?? entry?.due_date ?? entry?.created_at ?? null;
  return entry?.[dateField] ?? null;
}

/** @param {unknown} value */
function isDateInCurrentMonth(value) {
  if (!value) return false;
  const date = new Date(/** @type {string | number} */ (value));
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

/**
 * @param {Record<string, unknown>[]} entries
 * @param {string} dateField
 */
export function calculateCurrentMonthTotal(entries, dateField) {
  const oneTime = entries
    .filter((entry) => (normalizeCycle(/** @type {string} */ (entry?.cycle ?? "once")) ?? "once") === "once")
    .filter((entry) => isDateInCurrentMonth(resolveEntryDateForFilter(entry, dateField)))
    .reduce((sum, entry) => sum + (toNullableNumber(entry?.amount) ?? 0), 0);

  const recurring = entries.reduce((sum, entry) => sum + recurrenceMonthlyContribution(entry), 0);
  return Number((oneTime + recurring).toFixed(2));
}

/**
 * @param {Pool} pool
 * @param {number | string} userId
 */
export async function calculateDashboardStyleDonationBalance(pool, userId) {
  const userAccounts = await ensureUserFinanceRoots(pool, userId);
  const accountIds = userAccounts.map((account) => account.id);

  if (accountIds.length === 0) {
    return { availableDonationBalance: 0, dashboardNetLiquidity: 0, monthlyIncome: 0, monthlyExpense: 0, userAccounts };
  }

  const [incomeResult, expenseResult] = await Promise.all([
    pool.query(
      `SELECT amount, cycle, recurrence, is_active, state, received_at, pay_date, created_at FROM income WHERE bank_account_id = ANY($1)`,
      [accountIds]
    ),
    pool.query(
      `SELECT amount, cycle, recurrence, is_active, state, spent_at, pay_date, due_date, created_at FROM private_expenses WHERE bank_account_id = ANY($1)`,
      [accountIds]
    )
  ]);

  const incomeEntries = incomeResult.rows;
  const expenseEntries = expenseResult.rows;

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

export function resolveEntryState(cycle, recurrence, isActive) {
  const effectiveRecurrence = cycle === "once" ? null : recurrence;
  const effectiveIsActive = cycle === "once" ? true : (effectiveRecurrence === 0 ? false : isActive);
  const effectiveState = cycle === "once" ? "open" : (effectiveRecurrence === 0 ? "completed" : (effectiveIsActive ? "open" : "paused"));
  return { effectiveRecurrence, effectiveIsActive, effectiveState };
}
