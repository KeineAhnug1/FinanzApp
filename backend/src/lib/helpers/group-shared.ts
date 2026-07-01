import type { DbClient } from '@/lib/db';
import { toFixedAmount, transferBetweenAccounts } from './finance';

export async function getDefaultAccountId(db: DbClient, userId: number): Promise<number | null> {
  const { data: user } = await db
    .from('users')
    .select('default_bank_account_id')
    .eq('id', userId)
    .single();

  const explicit = (user as Record<string, unknown> | null)?.default_bank_account_id;
  if (explicit != null) {
    const n = Number(explicit);
    if (Number.isFinite(n) && n > 0) return n;
  }

  const { data: accounts } = await db
    .from('bank_accounts')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);

  const first = (accounts ?? [])[0] as Record<string, unknown> | undefined;
  if (!first) return null;
  const n = Number(first.id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function requireDefaultAccount(db: DbClient, userId: number): Promise<number> {
  const id = await getDefaultAccountId(db, userId);
  if (id == null) throw new Error(`User ${userId} hat kein Standardkonto`);
  return id;
}

export interface PeerTransferInput {
  fromUserId: number;
  toUserId: number;
  fromBankAccountId: number;
  toBankAccountId: number;
  amount: number;
  reason: string;
  groupId?: number | null;
  groupExpenseShareId?: number | null;
  tripSettlementId?: number | null;
}

export async function createPeerTransfer(db: DbClient, input: PeerTransferInput): Promise<number> {
  const amount = toFixedAmount(input.amount);
  if (amount <= 0) throw new Error('Transfer amount must be > 0');
  if (input.fromBankAccountId === input.toBankAccountId) {
    throw new Error('Transfer from and to account must differ');
  }

  const now = new Date().toISOString();
  const { data: inserted, error: tErr } = await db
    .from('transfers')
    .insert({
      from_user_id: input.fromUserId,
      to_user_id: input.toUserId,
      from_bank_account_id: input.fromBankAccountId,
      to_bank_account_id: input.toBankAccountId,
      amount,
      reason: input.reason,
      group_id: input.groupId ?? null,
      group_expense_share_id: input.groupExpenseShareId ?? null,
      trip_settlement_id: input.tripSettlementId ?? null,
      status: 'completed',
      completed_at: now,
    })
    .select('id')
    .single();

  if (tErr || !inserted) {
    console.error('[group-shared.createPeerTransfer] transfers insert failed', tErr);
    throw new Error(`Transfer-Insert fehlgeschlagen: ${tErr?.message ?? 'unbekannter Fehler'}`);
  }

  const transferId = Number((inserted as Record<string, unknown>).id);
  if (!Number.isFinite(transferId) || transferId <= 0) {
    throw new Error('Transfer-Insert fehlgeschlagen');
  }

  // Paired ledger entries: appear in sender's expenses + recipient's income with transfer_id tag
  const { error: expenseErr } = await db.from('private_expenses').insert({
    bank_account_id: input.fromBankAccountId,
    source: input.reason,
    category: 'transfer',
    amount,
    spent_at: now,
    due_date: now,
    pay_date: now,
    info: input.reason,
    state: 'open',
    note: '',
    recurrence: null,
    cycle: 'once',
    is_active: true,
    transfer_id: transferId,
    group_id: input.groupId ?? null,
  });
  if (expenseErr) {
    console.error('[group-shared.createPeerTransfer] private_expenses insert failed', expenseErr);
    await db.from('transfers').delete().eq('id', transferId);
    throw new Error(`Buchung fehlgeschlagen: ${expenseErr.message}`);
  }

  const { error: incomeErr } = await db.from('income').insert({
    bank_account_id: input.toBankAccountId,
    source: input.reason,
    category: 'transfer',
    amount,
    received_at: now,
    pay_date: now,
    info: input.reason,
    note: '',
    recurrence: null,
    cycle: 'once',
    is_active: true,
    state: 'open',
    transfer_id: transferId,
    group_id: input.groupId ?? null,
  });
  if (incomeErr) {
    console.error('[group-shared.createPeerTransfer] income insert failed', incomeErr);
    await db.from('private_expenses').delete().eq('transfer_id', transferId);
    await db.from('transfers').delete().eq('id', transferId);
    throw new Error(`Buchung fehlgeschlagen: ${incomeErr.message}`);
  }

  // Atomic balance transfer — both UPDATE statements run in a single PL/pgSQL transaction
  try {
    await transferBetweenAccounts(db, input.fromBankAccountId, input.toBankAccountId, amount);
  } catch (err) {
    console.error('[group-shared.createPeerTransfer] atomic transfer failed, rolling back ledger', err);
    await db.from('income').delete().eq('transfer_id', transferId);
    await db.from('private_expenses').delete().eq('transfer_id', transferId);
    await db.from('transfers').delete().eq('id', transferId);
    throw err;
  }

  return transferId;
}

export type Settlement = { from: number; to: number; amount: number };

export function netSettlements(balances: Map<number, number>): Settlement[] {
  const EPS = 0.01;
  const creditors: { id: number; amount: number }[] = [];
  const debtors: { id: number; amount: number }[] = [];
  for (const [id, bal] of balances) {
    const rounded = Math.round(bal * 100) / 100;
    if (rounded > EPS) creditors.push({ id, amount: rounded });
    else if (rounded < -EPS) debtors.push({ id, amount: -rounded });
  }
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const result: Settlement[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]!;
    const c = creditors[j]!;
    const settle = Math.round(Math.min(d.amount, c.amount) * 100) / 100;
    if (settle < EPS) break;
    result.push({ from: d.id, to: c.id, amount: settle });
    d.amount = Math.round((d.amount - settle) * 100) / 100;
    c.amount = Math.round((c.amount - settle) * 100) / 100;
    if (d.amount < EPS) i++;
    if (c.amount < EPS) j++;
  }
  return result;
}

export interface TripExpenseRow {
  id: number;
  payer_user_id: number;
  amount: number;
}

export interface TripExpenseParticipantRow {
  trip_expense_id: number;
  user_id: number;
}

export function computeTripBalances(
  expenses: TripExpenseRow[],
  expenseParticipants: TripExpenseParticipantRow[],
  alreadyPaid: Map<string, number>,
): Map<number, number> {
  const participantsByExpense = new Map<number, number[]>();
  for (const p of expenseParticipants) {
    const list = participantsByExpense.get(p.trip_expense_id);
    if (list) list.push(p.user_id);
    else participantsByExpense.set(p.trip_expense_id, [p.user_id]);
  }

  const balances = new Map<number, number>();
  const add = (userId: number, delta: number) => {
    balances.set(userId, (balances.get(userId) ?? 0) + delta);
  };

  for (const exp of expenses) {
    const participants = participantsByExpense.get(exp.id) ?? [];
    if (participants.length === 0) continue;
    const amount = Number(exp.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const share = amount / participants.length;
    add(exp.payer_user_id, amount);
    for (const uid of participants) add(uid, -share);
  }

  for (const [key, paid] of alreadyPaid) {
    const [fromStr, toStr] = key.split('-');
    const from = Number(fromStr);
    const to = Number(toStr);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    add(from, paid);
    add(to, -paid);
  }

  for (const [id, bal] of balances) {
    balances.set(id, Math.round(bal * 100) / 100);
  }
  return balances;
}
