import { Hono } from 'hono';
import type { Env } from '@/types';
import { requireAuth } from '@/lib/helpers/auth';
import { checkCsrf } from '@/lib/utils/csrf';
import { parseBody } from '@/lib/utils/http';
import { badRequest, jsonResponse } from '@/lib/utils/responses';

const defaultAccount = new Hono<{ Bindings: Env }>();

defaultAccount.get('/me/default-account', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const { data } = await auth.db
    .from('users')
    .select('default_bank_account_id')
    .eq('id', auth.user.id)
    .single();

  const value = (data as { default_bank_account_id?: number | null } | null)?.default_bank_account_id ?? null;
  return jsonResponse({ ok: true, default_bank_account_id: value }, 200);
});

defaultAccount.put('/me/default-account', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const payload = await parseBody<{ bank_account_id?: unknown }>(c.req.raw);
  const accountId = Number(payload.bank_account_id);
  if (!Number.isFinite(accountId) || accountId <= 0) return badRequest('bank_account_id ist ein Pflichtfeld');

  const { data: account } = await auth.db
    .from('bank_accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', auth.user.id)
    .single();

  if (!account) return badRequest('Konto nicht gefunden');

  await auth.db
    .from('users')
    .update({ default_bank_account_id: accountId } as Record<string, unknown>)
    .eq('id', auth.user.id);

  return jsonResponse({ ok: true }, 200);
});

export default defaultAccount;
