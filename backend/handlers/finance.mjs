// @ts-check
import {
  LOGO_DEV_API_KEY,
  LOGO_DEV_BASE_URL,
  PRESET_EXPENSE_CATEGORY_KEYS,
  PRESET_INCOME_CATEGORY_KEYS,
  STOCK_API_KEY,
  STOCK_SEARCH_BASE_URL,
  STOCK_SEARCH_DEFAULT_EXCHANGE,
  TWELVE_DATA_API_KEY,
  TWELVE_DATA_BASE_URL
} from "../config/runtime.mjs";
import {
  categoryKey,
  normalizeCategoryValue,
  normalizeCycle,
  parseBoolean,
  parseId,
  parsePositiveAmount,
  parseRecurrence,
  toFixedAmount,
  toNumber,
  uniqueCategoryList
} from "../utils/data.mjs";
import { jsonResponse, parseBody } from "../utils/http.mjs";
import { checkRateLimit } from "../utils/rate-limit.mjs";
import { badRequest, unauthorized, notFound } from "../helpers/responses.mjs";
import { serializeIncomeEntry, serializeExpenseEntry } from "../helpers/serializers.mjs";
import {
  listUserShareAccounts,
  ensureUserFinanceRoots,
  listUserBankAccounts,
  incrementBankAccountBalance,
  deleteBankAccountAssociations,
  rememberUserCategory,
  resolveRequestedBankAccountFilter,
  resolveEntryState
} from "../helpers/finance-db.mjs";

const LOGO_CACHE_TTL = 6 * 60 * 60 * 1000;
const LOGO_NEGATIVE_TTL = 30 * 60 * 1000;
const LOGO_CACHE_MAX = 500;
const DOMAIN_CACHE_TTL = 24 * 60 * 60 * 1000;
const DOMAIN_CACHE_MAX = 2000;
const logoCache = new Map();
const domainCache = new Map();

function logoCacheGet(key) {
  const entry = logoCache.get(key);
  if (!entry) return null;
  const ttl = entry.notFound ? LOGO_NEGATIVE_TTL : LOGO_CACHE_TTL;
  if (Date.now() - entry.cachedAt > ttl) { logoCache.delete(key); return null; }
  return entry;
}

function logoCacheSet(key, value) {
  if (logoCache.size >= LOGO_CACHE_MAX) { logoCache.delete(logoCache.keys().next().value); }
  logoCache.set(key, { ...(/** @type {object} */ (value)), cachedAt: Date.now() });
}

function domainCacheGet(key) {
  const entry = domainCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > DOMAIN_CACHE_TTL) { domainCache.delete(key); return undefined; }
  return entry.domain;
}

function domainCacheSet(key, domain) {
  if (domainCache.size >= DOMAIN_CACHE_MAX) { domainCache.delete(domainCache.keys().next().value); }
  domainCache.set(key, { domain, cachedAt: Date.now() });
}

function normalizeExchangeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function extractHostnameCandidate(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return new URL(value).hostname.toLowerCase();
    const cleaned = value.replace(/^www\./i, "");
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cleaned)) return "";
    return cleaned.toLowerCase();
  } catch { return ""; }
}

function resolveLogoDomainFromSearchRows(rows, symbolHint = "") {
  const normalizedSymbol = String(symbolHint || "").trim().toUpperCase();
  const candidates = Array.isArray(rows) ? rows : [];
  const exact = candidates.find((row) => String(row?.symbol || "").trim().toUpperCase() === normalizedSymbol) || candidates[0];
  if (!exact) return "";
  for (const field of [exact?.domain, exact?.website, exact?.url, exact?.homepage, exact?.site, exact?.company_url]) {
    const hostname = extractHostnameCandidate(field);
    if (hostname) return hostname;
  }
  return "";
}

async function resolveLogoDomainBySymbol(symbol, exchange) {
  if (!STOCK_SEARCH_BASE_URL || !STOCK_API_KEY) return "";
  const sSymbol = String(symbol || "").trim().toUpperCase();
  if (!sSymbol) return "";
  const sExchange = String(exchange || STOCK_SEARCH_DEFAULT_EXCHANGE).trim().toUpperCase() || STOCK_SEARCH_DEFAULT_EXCHANGE;
  const cacheKey = `${sSymbol}:${sExchange}`;
  const cached = domainCacheGet(cacheKey);
  if (cached !== undefined) return cached;
  const upstreamUrl = new URL("/search", STOCK_SEARCH_BASE_URL);
  upstreamUrl.searchParams.set("q", sSymbol);
  upstreamUrl.searchParams.set("exchange", sExchange);
  const upstreamResponse = await fetch(upstreamUrl.toString(), { headers: { Accept: "application/json", "x-api-key": STOCK_API_KEY } });
  const payload = await upstreamResponse.json().catch(() => null);
  if (!upstreamResponse.ok || !Array.isArray(payload)) { domainCacheSet(cacheKey, ""); return ""; }
  const domain = resolveLogoDomainFromSearchRows(payload, sSymbol);
  domainCacheSet(cacheKey, domain);
  return domain;
}

/** @param {Pool} pool */
export function createFinanceHandlers(pool) {

  /**
   * @param {Request} request
   * @param {{ user: { id: string } }} session
   */
  async function handleTransactions(request, session) {
    const userId = parseId(session.user.id);
    if (!userId) return unauthorized("Session user invalid");
    const userAccounts = await ensureUserFinanceRoots(pool, userId);
    const accountIds = userAccounts.map((a) => a.id);

    if (request.method !== "GET") return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "GET" });

    const requestUrl = new URL(request.url);
    const filterResult = resolveRequestedBankAccountFilter(requestUrl, accountIds);
    if (!filterResult.ok) return jsonResponse({ ok: false, message: filterResult.message }, filterResult.status);

    const limitRaw = Number(requestUrl.searchParams.get("limit"));
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
    const cursorRaw = String(requestUrl.searchParams.get("cursor") || "").trim();
    const categoryRaw = String(requestUrl.searchParams.get("category") || "").trim();
    const category = normalizeCategoryValue(categoryRaw);

    let cursorSortAt = null;
    let cursorId = null;
    if (cursorRaw) {
      const m = cursorRaw.match(/^(\d+)[_:](\d+)$/);
      if (m) {
        const ts = Number(m[1]);
        const idParsed = parseId(m[2]);
        const d = new Date(ts);
        if (Number.isFinite(ts) && idParsed && !Number.isNaN(d.getTime())) { cursorSortAt = d; cursorId = idParsed; }
      }
    }

    const params = [];
    let p = 1;
    const pAccounts = p++; params.push(filterResult.accountIds);
    let pCategory = 0;
    if (category) { pCategory = p++; params.push(category); }

    const unionSql = `
      SELECT id, bank_account_id, source, category, amount, cycle, recurrence, is_active, note, state, created_at, updated_at,
             COALESCE(received_at, pay_date, created_at) AS sort_at, 'income'::text AS type,
             received_at, pay_date, NULL::timestamp AS spent_at, NULL::timestamp AS due_date
        FROM income WHERE bank_account_id = ANY($${pAccounts})${pCategory ? ` AND LOWER(category) = LOWER($${pCategory})` : ""}
      UNION ALL
      SELECT id, bank_account_id, source, category, amount, cycle, recurrence, is_active, note, state, created_at, updated_at,
             COALESCE(spent_at, pay_date, due_date, created_at) AS sort_at, 'expense'::text AS type,
             NULL::timestamp AS received_at, pay_date, spent_at, due_date
        FROM private_expenses WHERE bank_account_id = ANY($${pAccounts})${pCategory ? ` AND LOWER(category) = LOWER($${pCategory})` : ""}
    `;

    let whereCursor = "";
    if (cursorSortAt && cursorId) {
      const pSort = p++; params.push(cursorSortAt);
      const pId = p++; params.push(cursorId);
      whereCursor = ` WHERE (sort_at, id) < ($${pSort}, $${pId})`;
    }

    const pLimit = p; params.push(limit);
    const query = `SELECT * FROM (${unionSql}) AS t${whereCursor} ORDER BY sort_at DESC NULLS LAST, id DESC LIMIT $${pLimit}`;
    const { rows } = await pool.query(query, params);

    const entries = rows.map((row) => row.type === "income"
      ? { type: "income", ...serializeIncomeEntry(row, userId) }
      : { type: "expense", ...serializeExpenseEntry(row, userId) }
    );

    let nextCursor = null;
    if (rows.length === limit) {
      const last = rows[rows.length - 1];
      const ts = last.sort_at instanceof Date ? last.sort_at.getTime() : Date.parse(String(last.sort_at || ""));
      if (Number.isFinite(ts)) nextCursor = `${ts}_${last.id}`;
    }

    return jsonResponse({ ok: true, entries, next_cursor: nextCursor }, 200);
  }

  /**
   * @param {Request} request
   * @param {{ user: { id: string } }} session
   */
  async function handleCategories(request, session) {
    const userId = parseId(session.user.id);
    if (!userId) return unauthorized("Session user invalid");
    const userAccounts = await listUserBankAccounts(pool, userId);
    const accountIds = userAccounts.map((a) => a.id);

    if (request.method === "GET") {
      const [storedResult, incomeDistinct, expenseDistinct] = await Promise.all([
        pool.query(`SELECT kind, value FROM user_categories WHERE user_id = $1`, [userId]),
        accountIds.length ? pool.query(`SELECT DISTINCT category FROM income WHERE bank_account_id = ANY($1) AND category IS NOT NULL`, [accountIds]) : { rows: [] },
        accountIds.length ? pool.query(`SELECT DISTINCT category FROM private_expenses WHERE bank_account_id = ANY($1) AND category IS NOT NULL`, [accountIds]) : { rows: [] }
      ]);
      const incomeValues = [];
      const expenseValues = [];
      for (const entry of storedResult.rows) {
        if (entry.kind === "income") incomeValues.push(entry.value);
        if (entry.kind === "expense") expenseValues.push(entry.value);
      }
      return jsonResponse({
        ok: true,
        income: uniqueCategoryList(incomeValues.concat(incomeDistinct.rows.map((r) => r.category))),
        expense: uniqueCategoryList(expenseValues.concat(expenseDistinct.rows.map((r) => r.category)))
      }, 200);
    }

    if (request.method !== "DELETE") return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "GET, DELETE" });

    const payload = await parseBody(request);
    if (!payload) return badRequest("Invalid JSON body");

    const kind = String(payload.kind || "").trim().toLowerCase();
    if (kind !== "income" && kind !== "expense") return badRequest("kind muss income oder expense sein");

    const category = normalizeCategoryValue(payload.category);
    if (!category) return badRequest("Kategorie ist ein Pflichtfeld");

    const presetSet = kind === "income" ? PRESET_INCOME_CATEGORY_KEYS : PRESET_EXPENSE_CATEGORY_KEYS;
    if (presetSet.has(category.toLowerCase())) return badRequest("Standardkategorien koennen nicht geloescht werden");

    const fallbackCategory = normalizeCategoryValue(payload.replace_with || "other");
    if (!fallbackCategory) return badRequest("replace_with ist ungueltig");

    const tableName = kind === "income" ? "income" : "private_expenses";
    let updateResult;
    if (accountIds.length) {
      updateResult = await pool.query(
        `UPDATE ${tableName} SET category = $1, updated_at = NOW() WHERE bank_account_id = ANY($2) AND LOWER(category) = LOWER($3)`,
        [fallbackCategory, accountIds, category]
      );
    } else {
      updateResult = { rowCount: 0 };
    }

    await pool.query(`DELETE FROM user_categories WHERE user_id = $1 AND kind = $2 AND key = $3`, [userId, kind, categoryKey(category)]);
    if (!presetSet.has(fallbackCategory.toLowerCase())) await rememberUserCategory(pool, userId, kind, fallbackCategory);

    return jsonResponse({ ok: true, message: "Kategorie geloescht", kind, deleted_category: category, replaced_with: fallbackCategory, updated_entries: updateResult.rowCount }, 200);
  }

  /**
   * @param {Request} request
   * @param {{ user: { id: string } }} session
   */
  async function handleIncomeEntries(request, session) {
    const userId = parseId(session.user.id);
    if (!userId) return unauthorized("Session user invalid");
    const userAccounts = await ensureUserFinanceRoots(pool, userId);
    const accountIds = userAccounts.map((a) => a.id);

    if (request.method === "GET") {
      const requestUrl = new URL(request.url);
      const filterResult = resolveRequestedBankAccountFilter(requestUrl, accountIds);
      if (!filterResult.ok) return jsonResponse({ ok: false, message: filterResult.message }, filterResult.status);
      const limitRaw = Number(requestUrl.searchParams.get("limit"));
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 200;
      const cursorId = parseId(requestUrl.searchParams.get("cursor"));
      let query; let params;
      if (cursorId) {
        query = `SELECT * FROM income WHERE bank_account_id = ANY($1) AND id < $2 ORDER BY id DESC LIMIT $3`;
        params = [filterResult.accountIds, cursorId, limit];
      } else {
        query = `SELECT * FROM income WHERE bank_account_id = ANY($1) ORDER BY received_at DESC NULLS LAST, pay_date DESC NULLS LAST, created_at DESC LIMIT $2`;
        params = [filterResult.accountIds, limit];
      }
      const { rows: entries } = await pool.query(query, params);
      const nextCursor = entries.length === limit ? String(entries[entries.length - 1].id) : null;
      return jsonResponse({ ok: true, entries: entries.map((e) => serializeIncomeEntry(e, userId)), next_cursor: nextCursor }, 200);
    }

    if (request.method !== "POST") return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "GET, POST" });

    const rl = checkRateLimit(request, { maxAttempts: 60, windowMs: 60_000, group: "finance-write" });
    if (rl) return rl;

    const payload = await parseBody(request);
    if (!payload) return badRequest("Invalid JSON body");

    const source = String(payload.source || "").trim();
    const category = normalizeCategoryValue(payload.category);
    const note = String(payload.note || "").trim();
    const amountNumber = Number(payload.amount);
    const receivedAt = payload.received_at ? new Date(/** @type {string} */ (payload.received_at)) : new Date();
    const cycle = normalizeCycle(payload.cycle);
    const recurrence = parseRecurrence(payload.recurrence);
    const isActive = parseBoolean(payload.is_active, true);

    if (!source) return badRequest("Quelle ist ein Pflichtfeld");
    if (!category) return badRequest("Kategorie ist ein Pflichtfeld");
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) return badRequest("Betrag muss groesser 0 sein");
    if (Number.isNaN(receivedAt.getTime())) return badRequest("Datum ist ungueltig");
    if (!cycle) return badRequest("Zyklus muss once, weekly, monthly oder yearly sein");
    if (recurrence === undefined) return badRequest("Wiederholung muss eine positive Ganzzahl oder leer (unbegrenzt) sein");

    await rememberUserCategory(pool, userId, "income", category);
    const selectedBankAccountId = parseId(payload.bank_account_id);
    const bankAccountId = selectedBankAccountId && accountIds.includes(selectedBankAccountId) ? selectedBankAccountId : accountIds[0];
    const { effectiveRecurrence, effectiveIsActive, effectiveState } = resolveEntryState(cycle, recurrence, isActive);

    const { rows } = await pool.query(
      `INSERT INTO income (bank_account_id, source, category, amount, received_at, pay_date, note, info, recurrence, cycle, is_active, state, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()) RETURNING *`,
      [bankAccountId, source, category, amountNumber, receivedAt, note, source || note || null, effectiveRecurrence, cycle, effectiveIsActive, effectiveState]
    );

    await incrementBankAccountBalance(pool, bankAccountId, amountNumber);
    return jsonResponse({ ok: true, entry: serializeIncomeEntry(rows[0], userId) }, 201);
  }

  /**
   * @param {Request} request
   * @param {string} entryIdRaw
   * @param {{ user: { id: string } }} session
   */
  async function handleIncomeEntryById(request, entryIdRaw, session) {
    const entryId = parseId(entryIdRaw);
    if (!entryId) return badRequest("entry_id ist ungueltig");
    const userId = parseId(session.user.id);
    if (!userId) return unauthorized("Session user invalid");
    const accountIds = (await listUserBankAccounts(pool, userId)).map((a) => a.id);
    if (accountIds.length === 0) return notFound("Eintrag wurde nicht gefunden");

    if (request.method === "DELETE") {
      const { rows: existing } = await pool.query(`SELECT id, amount, bank_account_id FROM income WHERE id = $1 AND bank_account_id = ANY($2)`, [entryId, accountIds]);
      if (existing.length === 0) return notFound("Eintrag wurde nicht gefunden");
      await pool.query(`DELETE FROM income WHERE id = $1`, [entryId]);
      await incrementBankAccountBalance(pool, existing[0].bank_account_id, -toFixedAmount(existing[0].amount));
      return jsonResponse({ ok: true, message: "Eintrag geloescht" }, 200);
    }

    if (request.method !== "PATCH") return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "PATCH, DELETE" });

    const payload = await parseBody(request);
    if (!payload) return badRequest("Invalid JSON body");

    const source = String(payload.source || "").trim();
    const category = normalizeCategoryValue(payload.category);
    const note = String(payload.note || "").trim();
    const amountNumber = Number(payload.amount);
    const receivedAt = payload.received_at ? new Date(/** @type {string} */ (payload.received_at)) : null;
    const cycle = normalizeCycle(payload.cycle);
    const recurrence = parseRecurrence(payload.recurrence);
    const isActive = parseBoolean(payload.is_active, true);
    const requestedBankAccountId = parseId(payload.bank_account_id);

    if (!source) return badRequest("Quelle ist ein Pflichtfeld");
    if (!category) return badRequest("Kategorie ist ein Pflichtfeld");
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) return badRequest("Betrag muss groesser 0 sein");
    if (!receivedAt || Number.isNaN(receivedAt.getTime())) return badRequest("Datum ist ungueltig");
    if (!cycle) return badRequest("Zyklus muss once, weekly, monthly oder yearly sein");
    if (recurrence === undefined) return badRequest("Wiederholung muss eine positive Ganzzahl oder leer (unbegrenzt) sein");

    await rememberUserCategory(pool, userId, "income", category);
    const { rows: existing } = await pool.query(`SELECT id, amount, bank_account_id FROM income WHERE id = $1 AND bank_account_id = ANY($2)`, [entryId, accountIds]);
    if (existing.length === 0) return notFound("Eintrag wurde nicht gefunden");

    const nextBankAccountId = requestedBankAccountId && accountIds.includes(requestedBankAccountId) ? requestedBankAccountId : existing[0].bank_account_id;
    const { effectiveRecurrence, effectiveIsActive, effectiveState } = resolveEntryState(cycle, recurrence, isActive);

    const { rows: updated } = await pool.query(
      `UPDATE income SET bank_account_id=$1, source=$2, category=$3, note=$4, amount=$5, received_at=$6, pay_date=$6, recurrence=$7, cycle=$8, state=$9, info=$10, is_active=$11, updated_at=NOW()
       WHERE id = $12 RETURNING *`,
      [nextBankAccountId, source, category, note, amountNumber, receivedAt, effectiveRecurrence, cycle, effectiveState, source || note || null, effectiveIsActive, entryId]
    );
    if (updated.length === 0) return notFound("Eintrag wurde nicht gefunden");

    const previousAmount = toFixedAmount(existing[0].amount);
    const nextAmount = Number(amountNumber.toFixed(2));
    if (existing[0].bank_account_id === nextBankAccountId) {
      await incrementBankAccountBalance(pool, nextBankAccountId, nextAmount - previousAmount);
    } else {
      await incrementBankAccountBalance(pool, existing[0].bank_account_id, -previousAmount);
      await incrementBankAccountBalance(pool, nextBankAccountId, nextAmount);
    }
    return jsonResponse({ ok: true, entry: serializeIncomeEntry(updated[0], userId) }, 200);
  }

  /**
   * @param {Request} request
   * @param {{ user: { id: string } }} session
   */
  async function handleExpenseEntries(request, session) {
    const userId = parseId(session.user.id);
    if (!userId) return unauthorized("Session user invalid");
    const userAccounts = await ensureUserFinanceRoots(pool, userId);
    const accountIds = userAccounts.map((a) => a.id);

    if (request.method === "GET") {
      const requestUrl = new URL(request.url);
      const filterResult = resolveRequestedBankAccountFilter(requestUrl, accountIds);
      if (!filterResult.ok) return jsonResponse({ ok: false, message: filterResult.message }, filterResult.status);
      const limitRaw = Number(requestUrl.searchParams.get("limit"));
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 200;
      const cursorId = parseId(requestUrl.searchParams.get("cursor"));
      let query; let params;
      if (cursorId) {
        query = `SELECT * FROM private_expenses WHERE bank_account_id = ANY($1) AND id < $2 ORDER BY id DESC LIMIT $3`;
        params = [filterResult.accountIds, cursorId, limit];
      } else {
        query = `SELECT * FROM private_expenses WHERE bank_account_id = ANY($1) ORDER BY spent_at DESC NULLS LAST, pay_date DESC NULLS LAST, due_date DESC NULLS LAST, created_at DESC LIMIT $2`;
        params = [filterResult.accountIds, limit];
      }
      const { rows: entries } = await pool.query(query, params);
      const nextCursor = entries.length === limit ? String(entries[entries.length - 1].id) : null;
      return jsonResponse({ ok: true, entries: entries.map((e) => serializeExpenseEntry(e, userId)), next_cursor: nextCursor }, 200);
    }

    if (request.method !== "POST") return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "GET, POST" });

    const rl = checkRateLimit(request, { maxAttempts: 60, windowMs: 60_000, group: "finance-write" });
    if (rl) return rl;

    const payload = await parseBody(request);
    if (!payload) return badRequest("Invalid JSON body");

    const source = String(payload.source || "").trim();
    const category = normalizeCategoryValue(payload.category);
    const note = String(payload.note || "").trim();
    const amountNumber = parsePositiveAmount(payload.amount);
    const spentAt = payload.spent_at ? new Date(/** @type {string} */ (payload.spent_at)) : new Date();
    const cycle = normalizeCycle(payload.cycle);
    const recurrence = parseRecurrence(payload.recurrence);
    const isActive = parseBoolean(payload.is_active, true);

    if (!source) return badRequest("Quelle ist ein Pflichtfeld");
    if (!category) return badRequest("Kategorie ist ein Pflichtfeld");
    if (amountNumber == null) return badRequest("Betrag muss groesser 0 sein");
    if (Number.isNaN(spentAt.getTime())) return badRequest("Datum ist ungueltig");
    if (!cycle) return badRequest("Zyklus muss once, weekly, monthly oder yearly sein");
    if (recurrence === undefined) return badRequest("Wiederholung muss eine positive Ganzzahl oder leer (unbegrenzt) sein");

    await rememberUserCategory(pool, userId, "expense", category);
    const selectedBankAccountId = parseId(payload.bank_account_id);
    const bankAccountId = selectedBankAccountId && accountIds.includes(selectedBankAccountId) ? selectedBankAccountId : accountIds[0];
    const { effectiveRecurrence, effectiveIsActive, effectiveState } = resolveEntryState(cycle, recurrence, isActive);

    const { rows } = await pool.query(
      `INSERT INTO private_expenses (bank_account_id, source, category, amount, theo_amount, spent_at, due_date, pay_date, info, state, note, recurrence, cycle, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4, $5, $5, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()) RETURNING *`,
      [bankAccountId, source, category, amountNumber, spentAt, source || note || null, effectiveState, note, effectiveRecurrence, cycle, effectiveIsActive]
    );

    await incrementBankAccountBalance(pool, bankAccountId, -amountNumber);
    return jsonResponse({ ok: true, entry: serializeExpenseEntry(rows[0], userId) }, 201);
  }

  /**
   * @param {Request} request
   * @param {string} entryIdRaw
   * @param {{ user: { id: string } }} session
   */
  async function handleExpenseEntryById(request, entryIdRaw, session) {
    const entryId = parseId(entryIdRaw);
    if (!entryId) return badRequest("entry_id ist ungueltig");
    const userId = parseId(session.user.id);
    if (!userId) return unauthorized("Session user invalid");
    const accountIds = (await listUserBankAccounts(pool, userId)).map((a) => a.id);
    if (accountIds.length === 0) return notFound("Eintrag wurde nicht gefunden");

    if (request.method === "DELETE") {
      const { rows: existing } = await pool.query(`SELECT id, amount, bank_account_id FROM private_expenses WHERE id = $1 AND bank_account_id = ANY($2)`, [entryId, accountIds]);
      if (existing.length === 0) return notFound("Eintrag wurde nicht gefunden");
      await pool.query(`DELETE FROM private_expenses WHERE id = $1`, [entryId]);
      await incrementBankAccountBalance(pool, existing[0].bank_account_id, toFixedAmount(existing[0].amount));
      return jsonResponse({ ok: true, message: "Eintrag geloescht" }, 200);
    }

    if (request.method !== "PATCH") return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "PATCH, DELETE" });

    const payload = await parseBody(request);
    if (!payload) return badRequest("Invalid JSON body");

    const source = String(payload.source || "").trim();
    const category = normalizeCategoryValue(payload.category);
    const note = String(payload.note || "").trim();
    const amountNumber = parsePositiveAmount(payload.amount);
    const spentAt = payload.spent_at ? new Date(/** @type {string} */ (payload.spent_at)) : null;
    const cycle = normalizeCycle(payload.cycle);
    const recurrence = parseRecurrence(payload.recurrence);
    const isActive = parseBoolean(payload.is_active, true);
    const requestedBankAccountId = parseId(payload.bank_account_id);

    if (!source) return badRequest("Quelle ist ein Pflichtfeld");
    if (!category) return badRequest("Kategorie ist ein Pflichtfeld");
    if (amountNumber == null) return badRequest("Betrag muss groesser 0 sein");
    if (!spentAt || Number.isNaN(spentAt.getTime())) return badRequest("Datum ist ungueltig");
    if (!cycle) return badRequest("Zyklus muss once, weekly, monthly oder yearly sein");
    if (recurrence === undefined) return badRequest("Wiederholung muss eine positive Ganzzahl oder leer (unbegrenzt) sein");

    await rememberUserCategory(pool, userId, "expense", category);
    const { rows: existing } = await pool.query(`SELECT id, amount, bank_account_id FROM private_expenses WHERE id = $1 AND bank_account_id = ANY($2)`, [entryId, accountIds]);
    if (existing.length === 0) return notFound("Eintrag wurde nicht gefunden");

    const nextBankAccountId = requestedBankAccountId && accountIds.includes(requestedBankAccountId) ? requestedBankAccountId : existing[0].bank_account_id;
    const { effectiveRecurrence, effectiveIsActive, effectiveState } = resolveEntryState(cycle, recurrence, isActive);

    const { rows: updated } = await pool.query(
      `UPDATE private_expenses SET bank_account_id=$1, source=$2, category=$3, note=$4, amount=$5, theo_amount=$5, spent_at=$6, due_date=$6, pay_date=$6, info=$7, state=$8, recurrence=$9, cycle=$10, is_active=$11, updated_at=NOW()
       WHERE id = $12 RETURNING *`,
      [nextBankAccountId, source, category, note, amountNumber, spentAt, source || note || null, effectiveState, effectiveRecurrence, cycle, effectiveIsActive, entryId]
    );
    if (updated.length === 0) return notFound("Eintrag wurde nicht gefunden");

    const previousAmount = toFixedAmount(existing[0].amount);
    const nextAmount = Number(amountNumber.toFixed(2));
    if (existing[0].bank_account_id === nextBankAccountId) {
      await incrementBankAccountBalance(pool, nextBankAccountId, previousAmount - nextAmount);
    } else {
      await incrementBankAccountBalance(pool, existing[0].bank_account_id, previousAmount);
      await incrementBankAccountBalance(pool, nextBankAccountId, -nextAmount);
    }
    return jsonResponse({ ok: true, entry: serializeExpenseEntry(updated[0], userId) }, 200);
  }

  async function loadUserBankAccountsLocal(userId) {
    const userObjectId = parseId(userId);
    if (!userObjectId) return [];
    const { rows } = await pool.query(`SELECT id, label, balance, created_at FROM bank_accounts WHERE user_id = $1 ORDER BY created_at ASC`, [userObjectId]);
    return rows.map((account, index) => ({ id: String(account.id), label: String(account.label || `Bankkonto ${index + 1}`), balance: toFixedAmount(account.balance) }));
  }

  async function loadUserShareAccountsLocal(userId) {
    const userObjectId = parseId(userId);
    if (!userObjectId) return [];
    const shareAccounts = await listUserShareAccounts(pool, userObjectId);
    return shareAccounts.map((account, index) => ({ id: String(account.id), label: String(account.label || `Aktienkonto ${index + 1}`) }));
  }

  async function loadUserPositions(userId, shareAccountIdRaw = "") {
    const userObjectId = parseId(userId);
    if (!userObjectId) return [];
    const shareAccounts = await listUserShareAccounts(pool, userObjectId);
    if (!shareAccounts.length) return [];
    const shareAccountIds = shareAccounts.map((a) => a.id);
    let filteredShareAccountIds = shareAccountIds;
    const selectedAccountId = parseId(shareAccountIdRaw);
    if (shareAccountIdRaw && !selectedAccountId) return [];
    if (selectedAccountId) {
      if (!shareAccountIds.includes(selectedAccountId)) return [];
      filteredShareAccountIds = [selectedAccountId];
    }
    const { rows: shares } = await pool.query(
      `SELECT * FROM shares WHERE share_account_id = ANY($1) OR depot_id = ANY($1) OR bank_account_id = ANY($1) ORDER BY bought_at ASC LIMIT 500`,
      [filteredShareAccountIds]
    );
    return shares.map((share) => {
      const symbol = String(share.symbol || "").trim().toUpperCase();
      const amount = toNumber(share.units);
      const boughtFor = toNumber(share.bought_for);
      const boughtAtMs = share.bought_at instanceof Date ? share.bought_at.getTime() : Date.parse(String(share.bought_at || ""));
      const createdAt = Number.isFinite(boughtAtMs) ? Math.floor(boughtAtMs / 1000) : Number.NaN;
      if (!symbol || !Number.isFinite(amount) || amount === null || amount <= 0 || !Number.isFinite(createdAt) || createdAt <= 0) return null;
      const worthWhenBought = Number.isFinite(boughtFor) && boughtFor !== null && boughtFor > 0 ? boughtFor / amount : Number.NaN;
      if (!Number.isFinite(worthWhenBought) || worthWhenBought <= 0) return null;
      return { symbol, amount: Number(amount.toFixed(4)), created_at: createdAt, worthwhenbought: Number(worthWhenBought.toFixed(4)) };
    }).filter(Boolean);
  }

  /**
   * @param {Request} request
   * @param {URL} url
   * @param {{ user: { id: string } }} session
   */
  async function handlePositions(request, url, session) {
    if (request.method !== "GET") return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "GET" });
    const shareAccountId = String(url.searchParams.get("share_account_id") || url.searchParams.get("bank_account_id") || "").trim();
    const positions = await loadUserPositions(session.user.id, shareAccountId);
    return jsonResponse(positions, 200);
  }

  /**
   * @param {Request} request
   * @param {{ user: { id: string } }} session
   */
  async function handleBankAccounts(request, session) {
    const userId = parseId(session.user.id);
    if (!userId) return unauthorized("Session user invalid");

    if (request.method === "GET") {
      const accounts = await loadUserBankAccountsLocal(session.user.id);
      return jsonResponse({ ok: true, accounts }, 200);
    }

    if (request.method !== "POST") return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "GET, POST" });

    const payload = await parseBody(request);
    if (!payload) return badRequest("Invalid JSON body");
    const label = String(payload?.label || payload?.name || "").trim();
    if (!label) return badRequest("Kontoname ist erforderlich");

    const { rows } = await pool.query(`INSERT INTO bank_accounts (user_id, label, balance, created_at) VALUES ($1, $2, 0, NOW()) RETURNING id, label, balance`, [userId, label]);
    return jsonResponse({ ok: true, account: { id: String(rows[0].id), label, balance: 0 } }, 201);
  }

  /**
   * @param {Request} request
   * @param {string} accountIdRaw
   * @param {{ user: { id: string } }} session
   */
  async function handleBankAccountById(request, accountIdRaw, session) {
    const accountId = parseId(accountIdRaw);
    if (!accountId) return badRequest("bank_account_id ist ungueltig");
    const userId = parseId(session.user.id);
    if (!userId) return unauthorized("Session user invalid");

    if (request.method === "PATCH") {
      const payload = await parseBody(request);
      if (!payload) return badRequest("Invalid JSON body");
      const label = String(payload?.label || payload?.name || "").trim();
      if (!label) return badRequest("Kontoname ist erforderlich");
      const { rows } = await pool.query(`UPDATE bank_accounts SET label = $1 WHERE id = $2 AND user_id = $3 RETURNING id, label, balance`, [label, accountId, userId]);
      if (rows.length === 0) return notFound("Bankkonto nicht gefunden");
      return jsonResponse({ ok: true, account: { id: String(rows[0].id), label: rows[0].label, balance: toFixedAmount(rows[0].balance) } }, 200);
    }

    if (request.method === "DELETE") {
      const { rows: sourceRows } = await pool.query(`SELECT id, label, balance FROM bank_accounts WHERE id = $1 AND user_id = $2`, [accountId, userId]);
      if (sourceRows.length === 0) return notFound("Bankkonto nicht gefunden");
      const sourceAccount = sourceRows[0];
      const payload = await parseBody(request);
      if (!payload) return badRequest("Invalid JSON body");
      const transferTargetId = parseId(payload?.transfer_to_bank_account_id);
      const sourceBalance = toFixedAmount(sourceAccount.balance);
      const { rows: transferOptions } = await pool.query(`SELECT id, label, balance FROM bank_accounts WHERE user_id = $1 AND id != $2 ORDER BY created_at ASC`, [userId, accountId]);
      const hasAlternativeAccount = transferOptions.length > 0;
      const needsTransferPrompt = sourceBalance !== 0 && hasAlternativeAccount;
      if (needsTransferPrompt && !transferTargetId) {
        return jsonResponse({ ok: false, code: "transfer_required", requires_transfer: true, balance: sourceBalance, message: "Bankkonto kann nur mit Transfer auf ein anderes Konto geloescht werden.", transfer_options: transferOptions.map((a, i) => ({ id: String(a.id), label: String(a.label || `Bankkonto ${i + 1}`), balance: toFixedAmount(a.balance) })) }, 409);
      }
      if (sourceBalance !== 0 && !hasAlternativeAccount) {
        return jsonResponse({ ok: false, requires_transfer: false, message: "Dieses Konto hat einen Kontostand ungleich 0. Lege zuerst ein weiteres Bankkonto an, um den Betrag zu uebertragen." }, 409);
      }
      if (transferTargetId) {
        if (transferTargetId === accountId) return badRequest("Zielkonto muss ein anderes Konto sein");
        const { rows: targetRows } = await pool.query(`SELECT id FROM bank_accounts WHERE id = $1 AND user_id = $2`, [transferTargetId, userId]);
        if (targetRows.length === 0) return badRequest("Zielkonto wurde nicht gefunden");
        if (sourceBalance !== 0) await incrementBankAccountBalance(pool, transferTargetId, sourceBalance);
      }
      await deleteBankAccountAssociations(pool, accountId);
      const { rowCount } = await pool.query(`DELETE FROM bank_accounts WHERE id = $1 AND user_id = $2`, [accountId, userId]);
      if (rowCount === 0) return notFound("Bankkonto nicht gefunden");
      return jsonResponse({ ok: true, message: "Bankkonto geloescht" }, 200);
    }

    return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "PATCH, DELETE" });
  }

  /**
   * @param {Request} request
   * @param {{ user: { id: string } }} session
   */
  async function handleShareAccounts(request, session) {
    const userId = parseId(session.user.id);
    if (!userId) return unauthorized("Session user invalid");

    if (request.method === "GET") {
      const accounts = await loadUserShareAccountsLocal(session.user.id);
      return jsonResponse({ accounts }, 200);
    }

    if (request.method !== "POST") return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "GET, POST" });

    const payload = await parseBody(request);
    if (!payload) return badRequest("Invalid JSON body");
    const label = String(payload?.label || payload?.name || "").trim();
    if (!label) return badRequest("Kontoname ist erforderlich");

    const { rows } = await pool.query(`INSERT INTO share_accounts (user_id, label, created_at) VALUES ($1, $2, NOW()) RETURNING id, label`, [userId, label]);
    return jsonResponse({ ok: true, account: { id: String(rows[0].id), label } }, 201);
  }

  /**
   * @param {Request} request
   * @param {string} accountIdRaw
   * @param {{ user: { id: string } }} session
   */
  async function handleShareAccountById(request, accountIdRaw, session) {
    const accountId = parseId(accountIdRaw);
    if (!accountId) return badRequest("share_account_id ist ungueltig");
    const userId = parseId(session.user.id);
    if (!userId) return unauthorized("Session user invalid");

    if (request.method === "PATCH") {
      const payload = await parseBody(request);
      if (!payload) return badRequest("Invalid JSON body");
      const label = String(payload?.label || payload?.name || "").trim();
      if (!label) return badRequest("Kontoname ist erforderlich");
      const { rows } = await pool.query(`UPDATE share_accounts SET label = $1 WHERE id = $2 AND user_id = $3 RETURNING id, label`, [label, accountId, userId]);
      if (rows.length === 0) return notFound("Aktienkonto nicht gefunden");
      return jsonResponse({ ok: true, account: { id: String(rows[0].id), label: rows[0].label } }, 200);
    }

    if (request.method === "DELETE") {
      const { rows: sourceRows } = await pool.query(`SELECT id, label FROM share_accounts WHERE id = $1 AND user_id = $2`, [accountId, userId]);
      if (sourceRows.length === 0) return notFound("Aktienkonto nicht gefunden");
      const payload = await parseBody(request);
      if (!payload) return badRequest("Invalid JSON body");
      const transferTargetId = parseId(payload?.transfer_to_share_account_id);
      const shareAccounts = await listUserShareAccounts(pool, userId);
      const transferOptions = shareAccounts.filter((a) => a.id !== accountId).map((a, i) => ({ id: String(a.id), label: String(a.label || `Aktienkonto ${i + 1}`) }));
      if (!transferOptions.length) return jsonResponse({ ok: false, requires_transfer: false, message: "Du hast nur ein Aktienkonto. Lege zuerst ein weiteres an, bevor du dieses loescht." }, 409);
      const { rows: shareCountRows } = await pool.query(`SELECT COUNT(*) as cnt FROM shares WHERE share_account_id = $1 OR depot_id = $1 OR bank_account_id = $1`, [accountId]);
      const shareCount = Number(shareCountRows[0]?.cnt || 0);
      if (shareCount > 0 && !transferTargetId) return jsonResponse({ ok: false, code: "transfer_required", requires_transfer: true, message: "Aktienkonto kann nur geloescht werden, wenn die Shares auf ein anderes Aktienkonto uebertragen werden.", transfer_options: transferOptions }, 409);
      if (transferTargetId) {
        if (transferTargetId === accountId) return badRequest("Zielkonto muss ein anderes Konto sein");
        const { rows: targetRows } = await pool.query(`SELECT id FROM share_accounts WHERE id = $1 AND user_id = $2`, [transferTargetId, userId]);
        if (targetRows.length === 0) return badRequest("Zielkonto wurde nicht gefunden");
        await pool.query(`UPDATE shares SET share_account_id = $1 WHERE share_account_id = $2`, [transferTargetId, accountId]);
        await pool.query(`UPDATE shares SET depot_id = $1 WHERE depot_id = $2`, [transferTargetId, accountId]);
        await pool.query(`UPDATE shares SET bank_account_id = $1 WHERE bank_account_id = $2`, [transferTargetId, accountId]);
      }
      const { rowCount } = await pool.query(`DELETE FROM share_accounts WHERE id = $1 AND user_id = $2`, [accountId, userId]);
      if (rowCount === 0) return notFound("Aktienkonto nicht gefunden");
      return jsonResponse({ ok: true, message: "Aktienkonto geloescht" }, 200);
    }

    return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "PATCH, DELETE" });
  }

  /**
   * @param {Request} request
   * @param {URL} url
   * @param {{ user: { id: string } }} session
   */
  async function handleDebugPositions(request, url, session) {
    if (request.method !== "GET") return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "GET" });
    const bankAccountId = String(url.searchParams.get("bank_account_id") || url.searchParams.get("share_account_id") || "").trim();
    const accounts = await loadUserBankAccountsLocal(session.user.id);
    const positions = await loadUserPositions(session.user.id, bankAccountId);
    return jsonResponse({ ok: true, user_id: session.user.id, selected_bank_account_id: bankAccountId || null, visible_accounts: accounts, positions_count: positions.length }, 200);
  }

  /**
   * @param {Request} request
   * @param {string} pathname
   * @param {URL} requestUrl
   * @param {unknown} _session
   */
  async function handleTwelveDataProxy(request, pathname, requestUrl, _session) {
    if (request.method !== "GET") return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "GET" });
    if (!TWELVE_DATA_API_KEY) return jsonResponse({ status: "error", message: "TWELVE_DATA_API_KEY fehlt im Backend." }, 500);

    const tdPathRaw = pathname.slice("/api/twelvedata".length) || "/";
    const tdPath = tdPathRaw.startsWith("/") ? tdPathRaw : `/${tdPathRaw}`;
    const tdUrl = new URL(tdPath, TWELVE_DATA_BASE_URL);
    requestUrl.searchParams.forEach((value, key) => {
      if (key.toLowerCase() === "apikey" || key.toLowerCase() === "api_key") return;
      tdUrl.searchParams.set(key, value);
    });
    tdUrl.searchParams.set("apikey", TWELVE_DATA_API_KEY);

    try {
      const upstreamResponse = await fetch(tdUrl.toString(), { headers: { Accept: "application/json" } });
      const body = await upstreamResponse.text();
      return new Response(body, { status: upstreamResponse.status, headers: { "Content-Type": "application/json; charset=utf-8" } });
    } catch (/** @type {unknown} */ err) {
      const error = /** @type {Error} */ (err);
      return jsonResponse({ status: "error", message: "Twelve Data Proxy Anfrage fehlgeschlagen.", detail: String(error?.message || error) }, 502);
    }
  }

  /**
   * @param {Request} request
   * @param {URL} requestUrl
   * @param {unknown} _session
   */
  async function handleStockSearchProxy(request, requestUrl, _session) {
    if (request.method !== "GET") return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "GET" });
    if (!STOCK_SEARCH_BASE_URL) return jsonResponse({ ok: false, message: "STOCK_SEARCH_BASE_URL fehlt im Backend." }, 500);
    if (!STOCK_API_KEY) return jsonResponse({ ok: false, message: "STOCK_API_KEY fehlt im Backend." }, 500);

    const query = String(requestUrl.searchParams.get("q") || "").trim();
    if (!query) return badRequest("Query-Parameter 'q' fehlt.");

    const requestedExchange = String(requestUrl.searchParams.get("exchange") || "").trim().toUpperCase();
    const exchange = /^[A-Z0-9._-]{2,15}$/.test(requestedExchange) ? requestedExchange : "";
    const requestedLimitRaw = Number(requestUrl.searchParams.get("limit"));
    const requestedLimit = Number.isFinite(requestedLimitRaw) ? requestedLimitRaw : 20;
    const limit = Math.max(1, Math.min(50, Math.floor(requestedLimit)));
    const requestedAssetClass = String(requestUrl.searchParams.get("asset_class") || "").trim().toLowerCase();
    const assetClass = requestedAssetClass === "stock" || requestedAssetClass === "etf" ? requestedAssetClass : "";

    const upstreamUrl = new URL("/search", STOCK_SEARCH_BASE_URL);
    upstreamUrl.searchParams.set("q", query);
    if (exchange) upstreamUrl.searchParams.set("exchange", exchange);
    if (assetClass) upstreamUrl.searchParams.set("asset_class", assetClass);

    try {
      const upstreamResponse = await fetch(upstreamUrl.toString(), { headers: { Accept: "application/json", "x-api-key": STOCK_API_KEY } });
      const payload = await upstreamResponse.json().catch(() => null);
      if (!upstreamResponse.ok || !Array.isArray(payload)) {
        return jsonResponse({ ok: false, message: payload?.detail || payload?.message || "Stock-Suche konnte nicht geladen werden." }, 502);
      }
      const results = payload.map((row) => ({ sSymbol: String(row?.symbol || "").trim().toUpperCase(), sName: String(row?.name || "").trim(), sExchange: String(row?.exchange || "").trim(), sCountry: String(row?.country || "").trim() }))
        .filter((row) => Boolean(row.sSymbol))
        .filter((row) => !exchange || normalizeExchangeCode(row.sExchange) === exchange)
        .slice(0, limit);
      return jsonResponse({ ok: true, results }, 200);
    } catch (/** @type {unknown} */ err) {
      const error = /** @type {Error} */ (err);
      return jsonResponse({ ok: false, message: "Stock-Suche fehlgeschlagen.", detail: String(error?.message || error) }, 502);
    }
  }

  /**
   * @param {Request} request
   * @param {URL} requestUrl
   * @param {unknown} _session
   */
  async function handleStockLogoProxy(request, requestUrl, _session) {
    if (request.method !== "GET") return jsonResponse({ ok: false, message: "Method not allowed" }, 405, { Allow: "GET" });
    if (!LOGO_DEV_BASE_URL || !LOGO_DEV_API_KEY) return jsonResponse({ ok: false, message: "LOGO_DEV_API_KEY fehlt im Backend." }, 500);

    const symbol = String(requestUrl.searchParams.get("symbol") || "").trim().toUpperCase();
    const domainFromQuery = extractHostnameCandidate(requestUrl.searchParams.get("domain"));
    const requestedExchange = String(requestUrl.searchParams.get("exchange") || STOCK_SEARCH_DEFAULT_EXCHANGE).trim().toUpperCase();
    const exchange = /^[A-Z0-9._-]{2,15}$/.test(requestedExchange) ? requestedExchange : STOCK_SEARCH_DEFAULT_EXCHANGE;
    const themeRaw = String(requestUrl.searchParams.get("theme") || "").trim().toLowerCase();
    const theme = themeRaw === "dark" ? "dark" : "light";
    const sizeRaw = Number(requestUrl.searchParams.get("size"));
    const size = Number.isFinite(sizeRaw) ? Math.max(16, Math.min(128, Math.round(sizeRaw))) : 28;

    if (!symbol && !domainFromQuery) return badRequest("Query-Parameter 'symbol' oder 'domain' fehlt.");

    const cacheKey = `${symbol || domainFromQuery}:${size}:${theme}`;
    const cached = logoCacheGet(cacheKey);
    if (cached) {
      if (cached.notFound) return jsonResponse({ ok: false, message: "Logo konnte nicht geladen werden." }, 404);
      return new Response(cached.buffer, { status: 200, headers: { "Content-Type": cached.contentType, "Cache-Control": "public, max-age=21600" } });
    }

    let domain = domainFromQuery;
    if (!domain && symbol) {
      try { domain = await resolveLogoDomainBySymbol(symbol, exchange); } catch { domain = ""; }
    }

    const logoCandidates = [];
    if (domain) logoCandidates.push(`/${encodeURIComponent(domain)}`);
    if (symbol) logoCandidates.push(`/ticker/${encodeURIComponent(symbol)}`);
    if (!logoCandidates.length) return jsonResponse({ ok: false, message: "Kein Logo-Kandidat gefunden." }, 404);

    const formatVariants = [{ format: "svg", background: "transparent" }, { format: "svg" }, { format: "png", background: "transparent" }, { format: "png" }];
    const fetches = [];
    for (const pathCandidate of logoCandidates) {
      for (const variant of formatVariants) {
        const logoUrl = new URL(pathCandidate, LOGO_DEV_BASE_URL);
        logoUrl.searchParams.set("token", LOGO_DEV_API_KEY);
        logoUrl.searchParams.set("size", String(size));
        logoUrl.searchParams.set("theme", theme);
        if (variant.format) logoUrl.searchParams.set("format", variant.format);
        if (variant.background) logoUrl.searchParams.set("background", variant.background);
        fetches.push(
          fetch(logoUrl.toString(), { headers: { Accept: "image/*", Authorization: `Bearer ${LOGO_DEV_API_KEY}` } })
            .then(async (r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              const buffer = await r.arrayBuffer();
              const contentType = r.headers.get("content-type") || "image/png";
              return { buffer, contentType };
            })
        );
      }
    }

    try {
      const result = await Promise.any(fetches);
      logoCacheSet(cacheKey, result);
      return new Response(result.buffer, { status: 200, headers: { "Content-Type": result.contentType, "Cache-Control": "public, max-age=21600" } });
    } catch {
      logoCacheSet(cacheKey, { notFound: true });
      return jsonResponse({ ok: false, message: "Logo konnte nicht geladen werden." }, 404);
    }
  }

  return {
    handleCategories, handleIncomeEntries, handleIncomeEntryById,
    handleExpenseEntries, handleExpenseEntryById,
    handlePositions, handleBankAccounts, handleBankAccountById,
    handleShareAccounts, handleShareAccountById, handleDebugPositions,
    handleTwelveDataProxy, handleStockSearchProxy, handleStockLogoProxy,
    handleTransactions
  };
}
