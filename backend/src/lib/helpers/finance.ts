import type { DbClient } from '@/lib/db';

export const PRESET_INCOME_CATEGORY_KEYS = new Set([
  'salary', 'freelance', 'bonus', 'refund', 'investment', 'other',
]);
export const PRESET_EXPENSE_CATEGORY_KEYS = new Set([
  'rent', 'groceries', 'utilities', 'transport', 'health', 'entertainment', 'other',
]);

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

type DbRow = Record<string, unknown>;

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toFixedAmount(value: unknown): number {
  return Number((toNumber(value) ?? 0).toFixed(2));
}

function resolveEntryDate(entry: DbRow, ...fields: string[]): string | null {
  for (const field of fields) {
    const v = entry[field];
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'string' && v) return v;
  }
  return null;
}

function serializeEntryBase(entry: DbRow, userId: string | number | null) {
  return {
    id: String(entry.id),
    user_id: String(userId ?? entry.user_id ?? ''),
    bank_account_id: entry.bank_account_id ? String(entry.bank_account_id) : null,
    source: String(entry.source ?? entry.info ?? ''),
    category: String(entry.category ?? ''),
    amount: toNumber(entry.amount),
    cycle: entry.cycle ?? 'once',
    recurrence: entry.recurrence == null ? null : Number(entry.recurrence),
    is_active: typeof entry.is_active === 'boolean' ? entry.is_active : entry.state !== 'paused',
    note: String(entry.note ?? entry.info ?? ''),
    created_at: entry.created_at instanceof Date ? entry.created_at.toISOString() : (entry.created_at as string | null) ?? null,
    updated_at: entry.updated_at instanceof Date ? entry.updated_at.toISOString() : (entry.updated_at as string | null) ?? null,
  };
}

export function serializeIncomeEntry(entry: DbRow, userId: string | number | null) {
  return {
    ...serializeEntryBase(entry, userId),
    received_at: resolveEntryDate(entry, 'received_at', 'pay_date', 'created_at'),
  };
}

export function serializeExpenseEntry(entry: DbRow, userId: string | number | null) {
  return {
    ...serializeEntryBase(entry, userId),
    category: String(entry.category ?? 'other'),
    spent_at: resolveEntryDate(entry, 'spent_at', 'pay_date', 'due_date', 'created_at'),
  };
}

// ---------------------------------------------------------------------------
// Data normalizers
// ---------------------------------------------------------------------------

export function normalizeCategoryValue(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function categoryKey(value: unknown): string {
  return normalizeCategoryValue(value).toLowerCase();
}

export function normalizeCycle(value: unknown): string | null {
  const v = String(value ?? 'once').trim().toLowerCase();
  return ['weekly', 'monthly', 'yearly', 'once'].includes(v) ? v : null;
}

export function parseRecurrence(value: unknown): number | null | undefined {
  if (value == null || value === '' || value === 'null') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) return undefined;
  return n;
}

export function parseBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return fallback;
}

export function uniqueCategoryList(values: unknown[]): string[] {
  const map = new Map<string, string>();
  for (const value of values ?? []) {
    const normalized = normalizeCategoryValue(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (!map.has(key)) map.set(key, normalized);
  }
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'de'));
}

export function resolveEntryState(
  cycle: string,
  recurrence: number | null,
  isActive: boolean,
): { effectiveRecurrence: number | null; effectiveIsActive: boolean; effectiveState: string } {
  const effectiveRecurrence = cycle === 'once' ? null : recurrence;
  const effectiveIsActive = cycle === 'once' ? true : isActive;
  const effectiveState = effectiveIsActive ? 'open' : 'paused';
  return { effectiveRecurrence, effectiveIsActive, effectiveState };
}

export interface BankAccountFilter {
  ok: boolean;
  accountIds: number[];
  message?: string;
  status?: number;
}

export function resolveRequestedBankAccountFilter(
  searchParams: URLSearchParams,
  allAccountIds: (string | number)[],
): BankAccountFilter {
  const raw = searchParams.get('bank_account_id');
  if (!raw) {
    return { ok: true, accountIds: allAccountIds.map(Number) };
  }
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, accountIds: [], message: 'bank_account_id ist ungültig', status: 400 };
  }
  if (!allAccountIds.map(Number).includes(id)) {
    return { ok: false, accountIds: [], message: 'Konto nicht gefunden', status: 404 };
  }
  return { ok: true, accountIds: [id] };
}

export async function getUserBankAccounts(db: DbClient, userId: string | number) {
  const { data } = await db
    .from('bank_accounts')
    .select('id, label, balance, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  return (data ?? []).map((a: DbRow, i: number) => ({
    id: String(a.id),
    label: String(a.label ?? `Bankkonto ${i + 1}`),
    balance: toFixedAmount(a.balance),
  }));
}

export async function ensureUserFinanceRoots(db: DbClient, userId: string | number) {
  const { data: bankAccounts } = await db
    .from('bank_accounts')
    .select('id, label, balance, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (!bankAccounts || bankAccounts.length === 0) {
    const { data } = await db
      .from('bank_accounts')
      .insert({ user_id: userId, label: 'Bankkonto 1', balance: 0 })
      .select('id, label, balance, created_at');
    const accounts = (data ?? []).map((a: DbRow, i: number) => ({
      id: String(a.id),
      label: String(a.label ?? `Bankkonto ${i + 1}`),
      balance: toFixedAmount(a.balance),
    }));
    const { data: shareAccts } = await db.from('share_accounts').select('id').eq('user_id', userId).limit(1);
    if (!shareAccts?.length) {
      await db.from('share_accounts').insert({ user_id: userId, label: 'Aktienkonto 1' });
    }
    return accounts;
  }

  const { data: shareAccts } = await db.from('share_accounts').select('id').eq('user_id', userId).limit(1);
  if (!shareAccts?.length) {
    await db.from('share_accounts').insert({ user_id: userId, label: 'Aktienkonto 1' });
  }

  return bankAccounts.map((a: DbRow, i: number) => ({
    id: String(a.id),
    label: String(a.label ?? `Bankkonto ${i + 1}`),
    balance: toFixedAmount(a.balance),
  }));
}

export async function incrementBankAccountBalance(db: DbClient, accountId: string | number, delta: number): Promise<void> {
  await db.rpc('increment_bank_balance', { p_account_id: Number(accountId), p_delta: delta });
}

export async function rememberUserCategory(
  db: DbClient,
  userId: string | number,
  kind: 'income' | 'expense',
  value: string,
): Promise<void> {
  const preset = kind === 'income' ? PRESET_INCOME_CATEGORY_KEYS : PRESET_EXPENSE_CATEGORY_KEYS;
  const key = categoryKey(value);
  if (!key || preset.has(key)) return;
  await db.from('user_categories').upsert({ user_id: userId, kind, key, value }, { onConflict: 'user_id,kind,key' });
}
