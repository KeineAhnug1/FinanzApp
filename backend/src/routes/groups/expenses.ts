import { Hono } from 'hono';
import type { Env } from '@/types';
import { requireAuth } from '@/lib/helpers/auth';
import type { DbClient } from '@/lib/db';
import { checkCsrf } from '@/lib/utils/csrf';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { parseBody } from '@/lib/utils/http';
import { badRequest, forbidden, notFound, jsonResponse } from '@/lib/utils/responses';
import { toFixedAmount, normalizeCycle } from '@/lib/helpers/finance';
import { getGroupCtx } from './_shared';

const expenses = new Hono<{ Bindings: Env }>();

type ExpenseState = 'open' | 'paid' | 'overdue';
const VALID_STATES = new Set<ExpenseState>(['open', 'paid', 'overdue']);

function normalizeState(value: unknown): ExpenseState {
  const s = typeof value === 'string' ? value.toLowerCase().trim() : '';
  return VALID_STATES.has(s as ExpenseState) ? (s as ExpenseState) : 'open';
}

function normalizeDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function serializeExpense(row: Record<string, unknown>) {
  return {
    group_expense_id: String(row.id),
    group_funding_id: String(row.group_funding_id),
    amount: toFixedAmount(row.amount),
    info: row.info ?? null,
    state: row.state ?? null,
    cycle: row.cycle ?? null,
    due_date: row.due_date ?? null,
    pay_date: row.pay_date ?? null,
    created_at: row.created_at ?? null,
  };
}

async function fetchFundingForMutation(db: DbClient, fundingId: number, groupId: number) {
  const { data } = await db.from('group_funding')
    .select('id, group_id, amount, target_amount, status, creator_user_id, creator_bank_account_id, info')
    .eq('id', fundingId).eq('group_id', groupId).single();
  return data as Record<string, unknown> | null;
}

async function sumReservedExpenses(db: DbClient, fundingId: number, excludeExpenseId?: number): Promise<number> {
  const { data } = await db.from('group_expenses').select('id, amount').eq('group_funding_id', fundingId);
  const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
  return rows
    .filter((r) => excludeExpenseId == null || Number(r.id) !== excludeExpenseId)
    .reduce((s, r) => s + toFixedAmount(r.amount), 0);
}

function isCreator(funding: Record<string, unknown>, userId: number): boolean {
  if (!funding.creator_user_id) return false;
  return Number(funding.creator_user_id) === Number(userId);
}

// POST /api/groups/:id/funding/:fundingId/expenses
// Erstellt eine geplante Unter-Ausgabe. Reduziert den Pool NICHT — das passiert
// erst beim Bezahlen. Validiert: Summe aller geplanten+bezahlten Ausgaben
// darf target_amount nicht überschreiten. Anlegen ist jederzeit möglich, die
// Auszahlung (state=paid) bleibt aber bis funding.status === 'completed' gesperrt.
expenses.post('/:id/funding/:fundingId/expenses', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 20, windowMs: 60_000, group: 'groups-mutate' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = Number(c.req.param('id'));
  const fundingId = Number(c.req.param('fundingId'));
  if (!Number.isFinite(groupId) || !Number.isFinite(fundingId)) return badRequest('Invalid id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);

  const funding = await fetchFundingForMutation(auth.db, fundingId, groupId);
  if (!funding) return notFound('Funding not found for this group');

  if (!isCreator(funding, auth.user.id)) return forbidden('Nur die Erstellerin oder der Ersteller darf Ausgaben anlegen.');
  if (funding.status === 'archived') return badRequest('Archivierte Sammelaktionen können nicht mehr verändert werden.');

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const amount = toFixedAmount(payload.amount);
  if (amount <= 0) return badRequest('Betrag muss größer 0 sein');

  const info = typeof payload.info === 'string' ? payload.info.trim() : '';
  const cycle = normalizeCycle(payload.cycle) ?? 'once';
  const dueDate = normalizeDate(payload.due_date);

  const target = toFixedAmount(funding.target_amount);
  const reserved = await sumReservedExpenses(auth.db, fundingId);
  if (toFixedAmount(reserved + amount) > target) {
    return badRequest(`Gesamtkosten würden das Sammelbudget übersteigen. Verfügbar: ${toFixedAmount(target - reserved).toFixed(2)}€`);
  }

  const { data: inserted } = await auth.db.from('group_expenses').insert({
    group_funding_id: fundingId,
    amount,
    info: info || null,
    state: 'open',
    cycle,
    due_date: dueDate,
    pay_date: null,
  }).select('id, group_funding_id, amount, info, state, cycle, due_date, pay_date, created_at').single();

  if (!inserted) return jsonResponse({ ok: false, message: 'Ausgabe konnte nicht erstellt werden.' }, 500);

  return jsonResponse({
    ok: true,
    expense: serializeExpense(inserted),
    funding_amount: toFixedAmount(funding.amount),
    reserved: toFixedAmount(reserved + amount),
    available: toFixedAmount(target - reserved - amount),
  }, 201);
});

// PATCH /api/groups/:id/funding/:fundingId/expenses/:expenseId
// State-Übergänge:
//   open|overdue → paid:  Bank-Konto des Erstellers belasten + Pool reduzieren + private_expense anlegen.
//   paid → open|overdue:  Bank-Konto des Erstellers gutschreiben + Pool zurück + private_expense löschen.
// Sonstige Updates (info, due_date, cycle, amount): erlaubt, solange nicht 'paid'. Bei 'paid' ist nur State-Wechsel zurück erlaubt.
expenses.patch('/:id/funding/:fundingId/expenses/:expenseId', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 20, windowMs: 60_000, group: 'groups-mutate' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = Number(c.req.param('id'));
  const fundingId = Number(c.req.param('fundingId'));
  const expenseId = Number(c.req.param('expenseId'));
  if (!Number.isFinite(groupId) || !Number.isFinite(fundingId) || !Number.isFinite(expenseId)) return badRequest('Invalid id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);

  const funding = await fetchFundingForMutation(auth.db, fundingId, groupId);
  if (!funding) return notFound('Funding not found for this group');
  if (!isCreator(funding, auth.user.id)) return forbidden('Nur die Erstellerin oder der Ersteller darf Ausgaben ändern.');

  const { data: existing } = await auth.db.from('group_expenses')
    .select('id, group_funding_id, amount, info, state, cycle, due_date, pay_date, created_at')
    .eq('id', expenseId).eq('group_funding_id', fundingId).single();
  if (!existing) return notFound('Ausgabe nicht gefunden');

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const update: Record<string, unknown> = {};

  const oldState = (typeof existing.state === 'string' ? existing.state : 'open') as ExpenseState;
  let nextState: ExpenseState = oldState;
  if ('state' in payload) {
    nextState = normalizeState(payload.state);
    update.state = nextState;
  }

  const oldAmount = toFixedAmount(existing.amount);
  let newAmount = oldAmount;
  if ('amount' in payload) {
    newAmount = toFixedAmount(payload.amount);
    if (newAmount <= 0) return badRequest('Betrag muss größer 0 sein');
    update.amount = newAmount;
  }

  if ('info' in payload) {
    const info = typeof payload.info === 'string' ? payload.info.trim() : '';
    update.info = info || null;
  }
  if ('cycle' in payload) {
    const cycle = normalizeCycle(payload.cycle);
    if (!cycle) return badRequest('Ungültiger Cycle-Wert');
    update.cycle = cycle;
  }
  if ('due_date' in payload) update.due_date = normalizeDate(payload.due_date);

  // Reservierungs-Check bei Betrags-Änderung
  if (newAmount !== oldAmount) {
    const target = toFixedAmount(funding.target_amount);
    const reservedOthers = await sumReservedExpenses(auth.db, fundingId, expenseId);
    if (toFixedAmount(reservedOthers + newAmount) > target) {
      return badRequest(`Gesamtkosten würden das Sammelbudget übersteigen. Verfügbar: ${toFixedAmount(target - reservedOthers).toFixed(2)}€`);
    }
  }

  const creatorBankId = funding.creator_bank_account_id ? Number(funding.creator_bank_account_id) : null;
  const poolAmount = toFixedAmount(funding.amount);
  let nextPool = poolAmount;

  // Wechsel zu 'paid': abbuchen vom Konto + Pool reduzieren + private_expense anlegen
  if (oldState !== 'paid' && nextState === 'paid') {
    if (funding.status !== 'completed') return badRequest('Auszahlung erst möglich, wenn das Sammelziel erreicht ist.');
    if (!creatorBankId) return badRequest('Keine Empfänger-Bankverbindung bei dieser Sammelaktion hinterlegt.');
    if (poolAmount < newAmount) return badRequest('Pool reicht nicht aus für diese Auszahlung.');
    const debitRpc = await auth.db.rpc('increment_bank_balance', { p_account_id: creatorBankId, p_delta: -newAmount }) as { error: { message: string } | null };
    if (debitRpc.error) {
      console.error('[expenses.patch] debit failed', debitRpc.error);
      return jsonResponse({ ok: false, message: `Auszahlung fehlgeschlagen: ${debitRpc.error.message}` }, 500);
    }
    const now = new Date().toISOString();
    if (!('pay_date' in payload)) update.pay_date = now;
    else if (update.pay_date == null) update.pay_date = now;

    nextPool = toFixedAmount(poolAmount - newAmount);
    const label = (existing.info ?? funding.info ?? 'Sammelaktion-Ausgabe') as string;
    const { data: privExp, error: privErr } = await auth.db.from('private_expenses').insert({
      bank_account_id: creatorBankId,
      source: `Sammelaktion: ${label}`,
      category: 'transfer',
      amount: newAmount,
      spent_at: now, due_date: now, pay_date: now,
      info: `Sammelaktion-Auszahlung: ${label}`,
      note: `Sammelaktion-Auszahlung: ${label}`,
      state: 'open',
      recurrence: null,
      cycle: 'once',
      is_active: true,
      group_id: groupId,
      group_expense_id: expenseId,
    }).select('id').single();
    if (privErr || !privExp) {
      console.error('[expenses.patch] private_expense insert failed, rolling back debit', privErr);
      await auth.db.rpc('increment_bank_balance', { p_account_id: creatorBankId, p_delta: newAmount });
      return jsonResponse({ ok: false, message: `Auszahlung konnte nicht verbucht werden: ${privErr?.message ?? 'unbekannter Fehler'}` }, 500);
    }
    await auth.db.from('group_funding').update({ amount: nextPool }).eq('id', fundingId);
  }
  // Wechsel von 'paid' zurück: gutschreiben + Pool wieder erhöhen + private_expense löschen
  else if (oldState === 'paid' && nextState !== 'paid') {
    if (!creatorBankId) return badRequest('Keine Empfänger-Bankverbindung bei dieser Sammelaktion hinterlegt.');
    const creditRpc = await auth.db.rpc('increment_bank_balance', { p_account_id: creatorBankId, p_delta: oldAmount }) as { error: { message: string } | null };
    if (creditRpc.error) {
      console.error('[expenses.patch] reversal credit failed', creditRpc.error);
      return jsonResponse({ ok: false, message: `Stornierung fehlgeschlagen: ${creditRpc.error.message}` }, 500);
    }
    // Linked private_expense + audit entries entfernen
    const { data: linked } = await auth.db.from('private_expenses').select('id').eq('group_expense_id', expenseId);
    const linkedIds = (Array.isArray(linked) ? linked : []).map((r: Record<string, unknown>) => Number(r.id));
    if (linkedIds.length) {
      await auth.db.from('private_expenses').delete().in('id', linkedIds);
    }
    nextPool = toFixedAmount(poolAmount + oldAmount);
    await auth.db.from('group_funding').update({ amount: nextPool }).eq('id', fundingId);
    update.pay_date = null;
  }
  // Betrag-Änderung ohne State-Wechsel auf paid: keine Konto-Bewegung nötig (Pool unverändert)

  const { data: updated } = await auth.db.from('group_expenses').update(update).eq('id', expenseId)
    .select('id, group_funding_id, amount, info, state, cycle, due_date, pay_date, created_at').single();
  if (!updated) return jsonResponse({ ok: false, message: 'Ausgabe konnte nicht aktualisiert werden.' }, 500);

  return jsonResponse({ ok: true, expense: serializeExpense(updated), funding_amount: nextPool }, 200);
});

// DELETE /api/groups/:id/funding/:fundingId/expenses/:expenseId
// Wenn die Ausgabe bezahlt war → Konto-Credit + Pool-Restore.
// Wenn nur geplant → einfach löschen, kein Geld bewegt sich.
expenses.delete('/:id/funding/:fundingId/expenses/:expenseId', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 20, windowMs: 60_000, group: 'groups-mutate' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = Number(c.req.param('id'));
  const fundingId = Number(c.req.param('fundingId'));
  const expenseId = Number(c.req.param('expenseId'));
  if (!Number.isFinite(groupId) || !Number.isFinite(fundingId) || !Number.isFinite(expenseId)) return badRequest('Invalid id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);

  const funding = await fetchFundingForMutation(auth.db, fundingId, groupId);
  if (!funding) return notFound('Funding not found for this group');
  if (!isCreator(funding, auth.user.id)) return forbidden('Nur die Erstellerin oder der Ersteller darf Ausgaben löschen.');

  const { data: existing } = await auth.db.from('group_expenses').select('id, amount, state, group_funding_id')
    .eq('id', expenseId).eq('group_funding_id', fundingId).single();
  if (!existing) return notFound('Ausgabe nicht gefunden');

  const wasPaid = existing.state === 'paid';
  const amount = toFixedAmount(existing.amount);
  const creatorBankId = funding.creator_bank_account_id ? Number(funding.creator_bank_account_id) : null;
  const poolAmount = toFixedAmount(funding.amount);
  let nextPool = poolAmount;

  if (wasPaid && creatorBankId) {
    const creditRpc = await auth.db.rpc('increment_bank_balance', { p_account_id: creatorBankId, p_delta: amount }) as { error: { message: string } | null };
    if (creditRpc.error) {
      console.error('[expenses.delete] reversal credit failed', creditRpc.error);
      return jsonResponse({ ok: false, message: `Stornierung fehlgeschlagen: ${creditRpc.error.message}` }, 500);
    }
    nextPool = toFixedAmount(poolAmount + amount);
    const { data: linked } = await auth.db.from('private_expenses').select('id').eq('group_expense_id', expenseId);
    const linkedIds = (Array.isArray(linked) ? linked : []).map((r: Record<string, unknown>) => Number(r.id));
    if (linkedIds.length) {
      await auth.db.from('private_expenses').delete().in('id', linkedIds);
    }
    await auth.db.from('group_funding').update({ amount: nextPool }).eq('id', fundingId);
  }

  await auth.db.from('group_expenses').delete().eq('id', expenseId);

  return jsonResponse({ ok: true, message: 'Ausgabe gelöscht', funding_amount: nextPool }, 200);
});

export default expenses;
