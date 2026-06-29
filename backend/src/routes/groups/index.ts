import { Hono } from 'hono';
import type { Env } from '@/types';
import { requireAuth } from '@/lib/helpers/auth';
import { checkCsrf } from '@/lib/utils/csrf';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { parseBody } from '@/lib/utils/http';
import { badRequest, forbidden, notFound, jsonResponse } from '@/lib/utils/responses';
import { toNum, getGroupCtx } from './_shared';
import membersRoutes from './members';
import activitiesRoutes from './activities';
import expensesRoutes from './expenses';
import tripsRoutes from './trips';
import sharedExpensesRoutes from './shared-expenses';

const groups = new Hono<{ Bindings: Env }>();

// GET /api/groups
groups.get('/', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const { data } = await auth.db
    .from('group_members')
    .select('role, status, groups(id, name, address, created_at)')
    .eq('user_id', auth.user.id)
    .in('status', ['accepted', 'pending_admin'])
    .order('created_at', { referencedTable: 'groups', ascending: false });

  return jsonResponse({
    ok: true,
    session_username: auth.user.username,
    groups: (data ?? []).map((gm: Record<string, unknown>) => {
      const g = gm.groups as Record<string, unknown> | null;
      return {
        group_id: String(g?.id ?? ''),
        name: g?.name ?? null,
        address: g?.address ?? null,
        created_at: g?.created_at ?? null,
        role: gm.role,
        status: gm.status ?? null,
      };
    }),
  }, 200);
});

// POST /api/groups
groups.post('/', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 5, windowMs: 60_000, group: 'groups-create' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const name = String(payload.name ?? '').trim();
  const info = String(payload.info ?? '').trim();
  const address = String(payload.address ?? '').trim();
  if (!name) return badRequest('Gruppenname ist erforderlich.');
  if (info.length > 500) return badRequest('Beschreibung zu lang (max. 500 Zeichen)');

  const { data: group } = await auth.db
    .from('groups').insert({ name, info: info || null, address: address || null }).select('id').single();
  if (!group) return jsonResponse({ ok: false, message: 'Gruppe konnte nicht erstellt werden.' }, 500);

  await auth.db.from('group_members').insert({
    group_id: group.id, user_id: auth.user.id, role: 'admin', status: 'accepted',
  });

  return jsonResponse({
    ok: true,
    group: { group_id: String(group.id), name, info: info || null, address: address || null, role: 'admin', status: 'accepted' },
  }, 201);
});

// GET /api/groups/invitations
groups.get('/invitations', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const { data } = await auth.db
    .from('group_members')
    .select('group_id, role, status, groups(id, name, address)')
    .eq('user_id', auth.user.id)
    .eq('status', 'invited');

  return jsonResponse({
    ok: true,
    invitations: (data ?? []).map((gm: Record<string, unknown>) => {
      const g = gm.groups as Record<string, unknown> | null;
      return {
        group_id: String(gm.group_id),
        name: g?.name ?? null,
        address: g?.address ?? null,
        role: gm.role,
        status: gm.status,
      };
    }),
  }, 200);
});

// GET /api/groups/:id
groups.get('/:id', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const groupId = Number(c.req.param('id'));
  if (!Number.isFinite(groupId)) return badRequest('Invalid group id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);

  const [{ data: members }, { data: activities }, { data: fundings }] = await Promise.all([
    auth.db.from('group_members')
      .select('role, status, users(id, username, first_name, last_name)')
      .eq('group_id', groupId)
      .in('status', ['accepted', 'pending_admin', 'invited', 'pending_member']),
    auth.db.from('group_activities').select('*').eq('group_id', groupId).order('date', { ascending: false }),
    auth.db.from('group_funding').select('*').eq('group_id', groupId).order('created_at', { ascending: false }),
  ]);

  const fundingIds = (fundings ?? []).map((f: Record<string, unknown>) => f.id as number);
  let participants: Record<string, unknown>[] = [];
  let expenses: Record<string, unknown>[] = [];

  if (fundingIds.length) {
    const [{ data: parts }, { data: exps }] = await Promise.all([
      auth.db.from('funding_participants')
        .select('group_funding_id, amount, created_at, bank_accounts(users(id, username, first_name, last_name))')
        .in('group_funding_id', fundingIds),
      auth.db.from('group_expenses').select('*').in('group_funding_id', fundingIds).order('created_at', { ascending: false }),
    ]);
    participants = (parts ?? []) as Record<string, unknown>[];
    expenses = (exps ?? []) as Record<string, unknown>[];
  }

  const participantsByFunding = new Map<string, Record<string, unknown>[]>();
  for (const p of participants) {
    const key = String(p.group_funding_id);
    if (!participantsByFunding.has(key)) participantsByFunding.set(key, []);
    participantsByFunding.get(key)!.push(p);
  }

  const g = ctx.group as Record<string, unknown>;
  return jsonResponse({
    ok: true,
    group: { group_id: String(g.id), name: g.name, address: g.address ?? null, created_at: g.created_at ?? null },
    is_admin: (ctx.membership as Record<string, unknown>).role === 'admin',
    session_user_id: String(ctx.user.id),
    members: (members ?? []).map((m: Record<string, unknown>) => {
      const u = m.users as Record<string, unknown> | null;
      return {
        user_id: String(u?.id ?? ''), username: u?.username ?? null,
        first_name: u?.first_name ?? null, last_name: u?.last_name ?? null,
        role: m.role, status: m.status ?? null,
      };
    }),
    activities: (activities ?? []).map((a: Record<string, unknown>) => ({
      activity_id: String(a.id), info: a.info ?? null, date: a.date ?? null, created_at: a.created_at ?? null,
    })),
    fundings: (fundings ?? []).map((f: Record<string, unknown>) => {
      const contributions = participantsByFunding.get(String(f.id)) ?? [];
      return {
        funding_id: String(f.id),
        group_activity_id: f.group_activity_id ? String(f.group_activity_id) : null,
        amount: toNum(f.amount), info: f.info ?? null, created_at: f.created_at ?? null,
        contributions: contributions.map((cont) => {
          const ba = cont.bank_accounts as Record<string, unknown> | null;
          const u = ba?.users as Record<string, unknown> | null;
          return {
            user_id: String(u?.id ?? ''), username: u?.username ?? null,
            first_name: u?.first_name ?? null, amount: toNum(cont.amount), created_at: cont.created_at ?? null,
          };
        }),
        total_donated: Number(contributions.reduce((s, cont) => s + (toNum(cont.amount) ?? 0), 0).toFixed(2)),
      };
    }),
    expenses: expenses.map((e: Record<string, unknown>) => ({
      group_expense_id: String(e.id), group_funding_id: String(e.group_funding_id),
      amount: toNum(e.amount), info: e.info ?? null, state: e.state ?? null,
      cycle: e.cycle ?? null, due_date: e.due_date ?? e.pay_date ?? null,
      pay_date: e.pay_date ?? e.due_date ?? null, created_at: e.created_at ?? null,
    })),
  }, 200);
});

// DELETE /api/groups/:id
groups.delete('/:id', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 5, windowMs: 60_000, group: 'groups-delete' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = Number(c.req.param('id'));
  if (!Number.isFinite(groupId)) return badRequest('Invalid group id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);
  if ((ctx.membership as Record<string, unknown>).role !== 'admin') return forbidden('Nur Admins können Gruppen löschen');

  const { data: fundings } = await auth.db.from('group_funding').select('id').eq('group_id', groupId);
  const fundingIds = (fundings ?? []).map((f: Record<string, unknown>) => f.id as number);
  if (fundingIds.length) {
    const { data: exps } = await auth.db.from('group_expenses').select('id').in('group_funding_id', fundingIds);
    const expIds = (exps ?? []).map((e: Record<string, unknown>) => e.id as number);
    if (expIds.length) {
      await auth.db.from('transactions').delete().in('group_expense_id', expIds);
      await auth.db.from('group_expenses').delete().in('id', expIds);
    }
    await auth.db.from('funding_participants').delete().in('group_funding_id', fundingIds);
    await auth.db.from('group_funding').delete().in('id', fundingIds);
  }

  await Promise.all([
    auth.db.from('group_message').delete().eq('group_id', groupId),
    auth.db.from('group_activities').delete().eq('group_id', groupId),
    auth.db.from('group_members').delete().eq('group_id', groupId),
  ]);
  await auth.db.from('groups').delete().eq('id', groupId);

  return jsonResponse({ ok: true, message: 'Gruppe gelöscht' }, 200);
});

// POST /api/groups/:id/invite
groups.post('/:id/invite', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 20, windowMs: 60_000, group: 'groups-mutate' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = Number(c.req.param('id'));
  if (!Number.isFinite(groupId)) return badRequest('Invalid group id');

  const { data: membership } = await auth.db.from('group_members').select('role')
    .eq('group_id', groupId).eq('user_id', auth.user.id).single();
  if (!membership) return jsonResponse({ ok: false, message: 'You are not a member of this group' }, 403);
  if ((membership as Record<string, unknown>).role !== 'admin') return forbidden('Nur Admins können Mitglieder einladen');

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const username = String(payload.username ?? '').trim().toLowerCase();
  if (!username) return badRequest('Username ist erforderlich');

  const { data: target } = await auth.db.from('users').select('id, username, email').eq('username', username).single();
  if (!target) return jsonResponse({ ok: false, message: 'Benutzer nicht gefunden' }, 404);

  const { data: existing } = await auth.db.from('group_members').select('status')
    .eq('group_id', groupId).eq('user_id', target.id).single();

  if (existing && ['accepted', 'invited', 'pending_admin', 'pending_member'].includes((existing as Record<string, unknown>).status as string)) {
    return jsonResponse({ ok: false, message: 'Benutzer ist bereits Mitglied oder wurde bereits eingeladen' }, 409);
  }

  await auth.db.from('group_members').upsert({
    group_id: groupId, user_id: target.id, role: 'member', status: 'invited',
  }, { onConflict: 'group_id,user_id' });

  return jsonResponse({ ok: true, message: `${target.username} wurde eingeladen`, invited_user_id: String(target.id) }, 200);
});

// POST /api/groups/:id/join
groups.post('/:id/join', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 20, windowMs: 60_000, group: 'groups-mutate' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = Number(c.req.param('id'));
  if (!Number.isFinite(groupId)) return badRequest('Invalid group id');

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const decision = String(payload.decision ?? '').toLowerCase();
  if (decision !== 'accept' && decision !== 'decline') return badRequest('decision muss "accept" oder "decline" sein');

  const { data: existing } = await auth.db.from('group_members').select('id, status')
    .eq('group_id', groupId).eq('user_id', auth.user.id).single();

  if (!existing || (existing as Record<string, unknown>).status !== 'invited')
    return jsonResponse({ ok: false, message: 'Keine ausstehende Einladung für diese Gruppe' }, 404);

  if (decision === 'accept') {
    await auth.db.from('group_members').update({ status: 'accepted' }).eq('id', (existing as Record<string, unknown>).id);
    return jsonResponse({ ok: true, message: 'Einladung angenommen', status: 'accepted' }, 200);
  } else {
    await auth.db.from('group_members').delete().eq('id', (existing as Record<string, unknown>).id);
    return jsonResponse({ ok: true, message: 'Einladung abgelehnt', status: 'declined' }, 200);
  }
});

// POST /api/groups/:id/leave
groups.post('/:id/leave', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 20, windowMs: 60_000, group: 'groups-mutate' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = Number(c.req.param('id'));
  if (!Number.isFinite(groupId)) return badRequest('Invalid group id');

  const { data: membership } = await auth.db.from('group_members').select('id, role')
    .eq('group_id', groupId).eq('user_id', auth.user.id).single();
  if (!membership) return jsonResponse({ ok: false, message: 'You are not a member of this group' }, 403);

  if ((membership as Record<string, unknown>).role === 'admin') {
    const { count } = await auth.db.from('group_members').select('id', { count: 'exact', head: true })
      .eq('group_id', groupId).eq('role', 'admin').in('status', ['accepted', 'pending_admin']);
    if ((count ?? 0) <= 1)
      return jsonResponse({ ok: false, message: 'Du bist der einzige Admin. Ernenne zuerst ein anderes Mitglied zum Admin.' }, 409);
  }

  await auth.db.from('group_members').delete().eq('id', (membership as Record<string, unknown>).id);
  return jsonResponse({ ok: true, message: 'Gruppe verlassen' }, 200);
});

// POST /api/groups/:id/funding
groups.post('/:id/funding', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = Number(c.req.param('id'));
  if (!Number.isFinite(groupId)) return badRequest('Invalid group id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const amount = Number(payload.amount);
  const info = String(payload.info ?? '').trim();
  if (!Number.isFinite(amount) || amount <= 0) return badRequest('Betrag muss größer 0 sein');
  if (!info) return badRequest('Beschreibung ist erforderlich');

  const activityId = payload.group_activity_id ? Number(payload.group_activity_id) : null;

  const { data } = await auth.db.from('group_funding')
    .insert({ group_id: groupId, group_activity_id: activityId || null, amount, info })
    .select('id, group_activity_id, amount, info, created_at').single();

  return jsonResponse({
    ok: true,
    funding: {
      funding_id: String(data?.id), group_activity_id: activityId ? String(activityId) : null,
      amount, info, created_at: data?.created_at ?? null,
    },
  }, 201);
});

// POST /api/groups/:id/funding/:fundingId/donate
groups.post('/:id/funding/:fundingId/donate', async (c) => {
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 30, windowMs: 60_000, group: 'groups-write' });
  if (rl) return rl;
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = Number(c.req.param('id'));
  const fundingId = Number(c.req.param('fundingId'));
  if (!Number.isFinite(groupId) || !Number.isFinite(fundingId)) return badRequest('Invalid id');

  const { data: membership } = await auth.db.from('group_members').select('role, status')
    .eq('group_id', groupId).eq('user_id', auth.user.id).in('status', ['accepted', 'pending_admin']).single();
  if (!membership) return jsonResponse({ ok: false, message: 'You are not a member of this group' }, 403);

  const { data: funding } = await auth.db.from('group_funding').select('id, amount, info')
    .eq('id', fundingId).eq('group_id', groupId).single();
  if (!funding) return notFound('Funding not found for this group');

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const donationAmount = Number(payload.amount);
  if (!Number.isFinite(donationAmount) || donationAmount <= 0) return badRequest('Donation amount must be a positive number');

  const { data: bankAccounts } = await auth.db.from('bank_accounts').select('id, balance')
    .eq('user_id', auth.user.id).order('created_at', { ascending: true }).limit(1);
  const bankAccount = bankAccounts?.[0];
  if (!bankAccount) return badRequest('No bank account available for this user');

  const now = new Date().toISOString();
  const updatedFundingAmount = Number((Number(Number(funding.amount ?? 0).toFixed(2)) + donationAmount).toFixed(2));
  const donationLabel = funding.info ? `Funding donation: ${funding.info}` : 'Funding donation';

  const { data: existingParticipant } = await auth.db.from('funding_participants').select('id, amount')
    .eq('group_funding_id', fundingId).eq('bank_account_id', bankAccount.id).single();

  let fundingParticipantId: number;
  if (existingParticipant) {
    const newAmount = Number((Number(existingParticipant.amount ?? 0) + donationAmount).toFixed(2));
    await auth.db.from('funding_participants').update({ amount: newAmount }).eq('id', existingParticipant.id);
    fundingParticipantId = existingParticipant.id;
  } else {
    const { data: inserted } = await auth.db.from('funding_participants')
      .insert({ group_funding_id: fundingId, bank_account_id: bankAccount.id, amount: donationAmount })
      .select('id').single();
    fundingParticipantId = inserted!.id;
  }

  await auth.db.from('group_funding').update({ amount: updatedFundingAmount }).eq('id', fundingId);

  const { data: expense } = await auth.db.from('private_expenses').insert({
    bank_account_id: bankAccount.id, source: donationLabel, category: 'other',
    amount: donationAmount, theo_amount: donationAmount, spent_at: now, due_date: now, pay_date: now,
    info: donationLabel, note: donationLabel, state: 'open', recurrence: null, cycle: 'once', is_active: true,
    group_funding_id: fundingId, funding_participant_id: fundingParticipantId,
  }).select('id').single();

  if (expense) {
    await auth.db.from('transactions').insert({ private_expense_id: expense.id });
    await auth.db.rpc('increment_bank_balance', { p_account_id: bankAccount.id, p_delta: -donationAmount });
  }

  return jsonResponse({ ok: true, donation: { funding_id: String(fundingId), amount: donationAmount, funding_total: updatedFundingAmount } }, 201);
});

// GET /api/groups/:id/messages
groups.get('/:id/messages', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const groupId = Number(c.req.param('id'));
  if (!Number.isFinite(groupId)) return badRequest('Invalid group id');

  const { data: membership } = await auth.db.from('group_members').select('role, status')
    .eq('group_id', groupId).eq('user_id', auth.user.id).in('status', ['accepted', 'pending_admin']).single();
  if (!membership) return jsonResponse({ ok: false, message: 'You are not a member of this group' }, 403);

  const sp = new URL(c.req.url).searchParams;
  const limit = Number(sp.get('limit')) || 50;
  const before = sp.get('before');

  let query = auth.db.from('group_message')
    .select('id, message, created_at, users(id, username, first_name, last_name)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 100));

  if (before) query = query.lt('created_at', before);

  const { data: messages } = await query;

  return jsonResponse({
    ok: true,
    messages: (messages ?? []).reverse().map((m: Record<string, unknown>) => {
      const u = m.users as Record<string, unknown> | null;
      return {
        message_id: String(m.id), message: m.message, created_at: m.created_at,
        user: { user_id: String(u?.id ?? ''), username: u?.username ?? null, first_name: u?.first_name ?? null, last_name: u?.last_name ?? null },
      };
    }),
  }, 200);
});

// POST /api/groups/:id/messages
groups.post('/:id/messages', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 30, windowMs: 60_000, group: 'groups-messages' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = Number(c.req.param('id'));
  if (!Number.isFinite(groupId)) return badRequest('Invalid group id');

  const { data: membership } = await auth.db.from('group_members').select('role, status')
    .eq('group_id', groupId).eq('user_id', auth.user.id).in('status', ['accepted', 'pending_admin']).single();
  if (!membership) return jsonResponse({ ok: false, message: 'You are not a member of this group' }, 403);

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const message = String(payload.message ?? '').trim();
  if (!message) return badRequest('Nachricht ist erforderlich');
  if (message.length > 2000) return badRequest('Nachricht zu lang (max. 2000 Zeichen)');

  const { data } = await auth.db.from('group_message')
    .insert({ group_id: groupId, user_id: auth.user.id, message })
    .select('id, message, created_at').single();

  return jsonResponse({
    ok: true,
    msg: {
      message_id: String(data?.id), message, created_at: data?.created_at,
      user: { user_id: String(auth.user.id), username: auth.user.username, first_name: auth.user.first_name, last_name: auth.user.last_name },
    },
  }, 201);
});

// DELETE /api/groups/:id/messages/:msgId
groups.delete('/:id/messages/:msgId', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 30, windowMs: 60_000, group: 'groups-messages' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = Number(c.req.param('id'));
  const messageId = Number(c.req.param('msgId'));
  if (!Number.isFinite(groupId) || !Number.isFinite(messageId)) return badRequest('Invalid id');

  const { data: msg } = await auth.db.from('group_message').select('id, user_id, group_id')
    .eq('id', messageId).eq('group_id', groupId).single();
  if (!msg) return notFound('Nachricht nicht gefunden');

  if (Number(msg.user_id) !== auth.user.id) {
    const { data: ms } = await auth.db.from('group_members').select('role')
      .eq('group_id', groupId).eq('user_id', auth.user.id).single();
    if ((ms as Record<string, unknown> | null)?.role !== 'admin')
      return forbidden('Nur der Autor oder ein Admin kann diese Nachricht löschen');
  }

  await auth.db.from('group_message').delete().eq('id', messageId);
  return jsonResponse({ ok: true, message: 'Nachricht gelöscht' }, 200);
});

groups.route('/', membersRoutes);
groups.route('/', activitiesRoutes);
groups.route('/', expensesRoutes);
groups.route('/', tripsRoutes);
groups.route('/', sharedExpensesRoutes);

export default groups;
