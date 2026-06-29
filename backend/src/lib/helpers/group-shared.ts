import type { DbClient } from '../db';

export async function getDefaultAccountId(db: DbClient, userId: number): Promise<number | null> {
  const { data } = await db
    .from('users')
    .select('default_bank_account_id')
    .eq('id', userId)
    .single();
  return (data as { default_bank_account_id: number | null } | null)?.default_bank_account_id ?? null;
}

export async function requireDefaultAccount(db: DbClient, userId: number): Promise<number> {
  const id = await getDefaultAccountId(db, userId);
  if (!id) throw new Error('Kein Standardkonto gesetzt');
  return id;
}
