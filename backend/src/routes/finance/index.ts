import { Hono } from 'hono';
import type { Env } from '@/types';
import { requireAuth } from '@/lib/helpers/auth';
import { checkCsrf } from '@/lib/utils/csrf';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { parseBody } from '@/lib/utils/http';
import { badRequest, notFound, jsonResponse } from '@/lib/utils/responses';
import {
  getUserBankAccounts,
  ensureUserFinanceRoots,
  resolveRequestedBankAccountFilter,
  serializeIncomeEntry,
  serializeExpenseEntry,
  rememberUserCategory,
  normalizeCategoryValue,
  normalizeCycle,
  parseRecurrence,
  parseBoolean,
  parsePaginationCursor,
  resolveEntryState,
  incrementBankAccountBalance,
  transferBetweenAccounts,
  uniqueCategoryList,
  categoryKey,
  toFixedAmount,
  assertDateAfterAccountOpening,
  PRESET_INCOME_CATEGORY_KEYS,
  PRESET_EXPENSE_CATEGORY_KEYS,
} from '@/lib/helpers/finance';
import bankAccountHistoryRoutes from './bank-account-history';
import shareAccountsRoutes from './share-accounts';
import peerTransfersRoutes from './peer-transfers';

const finance = new Hono<{ Bindings: Env }>();

finance.route('/', shareAccountsRoutes);
finance.route('/', peerTransfersRoutes);

// ---------------------------------------------------------------------------
// Bank Accounts
// ---------------------------------------------------------------------------

finance.get('/bank-accounts', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const accounts = await getUserBankAccounts(auth.db, auth.user.id);
  console.log(`[bank-accounts] user=${auth.user.id} returned ${accounts.length} accounts`);
  return jsonResponse({ ok: true, accounts }, 200);
});

finance.post('/bank-accounts', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const rl = checkRateLimit(c.req.raw, { maxAttempts: 30, windowMs: 60_000, group: 'bank-create' });
  if (rl) return rl;

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const label = String(payload.label ?? payload.name ?? '').trim();
  if (!label) return badRequest('Kontoname ist erforderlich');

  const initialBalance = Number(payload.initial_balance ?? 0);
  const startBalance = Number.isFinite(initialBalance) && initialBalance >= 0 ? Math.round(initialBalance * 100) / 100 : 0;

  // Account-balance starts at 0; the opening capital becomes a regular income entry so
  // the running balance is always "sum of bookings".
  const { data } = await auth.db
    .from('bank_accounts')
    .insert({ user_id: auth.user.id, label, balance: 0 })
    .select('id, label, balance, created_at')
    .single();

  if (!data) return jsonResponse({ ok: false, message: 'Konto konnte nicht erstellt werden' }, 500);

  const accountId = Number((data as Record<string, unknown>).id);
  const createdAtRaw = (data as Record<string, unknown>).created_at;
  const createdAtIso = createdAtRaw instanceof Date
    ? createdAtRaw.toISOString()
    : typeof createdAtRaw === 'string'
      ? createdAtRaw
      : new Date().toISOString();

  if (startBalance > 0) {
    await auth.db.from('income').insert({
      bank_account_id: accountId,
      source: 'Startkapital',
      category: 'opening',
      amount: startBalance,
      received_at: createdAtIso,
      pay_date: createdAtIso,
      note: '',
      info: 'Startkapital',
      recurrence: null,
      cycle: 'once',
      is_active: true,
      state: 'open',
    });
    await incrementBankAccountBalance(auth.db, accountId, startBalance);
  }

  return jsonResponse({
    ok: true,
    account: {
      id: String(accountId),
      label,
      balance: startBalance,
      created_at: createdAtIso,
    },
  }, 201);
});

finance.patch('/bank-accounts/:id', async (c) => {
  const accountIdRaw = c.req.param('id');
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const rl = checkRateLimit(c.req.raw, { maxAttempts: 30, windowMs: 60_000, group: 'bank-update' });
  if (rl) return rl;

  const accountId = Number(accountIdRaw);
  if (!Number.isFinite(accountId) || accountId <= 0) return badRequest('bank_account_id ist ungültig');

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const label = String(payload.label ?? payload.name ?? '').trim();
  if (!label) return badRequest('Kontoname ist erforderlich');

  const { data } = await auth.db
    .from('bank_accounts')
    .update({ label })
    .eq('id', accountId)
    .eq('user_id', auth.user.id)
    .select('id, label, balance')
    .single();

  if (!data) return notFound('Bankkonto nicht gefunden');

  return jsonResponse({
    ok: true,
    account: { id: String(data.id), label: data.label, balance: toFixedAmount(data.balance) },
  }, 200);
});

finance.delete('/bank-accounts/:id', async (c) => {
  const accountIdRaw = c.req.param('id');
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const rl = checkRateLimit(c.req.raw, { maxAttempts: 30, windowMs: 60_000, group: 'bank-delete' });
  if (rl) return rl;

  const accountId = Number(accountIdRaw);
  if (!Number.isFinite(accountId) || accountId <= 0) return badRequest('bank_account_id ist ungültig');

  const { data: sourceAccount } = await auth.db
    .from('bank_accounts')
    .select('id, label, balance')
    .eq('id', accountId)
    .eq('user_id', auth.user.id)
    .single();

  if (!sourceAccount) return notFound('Bankkonto nicht gefunden');

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const transferTargetId = payload.transfer_to_bank_account_id
    ? Number(payload.transfer_to_bank_account_id)
    : null;

  const sourceBalance = toFixedAmount(sourceAccount.balance);

  const { data: transferOptions } = await auth.db
    .from('bank_accounts')
    .select('id, label, balance')
    .eq('user_id', auth.user.id)
    .neq('id', accountId)
    .order('created_at', { ascending: true });

  const hasAlternativeAccount = (transferOptions ?? []).length > 0;
  const needsTransferPrompt = sourceBalance !== 0 && hasAlternativeAccount;

  if (needsTransferPrompt && !transferTargetId) {
    return jsonResponse({
      ok: false,
      code: 'transfer_required',
      requires_transfer: true,
      balance: sourceBalance,
      message: 'Bankkonto kann nur mit Transfer auf ein anderes Konto gelöscht werden.',
      transfer_options: (transferOptions ?? []).map((a: Record<string, unknown>, i: number) => ({
        id: String(a.id),
        label: String(a.label ?? `Bankkonto ${i + 1}`),
        balance: toFixedAmount(a.balance),
      })),
    }, 409);
  }

  if (sourceBalance !== 0 && !hasAlternativeAccount) {
    return jsonResponse({
      ok: false,
      requires_transfer: false,
      message: 'Dieses Konto hat einen Kontostand ungleich 0. Lege zuerst ein weiteres Bankkonto an, um den Betrag zu übertragen.',
    }, 409);
  }

  if (transferTargetId) {
    if (transferTargetId === accountId) return badRequest('Zielkonto muss ein anderes Konto sein');
    const { data: target } = await auth.db
      .from('bank_accounts')
      .select('id')
      .eq('id', transferTargetId)
      .eq('user_id', auth.user.id)
      .single();
    if (!target) return badRequest('Zielkonto wurde nicht gefunden');
  }

  if (transferTargetId && sourceBalance !== 0) {
    await auth.db.rpc('increment_bank_balance', { p_account_id: transferTargetId, p_delta: sourceBalance });
    await auth.db.from('income').insert({
      bank_account_id: transferTargetId,
      source: 'Kontoübertrag',
      category: 'Sonstiges',
      amount: sourceBalance,
      received_at: new Date().toISOString(),
      pay_date: new Date().toISOString(),
      note: `Übertrag von gelöschtem Konto "${sourceAccount.label}"`,
      info: `Übertrag von gelöschtem Konto "${sourceAccount.label}"`,
      recurrence: null,
      cycle: 'once',
      is_active: true,
      state: 'open',
    });
  }

  await Promise.all([
    auth.db.from('income').delete().eq('bank_account_id', accountId),
    auth.db.from('private_expenses').delete().eq('bank_account_id', accountId),
    auth.db.from('funding_participants').delete().eq('bank_account_id', accountId),
  ]);

  await auth.db.from('bank_accounts').delete().eq('id', accountId).eq('user_id', auth.user.id);

  return jsonResponse({ ok: true, message: 'Bankkonto gelöscht' }, 200);
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

finance.get('/categories', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const accounts = await getUserBankAccounts(auth.db, auth.user.id);
  const accountIds = accounts.map((a: { id: string }) => Number(a.id));

  const [{ data: stored }, incomeDistinct, expenseDistinct] = await Promise.all([
    auth.db.from('user_categories').select('kind, value').eq('user_id', auth.user.id),
    accountIds.length
      ? auth.db.from('income').select('category').in('bank_account_id', accountIds).not('category', 'is', null)
      : Promise.resolve({ data: [] }),
    accountIds.length
      ? auth.db.from('private_expenses').select('category').in('bank_account_id', accountIds).not('category', 'is', null)
      : Promise.resolve({ data: [] }),
  ]);

  const incomeValues: string[] = [];
  const expenseValues: string[] = [];
  for (const entry of stored ?? []) {
    if (entry.kind === 'income') incomeValues.push(entry.value);
    if (entry.kind === 'expense') expenseValues.push(entry.value);
  }

  return jsonResponse({
    ok: true,
    income: uniqueCategoryList([
      ...incomeValues,
      ...((incomeDistinct.data ?? []) as Record<string, unknown>[]).map((r) => r.category),
    ]),
    expense: uniqueCategoryList([
      ...expenseValues,
      ...((expenseDistinct.data ?? []) as Record<string, unknown>[]).map((r) => r.category),
    ]),
  }, 200);
});

finance.delete('/categories', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const kind = String(payload.kind ?? '').trim().toLowerCase();
  if (kind !== 'income' && kind !== 'expense') return badRequest('kind muss income oder expense sein');

  const category = normalizeCategoryValue(payload.category);
  if (!category) return badRequest('Kategorie ist ein Pflichtfeld');

  const presetSet = kind === 'income' ? PRESET_INCOME_CATEGORY_KEYS : PRESET_EXPENSE_CATEGORY_KEYS;
  if (presetSet.has(category.toLowerCase())) return badRequest('Standardkategorien können nicht gelöscht werden');

  const fallbackCategory = normalizeCategoryValue(payload.replace_with ?? 'other');
  if (!fallbackCategory) return badRequest('replace_with ist ungültig');

  const accounts = await getUserBankAccounts(auth.db, auth.user.id);
  const accountIds = accounts.map((a: { id: string }) => Number(a.id));

  const tableName = kind === 'income' ? 'income' : 'private_expenses';
  let updatedCount = 0;
  if (accountIds.length) {
    const { count } = await auth.db
      .from(tableName)
      .update({ category: fallbackCategory, updated_at: new Date().toISOString() })
      .in('bank_account_id', accountIds)
      .ilike('category', category)
      .select('id');
    updatedCount = count ?? 0;
  }

  await auth.db.from('user_categories')
    .delete()
    .eq('user_id', auth.user.id)
    .eq('kind', kind)
    .eq('key', categoryKey(category));

  if (!presetSet.has(fallbackCategory.toLowerCase())) {
    await rememberUserCategory(auth.db, auth.user.id, kind as 'income' | 'expense', fallbackCategory);
  }

  return jsonResponse({
    ok: true,
    message: 'Kategorie gelöscht',
    kind,
    deleted_category: category,
    replaced_with: fallbackCategory,
    updated_entries: updatedCount,
  }, 200);
});

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

finance.get('/expenses', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const userAccounts = await ensureUserFinanceRoots(auth.db, auth.user.id);
  const allAccountIds = userAccounts.map((a: { id: string }) => Number(a.id));
  const sp = new URL(c.req.url).searchParams;
  const filter = resolveRequestedBankAccountFilter(sp, allAccountIds);
  if (!filter.ok) return jsonResponse({ ok: false, message: filter.message }, filter.status ?? 400);

  const { cursor, limit } = parsePaginationCursor(sp.get('cursor'), sp.get('limit'), { defaultLimit: 200, maxLimit: 200 });

  let query = auth.db
    .from('private_expenses')
    .select('*')
    .in('bank_account_id', filter.accountIds)
    .order('spent_at', { ascending: false, nullsFirst: false })
    .order('pay_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cursor) query = query.lt('id', cursor.id);

  const { data: entries } = await query;

  const nextCursor = entries && entries.length === limit
    ? String(entries[entries.length - 1].id)
    : null;

  return jsonResponse({
    ok: true,
    entries: (entries ?? []).map((e: Record<string, unknown>) => serializeExpenseEntry(e, auth.user.id)),
    next_cursor: nextCursor,
  }, 200);
});

finance.post('/expenses', async (c) => {
  const request = c.req.raw;

  const rl = checkRateLimit(request, { maxAttempts: 60, windowMs: 60_000, group: 'finance-write' });
  if (rl) return rl;

  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(request);
  if (csrf) return csrf;

  const userAccounts = await ensureUserFinanceRoots(auth.db, auth.user.id);
  const accountIds = userAccounts.map((a: { id: string }) => Number(a.id));

  const payload = await parseBody<Record<string, unknown>>(request);
  const source = String(payload.source ?? '').trim();
  const category = normalizeCategoryValue(payload.category);
  const note = String(payload.note ?? '').trim();
  const amount = Number(payload.amount);
  const spentAt = payload.spent_at ? new Date(String(payload.spent_at)) : new Date();
  const cycle = normalizeCycle(payload.cycle ?? 'once');
  const recurrence = parseRecurrence(payload.recurrence);
  const isActive = parseBoolean(payload.is_active, true);

  if (!source) return badRequest('Quelle ist ein Pflichtfeld');
  if (!category) return badRequest('Kategorie ist ein Pflichtfeld');
  if (!Number.isFinite(amount) || amount <= 0) return badRequest('Betrag muss größer 0 sein');
  if (Number.isNaN(spentAt.getTime())) return badRequest('Datum ist ungültig');
  if (!cycle) return badRequest('Zyklus muss once, weekly, monthly oder yearly sein');
  if (recurrence === undefined) return badRequest('Wiederholung muss eine positive Ganzzahl oder leer sein');

  await rememberUserCategory(auth.db, auth.user.id, 'expense', category);

  const selectedId = payload.bank_account_id ? Number(payload.bank_account_id) : null;
  const bankAccountId = selectedId && accountIds.includes(selectedId) ? selectedId : (accountIds[0] ?? 0);
  const { effectiveRecurrence, effectiveIsActive, effectiveState } = resolveEntryState(cycle, recurrence, isActive);

  const dateErr = await assertDateAfterAccountOpening(auth.db, bankAccountId, spentAt);
  if (dateErr) return badRequest(dateErr);

  const { data: inserted } = await auth.db.from('private_expenses').insert({
    bank_account_id: bankAccountId,
    source, category, amount,
    spent_at: spentAt.toISOString(),
    due_date: spentAt.toISOString(),
    pay_date: spentAt.toISOString(),
    info: source || note || null,
    state: effectiveState,
    note,
    recurrence: effectiveRecurrence, cycle, is_active: effectiveIsActive,
  }).select('*').single();

  await incrementBankAccountBalance(auth.db, bankAccountId, -amount);

  return jsonResponse({ ok: true, entry: serializeExpenseEntry(inserted as Record<string, unknown>, auth.user.id) }, 201);
});

finance.patch('/expenses/:id', async (c) => {
  const entryIdRaw = c.req.param('id');
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const entryId = Number(entryIdRaw);
  if (!Number.isFinite(entryId) || entryId <= 0) return badRequest('entry_id ist ungültig');

  const accounts = await getUserBankAccounts(auth.db, auth.user.id);
  const accountIds = accounts.map((a: { id: string }) => Number(a.id));
  if (accountIds.length === 0) return notFound('Eintrag wurde nicht gefunden');

  const { data: existing } = await auth.db
    .from('private_expenses')
    .select('id, amount, bank_account_id, transfer_id')
    .eq('id', entryId)
    .in('bank_account_id', accountIds)
    .single();

  if (!existing) return notFound('Eintrag wurde nicht gefunden');
  if (existing.transfer_id != null) return badRequest('Überweisungen können nicht bearbeitet oder gelöscht werden');

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const source = String(payload.source ?? '').trim();
  const category = normalizeCategoryValue(payload.category);
  const note = String(payload.note ?? '').trim();
  const amount = Number(payload.amount);
  const spentAt = payload.spent_at ? new Date(String(payload.spent_at)) : null;
  const cycle = normalizeCycle(payload.cycle ?? 'once');
  const recurrence = parseRecurrence(payload.recurrence);
  const isActive = parseBoolean(payload.is_active, true);
  const requestedBankAccountId = payload.bank_account_id ? Number(payload.bank_account_id) : null;

  if (!source) return badRequest('Quelle ist ein Pflichtfeld');
  if (!category) return badRequest('Kategorie ist ein Pflichtfeld');
  if (!Number.isFinite(amount) || amount <= 0) return badRequest('Betrag muss größer 0 sein');
  if (!spentAt || Number.isNaN(spentAt.getTime())) return badRequest('Datum ist ungültig');
  if (!cycle) return badRequest('Zyklus muss once, weekly, monthly oder yearly sein');
  if (recurrence === undefined) return badRequest('Wiederholung muss eine positive Ganzzahl oder leer sein');

  await rememberUserCategory(auth.db, auth.user.id, 'expense', category);
  const nextAccountId = requestedBankAccountId && accountIds.includes(requestedBankAccountId)
    ? requestedBankAccountId
    : Number(existing.bank_account_id);
  const { effectiveRecurrence, effectiveIsActive, effectiveState } = resolveEntryState(cycle, recurrence, isActive);

  const dateErr = await assertDateAfterAccountOpening(auth.db, nextAccountId, spentAt);
  if (dateErr) return badRequest(dateErr);

  const { data: updated } = await auth.db.from('private_expenses').update({
    bank_account_id: nextAccountId,
    source, category, note, amount,
    spent_at: spentAt.toISOString(), due_date: spentAt.toISOString(), pay_date: spentAt.toISOString(),
    info: source || note || null, state: effectiveState,
    recurrence: effectiveRecurrence, cycle, is_active: effectiveIsActive,
    updated_at: new Date().toISOString(),
  }).eq('id', entryId).select('*').single();

  if (!updated) return notFound('Eintrag wurde nicht gefunden');

  const prev = toFixedAmount(existing.amount);
  const next = Number(amount.toFixed(2));
  if (Number(existing.bank_account_id) === nextAccountId) {
    await incrementBankAccountBalance(auth.db, nextAccountId, prev - next);
  } else {
    await incrementBankAccountBalance(auth.db, Number(existing.bank_account_id), prev);
    await incrementBankAccountBalance(auth.db, nextAccountId, -next);
  }

  return jsonResponse({ ok: true, entry: serializeExpenseEntry(updated as Record<string, unknown>, auth.user.id) }, 200);
});

finance.delete('/expenses/:id', async (c) => {
  const entryIdRaw = c.req.param('id');
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const entryId = Number(entryIdRaw);
  if (!Number.isFinite(entryId) || entryId <= 0) return badRequest('entry_id ist ungültig');

  const accounts = await getUserBankAccounts(auth.db, auth.user.id);
  const accountIds = accounts.map((a: { id: string }) => Number(a.id));
  if (accountIds.length === 0) return notFound('Eintrag wurde nicht gefunden');

  const { data: existing } = await auth.db
    .from('private_expenses')
    .select('id, amount, bank_account_id, transfer_id, is_active')
    .eq('id', entryId)
    .in('bank_account_id', accountIds)
    .single();

  if (!existing) return notFound('Eintrag wurde nicht gefunden');
  if (existing.transfer_id != null) return badRequest('Überweisungen können nicht bearbeitet oder gelöscht werden');

  // See income DELETE: if a check-constraint trigger blocks hard DELETE, fall back to
  // a soft delete so the entry vanishes from every user-facing view.
  const wasActive = (existing as { is_active?: boolean }).is_active !== false;

  const { error: deleteError } = await auth.db.from('private_expenses').delete().eq('id', entryId);
  if (deleteError) {
    console.error('[finance.delete /expenses/:id] hard delete failed, falling back to soft delete:', deleteError);
    const { error: softError } = await auth.db
      .from('private_expenses')
      .update({ is_active: false, state: 'completed' })
      .eq('id', entryId);
    if (softError) {
      console.error('[finance.delete /expenses/:id] soft delete also failed:', softError);
      return jsonResponse({ ok: false, message: `Eintrag konnte nicht gelöscht werden: ${softError.message ?? 'unbekannt'}` }, 500);
    }
  }

  if (wasActive) {
    await incrementBankAccountBalance(auth.db, Number(existing.bank_account_id), toFixedAmount(existing.amount));
  }

  return jsonResponse({ ok: true, message: 'Eintrag gelöscht' }, 200);
});

// ---------------------------------------------------------------------------
// Income
// ---------------------------------------------------------------------------

finance.get('/income', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const userAccounts = await ensureUserFinanceRoots(auth.db, auth.user.id);
  const allAccountIds = userAccounts.map((a: { id: string }) => Number(a.id));
  const sp = new URL(c.req.url).searchParams;
  const filter = resolveRequestedBankAccountFilter(sp, allAccountIds);
  if (!filter.ok) return jsonResponse({ ok: false, message: filter.message }, filter.status ?? 400);

  const { cursor, limit } = parsePaginationCursor(sp.get('cursor'), sp.get('limit'), { defaultLimit: 200, maxLimit: 200 });

  let query = auth.db
    .from('income')
    .select('*')
    .in('bank_account_id', filter.accountIds)
    .order('received_at', { ascending: false, nullsFirst: false })
    .order('pay_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cursor) query = query.lt('id', cursor.id);

  const { data: entries } = await query;

  const nextCursor = entries && entries.length === limit
    ? String(entries[entries.length - 1].id)
    : null;

  return jsonResponse({
    ok: true,
    entries: (entries ?? []).map((e: Record<string, unknown>) => serializeIncomeEntry(e, auth.user.id)),
    next_cursor: nextCursor,
  }, 200);
});

finance.post('/income', async (c) => {
  const request = c.req.raw;

  const rl = checkRateLimit(request, { maxAttempts: 60, windowMs: 60_000, group: 'finance-write' });
  if (rl) return rl;

  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(request);
  if (csrf) return csrf;

  const userAccounts = await ensureUserFinanceRoots(auth.db, auth.user.id);
  const accountIds = userAccounts.map((a: { id: string }) => Number(a.id));

  const payload = await parseBody<Record<string, unknown>>(request);
  const source = String(payload.source ?? '').trim();
  const category = normalizeCategoryValue(payload.category);
  const note = String(payload.note ?? '').trim();
  const amount = Number(payload.amount);
  const receivedAt = payload.received_at ? new Date(String(payload.received_at)) : new Date();
  const cycle = normalizeCycle(payload.cycle ?? 'once');
  const recurrence = parseRecurrence(payload.recurrence);
  const isActive = parseBoolean(payload.is_active, true);

  if (!source) return badRequest('Quelle ist ein Pflichtfeld');
  if (!category) return badRequest('Kategorie ist ein Pflichtfeld');
  if (!Number.isFinite(amount) || amount <= 0) return badRequest('Betrag muss größer 0 sein');
  if (Number.isNaN(receivedAt.getTime())) return badRequest('Datum ist ungültig');
  if (!cycle) return badRequest('Zyklus muss once, weekly, monthly oder yearly sein');
  if (recurrence === undefined) return badRequest('Wiederholung muss eine positive Ganzzahl oder leer sein');

  await rememberUserCategory(auth.db, auth.user.id, 'income', category);

  const selectedId = payload.bank_account_id ? Number(payload.bank_account_id) : null;
  const bankAccountId = selectedId && accountIds.includes(selectedId) ? selectedId : (accountIds[0] ?? 0);
  const { effectiveRecurrence, effectiveIsActive, effectiveState } = resolveEntryState(cycle, recurrence, isActive);

  const dateErr = await assertDateAfterAccountOpening(auth.db, bankAccountId, receivedAt);
  if (dateErr) return badRequest(dateErr);

  const { data: inserted } = await auth.db.from('income').insert({
    bank_account_id: bankAccountId,
    source, category, amount,
    received_at: receivedAt.toISOString(),
    pay_date: receivedAt.toISOString(),
    note,
    info: source || note || null,
    recurrence: effectiveRecurrence,
    cycle,
    is_active: effectiveIsActive,
    state: effectiveState,
  }).select('*').single();

  await incrementBankAccountBalance(auth.db, bankAccountId, amount);

  return jsonResponse({ ok: true, entry: serializeIncomeEntry(inserted as Record<string, unknown>, auth.user.id) }, 201);
});

finance.patch('/income/:id', async (c) => {
  const entryIdRaw = c.req.param('id');
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const entryId = Number(entryIdRaw);
  if (!Number.isFinite(entryId) || entryId <= 0) return badRequest('entry_id ist ungültig');

  const accounts = await getUserBankAccounts(auth.db, auth.user.id);
  const accountIds = accounts.map((a: { id: string }) => Number(a.id));
  if (accountIds.length === 0) return notFound('Eintrag wurde nicht gefunden');

  const { data: existing } = await auth.db
    .from('income')
    .select('id, amount, bank_account_id, transfer_id')
    .eq('id', entryId)
    .in('bank_account_id', accountIds)
    .single();

  if (!existing) return notFound('Eintrag wurde nicht gefunden');
  if (existing.transfer_id != null) return badRequest('Überweisungen können nicht bearbeitet oder gelöscht werden');

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const source = String(payload.source ?? '').trim();
  const category = normalizeCategoryValue(payload.category);
  const note = String(payload.note ?? '').trim();
  const amount = Number(payload.amount);
  const receivedAt = payload.received_at ? new Date(String(payload.received_at)) : null;
  const cycle = normalizeCycle(payload.cycle ?? 'once');
  const recurrence = parseRecurrence(payload.recurrence);
  const isActive = parseBoolean(payload.is_active, true);
  const requestedBankAccountId = payload.bank_account_id ? Number(payload.bank_account_id) : null;

  if (!source) return badRequest('Quelle ist ein Pflichtfeld');
  if (!category) return badRequest('Kategorie ist ein Pflichtfeld');
  if (!Number.isFinite(amount) || amount <= 0) return badRequest('Betrag muss größer 0 sein');
  if (!receivedAt || Number.isNaN(receivedAt.getTime())) return badRequest('Datum ist ungültig');
  if (!cycle) return badRequest('Zyklus muss once, weekly, monthly oder yearly sein');
  if (recurrence === undefined) return badRequest('Wiederholung muss eine positive Ganzzahl oder leer sein');

  await rememberUserCategory(auth.db, auth.user.id, 'income', category);
  const nextAccountId = requestedBankAccountId && accountIds.includes(requestedBankAccountId)
    ? requestedBankAccountId
    : Number(existing.bank_account_id);
  const { effectiveRecurrence, effectiveIsActive, effectiveState } = resolveEntryState(cycle, recurrence, isActive);

  const dateErr = await assertDateAfterAccountOpening(auth.db, nextAccountId, receivedAt);
  if (dateErr) return badRequest(dateErr);

  const { data: updated } = await auth.db.from('income').update({
    bank_account_id: nextAccountId,
    source, category, note,
    amount, received_at: receivedAt.toISOString(), pay_date: receivedAt.toISOString(),
    info: source || note || null,
    recurrence: effectiveRecurrence, cycle, state: effectiveState, is_active: effectiveIsActive,
    updated_at: new Date().toISOString(),
  }).eq('id', entryId).select('*').single();

  if (!updated) return notFound('Eintrag wurde nicht gefunden');

  const prev = toFixedAmount(existing.amount);
  const next = Number(amount.toFixed(2));
  if (Number(existing.bank_account_id) === nextAccountId) {
    await incrementBankAccountBalance(auth.db, nextAccountId, next - prev);
  } else {
    await incrementBankAccountBalance(auth.db, Number(existing.bank_account_id), -prev);
    await incrementBankAccountBalance(auth.db, nextAccountId, next);
  }

  return jsonResponse({ ok: true, entry: serializeIncomeEntry(updated as Record<string, unknown>, auth.user.id) }, 200);
});

finance.delete('/income/:id', async (c) => {
  const entryIdRaw = c.req.param('id');
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const entryId = Number(entryIdRaw);
  if (!Number.isFinite(entryId) || entryId <= 0) return badRequest('entry_id ist ungültig');

  const accounts = await getUserBankAccounts(auth.db, auth.user.id);
  const accountIds = accounts.map((a: { id: string }) => Number(a.id));
  if (accountIds.length === 0) return notFound('Eintrag wurde nicht gefunden');

  const { data: existing } = await auth.db
    .from('income')
    .select('id, amount, bank_account_id, transfer_id, is_active')
    .eq('id', entryId)
    .in('bank_account_id', accountIds)
    .single();

  if (!existing) return notFound('Eintrag wurde nicht gefunden');
  if (existing.transfer_id != null) return badRequest('Überweisungen können nicht bearbeitet oder gelöscht werden');

  // Some Supabase setups install a check constraint trigger on a parent `transactions` log
  // that prevents hard DELETE (constraint `transactions_has_source` fires on the synthetic
  // delete-row). When the hard delete is blocked, fall back to a soft-delete (state:
  // 'completed', is_active: false) so the entry vanishes from every user-facing view while
  // the audit trail in `transactions` stays intact.
  const wasActive = (existing as { is_active?: boolean }).is_active !== false;

  const { error: deleteError } = await auth.db.from('income').delete().eq('id', entryId);
  if (deleteError) {
    console.error('[finance.delete /income/:id] hard delete failed, falling back to soft delete:', deleteError);
    const { error: softError } = await auth.db
      .from('income')
      .update({ is_active: false, state: 'completed' })
      .eq('id', entryId);
    if (softError) {
      console.error('[finance.delete /income/:id] soft delete also failed:', softError);
      return jsonResponse({ ok: false, message: `Eintrag konnte nicht gelöscht werden: ${softError.message ?? 'unbekannt'}` }, 500);
    }
  }

  // Reverse the balance impact only if the entry was still "active" — otherwise its
  // amount was already removed from the balance by a previous soft delete.
  if (wasActive) {
    await incrementBankAccountBalance(auth.db, Number(existing.bank_account_id), -toFixedAmount(existing.amount));
  }

  return jsonResponse({ ok: true, message: 'Eintrag gelöscht' }, 200);
});

// ---------------------------------------------------------------------------
// Transfers between bank accounts
// ---------------------------------------------------------------------------

// POST /api/finance/transfers — { from_account_id, to_account_id, amount, date?, label? }
// Records the transfer as a paired expense (source side) and income (target side), both
// with category 'transfer', so the two account balances move atomically.
finance.post('/transfers', async (c) => {
  const request = c.req.raw;

  const rl = checkRateLimit(request, { maxAttempts: 60, windowMs: 60_000, group: 'finance-write' });
  if (rl) return rl;

  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(request);
  if (csrf) return csrf;

  const userAccounts = await ensureUserFinanceRoots(auth.db, auth.user.id);
  const accountIds = userAccounts.map((a: { id: string }) => Number(a.id));
  const accountById = new Map<number, { id: string; label: string }>();
  for (const a of userAccounts as { id: string; label: string }[]) {
    accountById.set(Number(a.id), a);
  }

  const payload = await parseBody<Record<string, unknown>>(request);
  const fromId = Number(payload.from_account_id);
  const toId = Number(payload.to_account_id);
  const amount = toFixedAmount(payload.amount);
  const dateRaw = payload.date ? new Date(String(payload.date)) : new Date();
  const userLabel = String(payload.label ?? '').trim();

  if (!Number.isFinite(fromId) || !accountIds.includes(fromId)) return badRequest('Quellkonto ist ungültig');
  if (!Number.isFinite(toId) || !accountIds.includes(toId)) return badRequest('Zielkonto ist ungültig');
  if (fromId === toId) return badRequest('Quell- und Zielkonto müssen unterschiedlich sein');
  if (!Number.isFinite(amount) || amount <= 0) return badRequest('Betrag muss größer 0 sein');
  if (Number.isNaN(dateRaw.getTime())) return badRequest('Datum ist ungültig');

  const fromDateErr = await assertDateAfterAccountOpening(auth.db, fromId, dateRaw);
  if (fromDateErr) return badRequest(fromDateErr);
  const toDateErr = await assertDateAfterAccountOpening(auth.db, toId, dateRaw);
  if (toDateErr) return badRequest(toDateErr);

  const fromAccount = accountById.get(fromId)!;
  const toAccount = accountById.get(toId)!;

  const expenseSource = userLabel || `Transfer an ${toAccount.label}`;
  const incomeSource = userLabel || `Transfer von ${fromAccount.label}`;
  const dateIso = dateRaw.toISOString();

  const { data: expenseRow, error: expenseError } = await auth.db.from('private_expenses').insert({
    bank_account_id: fromId,
    source: expenseSource,
    category: 'transfer',
    amount,
    spent_at: dateIso,
    due_date: dateIso,
    pay_date: dateIso,
    info: expenseSource,
    state: 'open',
    note: '',
    recurrence: null,
    cycle: 'once',
    is_active: true,
  }).select('*').single();
  if (expenseError || !expenseRow) {
    console.error('[finance.post /transfers] expense insert failed:', expenseError);
    return jsonResponse({ ok: false, message: `Überweisung fehlgeschlagen: ${expenseError?.message ?? 'unbekannt'}` }, 500);
  }

  const { data: incomeRow, error: incomeError } = await auth.db.from('income').insert({
    bank_account_id: toId,
    source: incomeSource,
    category: 'transfer',
    amount,
    received_at: dateIso,
    pay_date: dateIso,
    info: incomeSource,
    note: '',
    recurrence: null,
    cycle: 'once',
    is_active: true,
    state: 'open',
  }).select('*').single();
  if (incomeError || !incomeRow) {
    console.error('[finance.post /transfers] income insert failed, rolling back expense:', incomeError);
    // Best-effort rollback: try hard delete, fall back to soft delete on constraint failure.
    const { error: rollbackError } = await auth.db
      .from('private_expenses')
      .delete()
      .eq('id', (expenseRow as { id: number }).id);
    if (rollbackError) {
      await auth.db
        .from('private_expenses')
        .update({ is_active: false, state: 'completed' })
        .eq('id', (expenseRow as { id: number }).id);
    }
    return jsonResponse({ ok: false, message: `Überweisung fehlgeschlagen: ${incomeError?.message ?? 'unbekannt'}` }, 500);
  }

  try {
    await transferBetweenAccounts(auth.db, fromId, toId, amount);
  } catch (transferErr) {
    console.error('[finance.post /transfers] atomic balance transfer failed, rolling back ledger rows:', transferErr);
    await auth.db.from('income').delete().eq('id', (incomeRow as { id: number }).id);
    await auth.db.from('private_expenses').delete().eq('id', (expenseRow as { id: number }).id);
    return jsonResponse({ ok: false, message: `Überweisung fehlgeschlagen: ${(transferErr as Error).message}` }, 500);
  }

  await rememberUserCategory(auth.db, auth.user.id, 'expense', 'transfer');
  await rememberUserCategory(auth.db, auth.user.id, 'income', 'transfer');

  return jsonResponse({
    ok: true,
    expense: serializeExpenseEntry(expenseRow as Record<string, unknown>, auth.user.id),
    income: serializeIncomeEntry(incomeRow as Record<string, unknown>, auth.user.id),
  }, 201);
});

// ---------------------------------------------------------------------------
// Transactions (combined income + expenses)
// ---------------------------------------------------------------------------

finance.get('/transactions', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const userId = auth.user.id;

  const userAccounts = await ensureUserFinanceRoots(auth.db, userId);
  const allAccountIds = userAccounts.map((a: { id: string }) => Number(a.id));
  const sp = new URL(c.req.url).searchParams;
  const filter = resolveRequestedBankAccountFilter(sp, allAccountIds);
  if (!filter.ok) return jsonResponse({ ok: false, message: filter.message }, filter.status ?? 400);

  const { cursor, limit } = parsePaginationCursor(sp.get('cursor'), sp.get('limit'), {
    defaultLimit: 50,
    maxLimit: 2000,
    format: 'composite',
  });
  const categoryRaw = (sp.get('category') ?? '').trim();
  const cursorTs = cursor?.ord ?? null;
  const cursorId = cursor?.id ?? null;

  const incomeQuery = auth.db
    .from('income')
    .select('*, "received_at", "pay_date"')
    .in('bank_account_id', filter.accountIds);
  if (categoryRaw) incomeQuery.ilike('category', categoryRaw);

  const expenseQuery = auth.db
    .from('private_expenses')
    .select('*, "spent_at", "pay_date", "due_date"')
    .in('bank_account_id', filter.accountIds);
  if (categoryRaw) expenseQuery.ilike('category', categoryRaw);

  const [{ data: incomeRows }, { data: expenseRows }] = await Promise.all([incomeQuery, expenseQuery]);

  type Row = Record<string, unknown> & { _sortAt?: number; _id?: number; _type?: string };

  // Hide soft-deleted entries from all user-facing dashboard views.
  const isSoftDeleted = (r: Record<string, unknown>) =>
    r.is_active === false && r.state === 'completed';

  const allEntries: Row[] = [
    ...(incomeRows ?? []).filter((r: Record<string, unknown>) => !isSoftDeleted(r)).map((r: Record<string, unknown>) => ({
      ...r,
      _type: 'income',
      _sortAt: new Date(String(r.received_at ?? r.pay_date ?? r.created_at ?? 0)).getTime(),
      _id: Number(r.id),
    })),
    ...(expenseRows ?? []).filter((r: Record<string, unknown>) => !isSoftDeleted(r)).map((r: Record<string, unknown>) => ({
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

finance.route('/', bankAccountHistoryRoutes);

export default finance;
