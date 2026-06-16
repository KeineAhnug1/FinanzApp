import { Hono } from 'hono';
import type { Env } from '@/types';
import { requireAuth } from '@/lib/helpers/auth';
import { checkCsrf } from '@/lib/utils/csrf';
import { parseBody } from '@/lib/utils/http';
import { badRequest, notFound, jsonResponse } from '@/lib/utils/responses';
import { normalizeCategoryValue, getUserBankAccounts } from '@/lib/helpers/finance';

const budgets = new Hono<{ Bindings: Env }>();

function serializeBudget(b: Record<string, unknown>) {
  return {
    id: String(b.id),
    category: String(b.category ?? ''),
    target_amount: Number(Number(b.target_amount).toFixed(2)),
    current_amount: Number(Number(b.current_amount ?? 0).toFixed(2)),
    reset_date: b.reset_date ? String(b.reset_date) : null,
    created_at: b.created_at ? String(b.created_at) : null,
  };
}

// ---------------------------------------------------------------------------
// GET /budgets
// ---------------------------------------------------------------------------
budgets.get('/', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const { data } = await auth.db
    .from('budgets')
    .select('id, category, target_amount, current_amount, reset_date, created_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false });

  return jsonResponse({ ok: true, budgets: (data ?? []).map(serializeBudget) }, 200);
});

// ---------------------------------------------------------------------------
// POST /budgets
// ---------------------------------------------------------------------------
budgets.post('/', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const category = normalizeCategoryValue(payload.category);
  const targetAmount = Number(payload.target_amount);

  if (!category) return badRequest('Kategorie ist ein Pflichtfeld');
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) return badRequest('Zielbetrag muss größer 0 sein');

  const { data: existing } = await auth.db
    .from('budgets')
    .select('id')
    .eq('user_id', auth.user.id)
    .ilike('category', category)
    .limit(1);

  if (existing && existing.length > 0) {
    return jsonResponse({ ok: false, message: 'Budget für diese Kategorie existiert bereits' }, 409);
  }

  const { data } = await auth.db
    .from('budgets')
    .insert({ user_id: auth.user.id, category, target_amount: targetAmount, current_amount: 0 })
    .select('id, category, target_amount, current_amount, reset_date, created_at')
    .single();

  return jsonResponse({ ok: true, budget: serializeBudget(data as Record<string, unknown>) }, 201);
});

// ---------------------------------------------------------------------------
// PATCH /budgets/:id
// ---------------------------------------------------------------------------
budgets.patch('/:id', async (c) => {
  const budgetIdRaw = c.req.param('id');
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const budgetId = Number(budgetIdRaw);
  if (!Number.isFinite(budgetId) || budgetId <= 0) return badRequest('budget_id ist ungültig');

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const updates: Record<string, unknown> = {};

  if (payload.category !== undefined) {
    const category = normalizeCategoryValue(payload.category);
    if (!category) return badRequest('Kategorie darf nicht leer sein');
    updates.category = category;
  }
  if (payload.target_amount !== undefined) {
    const targetAmount = Number(payload.target_amount);
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) return badRequest('Zielbetrag muss größer 0 sein');
    updates.target_amount = targetAmount;
  }
  if (Object.keys(updates).length === 0) return badRequest('Keine Änderung angegeben');

  const { data } = await auth.db
    .from('budgets')
    .update(updates)
    .eq('id', budgetId)
    .eq('user_id', auth.user.id)
    .select('id, category, target_amount, current_amount, reset_date, created_at')
    .single();

  if (!data) return notFound('Budget nicht gefunden');
  return jsonResponse({ ok: true, budget: serializeBudget(data as Record<string, unknown>) }, 200);
});

// ---------------------------------------------------------------------------
// DELETE /budgets/:id
// ---------------------------------------------------------------------------
budgets.delete('/:id', async (c) => {
  const budgetIdRaw = c.req.param('id');
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const budgetId = Number(budgetIdRaw);
  if (!Number.isFinite(budgetId) || budgetId <= 0) return badRequest('budget_id ist ungültig');

  const { error } = await auth.db
    .from('budgets')
    .delete()
    .eq('id', budgetId)
    .eq('user_id', auth.user.id);

  if (error) return notFound('Budget nicht gefunden');
  return jsonResponse({ ok: true, message: 'Budget gelöscht' }, 200);
});

// ---------------------------------------------------------------------------
// GET /budgets/status
// ---------------------------------------------------------------------------
budgets.get('/status', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const { data: budgetList } = await auth.db
    .from('budgets')
    .select('id, category, target_amount')
    .eq('user_id', auth.user.id);

  if (!budgetList || budgetList.length === 0) {
    return jsonResponse({ ok: true, alerts: [] }, 200);
  }

  const accounts = await getUserBankAccounts(auth.db, auth.user.id);
  const accountIds = accounts.map((a: { id: number | string }) => Number(a.id));

  const expensesByCategory = new Map<string, number>();
  if (accountIds.length > 0) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { data: expenses } = await auth.db
      .from('private_expenses')
      .select('category, amount')
      .in('bank_account_id', accountIds)
      .gte('spent_at', monthStart)
      .not('category', 'is', null);

    for (const row of expenses ?? []) {
      const cat = String((row as Record<string, unknown>).category ?? '').toLowerCase();
      const prev = expensesByCategory.get(cat) ?? 0;
      expensesByCategory.set(cat, prev + Number((row as Record<string, unknown>).amount ?? 0));
    }
  }

  const alerts = budgetList.map((b: Record<string, unknown>) => {
    const target = Number(Number(b.target_amount).toFixed(2));
    const spent = Number((expensesByCategory.get(String(b.category ?? '').toLowerCase()) ?? 0).toFixed(2));
    const percentage = target > 0 ? Math.round((spent / target) * 100) : 0;
    return {
      budget_id: String(b.id),
      category: String(b.category ?? ''),
      target,
      spent,
      percentage,
      exceeded: spent > target,
    };
  });

  return jsonResponse({ ok: true, alerts }, 200);
});

export default budgets;
