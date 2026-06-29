import { Hono } from 'hono';
import type { Env } from '@/types';
import { requireAuth } from '@/lib/helpers/auth';
import { checkCsrf } from '@/lib/utils/csrf';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { parseBody } from '@/lib/utils/http';
import { badRequest, notFound, jsonResponse } from '@/lib/utils/responses';
import { toFixedAmount, normalizeCycle } from '@/lib/helpers/finance';
import type { DbClient } from '@/lib/db';
import { getGroupCtx, requireAdmin } from './_shared';
import {
  createPeerTransfer,
  getDefaultAccountId,
  requireDefaultAccount,
} from '@/lib/helpers/group-shared';

const sharedExpenses = new Hono<{ Bindings: Env }>();

type PaymentMode = 'prepaid' | 'postpaid';
const VALID_MODES = new Set<PaymentMode>(['prepaid', 'postpaid']);

type ShareStatus = 'pending' | 'accepted' | 'rejected' | 'left' | 'paid';
type ExpenseStatus = 'pending' | 'active' | 'completed' | 'cancelled';

interface ShareRow {
  id: number;
  shared_expense_id: number;
  user_id: number;
  share_amount: number;
  status: ShareStatus;
  decided_at: string | null;
  created_at: string;
}

interface ExpenseRow {
  id: number;
  group_id: number;
  creator_user_id: number;
  title: string;
  info: string | null;
  total_amount: number;
  payment_mode: PaymentMode;
  cycle: string;
  next_due_date: string | null;
  status: ExpenseStatus;
  created_at: string;
  updated_at: string | null;
}

interface PeriodRow {
  id: number;
  shared_expense_id: number;
  period_start: string;
  status: 'collecting' | 'settled' | 'cancelled';
  created_at: string;
  settled_at: string | null;
}

function serializeShare(s: Record<string, unknown>) {
  return {
    share_id: String(s.id),
    user_id: String(s.user_id),
    share_amount: toFixedAmount(s.share_amount),
    status: s.status ?? 'pending',
    decided_at: s.decided_at ?? null,
  };
}

function serializePeriod(p: Record<string, unknown> | null | undefined) {
  if (!p) return null;
  return {
    period_id: String(p.id),
    period_start: p.period_start ?? null,
    status: p.status ?? null,
    settled_at: p.settled_at ?? null,
  };
}

function serializeExpense(
  e: Record<string, unknown>,
  shares: Record<string, unknown>[],
  period: Record<string, unknown> | null,
) {
  return {
    shared_expense_id: String(e.id),
    group_id: String(e.group_id),
    creator_user_id: String(e.creator_user_id),
    title: String(e.title ?? ''),
    info: e.info ?? null,
    total_amount: toFixedAmount(e.total_amount),
    payment_mode: e.payment_mode ?? null,
    cycle: e.cycle ?? 'once',
    status: e.status ?? 'pending',
    next_due_date: e.next_due_date ?? null,
    created_at: e.created_at ?? null,
    shares: shares.map(serializeShare),
    current_period: serializePeriod(period),
  };
}

function computeEqualShares(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = toFixedAmount(total / n);
  const shares = new Array(n).fill(base) as number[];
  const sumSoFar = toFixedAmount(base * n);
  const remainder = toFixedAmount(total - sumSoFar);
  if (remainder !== 0) {
    shares[n - 1] = toFixedAmount((shares[n - 1] ?? 0) + remainder);
  }
  return shares;
}

async function loadExpenseFull(
  db: DbClient,
  expenseId: number,
): Promise<{ expense: ExpenseRow; shares: ShareRow[]; period: PeriodRow | null } | null> {
  const { data: expense } = await db.from('group_shared_expenses').select('*').eq('id', expenseId).single();
  if (!expense) return null;
  const { data: shares } = await db
    .from('group_shared_expense_shares')
    .select('*')
    .eq('shared_expense_id', expenseId)
    .order('id', { ascending: true });
  const { data: periods } = await db
    .from('group_shared_expense_periods')
    .select('*')
    .eq('shared_expense_id', expenseId)
    .order('id', { ascending: false })
    .limit(1);
  return {
    expense: expense as ExpenseRow,
    shares: (shares ?? []) as ShareRow[],
    period: ((periods ?? [])[0] ?? null) as PeriodRow | null,
  };
}

// POST /api/groups/:id/shared-expenses
sharedExpenses.post('/:id/shared-expenses', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 20, windowMs: 60_000, group: 'groups-mutate' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = Number(c.req.param('id'));
  if (!Number.isFinite(groupId)) return badRequest('Invalid group id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);
  const adminGuard = requireAdmin(ctx.membership as Record<string, unknown>, 'Nur Admins können geteilte Ausgaben anlegen');
  if (adminGuard) return adminGuard;

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const title = String(payload.title ?? '').trim();
  if (!title) return badRequest('Titel ist erforderlich');
  if (title.length > 200) return badRequest('Titel zu lang (max. 200 Zeichen)');
  const info = typeof payload.info === 'string' ? payload.info.trim() : '';
  if (info.length > 1000) return badRequest('Beschreibung zu lang (max. 1000 Zeichen)');

  const totalAmount = toFixedAmount(payload.total_amount);
  if (totalAmount <= 0) return badRequest('Betrag muss größer 0 sein');

  const modeRaw = String(payload.payment_mode ?? '').toLowerCase();
  if (!VALID_MODES.has(modeRaw as PaymentMode)) return badRequest('payment_mode muss "prepaid" oder "postpaid" sein');
  const paymentMode = modeRaw as PaymentMode;

  const cycle = normalizeCycle(payload.cycle) ?? 'once';

  const rawParticipants = Array.isArray(payload.participant_user_ids) ? payload.participant_user_ids : null;
  if (!rawParticipants || rawParticipants.length === 0) return badRequest('Mindestens ein Teilnehmer erforderlich');
  const participantIds = Array.from(
    new Set(
      rawParticipants
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  );
  if (participantIds.length === 0) return badRequest('Ungültige Teilnehmer');

  const { data: members } = await auth.db
    .from('group_members')
    .select('user_id, role, status')
    .eq('group_id', groupId)
    .in('status', ['accepted', 'pending_admin']);
  const memberIds = new Set<number>((members ?? []).map((m: Record<string, unknown>) => Number(m.user_id)));
  for (const pid of participantIds) {
    if (!memberIds.has(pid)) return badRequest(`User ${pid} ist kein Gruppenmitglied`);
  }

  if (paymentMode === 'prepaid') {
    const adminAccount = await getDefaultAccountId(auth.db, auth.user.id);
    if (adminAccount == null) return badRequest('Admin hat kein Standardkonto');
  }

  const sharesPerUser = computeEqualShares(totalAmount, participantIds.length);

  const { data: expense } = await auth.db
    .from('group_shared_expenses')
    .insert({
      group_id: groupId,
      creator_user_id: auth.user.id,
      title,
      info: info || null,
      total_amount: totalAmount,
      payment_mode: paymentMode,
      cycle,
      status: 'pending',
    })
    .select('id, group_id, creator_user_id, title, info, total_amount, payment_mode, cycle, next_due_date, status, created_at, updated_at')
    .single();
  if (!expense) return jsonResponse({ ok: false, message: 'Konnte geteilte Ausgabe nicht anlegen' }, 500);

  const expenseId = Number((expense as Record<string, unknown>).id);
  const now = new Date().toISOString();

  const shareRows: Record<string, unknown>[] = participantIds.map((uid, i) => {
    const isCreator = uid === auth.user.id;
    return {
      shared_expense_id: expenseId,
      user_id: uid,
      share_amount: sharesPerUser[i],
      status: isCreator ? 'accepted' : 'pending',
      decided_at: isCreator ? now : null,
    };
  });

  await auth.db.from('group_shared_expense_shares').insert(shareRows);

  const { data: insertedShares } = await auth.db
    .from('group_shared_expense_shares')
    .select('*')
    .eq('shared_expense_id', expenseId)
    .order('id', { ascending: true });

  const { data: period } = await auth.db
    .from('group_shared_expense_periods')
    .insert({ shared_expense_id: expenseId, period_start: now, status: 'collecting' })
    .select('id, shared_expense_id, period_start, status, created_at, settled_at')
    .single();

  if (paymentMode === 'postpaid' && period) {
    const creatorShare = (insertedShares ?? []).find(
      (s: Record<string, unknown>) => Number(s.user_id) === auth.user.id,
    ) as Record<string, unknown> | undefined;
    if (creatorShare) {
      await auth.db.from('group_shared_expense_period_transfers').insert({
        period_id: Number(period.id),
        share_id: Number(creatorShare.id),
        amount: toFixedAmount(creatorShare.share_amount),
        status: 'reserved',
      });
    }
  }

  return jsonResponse(
    {
      ok: true,
      shared_expense: serializeExpense(
        expense as Record<string, unknown>,
        (insertedShares ?? []) as Record<string, unknown>[],
        period as Record<string, unknown> | null,
      ),
    },
    201,
  );
});

// GET /api/groups/:id/shared-expenses
sharedExpenses.get('/:id/shared-expenses', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const groupId = Number(c.req.param('id'));
  if (!Number.isFinite(groupId)) return badRequest('Invalid group id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);

  const { data: expenses } = await auth.db
    .from('group_shared_expenses')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });

  const expenseRows = (expenses ?? []) as Record<string, unknown>[];
  const expenseIds = expenseRows.map((e) => Number(e.id));

  let sharesByExpense = new Map<number, Record<string, unknown>[]>();
  let latestPeriodByExpense = new Map<number, Record<string, unknown>>();
  if (expenseIds.length) {
    const { data: shares } = await auth.db
      .from('group_shared_expense_shares')
      .select('*')
      .in('shared_expense_id', expenseIds)
      .order('id', { ascending: true });
    for (const s of (shares ?? []) as Record<string, unknown>[]) {
      const key = Number(s.shared_expense_id);
      const arr = sharesByExpense.get(key) ?? [];
      arr.push(s);
      sharesByExpense.set(key, arr);
    }

    const { data: periods } = await auth.db
      .from('group_shared_expense_periods')
      .select('*')
      .in('shared_expense_id', expenseIds)
      .order('id', { ascending: false });
    for (const p of (periods ?? []) as Record<string, unknown>[]) {
      const key = Number(p.shared_expense_id);
      if (!latestPeriodByExpense.has(key)) latestPeriodByExpense.set(key, p);
    }
  }

  const items = expenseRows.map((e) => {
    const id = Number(e.id);
    return serializeExpense(e, sharesByExpense.get(id) ?? [], latestPeriodByExpense.get(id) ?? null);
  });

  return jsonResponse({ ok: true, items }, 200);
});

// POST /api/groups/:id/shared-expenses/:expenseId/decide
sharedExpenses.post('/:id/shared-expenses/:expenseId/decide', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 30, windowMs: 60_000, group: 'groups-mutate' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = Number(c.req.param('id'));
  const expenseId = Number(c.req.param('expenseId'));
  if (!Number.isFinite(groupId) || !Number.isFinite(expenseId)) return badRequest('Invalid id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const decision = String(payload.decision ?? '').toLowerCase();
  if (decision !== 'accept' && decision !== 'reject') return badRequest('decision muss "accept" oder "reject" sein');

  const full = await loadExpenseFull(auth.db, expenseId);
  if (!full || full.expense.group_id !== groupId) return notFound('Geteilte Ausgabe nicht gefunden');
  if (full.expense.status !== 'pending' && full.expense.status !== 'active') {
    return badRequest('Geteilte Ausgabe ist nicht mehr offen');
  }

  const share = full.shares.find((s) => Number(s.user_id) === auth.user.id);
  if (!share) return notFound('Du bist kein Teilnehmer dieser Ausgabe');
  if (share.status !== 'pending') return badRequest('Bereits entschieden');

  const period = full.period;
  const now = new Date().toISOString();

  if (decision === 'reject') {
    await auth.db
      .from('group_shared_expense_shares')
      .update({ status: 'rejected', decided_at: now })
      .eq('id', share.id);

    await auth.db
      .from('group_shared_expense_shares')
      .update({ status: 'rejected', decided_at: now })
      .eq('shared_expense_id', expenseId)
      .eq('status', 'pending');

    if (period) {
      await auth.db
        .from('group_shared_expense_periods')
        .update({ status: 'cancelled', settled_at: now })
        .eq('id', period.id);
      await auth.db
        .from('group_shared_expense_period_transfers')
        .update({ status: 'cancelled' })
        .eq('period_id', period.id)
        .eq('status', 'reserved');
    }

    await auth.db
      .from('group_shared_expenses')
      .update({ status: 'cancelled', updated_at: now })
      .eq('id', expenseId);

    return jsonResponse({ ok: true, cancelled: true }, 200);
  }

  const adminAccountId = await getDefaultAccountId(auth.db, full.expense.creator_user_id);
  if (adminAccountId == null) return badRequest('Admin hat kein Standardkonto');

  if (full.expense.payment_mode === 'prepaid') {
    const memberAccountId = await getDefaultAccountId(auth.db, auth.user.id);
    if (memberAccountId == null) return badRequest('Du hast kein Standardkonto');
    try {
      await createPeerTransfer(auth.db, {
        fromUserId: auth.user.id,
        toUserId: full.expense.creator_user_id,
        fromBankAccountId: memberAccountId,
        toBankAccountId: adminAccountId,
        amount: share.share_amount,
        reason: `Anteil: ${full.expense.title}`,
        groupId,
        groupExpenseShareId: share.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transfer fehlgeschlagen';
      return jsonResponse({ ok: false, message: msg }, 500);
    }

    await auth.db
      .from('group_shared_expense_shares')
      .update({ status: 'paid', decided_at: now })
      .eq('id', share.id);
  } else {
    await auth.db
      .from('group_shared_expense_shares')
      .update({ status: 'accepted', decided_at: now })
      .eq('id', share.id);

    if (period) {
      const { data: existingPt } = await auth.db
        .from('group_shared_expense_period_transfers')
        .select('id')
        .eq('period_id', period.id)
        .eq('share_id', share.id)
        .maybeSingle();
      if (!existingPt) {
        await auth.db.from('group_shared_expense_period_transfers').insert({
          period_id: period.id,
          share_id: share.id,
          amount: share.share_amount,
          status: 'reserved',
        });
      }
    }
  }

  const { data: refreshedShares } = await auth.db
    .from('group_shared_expense_shares')
    .select('*')
    .eq('shared_expense_id', expenseId)
    .order('id', { ascending: true });
  const allShares = (refreshedShares ?? []) as ShareRow[];

  let settled = false;

  if (full.expense.payment_mode === 'postpaid') {
    const allAccepted = allShares.every((s) => s.status === 'accepted' || s.status === 'left');
    const hasAccepted = allShares.some((s) => s.status === 'accepted');
    if (allAccepted && hasAccepted && period) {
      const rpcResult = await auth.db.rpc('release_period_reservations', { p_period_id: period.id });
      const rpcError = (rpcResult as { error: unknown } | null)?.error;
      if (rpcError) {
        const { data: reservedTransfers } = await auth.db
          .from('group_shared_expense_period_transfers')
          .select('*')
          .eq('period_id', period.id)
          .eq('status', 'reserved');

        try {
          for (const pt of (reservedTransfers ?? []) as Record<string, unknown>[]) {
            const shareId = Number(pt.share_id);
            const matchingShare = allShares.find((s) => s.id === shareId);
            if (!matchingShare) continue;
            if (matchingShare.user_id === full.expense.creator_user_id) {
              await auth.db
                .from('group_shared_expense_period_transfers')
                .update({ status: 'released' })
                .eq('id', Number(pt.id));
              await auth.db
                .from('group_shared_expense_shares')
                .update({ status: 'paid' })
                .eq('id', shareId);
              continue;
            }
            const memberAcc = await requireDefaultAccount(auth.db, matchingShare.user_id);
            const transferId = await createPeerTransfer(auth.db, {
              fromUserId: matchingShare.user_id,
              toUserId: full.expense.creator_user_id,
              fromBankAccountId: memberAcc,
              toBankAccountId: adminAccountId,
              amount: toFixedAmount(pt.amount),
              reason: `Anteil: ${full.expense.title}`,
              groupId,
              groupExpenseShareId: shareId,
            });
            await auth.db
              .from('group_shared_expense_period_transfers')
              .update({ status: 'released', transfer_id: transferId })
              .eq('id', Number(pt.id));
            await auth.db
              .from('group_shared_expense_shares')
              .update({ status: 'paid' })
              .eq('id', shareId);
          }
          await auth.db
            .from('group_shared_expense_periods')
            .update({ status: 'settled', settled_at: now })
            .eq('id', period.id);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Settlement fehlgeschlagen';
          return jsonResponse({ ok: false, message: msg }, 500);
        }
      }
      settled = true;
    }
  } else {
    const stillOpen = allShares.some((s) => s.status === 'pending');
    const anyPaid = allShares.some((s) => s.status === 'paid');
    if (!stillOpen && anyPaid && period) {
      await auth.db
        .from('group_shared_expense_periods')
        .update({ status: 'settled', settled_at: now })
        .eq('id', period.id);
      settled = true;
    }
  }

  if (settled) {
    const nextStatus: ExpenseStatus = full.expense.cycle === 'once' ? 'completed' : 'active';
    await auth.db
      .from('group_shared_expenses')
      .update({ status: nextStatus, updated_at: now })
      .eq('id', expenseId);
  }

  return jsonResponse({ ok: true, settled }, 200);
});

// POST /api/groups/:id/shared-expenses/:expenseId/stop
sharedExpenses.post('/:id/shared-expenses/:expenseId/stop', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 20, windowMs: 60_000, group: 'groups-mutate' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = Number(c.req.param('id'));
  const expenseId = Number(c.req.param('expenseId'));
  if (!Number.isFinite(groupId) || !Number.isFinite(expenseId)) return badRequest('Invalid id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);

  const full = await loadExpenseFull(auth.db, expenseId);
  if (!full || full.expense.group_id !== groupId) return notFound('Geteilte Ausgabe nicht gefunden');

  const share = full.shares.find((s) => Number(s.user_id) === auth.user.id);
  if (!share) return notFound('Du bist kein Teilnehmer dieser Ausgabe');

  const now = new Date().toISOString();

  if (full.expense.cycle === 'once') {
    if (share.status === 'pending' && full.expense.status === 'pending') {
      await auth.db
        .from('group_shared_expense_shares')
        .update({ status: 'rejected', decided_at: now })
        .eq('shared_expense_id', expenseId)
        .eq('status', 'pending');
      if (full.period) {
        await auth.db
          .from('group_shared_expense_periods')
          .update({ status: 'cancelled', settled_at: now })
          .eq('id', full.period.id);
        await auth.db
          .from('group_shared_expense_period_transfers')
          .update({ status: 'cancelled' })
          .eq('period_id', full.period.id)
          .eq('status', 'reserved');
      }
      await auth.db
        .from('group_shared_expenses')
        .update({ status: 'cancelled', updated_at: now })
        .eq('id', expenseId);
      return jsonResponse({ ok: true, cancelled: true }, 200);
    }
    return badRequest('Einmalige Ausgabe kann nicht mehr gestoppt werden');
  }

  if (share.status === 'left') return badRequest('Bereits gestoppt');
  if (share.status === 'rejected') return badRequest('Anteil bereits abgelehnt');
  if (full.expense.status !== 'pending' && full.expense.status !== 'active') {
    return badRequest('Geteilte Ausgabe ist nicht mehr offen');
  }
  await auth.db
    .from('group_shared_expense_shares')
    .update({ status: 'left', decided_at: now })
    .eq('id', share.id);

  const { data: remainingActive } = await auth.db
    .from('group_shared_expense_shares')
    .select('user_id, status')
    .eq('shared_expense_id', expenseId)
    .in('status', ['pending', 'accepted', 'paid']);

  const activeUserIds = new Set<number>(
    ((remainingActive ?? []) as Record<string, unknown>[]).map((s) => Number(s.user_id)),
  );
  const onlyCreator =
    activeUserIds.size === 0 ||
    (activeUserIds.size === 1 && activeUserIds.has(full.expense.creator_user_id));

  if (onlyCreator) {
    await auth.db
      .from('group_shared_expenses')
      .update({ status: 'completed', updated_at: now })
      .eq('id', expenseId);
  }

  return jsonResponse({ ok: true }, 200);
});

// DELETE /api/groups/:id/shared-expenses/:expenseId
sharedExpenses.delete('/:id/shared-expenses/:expenseId', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 20, windowMs: 60_000, group: 'groups-mutate' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = Number(c.req.param('id'));
  const expenseId = Number(c.req.param('expenseId'));
  if (!Number.isFinite(groupId) || !Number.isFinite(expenseId)) return badRequest('Invalid id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);
  const adminGuard = requireAdmin(ctx.membership as Record<string, unknown>, 'Nur Admins können geteilte Ausgaben stornieren');
  if (adminGuard) return adminGuard;

  const { data: expense } = await auth.db
    .from('group_shared_expenses')
    .select('id, group_id, status')
    .eq('id', expenseId)
    .single();
  if (!expense || Number((expense as Record<string, unknown>).group_id) !== groupId) {
    return notFound('Geteilte Ausgabe nicht gefunden');
  }
  if ((expense as Record<string, unknown>).status === 'cancelled') {
    return jsonResponse({ ok: true }, 200);
  }

  const now = new Date().toISOString();

  const { data: periods } = await auth.db
    .from('group_shared_expense_periods')
    .select('id, status')
    .eq('shared_expense_id', expenseId)
    .in('status', ['collecting']);
  const periodIds = ((periods ?? []) as Record<string, unknown>[]).map((p) => Number(p.id));

  if (periodIds.length) {
    await auth.db
      .from('group_shared_expense_periods')
      .update({ status: 'cancelled', settled_at: now })
      .in('id', periodIds);
    await auth.db
      .from('group_shared_expense_period_transfers')
      .update({ status: 'cancelled' })
      .in('period_id', periodIds)
      .eq('status', 'reserved');
  }

  await auth.db
    .from('group_shared_expenses')
    .update({ status: 'cancelled', updated_at: now })
    .eq('id', expenseId);

  return jsonResponse({ ok: true }, 200);
});

export default sharedExpenses;
