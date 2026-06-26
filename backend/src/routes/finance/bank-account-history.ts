import { Hono } from 'hono';
import type { Env } from '@/types';
import { requireAuth } from '@/lib/helpers/auth';
import { badRequest, notFound, jsonResponse } from '@/lib/utils/responses';
import { parsePaginationCursor, serializeIncomeEntry, serializeExpenseEntry } from '@/lib/helpers/finance';

const bankAccountHistory = new Hono<{ Bindings: Env }>();

bankAccountHistory.get('/bank-accounts/:id/history', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const userId = auth.user.id;

  const accountId = Number(c.req.param('id'));
  if (!Number.isFinite(accountId) || accountId <= 0) return badRequest('bank_account_id ist ungültig');

  const { data: account } = await auth.db
    .from('bank_accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', userId)
    .single();
  if (!account) return notFound('Bankkonto nicht gefunden');

  const sp = new URL(c.req.url).searchParams;
  const { cursor, limit } = parsePaginationCursor(sp.get('cursor'), sp.get('limit'), {
    defaultLimit: 50,
    maxLimit: 100,
    format: 'composite',
  });
  const cursorTs = cursor?.ord ?? null;
  const cursorId = cursor?.id ?? null;

  const [{ data: incomeRows }, { data: expenseRows }] = await Promise.all([
    auth.db
      .from('income')
      .select('*, "received_at", "pay_date"')
      .eq('bank_account_id', accountId),
    auth.db
      .from('private_expenses')
      .select('*, "spent_at", "pay_date", "due_date"')
      .eq('bank_account_id', accountId),
  ]);

  type Row = Record<string, unknown> & { _sortAt?: number; _id?: number; _type?: string };

  const allEntries: Row[] = [
    ...(incomeRows ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      _type: 'income',
      _sortAt: new Date(String(r.received_at ?? r.pay_date ?? r.created_at ?? 0)).getTime(),
      _id: Number(r.id),
    })),
    ...(expenseRows ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      _type: 'expense',
      _sortAt: new Date(String(r.spent_at ?? r.pay_date ?? r.due_date ?? r.created_at ?? 0)).getTime(),
      _id: Number(r.id),
    })),
  ];

  allEntries.sort((a, b) => (b._sortAt ?? 0) - (a._sortAt ?? 0) || (b._id ?? 0) - (a._id ?? 0));

  const startIdx =
    cursorTs && cursorId
      ? allEntries.findIndex((e) => (e._sortAt ?? 0) < cursorTs! || (e._sortAt === cursorTs && (e._id ?? 0) < cursorId!))
      : 0;

  const page = allEntries.slice(startIdx < 0 ? 0 : startIdx, (startIdx < 0 ? 0 : startIdx) + limit);

  const entries = page.map((row) =>
    row._type === 'income'
      ? { type: 'income', ...serializeIncomeEntry(row, userId) }
      : { type: 'expense', ...serializeExpenseEntry(row, userId) },
  );

  let nextCursor: string | null = null;
  if (page.length === limit && page.length > 0) {
    const last = page[page.length - 1];
    if (last?._sortAt) nextCursor = `${last._sortAt}_${last._id}`;
  }

  return jsonResponse({ ok: true, entries, next_cursor: nextCursor }, 200);
});

export default bankAccountHistory;
