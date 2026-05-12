import {
  EXCHANGE_RATE_API_KEY,
  EXCHANGE_RATE_BASE_URL,
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
  normalizeRecurrence,
  parseBoolean,
  parseId,
  parsePositiveAmount,
  toDecimal,
  toFixedAmount,
  toNumber
} from "../utils/data.mjs";
import { parseBody, readBody, sendJson } from "../utils/http.mjs";
import { badRequest, unauthorized, notFound } from "../helpers/responses.mjs";
import { serializeIncomeEntry, serializeExpenseEntry } from "../helpers/serializers.mjs";
import {
  listUserShareAccounts,
  ensureUserFinanceRoots,
  listUserBankAccounts,
  incrementBankAccountBalance,
  deleteBankAccountAssociations,
  rememberUserCategory,
  resolveRequestedBankAccountFilter
} from "../helpers/finance-db.mjs";

const LOGO_CACHE_TTL = 6 * 60 * 60 * 1000;
const LOGO_NEGATIVE_TTL = 30 * 60 * 1000;
const LOGO_CACHE_MAX = 500;
const DOMAIN_CACHE_TTL = 24 * 60 * 60 * 1000;
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
  if (logoCache.size >= LOGO_CACHE_MAX) {
    const oldest = logoCache.keys().next().value;
    logoCache.delete(oldest);
  }
  logoCache.set(key, { ...value, cachedAt: Date.now() });
}

function domainCacheGet(key) {
  const entry = domainCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > DOMAIN_CACHE_TTL) { domainCache.delete(key); return undefined; }
  return entry.domain;
}

function domainCacheSet(key, domain) {
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
  } catch {
    return "";
  }
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

export function createFinanceHandlers(pool) {

  async function handleCategories(req, res, session) {
    const userId = parseId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");
    const userAccounts = await listUserBankAccounts(pool, userId);
    const accountIds = userAccounts.map((a) => a.id);

    if (req.method === "GET") {
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

      const { uniqueCategoryList } = await import("../utils/data.mjs");
      return sendJson(res, 200, {
        ok: true,
        income: uniqueCategoryList(incomeValues.concat(incomeDistinct.rows.map((r) => r.category))),
        expense: uniqueCategoryList(expenseValues.concat(expenseDistinct.rows.map((r) => r.category)))
      });
    }

    if (req.method !== "DELETE") {
      res.setHeader("Allow", "GET, DELETE");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const payload = await parseBody(req, res);
    if (!payload) return;

    const kind = String(payload.kind || "").trim().toLowerCase();
    if (kind !== "income" && kind !== "expense") return badRequest(res, "kind muss income oder expense sein");

    const category = normalizeCategoryValue(payload.category);
    if (!category) return badRequest(res, "Kategorie ist ein Pflichtfeld");

    const presetSet = kind === "income" ? PRESET_INCOME_CATEGORY_KEYS : PRESET_EXPENSE_CATEGORY_KEYS;
    if (presetSet.has(category.toLowerCase())) return badRequest(res, "Standardkategorien koennen nicht geloescht werden");

    const fallbackCategory = normalizeCategoryValue(payload.replace_with || "other");
    if (!fallbackCategory) return badRequest(res, "replace_with ist ungueltig");

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

    return sendJson(res, 200, { ok: true, message: "Kategorie geloescht", kind, deleted_category: category, replaced_with: fallbackCategory, updated_entries: updateResult.rowCount });
  }

  async function handleIncomeEntries(req, res, session) {
    const userId = parseId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");
    const userAccounts = await ensureUserFinanceRoots(pool, userId);
    const accountIds = userAccounts.map((a) => a.id);

    if (req.method === "GET") {
      const filterResult = resolveRequestedBankAccountFilter(req, accountIds);
      if (!filterResult.ok) return sendJson(res, filterResult.status, { ok: false, message: filterResult.message });
      const { rows: entries } = await pool.query(
        `SELECT * FROM income WHERE bank_account_id = ANY($1) ORDER BY received_at DESC NULLS LAST, pay_date DESC NULLS LAST, created_at DESC LIMIT 200`,
        [filterResult.accountIds]
      );
      return sendJson(res, 200, { ok: true, entries: entries.map((entry) => serializeIncomeEntry(entry, userId)) });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const payload = await parseBody(req, res);
    if (!payload) return;

    const source = String(payload.source || "").trim();
    const category = normalizeCategoryValue(payload.category);
    const note = String(payload.note || "").trim();
    const amountNumber = Number(payload.amount);
    const receivedAt = payload.received_at ? new Date(payload.received_at) : new Date();
    const recurrence = normalizeRecurrence(payload.recurrence);
    const isActive = parseBoolean(payload.is_active, true);

    if (!source) return badRequest(res, "Quelle ist ein Pflichtfeld");
    if (!category) return badRequest(res, "Kategorie ist ein Pflichtfeld");
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) return badRequest(res, "Betrag muss groesser 0 sein");
    if (Number.isNaN(receivedAt.getTime())) return badRequest(res, "Datum ist ungueltig");
    if (!recurrence) return badRequest(res, "Wiederholung muss once, weekly oder monthly sein");

    await rememberUserCategory(pool, userId, "income", category);
    const selectedBankAccountId = parseId(payload.bank_account_id);
    const bankAccountId = selectedBankAccountId && accountIds.includes(selectedBankAccountId) ? selectedBankAccountId : accountIds[0];

    const { rows } = await pool.query(
      `INSERT INTO income (bank_account_id, source, category, amount, received_at, pay_date, note, info, recurrence, cycle, is_active, state, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $8, $9, $10, NOW(), NOW()) RETURNING *`,
      [bankAccountId, source, category, amountNumber, receivedAt, note, source || note || null, recurrence, recurrence === "once" ? true : isActive, recurrence === "once" ? "open" : (isActive ? "open" : "paused")]
    );

    await incrementBankAccountBalance(pool, bankAccountId, amountNumber);
    return sendJson(res, 201, { ok: true, entry: serializeIncomeEntry(rows[0], userId) });
  }

  async function handleIncomeEntryById(req, res, entryIdRaw, session) {
    const entryId = parseId(entryIdRaw);
    if (!entryId) return badRequest(res, "entry_id ist ungueltig");

    const userId = parseId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");
    const accountIds = (await listUserBankAccounts(pool, userId)).map((a) => a.id);
    if (accountIds.length === 0) return notFound(res, "Eintrag wurde nicht gefunden");

    if (req.method === "DELETE") {
      const { rows: existing } = await pool.query(
        `SELECT id, amount, bank_account_id FROM income WHERE id = $1 AND bank_account_id = ANY($2)`,
        [entryId, accountIds]
      );
      if (existing.length === 0) return notFound(res, "Eintrag wurde nicht gefunden");
      await pool.query(`DELETE FROM income WHERE id = $1`, [entryId]);
      await incrementBankAccountBalance(pool, existing[0].bank_account_id, -toFixedAmount(existing[0].amount));
      return sendJson(res, 200, { ok: true, message: "Eintrag geloescht" });
    }

    if (req.method !== "PATCH") {
      res.setHeader("Allow", "PATCH, DELETE");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const payload = await parseBody(req, res);
    if (!payload) return;

    const source = String(payload.source || "").trim();
    const category = normalizeCategoryValue(payload.category);
    const note = String(payload.note || "").trim();
    const amountNumber = Number(payload.amount);
    const receivedAt = payload.received_at ? new Date(payload.received_at) : null;
    const recurrence = normalizeRecurrence(payload.recurrence);
    const isActive = parseBoolean(payload.is_active, true);
    const requestedBankAccountId = parseId(payload.bank_account_id);

    if (!source) return badRequest(res, "Quelle ist ein Pflichtfeld");
    if (!category) return badRequest(res, "Kategorie ist ein Pflichtfeld");
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) return badRequest(res, "Betrag muss groesser 0 sein");
    if (!receivedAt || Number.isNaN(receivedAt.getTime())) return badRequest(res, "Datum ist ungueltig");
    if (!recurrence) return badRequest(res, "Wiederholung muss once, weekly oder monthly sein");

    await rememberUserCategory(pool, userId, "income", category);

    const { rows: existing } = await pool.query(
      `SELECT id, amount, bank_account_id FROM income WHERE id = $1 AND bank_account_id = ANY($2)`,
      [entryId, accountIds]
    );
    if (existing.length === 0) return notFound(res, "Eintrag wurde nicht gefunden");

    const nextBankAccountId = requestedBankAccountId && accountIds.includes(requestedBankAccountId)
      ? requestedBankAccountId : existing[0].bank_account_id;

    const { rows: updated } = await pool.query(
      `UPDATE income SET bank_account_id=$1, source=$2, category=$3, note=$4, amount=$5, received_at=$6, pay_date=$6, recurrence=$7, cycle=$7, state=$8, info=$9, is_active=$10, updated_at=NOW()
       WHERE id = $11 RETURNING *`,
      [nextBankAccountId, source, category, note, amountNumber, receivedAt, recurrence, recurrence === "once" ? "open" : (isActive ? "open" : "paused"), source || note || null, recurrence === "once" ? true : isActive, entryId]
    );
    if (updated.length === 0) return notFound(res, "Eintrag wurde nicht gefunden");

    const previousAmount = toFixedAmount(existing[0].amount);
    const nextAmount = Number(amountNumber.toFixed(2));
    if (existing[0].bank_account_id === nextBankAccountId) {
      await incrementBankAccountBalance(pool, nextBankAccountId, nextAmount - previousAmount);
    } else {
      await incrementBankAccountBalance(pool, existing[0].bank_account_id, -previousAmount);
      await incrementBankAccountBalance(pool, nextBankAccountId, nextAmount);
    }
    return sendJson(res, 200, { ok: true, entry: serializeIncomeEntry(updated[0], userId) });
  }

  async function handleExpenseEntries(req, res, session) {
    const userId = parseId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");
    const userAccounts = await ensureUserFinanceRoots(pool, userId);
    const accountIds = userAccounts.map((a) => a.id);

    if (req.method === "GET") {
      const filterResult = resolveRequestedBankAccountFilter(req, accountIds);
      if (!filterResult.ok) return sendJson(res, filterResult.status, { ok: false, message: filterResult.message });
      const { rows: entries } = await pool.query(
        `SELECT * FROM private_expenses WHERE bank_account_id = ANY($1) ORDER BY spent_at DESC NULLS LAST, pay_date DESC NULLS LAST, due_date DESC NULLS LAST, created_at DESC LIMIT 200`,
        [filterResult.accountIds]
      );
      return sendJson(res, 200, { ok: true, entries: entries.map((entry) => serializeExpenseEntry(entry, userId)) });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const payload = await parseBody(req, res);
    if (!payload) return;

    const source = String(payload.source || "").trim();
    const category = normalizeCategoryValue(payload.category);
    const note = String(payload.note || "").trim();
    const amountNumber = parsePositiveAmount(payload.amount);
    const spentAt = payload.spent_at ? new Date(payload.spent_at) : new Date();
    const recurrence = normalizeRecurrence(payload.recurrence);
    const isActive = parseBoolean(payload.is_active, true);

    if (!source) return badRequest(res, "Quelle ist ein Pflichtfeld");
    if (!category) return badRequest(res, "Kategorie ist ein Pflichtfeld");
    if (amountNumber == null) return badRequest(res, "Betrag muss groesser 0 sein");
    if (Number.isNaN(spentAt.getTime())) return badRequest(res, "Datum ist ungueltig");
    if (!recurrence) return badRequest(res, "Wiederholung muss once, weekly oder monthly sein");

    await rememberUserCategory(pool, userId, "expense", category);
    const selectedBankAccountId = parseId(payload.bank_account_id);
    const bankAccountId = selectedBankAccountId && accountIds.includes(selectedBankAccountId) ? selectedBankAccountId : accountIds[0];

    const { rows } = await pool.query(
      `INSERT INTO private_expenses (bank_account_id, source, category, amount, theo_amount, spent_at, due_date, pay_date, info, state, note, recurrence, cycle, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4, $5, $5, $5, $6, $7, $8, $9, $9, $10, NOW(), NOW()) RETURNING *`,
      [bankAccountId, source, category, amountNumber, spentAt, source || note || null, recurrence === "once" ? "open" : (isActive ? "open" : "paused"), note, recurrence, recurrence === "once" ? true : isActive]
    );

    await incrementBankAccountBalance(pool, bankAccountId, -amountNumber);
    return sendJson(res, 201, { ok: true, entry: serializeExpenseEntry(rows[0], userId) });
  }

  async function handleExpenseEntryById(req, res, entryIdRaw, session) {
    const entryId = parseId(entryIdRaw);
    if (!entryId) return badRequest(res, "entry_id ist ungueltig");

    const userId = parseId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");
    const accountIds = (await listUserBankAccounts(pool, userId)).map((a) => a.id);
    if (accountIds.length === 0) return notFound(res, "Eintrag wurde nicht gefunden");

    if (req.method === "DELETE") {
      const { rows: existing } = await pool.query(
        `SELECT id, amount, bank_account_id FROM private_expenses WHERE id = $1 AND bank_account_id = ANY($2)`,
        [entryId, accountIds]
      );
      if (existing.length === 0) return notFound(res, "Eintrag wurde nicht gefunden");
      await pool.query(`DELETE FROM private_expenses WHERE id = $1`, [entryId]);
      await incrementBankAccountBalance(pool, existing[0].bank_account_id, toFixedAmount(existing[0].amount));
      return sendJson(res, 200, { ok: true, message: "Eintrag geloescht" });
    }

    if (req.method !== "PATCH") {
      res.setHeader("Allow", "PATCH, DELETE");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const payload = await parseBody(req, res);
    if (!payload) return;

    const source = String(payload.source || "").trim();
    const category = normalizeCategoryValue(payload.category);
    const note = String(payload.note || "").trim();
    const amountNumber = parsePositiveAmount(payload.amount);
    const spentAt = payload.spent_at ? new Date(payload.spent_at) : null;
    const recurrence = normalizeRecurrence(payload.recurrence);
    const isActive = parseBoolean(payload.is_active, true);
    const requestedBankAccountId = parseId(payload.bank_account_id);

    if (!source) return badRequest(res, "Quelle ist ein Pflichtfeld");
    if (!category) return badRequest(res, "Kategorie ist ein Pflichtfeld");
    if (amountNumber == null) return badRequest(res, "Betrag muss groesser 0 sein");
    if (!spentAt || Number.isNaN(spentAt.getTime())) return badRequest(res, "Datum ist ungueltig");
    if (!recurrence) return badRequest(res, "Wiederholung muss once, weekly oder monthly sein");

    await rememberUserCategory(pool, userId, "expense", category);

    const { rows: existing } = await pool.query(
      `SELECT id, amount, bank_account_id FROM private_expenses WHERE id = $1 AND bank_account_id = ANY($2)`,
      [entryId, accountIds]
    );
    if (existing.length === 0) return notFound(res, "Eintrag wurde nicht gefunden");

    const nextBankAccountId = requestedBankAccountId && accountIds.includes(requestedBankAccountId)
      ? requestedBankAccountId : existing[0].bank_account_id;

    const { rows: updated } = await pool.query(
      `UPDATE private_expenses SET bank_account_id=$1, source=$2, category=$3, note=$4, amount=$5, theo_amount=$5, spent_at=$6, due_date=$6, pay_date=$6, info=$7, state=$8, recurrence=$9, cycle=$9, is_active=$10, updated_at=NOW()
       WHERE id = $11 RETURNING *`,
      [nextBankAccountId, source, category, note, amountNumber, spentAt, source || note || null, recurrence === "once" ? "open" : (isActive ? "open" : "paused"), recurrence, recurrence === "once" ? true : isActive, entryId]
    );
    if (updated.length === 0) return notFound(res, "Eintrag wurde nicht gefunden");

    const previousAmount = toFixedAmount(existing[0].amount);
    const nextAmount = Number(amountNumber.toFixed(2));
    if (existing[0].bank_account_id === nextBankAccountId) {
      await incrementBankAccountBalance(pool, nextBankAccountId, previousAmount - nextAmount);
    } else {
      await incrementBankAccountBalance(pool, existing[0].bank_account_id, previousAmount);
      await incrementBankAccountBalance(pool, nextBankAccountId, -nextAmount);
    }
    return sendJson(res, 200, { ok: true, entry: serializeExpenseEntry(updated[0], userId) });
  }

  async function loadUserBankAccountsLocal(userId) {
    const userObjectId = parseId(userId);
    if (!userObjectId) return [];
    const { rows } = await pool.query(
      `SELECT id, label, balance, created_at FROM bank_accounts WHERE user_id = $1 ORDER BY created_at ASC`,
      [userObjectId]
    );
    return rows.map((account, index) => ({
      id: String(account.id),
      label: String(account.label || `Bankkonto ${index + 1}`),
      balance: toFixedAmount(account.balance)
    }));
  }

  async function loadUserShareAccountsLocal(userId) {
    const userObjectId = parseId(userId);
    if (!userObjectId) return [];
    const shareAccounts = await listUserShareAccounts(pool, userObjectId);
    return shareAccounts.map((account, index) => ({
      id: String(account.id),
      label: String(account.label || `Aktienkonto ${index + 1}`)
    }));
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
      const worthWhenBought = Number.isFinite(amount) && amount > 0 && Number.isFinite(boughtFor) ? boughtFor / amount : Number.NaN;
      if (!symbol || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(createdAt) || createdAt <= 0 || !Number.isFinite(worthWhenBought) || worthWhenBought <= 0) return null;
      return { symbol, amount: Number(amount.toFixed(4)), created_at: createdAt, worthwhenbought: Number(worthWhenBought.toFixed(4)) };
    }).filter(Boolean);
  }

  async function handlePositions(req, res, url, session) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }
    const shareAccountId = String(url.searchParams.get("share_account_id") || url.searchParams.get("bank_account_id") || "").trim();
    const positions = await loadUserPositions(session.user.id, shareAccountId);
    return sendJson(res, 200, positions);
  }

  async function handleBankAccounts(req, res, session) {
    const userId = parseId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");

    if (req.method === "GET") {
      const accounts = await loadUserBankAccountsLocal(session.user.id);
      return sendJson(res, 200, { ok: true, accounts });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const payload = await parseBody(req, res);
    if (!payload) return;

    const label = String(payload?.label || payload?.name || "").trim();
    if (!label) return badRequest(res, "Kontoname ist erforderlich");

    const { rows } = await pool.query(
      `INSERT INTO bank_accounts (user_id, label, balance, created_at) VALUES ($1, $2, 0, NOW()) RETURNING id, label, balance`,
      [userId, label]
    );
    return sendJson(res, 201, { ok: true, account: { id: String(rows[0].id), label, balance: 0 } });
  }

  async function handleBankAccountById(req, res, accountIdRaw, session) {
    const accountId = parseId(accountIdRaw);
    if (!accountId) return badRequest(res, "bank_account_id ist ungueltig");

    const userId = parseId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");

    if (req.method === "PATCH") {
      const payload = await parseBody(req, res);
      if (!payload) return;
      const label = String(payload?.label || payload?.name || "").trim();
      if (!label) return badRequest(res, "Kontoname ist erforderlich");
      const { rows } = await pool.query(
        `UPDATE bank_accounts SET label = $1 WHERE id = $2 AND user_id = $3 RETURNING id, label, balance`,
        [label, accountId, userId]
      );
      if (rows.length === 0) return notFound(res, "Bankkonto nicht gefunden");
      return sendJson(res, 200, { ok: true, account: { id: String(rows[0].id), label: rows[0].label, balance: toFixedAmount(rows[0].balance) } });
    }

    if (req.method === "DELETE") {
      const { rows: sourceRows } = await pool.query(
        `SELECT id, label, balance FROM bank_accounts WHERE id = $1 AND user_id = $2`,
        [accountId, userId]
      );
      if (sourceRows.length === 0) return notFound(res, "Bankkonto nicht gefunden");
      const sourceAccount = sourceRows[0];

      let payload = {};
      try { payload = await readBody(req); } catch (error) {
        if (error.message !== "invalid_json") {
          if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
          return badRequest(res, "Invalid JSON body");
        }
        payload = {};
      }

      const transferTargetId = parseId(payload?.transfer_to_bank_account_id);
      const transferRequested = Boolean(transferTargetId);
      const sourceBalance = toFixedAmount(sourceAccount.balance);
      const { rows: transferOptions } = await pool.query(
        `SELECT id, label, balance FROM bank_accounts WHERE user_id = $1 AND id != $2 ORDER BY created_at ASC`,
        [userId, accountId]
      );
      const hasAlternativeAccount = transferOptions.length > 0;
      const needsTransferPrompt = sourceBalance !== 0 && hasAlternativeAccount;

      if (needsTransferPrompt && !transferRequested) {
        return sendJson(res, 409, { ok: false, code: "transfer_required", requires_transfer: true, balance: sourceBalance, message: "Bankkonto kann nur mit Transfer auf ein anderes Konto geloescht werden.", transfer_options: transferOptions.map((account, index) => ({ id: String(account.id), label: String(account.label || `Bankkonto ${index + 1}`), balance: toFixedAmount(account.balance) })) });
      }

      if (sourceBalance !== 0 && !hasAlternativeAccount) {
        return sendJson(res, 409, { ok: false, requires_transfer: false, message: "Dieses Konto hat einen Kontostand ungleich 0. Lege zuerst ein weiteres Bankkonto an, um den Betrag zu uebertragen." });
      }

      if (transferRequested) {
        if (transferTargetId === accountId) return badRequest(res, "Zielkonto muss ein anderes Konto sein");
        const { rows: targetRows } = await pool.query(
          `SELECT id FROM bank_accounts WHERE id = $1 AND user_id = $2`,
          [transferTargetId, userId]
        );
        if (targetRows.length === 0) return badRequest(res, "Zielkonto wurde nicht gefunden");
        if (sourceBalance !== 0) await incrementBankAccountBalance(pool, transferTargetId, sourceBalance);
      }

      await deleteBankAccountAssociations(pool, accountId);
      const { rowCount } = await pool.query(`DELETE FROM bank_accounts WHERE id = $1 AND user_id = $2`, [accountId, userId]);
      if (rowCount === 0) return notFound(res, "Bankkonto nicht gefunden");
      return sendJson(res, 200, { ok: true, message: "Bankkonto geloescht" });
    }

    res.setHeader("Allow", "PATCH, DELETE");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  async function handleShareAccounts(req, res, session) {
    const userId = parseId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");

    if (req.method === "GET") {
      const accounts = await loadUserShareAccountsLocal(session.user.id);
      return sendJson(res, 200, { accounts });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const payload = await parseBody(req, res);
    if (!payload) return;

    const label = String(payload?.label || payload?.name || "").trim();
    if (!label) return badRequest(res, "Kontoname ist erforderlich");

    const { rows } = await pool.query(
      `INSERT INTO share_accounts (user_id, label, created_at) VALUES ($1, $2, NOW()) RETURNING id, label`,
      [userId, label]
    );
    return sendJson(res, 201, { ok: true, account: { id: String(rows[0].id), label } });
  }

  async function handleShareAccountById(req, res, accountIdRaw, session) {
    const accountId = parseId(accountIdRaw);
    if (!accountId) return badRequest(res, "share_account_id ist ungueltig");

    const userId = parseId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");

    if (req.method === "PATCH") {
      const payload = await parseBody(req, res);
      if (!payload) return;
      const label = String(payload?.label || payload?.name || "").trim();
      if (!label) return badRequest(res, "Kontoname ist erforderlich");
      const { rows } = await pool.query(
        `UPDATE share_accounts SET label = $1 WHERE id = $2 AND user_id = $3 RETURNING id, label`,
        [label, accountId, userId]
      );
      if (rows.length === 0) return notFound(res, "Aktienkonto nicht gefunden");
      return sendJson(res, 200, { ok: true, account: { id: String(rows[0].id), label: rows[0].label } });
    }

    if (req.method === "DELETE") {
      const { rows: sourceRows } = await pool.query(
        `SELECT id, label FROM share_accounts WHERE id = $1 AND user_id = $2`,
        [accountId, userId]
      );
      if (sourceRows.length === 0) return notFound(res, "Aktienkonto nicht gefunden");

      let payload = {};
      try { payload = await readBody(req); } catch (error) {
        if (error.message !== "invalid_json") {
          if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
          return badRequest(res, "Invalid JSON body");
        }
        payload = {};
      }

      const transferTargetId = parseId(payload?.transfer_to_share_account_id);
      const transferRequested = Boolean(transferTargetId);
      const shareAccounts = await listUserShareAccounts(pool, userId);
      const transferOptions = shareAccounts.filter((a) => a.id !== accountId).map((a, i) => ({ id: String(a.id), label: String(a.label || `Aktienkonto ${i + 1}`) }));
      const hasAlternativeAccount = transferOptions.length > 0;

      if (!hasAlternativeAccount) {
        return sendJson(res, 409, { ok: false, requires_transfer: false, message: "Du hast nur ein Aktienkonto. Lege zuerst ein weiteres an, bevor du dieses loescht." });
      }

      const { rows: shareCountRows } = await pool.query(
        `SELECT COUNT(*) as cnt FROM shares WHERE share_account_id = $1 OR depot_id = $1 OR bank_account_id = $1`,
        [accountId]
      );
      const shareCount = Number(shareCountRows[0]?.cnt || 0);

      if (shareCount > 0 && !transferRequested) {
        return sendJson(res, 409, { ok: false, code: "transfer_required", requires_transfer: true, message: "Aktienkonto kann nur geloescht werden, wenn die Shares auf ein anderes Aktienkonto uebertragen werden.", transfer_options: transferOptions });
      }

      if (transferRequested) {
        if (transferTargetId === accountId) return badRequest(res, "Zielkonto muss ein anderes Konto sein");
        const { rows: targetRows } = await pool.query(
          `SELECT id FROM share_accounts WHERE id = $1 AND user_id = $2`,
          [transferTargetId, userId]
        );
        if (targetRows.length === 0) return badRequest(res, "Zielkonto wurde nicht gefunden");
        await pool.query(`UPDATE shares SET share_account_id = $1 WHERE share_account_id = $2`, [transferTargetId, accountId]);
        await pool.query(`UPDATE shares SET depot_id = $1 WHERE depot_id = $2`, [transferTargetId, accountId]);
        await pool.query(`UPDATE shares SET bank_account_id = $1 WHERE bank_account_id = $2`, [transferTargetId, accountId]);
      }

      const { rowCount } = await pool.query(`DELETE FROM share_accounts WHERE id = $1 AND user_id = $2`, [accountId, userId]);
      if (rowCount === 0) return notFound(res, "Aktienkonto nicht gefunden");
      return sendJson(res, 200, { ok: true, message: "Aktienkonto geloescht" });
    }

    res.setHeader("Allow", "PATCH, DELETE");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  async function handleDebugPositions(req, res, url, session) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }
    const bankAccountId = String(url.searchParams.get("bank_account_id") || url.searchParams.get("share_account_id") || "").trim();
    const accounts = await loadUserBankAccountsLocal(session.user.id);
    const positions = await loadUserPositions(session.user.id, bankAccountId);
    return sendJson(res, 200, { ok: true, user_id: session.user.id, selected_bank_account_id: bankAccountId || null, visible_accounts: accounts, positions_count: positions.length });
  }

  async function handleTwelveDataProxy(req, res, pathname, requestUrl, session) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }
    if (!TWELVE_DATA_API_KEY) return sendJson(res, 500, { status: "error", message: "TWELVE_DATA_API_KEY fehlt im Backend." });

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
      res.writeHead(upstreamResponse.status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(body);
    } catch (error) {
      return sendJson(res, 502, { status: "error", message: "Twelve Data Proxy Anfrage fehlgeschlagen.", detail: String(error?.message || error) });
    }
  }

  async function handleExchangeRates(req, res, requestUrl, session) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }
    if (!EXCHANGE_RATE_API_KEY) return sendJson(res, 500, { ok: false, message: "EXCHANGE_RATE_API_KEY fehlt im Backend." });

    const requestedBase = String(requestUrl.searchParams.get("base") || "EUR").trim().toUpperCase();
    const base = /^[A-Z]{3}$/.test(requestedBase) ? requestedBase : "EUR";
    const upstreamUrl = `${EXCHANGE_RATE_BASE_URL}/${encodeURIComponent(EXCHANGE_RATE_API_KEY)}/latest/${encodeURIComponent(base)}`;

    try {
      const upstreamResponse = await fetch(upstreamUrl, { headers: { Accept: "application/json" } });
      const payload = await upstreamResponse.json().catch(() => null);
      if (!upstreamResponse.ok || !payload || payload.result !== "success") {
        return sendJson(res, 502, { ok: false, message: payload?.["error-type"] || payload?.message || "Wechselkurse konnten nicht geladen werden." });
      }
      const conversionRates = payload.conversion_rates && typeof payload.conversion_rates === "object" ? payload.conversion_rates : {};
      return sendJson(res, 200, { ok: true, base_code: String(payload.base_code || base).toUpperCase(), time_last_update_unix: Number(payload.time_last_update_unix) || null, rates: conversionRates });
    } catch (error) {
      return sendJson(res, 502, { ok: false, message: "Wechselkurs-Anfrage fehlgeschlagen.", detail: String(error?.message || error) });
    }
  }

  async function handleStockSearchProxy(req, res, requestUrl, session) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }
    if (!STOCK_SEARCH_BASE_URL) return sendJson(res, 500, { ok: false, message: "STOCK_SEARCH_BASE_URL fehlt im Backend." });
    if (!STOCK_API_KEY) return sendJson(res, 500, { ok: false, message: "STOCK_API_KEY fehlt im Backend." });

    const query = String(requestUrl.searchParams.get("q") || "").trim();
    if (!query) return badRequest(res, "Query-Parameter 'q' fehlt.");

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
        return sendJson(res, 502, { ok: false, message: payload?.detail || payload?.message || "Stock-Suche konnte nicht geladen werden." });
      }
      const results = payload.map((row) => ({ sSymbol: String(row?.symbol || "").trim().toUpperCase(), sName: String(row?.name || "").trim(), sExchange: String(row?.exchange || "").trim(), sCountry: String(row?.country || "").trim() }))
        .filter((row) => Boolean(row.sSymbol))
        .filter((row) => !exchange || normalizeExchangeCode(row.sExchange) === exchange)
        .slice(0, limit);
      return sendJson(res, 200, { ok: true, results });
    } catch (error) {
      return sendJson(res, 502, { ok: false, message: "Stock-Suche fehlgeschlagen.", detail: String(error?.message || error) });
    }
  }

  async function handleStockLogoProxy(req, res, requestUrl, session) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }
    if (!LOGO_DEV_BASE_URL || !LOGO_DEV_API_KEY) return sendJson(res, 500, { ok: false, message: "LOGO_DEV_API_KEY fehlt im Backend." });

    const symbol = String(requestUrl.searchParams.get("symbol") || "").trim().toUpperCase();
    const domainFromQuery = extractHostnameCandidate(requestUrl.searchParams.get("domain"));
    const requestedExchange = String(requestUrl.searchParams.get("exchange") || STOCK_SEARCH_DEFAULT_EXCHANGE).trim().toUpperCase();
    const exchange = /^[A-Z0-9._-]{2,15}$/.test(requestedExchange) ? requestedExchange : STOCK_SEARCH_DEFAULT_EXCHANGE;
    const themeRaw = String(requestUrl.searchParams.get("theme") || "").trim().toLowerCase();
    const theme = themeRaw === "dark" ? "dark" : "light";
    const sizeRaw = Number(requestUrl.searchParams.get("size"));
    const size = Number.isFinite(sizeRaw) ? Math.max(16, Math.min(128, Math.round(sizeRaw))) : 28;

    if (!symbol && !domainFromQuery) return badRequest(res, "Query-Parameter 'symbol' oder 'domain' fehlt.");

    const cacheKey = `${symbol || domainFromQuery}:${size}:${theme}`;
    const cached = logoCacheGet(cacheKey);
    if (cached) {
      if (cached.notFound) return sendJson(res, 404, { ok: false, message: "Logo konnte nicht geladen werden." });
      res.writeHead(200, { "Content-Type": cached.contentType, "Cache-Control": "public, max-age=21600" });
      res.end(cached.buffer);
      return;
    }

    let domain = domainFromQuery;
    if (!domain && symbol) {
      try { domain = await resolveLogoDomainBySymbol(symbol, exchange); } catch { domain = ""; }
    }

    const logoCandidates = [];
    if (domain) logoCandidates.push(`/${encodeURIComponent(domain)}`);
    if (symbol) logoCandidates.push(`/ticker/${encodeURIComponent(symbol)}`);
    if (!logoCandidates.length) return notFound(res, "Kein Logo-Kandidat gefunden.");

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
              const buffer = Buffer.from(await r.arrayBuffer());
              const contentType = r.headers.get("content-type") || "image/png";
              return { buffer, contentType };
            })
        );
      }
    }

    try {
      const result = await Promise.any(fetches);
      logoCacheSet(cacheKey, result);
      res.writeHead(200, { "Content-Type": result.contentType, "Cache-Control": "public, max-age=21600" });
      res.end(result.buffer);
    } catch {
      logoCacheSet(cacheKey, { notFound: true });
      return sendJson(res, 404, { ok: false, message: "Logo konnte nicht geladen werden." });
    }
  }

  return {
    handleCategories, handleIncomeEntries, handleIncomeEntryById,
    handleExpenseEntries, handleExpenseEntryById,
    handlePositions, handleBankAccounts, handleBankAccountById,
    handleShareAccounts, handleShareAccountById, handleDebugPositions,
    handleTwelveDataProxy, handleExchangeRates, handleStockSearchProxy, handleStockLogoProxy
  };
}
