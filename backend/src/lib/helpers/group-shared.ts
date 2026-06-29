import type { DbClient } from '@/lib/db';
import { toFixedAmount, incrementBankAccountBalance } from './finance';

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
}

export async function createPeerTransfer(db: DbClient, input: PeerTransferInput): Promise<number> {
  const amount = toFixedAmount(input.amount);
  if (amount <= 0) throw new Error('Transfer amount must be > 0');
  if (input.fromBankAccountId === input.toBankAccountId) {
    throw new Error('Transfer from and to account must differ');
  }

  const now = new Date().toISOString();
  const { data: inserted } = await db
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
      status: 'completed',
      completed_at: now,
    })
    .select('id')
    .single();

  const transferId = Number((inserted as Record<string, unknown> | null)?.id);
  if (!Number.isFinite(transferId) || transferId <= 0) {
    throw new Error('Transfer-Insert fehlgeschlagen');
  }

  await incrementBankAccountBalance(db, input.fromBankAccountId, -amount);
  await incrementBankAccountBalance(db, input.toBankAccountId, amount);

  return transferId;
}
