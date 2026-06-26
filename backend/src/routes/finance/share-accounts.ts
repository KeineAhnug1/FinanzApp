import { Hono } from 'hono';
import type { Env } from '@/types';
import { requireAuth } from '@/lib/helpers/auth';
import { checkCsrf } from '@/lib/utils/csrf';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { parseBody } from '@/lib/utils/http';
import { badRequest, notFound, jsonResponse } from '@/lib/utils/responses';
import { toFixedAmount } from '@/lib/helpers/finance';

const shareAccounts = new Hono<{ Bindings: Env }>();

shareAccounts.get('/share-accounts', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const { data: accounts } = await auth.db
    .from('share_accounts')
    .select('id, label, created_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: true });

  const accountRows = (accounts ?? []) as Record<string, unknown>[];
  const accountIds = accountRows.map((a) => Number(a.id));

  const { data: shares } = accountIds.length
    ? await auth.db
        .from('shares')
        .select('share_account_id, symbol, units, bought_for')
        .in('share_account_id', accountIds)
    : { data: [] as Record<string, unknown>[] };

  const symbolsByAccount = new Map<number, Set<string>>();
  const investedByAccount = new Map<number, number>();
  for (const row of (shares ?? []) as Record<string, unknown>[]) {
    const accountId = Number(row.share_account_id);
    if (!Number.isFinite(accountId)) continue;
    const symbol = String(row.symbol ?? '').trim().toUpperCase();
    const units = Number(row.units);
    const boughtFor = Number(row.bought_for);

    if (symbol) {
      const set = symbolsByAccount.get(accountId) ?? new Set<string>();
      set.add(symbol);
      symbolsByAccount.set(accountId, set);
    }

    if (Number.isFinite(units) && Number.isFinite(boughtFor)) {
      investedByAccount.set(
        accountId,
        (investedByAccount.get(accountId) ?? 0) + units * boughtFor,
      );
    }
  }

  const share_accounts = accountRows.map((a, i) => {
    const id = Number(a.id);
    return {
      id: String(id),
      label: String(a.label ?? `Aktienkonto ${i + 1}`),
      position_count: symbolsByAccount.get(id)?.size ?? 0,
      total_invested: toFixedAmount(investedByAccount.get(id) ?? 0),
      created_at: a.created_at ?? null,
    };
  });

  return jsonResponse({ ok: true, share_accounts }, 200);
});

shareAccounts.post('/share-accounts', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const rl = checkRateLimit(c.req.raw, { maxAttempts: 5, windowMs: 60_000, group: 'share-accounts-create' });
  if (rl) return rl;

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const label = String(payload.label ?? '').trim();
  if (!label || label.length > 50) return badRequest('Depotname muss zwischen 1 und 50 Zeichen lang sein');

  const { data } = await auth.db
    .from('share_accounts')
    .insert({ user_id: auth.user.id, label })
    .select('id, label, created_at')
    .single();

  return jsonResponse({
    ok: true,
    share_account: {
      id: String(data?.id),
      label: String(data?.label ?? label),
      position_count: 0,
      total_invested: 0,
      created_at: data?.created_at ?? null,
    },
  }, 201);
});

shareAccounts.patch('/share-accounts/:id', async (c) => {
  const accountIdRaw = c.req.param('id');
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const rl = checkRateLimit(c.req.raw, { maxAttempts: 30, windowMs: 60_000, group: 'share-accounts-update' });
  if (rl) return rl;

  const accountId = Number(accountIdRaw);
  if (!Number.isFinite(accountId) || accountId <= 0) return badRequest('share_account_id ist ungültig');

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const label = String(payload.label ?? '').trim();
  if (!label || label.length > 50) return badRequest('Depotname muss zwischen 1 und 50 Zeichen lang sein');

  const { data } = await auth.db
    .from('share_accounts')
    .update({ label })
    .eq('id', accountId)
    .eq('user_id', auth.user.id)
    .select('id, label, created_at')
    .single();

  if (!data) return notFound('Aktienkonto nicht gefunden');

  return jsonResponse({
    ok: true,
    share_account: {
      id: String(data.id),
      label: String(data.label ?? label),
      created_at: data.created_at ?? null,
    },
  }, 200);
});

shareAccounts.delete('/share-accounts/:id', async (c) => {
  const accountIdRaw = c.req.param('id');
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const rl = checkRateLimit(c.req.raw, { maxAttempts: 30, windowMs: 60_000, group: 'share-accounts-delete' });
  if (rl) return rl;

  const accountId = Number(accountIdRaw);
  if (!Number.isFinite(accountId) || accountId <= 0) return badRequest('share_account_id ist ungültig');

  const { data: sourceAccount } = await auth.db
    .from('share_accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', auth.user.id)
    .single();

  if (!sourceAccount) return notFound('Aktienkonto nicht gefunden');

  const { data: allAccounts } = await auth.db
    .from('share_accounts')
    .select('id')
    .eq('user_id', auth.user.id);

  if ((allAccounts ?? []).length <= 1) {
    return jsonResponse({
      ok: false,
      message: 'Du musst mindestens ein Aktienkonto haben',
    }, 409);
  }

  const { data: positions } = await auth.db
    .from('shares')
    .select('id')
    .eq('share_account_id', accountId);

  const positionsCount = (positions ?? []).length;

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const transferTargetId = payload.transfer_to_share_account_id
    ? Number(payload.transfer_to_share_account_id)
    : null;

  if (positionsCount > 0) {
    if (!transferTargetId) {
      return jsonResponse({
        ok: false,
        message: 'Aktienkonto hat Positionen. Wähle ein Zielkonto für den Transfer.',
        positions_count: positionsCount,
      }, 409);
    }

    if (transferTargetId === accountId) return badRequest('Zielkonto muss ein anderes Konto sein');

    const { data: target } = await auth.db
      .from('share_accounts')
      .select('id')
      .eq('id', transferTargetId)
      .eq('user_id', auth.user.id)
      .single();
    if (!target) return badRequest('Zielkonto wurde nicht gefunden');

    await auth.db
      .from('shares')
      .update({ share_account_id: transferTargetId, depot_id: transferTargetId })
      .eq('share_account_id', accountId);
  }

  await auth.db.from('share_accounts').delete().eq('id', accountId).eq('user_id', auth.user.id);

  return jsonResponse({ ok: true, message: 'Aktienkonto gelöscht' }, 200);
});

export default shareAccounts;
