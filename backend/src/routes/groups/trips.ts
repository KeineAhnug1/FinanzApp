import { Hono } from 'hono';
import type { Env } from '@/types';
import { requireAuth } from '@/lib/helpers/auth';
import { checkCsrf } from '@/lib/utils/csrf';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { parseBody } from '@/lib/utils/http';
import { badRequest, forbidden, notFound, jsonResponse, serverError } from '@/lib/utils/responses';
import { toFixedAmount } from '@/lib/helpers/finance';
import {
  computeTripBalances,
  createPeerTransfer,
  netSettlements,
  requireDefaultAccount,
  type Settlement,
  type TripExpenseParticipantRow,
  type TripExpenseRow,
} from '@/lib/helpers/group-shared';
import type { DbClient } from '@/lib/db';
import { getGroupCtx, requireAdmin } from './_shared';

const trips = new Hono<{ Bindings: Env }>();

type Row = Record<string, unknown>;

function parseId(v: string | undefined): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function uniqueIntIds(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<number>();
  for (const v of input) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) out.add(n);
  }
  return Array.from(out);
}

function normalizeDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function serializeTripBase(row: Row) {
  return {
    trip_id: String(row.id),
    group_id: String(row.group_id),
    creator_user_id: String(row.creator_user_id),
    name: String(row.name ?? ''),
    description: (row.description as string | null) ?? null,
    status: (row.status as string | null) ?? 'open',
    created_at: (row.created_at as string | null) ?? null,
    closed_at: (row.closed_at as string | null) ?? null,
  };
}

function serializeExpense(row: Row) {
  return {
    expense_id: String(row.id),
    trip_id: String(row.trip_id),
    payer_user_id: String(row.payer_user_id),
    description: String(row.description ?? ''),
    amount: toFixedAmount(row.amount),
    spent_at: (row.spent_at as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
  };
}

function serializeSettlement(row: Row) {
  return {
    settlement_id: String(row.id),
    trip_id: String(row.trip_id),
    from_user_id: String(row.from_user_id),
    to_user_id: String(row.to_user_id),
    amount: toFixedAmount(row.amount),
    status: (row.status as string | null) ?? 'open',
    created_at: (row.created_at as string | null) ?? null,
    paid_at: (row.paid_at as string | null) ?? null,
  };
}

async function loadTripParticipants(db: DbClient, tripIds: number[]): Promise<Map<number, number[]>> {
  const result = new Map<number, number[]>();
  if (tripIds.length === 0) return result;
  const { data } = await db
    .from('group_trip_participants')
    .select('trip_id, user_id')
    .in('trip_id', tripIds);
  for (const row of (data ?? []) as Row[]) {
    const tid = Number(row.trip_id);
    const uid = Number(row.user_id);
    if (!Number.isFinite(tid) || !Number.isFinite(uid)) continue;
    const list = result.get(tid);
    if (list) list.push(uid);
    else result.set(tid, [uid]);
  }
  return result;
}

async function recomputeTripSettlements(db: DbClient, tripId: number): Promise<Settlement[]> {
  const [{ data: expRows }, { data: settleRows }] = await Promise.all([
    db.from('group_trip_expenses').select('id, payer_user_id, amount').eq('trip_id', tripId),
    db.from('group_trip_settlements').select('id, from_user_id, to_user_id, amount, status').eq('trip_id', tripId),
  ]);

  const expenses: TripExpenseRow[] = ((expRows ?? []) as Row[]).map((r) => ({
    id: Number(r.id),
    payer_user_id: Number(r.payer_user_id),
    amount: Number(r.amount),
  }));

  const expenseIds = expenses.map((e) => e.id);
  let parts: TripExpenseParticipantRow[] = [];
  if (expenseIds.length) {
    const { data: partRows } = await db
      .from('group_trip_expense_participants')
      .select('trip_expense_id, user_id')
      .in('trip_expense_id', expenseIds);
    parts = ((partRows ?? []) as Row[]).map((r) => ({
      trip_expense_id: Number(r.trip_expense_id),
      user_id: Number(r.user_id),
    }));
  }

  const alreadyPaid = new Map<string, number>();
  for (const row of (settleRows ?? []) as Row[]) {
    if (String(row.status) !== 'paid') continue;
    const from = Number(row.from_user_id);
    const to = Number(row.to_user_id);
    const amt = Number(row.amount);
    if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(amt)) continue;
    const key = `${from}-${to}`;
    alreadyPaid.set(key, (alreadyPaid.get(key) ?? 0) + amt);
  }

  const balances = computeTripBalances(expenses, parts, alreadyPaid);
  const computed = netSettlements(balances);

  await db.from('group_trip_settlements').delete().eq('trip_id', tripId).eq('status', 'open');

  if (computed.length) {
    const rows = computed.map((s) => ({
      trip_id: tripId,
      from_user_id: s.from,
      to_user_id: s.to,
      amount: toFixedAmount(s.amount),
      status: 'open',
    }));
    await db.from('group_trip_settlements').insert(rows);
  }

  return computed;
}

async function loadTripFull(db: DbClient, tripId: number, sessionUserId: number) {
  const { data: tripRow } = await db
    .from('group_trips')
    .select('id, group_id, creator_user_id, name, description, status, created_at, closed_at')
    .eq('id', tripId)
    .single();
  if (!tripRow) return null;

  const partsMap = await loadTripParticipants(db, [tripId]);
  const participantIds = partsMap.get(tripId) ?? [];

  let participants: Row[] = [];
  if (participantIds.length) {
    const { data } = await db
      .from('users')
      .select('id, username, first_name, last_name')
      .in('id', participantIds);
    participants = (data ?? []) as Row[];
  }

  const { data: expRows } = await db
    .from('group_trip_expenses')
    .select('id, trip_id, payer_user_id, description, amount, spent_at, created_at')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false });
  const expenses = (expRows ?? []) as Row[];
  const expenseIds = expenses.map((e) => Number(e.id));

  let expenseParticipants: Row[] = [];
  if (expenseIds.length) {
    const { data: epRows } = await db
      .from('group_trip_expense_participants')
      .select('trip_expense_id, user_id')
      .in('trip_expense_id', expenseIds);
    expenseParticipants = (epRows ?? []) as Row[];
  }
  const partsByExp = new Map<number, number[]>();
  for (const ep of expenseParticipants) {
    const eid = Number(ep.trip_expense_id);
    const uid = Number(ep.user_id);
    if (!Number.isFinite(eid) || !Number.isFinite(uid)) continue;
    const list = partsByExp.get(eid);
    if (list) list.push(uid);
    else partsByExp.set(eid, [uid]);
  }

  const { data: settleRows } = await db
    .from('group_trip_settlements')
    .select('id, trip_id, from_user_id, to_user_id, amount, status, created_at, paid_at')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true });
  const settlements = (settleRows ?? []) as Row[];

  const myOpenOwed = settlements
    .filter((s) => Number(s.from_user_id) === sessionUserId && s.status === 'open')
    .map((s) => serializeSettlement(s));
  const myOpenIncoming = settlements
    .filter((s) => Number(s.to_user_id) === sessionUserId && s.status === 'open')
    .map((s) => serializeSettlement(s));

  return {
    trip: {
      ...serializeTripBase(tripRow as Row),
      participants: participants.map((u) => ({
        user_id: String(u.id),
        username: (u.username as string | null) ?? null,
        first_name: (u.first_name as string | null) ?? null,
        last_name: (u.last_name as string | null) ?? null,
      })),
      expenses: expenses.map((e) => ({
        ...serializeExpense(e),
        participant_user_ids: (partsByExp.get(Number(e.id)) ?? []).map(String),
      })),
      settlements: settlements.map(serializeSettlement),
      my_open_debts: myOpenOwed,
      my_open_credits: myOpenIncoming,
    },
  };
}

// POST /api/groups/:id/trips
trips.post('/:id/trips', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 20, windowMs: 60_000, group: 'groups-mutate' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = parseId(c.req.param('id'));
  if (groupId == null) return badRequest('Invalid group id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const name = String(payload.name ?? '').trim();
  if (!name) return badRequest('Name ist erforderlich');
  if (name.length > 200) return badRequest('Name zu lang (max. 200 Zeichen)');

  const descriptionRaw = typeof payload.description === 'string' ? payload.description.trim() : '';
  if (descriptionRaw.length > 2000) return badRequest('Beschreibung zu lang (max. 2000 Zeichen)');
  const description = descriptionRaw || null;

  const participantIds = uniqueIntIds(payload.participant_user_ids);
  if (!participantIds.includes(auth.user.id)) participantIds.push(auth.user.id);
  if (participantIds.length < 1) return badRequest('Mindestens ein Teilnehmer erforderlich');

  const { data: validMembers } = await auth.db
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .in('user_id', participantIds)
    .in('status', ['accepted', 'pending_admin']);
  const memberIds = new Set<number>(((validMembers ?? []) as Row[]).map((r) => Number(r.user_id)));
  for (const id of participantIds) {
    if (!memberIds.has(id)) return badRequest('Teilnehmer ist kein Gruppenmitglied');
  }

  const { data: tripInserted, error: tripInsertError } = await auth.db
    .from('group_trips')
    .insert({
      group_id: groupId,
      creator_user_id: auth.user.id,
      name,
      description,
      status: 'open',
    })
    .select('id, group_id, creator_user_id, name, description, status, created_at, closed_at')
    .single();
  if (tripInsertError || !tripInserted) {
    console.error('[trips.create] insert failed', tripInsertError);
    return serverError(`Datenbankfehler beim Anlegen des Ausflugs: ${tripInsertError?.message ?? 'unbekannt'}`);
  }

  const tripId = Number((tripInserted as Row).id);
  const { error: partsInsertError } = await auth.db
    .from('group_trip_participants')
    .insert(participantIds.map((uid) => ({ trip_id: tripId, user_id: uid })));
  if (partsInsertError) {
    console.error('[trips.create] participants insert failed', partsInsertError);
    await auth.db.from('group_trips').delete().eq('id', tripId);
    return serverError(`Teilnehmer konnten nicht gespeichert werden: ${partsInsertError.message}`);
  }

  const full = await loadTripFull(auth.db, tripId, auth.user.id);
  return jsonResponse({ ok: true, ...(full ?? { trip: serializeTripBase(tripInserted as Row) }) }, 201);
});

// GET /api/groups/:id/trips
trips.get('/:id/trips', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const groupId = parseId(c.req.param('id'));
  if (groupId == null) return badRequest('Invalid group id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);

  const { data: tripRows } = await auth.db
    .from('group_trips')
    .select('id, group_id, creator_user_id, name, description, status, created_at, closed_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  const tripsList = (tripRows ?? []) as Row[];
  const tripIds = tripsList.map((t) => Number(t.id));

  const partsByTrip = await loadTripParticipants(auth.db, tripIds);

  let settlements: Row[] = [];
  if (tripIds.length) {
    const { data: sRows } = await auth.db
      .from('group_trip_settlements')
      .select('id, trip_id, from_user_id, to_user_id, amount, status, created_at, paid_at')
      .in('trip_id', tripIds);
    settlements = (sRows ?? []) as Row[];
  }
  const settlementsByTrip = new Map<number, Row[]>();
  for (const s of settlements) {
    const tid = Number(s.trip_id);
    if (!Number.isFinite(tid)) continue;
    const list = settlementsByTrip.get(tid);
    if (list) list.push(s);
    else settlementsByTrip.set(tid, [s]);
  }

  return jsonResponse({
    ok: true,
    trips: tripsList.map((t) => {
      const tid = Number(t.id);
      const allSettlements = settlementsByTrip.get(tid) ?? [];
      const myOpenOwed = allSettlements
        .filter((s) => Number(s.from_user_id) === auth.user.id && s.status === 'open')
        .map(serializeSettlement);
      const myOpenIncoming = allSettlements
        .filter((s) => Number(s.to_user_id) === auth.user.id && s.status === 'open')
        .map(serializeSettlement);
      return {
        ...serializeTripBase(t),
        participant_user_ids: (partsByTrip.get(tid) ?? []).map(String),
        my_open_debts: myOpenOwed,
        my_open_credits: myOpenIncoming,
      };
    }),
  }, 200);
});

// GET /api/groups/:id/trips/:tripId
trips.get('/:id/trips/:tripId', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const groupId = parseId(c.req.param('id'));
  const tripId = parseId(c.req.param('tripId'));
  if (groupId == null || tripId == null) return badRequest('Invalid id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);

  const { data: tripRow } = await auth.db
    .from('group_trips')
    .select('id, group_id')
    .eq('id', tripId)
    .single();
  if (!tripRow || Number((tripRow as Row).group_id) !== groupId) return notFound('Ausflug nicht gefunden');

  const full = await loadTripFull(auth.db, tripId, auth.user.id);
  if (!full) return notFound('Ausflug nicht gefunden');
  return jsonResponse({ ok: true, ...full }, 200);
});

// POST /api/groups/:id/trips/:tripId/expenses
trips.post('/:id/trips/:tripId/expenses', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 30, windowMs: 60_000, group: 'groups-mutate' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = parseId(c.req.param('id'));
  const tripId = parseId(c.req.param('tripId'));
  if (groupId == null || tripId == null) return badRequest('Invalid id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);

  const { data: tripRow } = await auth.db
    .from('group_trips')
    .select('id, group_id, status')
    .eq('id', tripId)
    .single();
  if (!tripRow || Number((tripRow as Row).group_id) !== groupId) return notFound('Ausflug nicht gefunden');
  if ((tripRow as Row).status !== 'open') return badRequest('Ausflug ist abgeschlossen');

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const payerUserId = Number(payload.payer_user_id);
  const description = String(payload.description ?? '').trim();
  const amount = toFixedAmount(payload.amount);
  const participantIds = uniqueIntIds(payload.participant_user_ids);
  const spentAt = normalizeDate(payload.spent_at);

  if (!Number.isFinite(payerUserId) || payerUserId <= 0) return badRequest('payer_user_id ist erforderlich');
  if (!description) return badRequest('Beschreibung ist erforderlich');
  if (description.length > 500) return badRequest('Beschreibung zu lang (max. 500 Zeichen)');
  if (amount <= 0) return badRequest('Betrag muss größer 0 sein');
  if (participantIds.length === 0) return badRequest('Mindestens ein Teilnehmer erforderlich');

  const { data: tripPartRows } = await auth.db
    .from('group_trip_participants')
    .select('user_id')
    .eq('trip_id', tripId);
  const tripParticipantIds = new Set<number>(((tripPartRows ?? []) as Row[]).map((r) => Number(r.user_id)));
  if (!tripParticipantIds.has(payerUserId)) return badRequest('Zahler ist kein Ausflug-Teilnehmer');
  for (const id of participantIds) {
    if (!tripParticipantIds.has(id)) return badRequest('Teilnehmer ist kein Ausflug-Teilnehmer');
  }

  const { data: inserted, error: expenseInsertError } = await auth.db
    .from('group_trip_expenses')
    .insert({
      trip_id: tripId,
      payer_user_id: payerUserId,
      description,
      amount,
      spent_at: spentAt ?? new Date().toISOString(),
    })
    .select('id')
    .single();
  if (expenseInsertError || !inserted) {
    console.error('[trips.expense.create] insert failed', expenseInsertError);
    return serverError(`Datenbankfehler beim Anlegen der Ausgabe: ${expenseInsertError?.message ?? 'unbekannt'}`);
  }
  const expenseId = Number((inserted as Row).id);

  const { error: epInsertError } = await auth.db
    .from('group_trip_expense_participants')
    .insert(participantIds.map((uid) => ({ trip_expense_id: expenseId, user_id: uid })));
  if (epInsertError) {
    console.error('[trips.expense.create] participants insert failed', epInsertError);
    await auth.db.from('group_trip_expenses').delete().eq('id', expenseId);
    return serverError(`Beteiligte konnten nicht gespeichert werden: ${epInsertError.message}`);
  }

  await recomputeTripSettlements(auth.db, tripId);

  const full = await loadTripFull(auth.db, tripId, auth.user.id);
  return jsonResponse({ ok: true, ...full }, 201);
});

// DELETE /api/groups/:id/trips/:tripId/expenses/:expenseId
trips.delete('/:id/trips/:tripId/expenses/:expenseId', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 30, windowMs: 60_000, group: 'groups-mutate' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = parseId(c.req.param('id'));
  const tripId = parseId(c.req.param('tripId'));
  const expenseId = parseId(c.req.param('expenseId'));
  if (groupId == null || tripId == null || expenseId == null) return badRequest('Invalid id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);

  const { data: tripRow } = await auth.db
    .from('group_trips')
    .select('id, group_id, status')
    .eq('id', tripId)
    .single();
  if (!tripRow || Number((tripRow as Row).group_id) !== groupId) return notFound('Ausflug nicht gefunden');

  const { data: expenseRow } = await auth.db
    .from('group_trip_expenses')
    .select('id, trip_id')
    .eq('id', expenseId)
    .single();
  if (!expenseRow || Number((expenseRow as Row).trip_id) !== tripId) return notFound('Ausgabe nicht gefunden');

  const { count: paidCount } = await auth.db
    .from('group_trip_settlements')
    .select('id', { count: 'exact', head: true })
    .eq('trip_id', tripId)
    .eq('status', 'paid');
  if ((paidCount ?? 0) > 0) {
    return badRequest('Bereits abgerechnete Ausflüge können nicht geändert werden');
  }

  await auth.db.from('group_trip_expenses').delete().eq('id', expenseId);

  await recomputeTripSettlements(auth.db, tripId);

  const full = await loadTripFull(auth.db, tripId, auth.user.id);
  return jsonResponse({ ok: true, ...full }, 200);
});

// POST /api/groups/:id/trips/:tripId/recompute
trips.post('/:id/trips/:tripId/recompute', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 30, windowMs: 60_000, group: 'groups-mutate' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = parseId(c.req.param('id'));
  const tripId = parseId(c.req.param('tripId'));
  if (groupId == null || tripId == null) return badRequest('Invalid id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);

  const { data: tripRow } = await auth.db
    .from('group_trips')
    .select('id, group_id')
    .eq('id', tripId)
    .single();
  if (!tripRow || Number((tripRow as Row).group_id) !== groupId) return notFound('Ausflug nicht gefunden');

  await recomputeTripSettlements(auth.db, tripId);
  const full = await loadTripFull(auth.db, tripId, auth.user.id);
  return jsonResponse({ ok: true, ...full }, 200);
});

// POST /api/groups/:id/trips/:tripId/settlements/:settlementId/pay
trips.post('/:id/trips/:tripId/settlements/:settlementId/pay', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 20, windowMs: 60_000, group: 'groups-mutate' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = parseId(c.req.param('id'));
  const tripId = parseId(c.req.param('tripId'));
  const settlementId = parseId(c.req.param('settlementId'));
  if (groupId == null || tripId == null || settlementId == null) return badRequest('Invalid id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);

  const { data: tripRow } = await auth.db
    .from('group_trips')
    .select('id, group_id, name')
    .eq('id', tripId)
    .single();
  if (!tripRow || Number((tripRow as Row).group_id) !== groupId) return notFound('Ausflug nicht gefunden');

  const { data: settlementRow } = await auth.db
    .from('group_trip_settlements')
    .select('id, trip_id, from_user_id, to_user_id, amount, status')
    .eq('id', settlementId)
    .single();
  if (!settlementRow || Number((settlementRow as Row).trip_id) !== tripId) return notFound('Settlement nicht gefunden');
  if (Number((settlementRow as Row).from_user_id) !== auth.user.id) {
    return forbidden('Du kannst nur eigene Schulden begleichen');
  }
  if ((settlementRow as Row).status !== 'open') return badRequest('Settlement ist nicht offen');

  const toUserId = Number((settlementRow as Row).to_user_id);
  const amount = toFixedAmount((settlementRow as Row).amount);
  if (amount <= 0) return badRequest('Ungültiger Betrag');

  let senderAccount: number;
  let recipientAccount: number;
  try {
    senderAccount = await requireDefaultAccount(auth.db, auth.user.id);
    recipientAccount = await requireDefaultAccount(auth.db, toUserId);
  } catch (err) {
    return badRequest((err as Error).message);
  }

  // Atomic claim FIRST (so two simultaneous /pay requests can't both transfer).
  // We mark the settlement 'paid' here, then attempt the transfer. If the transfer
  // fails, we revert. If another request already paid (no row matched), we abort
  // before moving any money.
  const { data: claimed, error: claimError } = await auth.db
    .from('group_trip_settlements')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', settlementId)
    .eq('status', 'open')
    .select('id')
    .single();
  if (claimError && claimError.code !== 'PGRST116') {
    console.error('[trips.pay] settlement claim failed', claimError);
    return serverError(`Schuld konnte nicht beglichen werden: ${claimError.message}`);
  }
  if (!claimed) return badRequest('Settlement wurde bereits beglichen');

  let transferId: number;
  try {
    transferId = await createPeerTransfer(auth.db, {
      fromUserId: auth.user.id,
      toUserId,
      fromBankAccountId: senderAccount,
      toBankAccountId: recipientAccount,
      amount,
      reason: `Ausflug: ${String((tripRow as Row).name ?? '')}`,
      groupId,
      tripSettlementId: settlementId,
    });
  } catch (err) {
    // createPeerTransfer rolls back its own DB writes + balance changes on failure.
    // We only need to revert the settlement claim so the user can retry.
    console.error('[trips.pay] createPeerTransfer failed, reverting settlement claim', err);
    await auth.db
      .from('group_trip_settlements')
      .update({ status: 'open', paid_at: null })
      .eq('id', settlementId)
      ;
    return serverError(`Schuld konnte nicht beglichen werden: ${(err as Error).message}`);
  }

  return jsonResponse({ ok: true, transfer_id: String(transferId) }, 200);
});

// DELETE /api/groups/:id/trips/:tripId
trips.delete('/:id/trips/:tripId', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 20, windowMs: 60_000, group: 'groups-mutate' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = parseId(c.req.param('id'));
  const tripId = parseId(c.req.param('tripId'));
  if (groupId == null || tripId == null) return badRequest('Invalid id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);
  const adminCheck = requireAdmin(ctx.membership as Record<string, unknown>, 'Nur Admins können Ausflüge schließen');
  if (adminCheck) return adminCheck;

  const { data: tripRow } = await auth.db
    .from('group_trips')
    .select('id, group_id, status')
    .eq('id', tripId)
    .single();
  if (!tripRow || Number((tripRow as Row).group_id) !== groupId) return notFound('Ausflug nicht gefunden');

  const { count: openCount } = await auth.db
    .from('group_trip_settlements')
    .select('id', { count: 'exact', head: true })
    .eq('trip_id', tripId)
    .eq('status', 'open');
  if ((openCount ?? 0) > 0) return badRequest('Offene Schulden vorhanden');

  await auth.db
    .from('group_trips')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', tripId);

  return jsonResponse({ ok: true, message: 'Ausflug geschlossen' }, 200);
});

export default trips;
