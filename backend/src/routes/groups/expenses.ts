import { Hono } from 'hono';
import type { Env } from '@/types';
import { requireAuth } from '@/lib/helpers/auth';
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

// POST /api/groups/:id/funding/:fundingId/expenses
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
  if ((ctx.membership as Record<string, unknown>).role !== 'admin') return forbidden('Nur Admins können Ausgaben anlegen');

  const { data: funding } = await auth.db.from('group_funding').select('id, group_id, amount')
    .eq('id', fundingId).eq('group_id', groupId).single();
  if (!funding) return notFound('Funding not found for this group');

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const amount = toFixedAmount(payload.amount);
  if (amount <= 0) return badRequest('Betrag muss größer 0 sein');

  const info = typeof payload.info === 'string' ? payload.info.trim() : '';
  const state = normalizeState(payload.state);
  const cycle = normalizeCycle(payload.cycle) ?? 'once';
  const dueDate = normalizeDate(payload.due_date);
  const explicitPayDate = normalizeDate(payload.pay_date);
  const payDate = state === 'paid' && !explicitPayDate ? new Date().toISOString() : explicitPayDate;

  const poolAmount = toFixedAmount(funding.amount);
  if (poolAmount < amount) return badRequest('Pool reicht nicht aus für diese Ausgabe.');

  const { data: inserted } = await auth.db.from('group_expenses').insert({
    group_funding_id: fundingId,
    amount,
    info: info || null,
    state,
    cycle,
    due_date: dueDate,
    pay_date: payDate,
  }).select('id, group_funding_id, amount, info, state, cycle, due_date, pay_date, created_at').single();

  if (!inserted) return jsonResponse({ ok: false, message: 'Ausgabe konnte nicht erstellt werden.' }, 500);

  // Pool ist `funding.amount`: Spenden erhöhen, Expenses reduzieren.
  // Die Bank-Kontomutation passierte bereits beim Spenden — hier nur Pool-Buchhaltung.
  const newPool = toFixedAmount(poolAmount - amount);
  await auth.db.from('group_funding').update({ amount: newPool }).eq('id', fundingId);

  const auditResult = await auth.db.from('transactions').insert({ group_expense_id: inserted.id });
  if ((auditResult as { error: { message: string } | null }).error) {
    console.error('[expenses.post] transactions audit insert failed (non-fatal)', (auditResult as { error: { message: string } }).error);
  }

  return jsonResponse({ ok: true, expense: serializeExpense(inserted), funding_amount: newPool }, 201);
});

// PATCH /api/groups/:id/funding/:fundingId/expenses/:expenseId
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
  if ((ctx.membership as Record<string, unknown>).role !== 'admin') return forbidden('Nur Admins können Ausgaben ändern');

  const { data: funding } = await auth.db.from('group_funding').select('id, group_id, amount')
    .eq('id', fundingId).eq('group_id', groupId).single();
  if (!funding) return notFound('Funding not found for this group');

  const { data: existing } = await auth.db.from('group_expenses')
    .select('id, group_funding_id, amount, info, state, cycle, due_date, pay_date, created_at')
    .eq('id', expenseId).eq('group_funding_id', fundingId).single();
  if (!existing) return notFound('Ausgabe nicht gefunden');

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const update: Record<string, unknown> = {};

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

  if ('due_date' in payload) {
    update.due_date = normalizeDate(payload.due_date);
  }

  const oldState = typeof existing.state === 'string' ? existing.state : 'open';
  let nextState = oldState;
  if ('state' in payload) {
    nextState = normalizeState(payload.state);
    update.state = nextState;
  }

  if ('pay_date' in payload) {
    update.pay_date = normalizeDate(payload.pay_date);
  } else if (nextState === 'paid' && oldState !== 'paid') {
    update.pay_date = new Date().toISOString();
  }

  const poolAmount = toFixedAmount(funding.amount);
  const diff = toFixedAmount(newAmount - oldAmount);
  let newPool = poolAmount;
  if (diff !== 0) {
    if (diff > 0 && poolAmount < diff) return badRequest('Pool reicht nicht aus für diese Ausgabe.');
    newPool = toFixedAmount(poolAmount - diff);
  }

  const { data: updated } = await auth.db.from('group_expenses').update(update).eq('id', expenseId)
    .select('id, group_funding_id, amount, info, state, cycle, due_date, pay_date, created_at').single();
  if (!updated) return jsonResponse({ ok: false, message: 'Ausgabe konnte nicht aktualisiert werden.' }, 500);

  if (diff !== 0) {
    await auth.db.from('group_funding').update({ amount: newPool }).eq('id', fundingId);
  }

  return jsonResponse({ ok: true, expense: serializeExpense(updated), funding_amount: newPool }, 200);
});

// DELETE /api/groups/:id/funding/:fundingId/expenses/:expenseId
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
  if ((ctx.membership as Record<string, unknown>).role !== 'admin') return forbidden('Nur Admins können Ausgaben löschen');

  const { data: funding } = await auth.db.from('group_funding').select('id, group_id, amount')
    .eq('id', fundingId).eq('group_id', groupId).single();
  if (!funding) return notFound('Funding not found for this group');

  const { data: existing } = await auth.db.from('group_expenses').select('id, amount, group_funding_id')
    .eq('id', expenseId).eq('group_funding_id', fundingId).single();
  if (!existing) return notFound('Ausgabe nicht gefunden');

  await auth.db.from('transactions').delete().eq('group_expense_id', expenseId);
  await auth.db.from('group_expenses').delete().eq('id', expenseId);

  const newPool = toFixedAmount(toFixedAmount(funding.amount) + toFixedAmount(existing.amount));
  await auth.db.from('group_funding').update({ amount: newPool }).eq('id', fundingId);

  return jsonResponse({ ok: true, message: 'Ausgabe gelöscht', funding_amount: newPool }, 200);
});

export default expenses;
