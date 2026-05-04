import {
  COLLECTIONS,
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
  escapeRegex,
  normalizeCategoryValue,
  normalizeRecurrence,
  parseBoolean,
  parseObjectId,
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

export function createFinanceHandlers(db) {

  async function handleCategories(req, res, session) {
    const userId = parseObjectId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");
    const userAccounts = await listUserBankAccounts(db, userId);
    const accountIds = userAccounts.map((account) => account._id);

    if (req.method === "GET") {
      const [stored, incomeDistinct, expenseDistinct] = await Promise.all([
        db.collection(COLLECTIONS.userCategories).find({ user_id: userId }).project({ _id: 0, kind: 1, value: 1 }).toArray(),
        accountIds.length ? db.collection(COLLECTIONS.incomeEntries).distinct("category", { bank_account_id: { $in: accountIds } }) : Promise.resolve([]),
        accountIds.length ? db.collection(COLLECTIONS.expenseEntries).distinct("category", { bank_account_id: { $in: accountIds } }) : Promise.resolve([])
      ]);

      const incomeValues = [];
      const expenseValues = [];
      for (const entry of stored) {
        if (entry.kind === "income") incomeValues.push(entry.value);
        if (entry.kind === "expense") expenseValues.push(entry.value);
      }

      const { uniqueCategoryList } = await import("../utils/data.mjs");
      return sendJson(res, 200, {
        ok: true,
        income: uniqueCategoryList(incomeValues.concat(incomeDistinct)),
        expense: uniqueCategoryList(expenseValues.concat(expenseDistinct))
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

    const collectionName = kind === "income" ? COLLECTIONS.incomeEntries : COLLECTIONS.expenseEntries;
    const accountFilter = accountIds.length ? { bank_account_id: { $in: accountIds } } : { _id: { $exists: false } };
    const updateResult = await db.collection(collectionName).updateMany(
      { ...accountFilter, category: new RegExp(`^${escapeRegex(category)}$`, "i") },
      { $set: { category: fallbackCategory, updated_at: new Date() } }
    );

    await db.collection(COLLECTIONS.userCategories).deleteOne({ user_id: userId, kind, key: categoryKey(category) });
    if (!presetSet.has(fallbackCategory.toLowerCase())) await rememberUserCategory(db, userId, kind, fallbackCategory);

    return sendJson(res, 200, { ok: true, message: "Kategorie geloescht", kind, deleted_category: category, replaced_with: fallbackCategory, updated_entries: updateResult.modifiedCount });
  }

  async function handleIncomeEntries(req, res, session) {
    const userId = parseObjectId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");
    const userAccounts = await ensureUserFinanceRoots(db, userId);
    const accountIds = userAccounts.map((account) => account._id);

    if (req.method === "GET") {
      const filterResult = resolveRequestedBankAccountFilter(req, accountIds);
      if (!filterResult.ok) return sendJson(res, filterResult.status, { ok: false, message: filterResult.message });
      const entries = await db.collection(COLLECTIONS.incomeEntries)
        .find(filterResult.filter).sort({ received_at: -1, pay_date: -1, created_at: -1 }).limit(200).toArray();
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

    await rememberUserCategory(db, userId, "income", category);
    const selectedBankAccountId = parseObjectId(payload.bank_account_id);
    const bankAccountId = selectedBankAccountId && accountIds.some((id) => String(id) === String(selectedBankAccountId)) ? selectedBankAccountId : accountIds[0];

    const doc = {
      bank_account_id: bankAccountId, source, category, amount: toDecimal(amountNumber),
      received_at: receivedAt, pay_date: receivedAt, note, recurrence, cycle: recurrence,
      is_active: recurrence === "once" ? true : isActive,
      state: recurrence === "once" ? "open" : (isActive ? "open" : "paused"),
      info: source || note || null, created_at: new Date(), updated_at: new Date()
    };

    const insert = await db.collection(COLLECTIONS.incomeEntries).insertOne(doc);
    await incrementBankAccountBalance(db, bankAccountId, amountNumber);
    const inserted = await db.collection(COLLECTIONS.incomeEntries).findOne({ _id: insert.insertedId });
    return sendJson(res, 201, { ok: true, entry: serializeIncomeEntry(inserted, userId) });
  }

  async function handleIncomeEntryById(req, res, entryIdRaw, session) {
    const entryId = parseObjectId(entryIdRaw);
    if (!entryId) return badRequest(res, "entry_id ist ungueltig");

    const userId = parseObjectId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");
    const accountIds = (await listUserBankAccounts(db, userId)).map((account) => account._id);
    if (accountIds.length === 0) return notFound(res, "Eintrag wurde nicht gefunden");
    const accountFilter = { bank_account_id: { $in: accountIds } };

    if (req.method === "DELETE") {
      const existing = await db.collection(COLLECTIONS.incomeEntries).findOne(
        { _id: entryId, ...accountFilter }, { projection: { _id: 1, amount: 1, bank_account_id: 1 } }
      );
      if (!existing) return notFound(res, "Eintrag wurde nicht gefunden");
      const deletion = await db.collection(COLLECTIONS.incomeEntries).deleteOne({ _id: entryId, ...accountFilter });
      if (!deletion || deletion.deletedCount !== 1) return notFound(res, "Eintrag wurde nicht gefunden");
      await incrementBankAccountBalance(db, existing.bank_account_id, -toFixedAmount(existing.amount));
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
    const requestedBankAccountId = parseObjectId(payload.bank_account_id);

    if (!source) return badRequest(res, "Quelle ist ein Pflichtfeld");
    if (!category) return badRequest(res, "Kategorie ist ein Pflichtfeld");
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) return badRequest(res, "Betrag muss groesser 0 sein");
    if (!receivedAt || Number.isNaN(receivedAt.getTime())) return badRequest(res, "Datum ist ungueltig");
    if (!recurrence) return badRequest(res, "Wiederholung muss once, weekly oder monthly sein");

    await rememberUserCategory(db, userId, "income", category);

    const existing = await db.collection(COLLECTIONS.incomeEntries).findOne(
      { _id: entryId, ...accountFilter }, { projection: { _id: 1, amount: 1, bank_account_id: 1 } }
    );
    if (!existing) return notFound(res, "Eintrag wurde nicht gefunden");

    const nextBankAccountId = requestedBankAccountId && accountIds.some((id) => String(id) === String(requestedBankAccountId))
      ? requestedBankAccountId : existing.bank_account_id;

    const updated = await db.collection(COLLECTIONS.incomeEntries).findOneAndUpdate(
      { _id: entryId },
      { $set: { bank_account_id: nextBankAccountId, source, category, note, amount: toDecimal(amountNumber), received_at: receivedAt, pay_date: receivedAt, recurrence, cycle: recurrence, state: recurrence === "once" ? "open" : (isActive ? "open" : "paused"), info: source || note || null, is_active: recurrence === "once" ? true : isActive, updated_at: new Date() } },
      { returnDocument: "after" }
    );
    if (!updated) return notFound(res, "Eintrag wurde nicht gefunden");

    const previousAmount = toFixedAmount(existing.amount);
    const nextAmount = Number(amountNumber.toFixed(2));
    if (String(existing.bank_account_id) === String(nextBankAccountId)) {
      await incrementBankAccountBalance(db, nextBankAccountId, nextAmount - previousAmount);
    } else {
      await incrementBankAccountBalance(db, existing.bank_account_id, -previousAmount);
      await incrementBankAccountBalance(db, nextBankAccountId, nextAmount);
    }
    return sendJson(res, 200, { ok: true, entry: serializeIncomeEntry(updated, userId) });
  }

  async function handleExpenseEntries(req, res, session) {
    const userId = parseObjectId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");
    const userAccounts = await ensureUserFinanceRoots(db, userId);
    const accountIds = userAccounts.map((account) => account._id);

    if (req.method === "GET") {
      const filterResult = resolveRequestedBankAccountFilter(req, accountIds);
      if (!filterResult.ok) return sendJson(res, filterResult.status, { ok: false, message: filterResult.message });
      const entries = await db.collection(COLLECTIONS.expenseEntries)
        .find(filterResult.filter).sort({ spent_at: -1, pay_date: -1, due_date: -1, created_at: -1 }).limit(200).toArray();
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

    await rememberUserCategory(db, userId, "expense", category);
    const selectedBankAccountId = parseObjectId(payload.bank_account_id);
    const bankAccountId = selectedBankAccountId && accountIds.some((id) => String(id) === String(selectedBankAccountId)) ? selectedBankAccountId : accountIds[0];

    const doc = {
      bank_account_id: bankAccountId, source, category, amount: toDecimal(amountNumber), theo_amount: toDecimal(amountNumber),
      spent_at: spentAt, due_date: spentAt, pay_date: spentAt, info: source || note || null,
      state: recurrence === "once" ? "open" : (isActive ? "open" : "paused"), note, recurrence, cycle: recurrence,
      is_active: recurrence === "once" ? true : isActive, created_at: new Date(), updated_at: new Date()
    };

    const insert = await db.collection(COLLECTIONS.expenseEntries).insertOne(doc);
    await incrementBankAccountBalance(db, bankAccountId, -amountNumber);
    const inserted = await db.collection(COLLECTIONS.expenseEntries).findOne({ _id: insert.insertedId });
    return sendJson(res, 201, { ok: true, entry: serializeExpenseEntry(inserted, userId) });
  }

  async function handleExpenseEntryById(req, res, entryIdRaw, session) {
    const entryId = parseObjectId(entryIdRaw);
    if (!entryId) return badRequest(res, "entry_id ist ungueltig");

    const userId = parseObjectId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");
    const accountIds = (await listUserBankAccounts(db, userId)).map((account) => account._id);
    if (accountIds.length === 0) return notFound(res, "Eintrag wurde nicht gefunden");
    const accountFilter = { bank_account_id: { $in: accountIds } };

    if (req.method === "DELETE") {
      const existing = await db.collection(COLLECTIONS.expenseEntries).findOne(
        { _id: entryId, ...accountFilter }, { projection: { _id: 1, amount: 1, bank_account_id: 1 } }
      );
      if (!existing) return notFound(res, "Eintrag wurde nicht gefunden");
      const deletion = await db.collection(COLLECTIONS.expenseEntries).deleteOne({ _id: entryId, ...accountFilter });
      if (!deletion || deletion.deletedCount !== 1) return notFound(res, "Eintrag wurde nicht gefunden");
      await incrementBankAccountBalance(db, existing.bank_account_id, toFixedAmount(existing.amount));
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
    const requestedBankAccountId = parseObjectId(payload.bank_account_id);

    if (!source) return badRequest(res, "Quelle ist ein Pflichtfeld");
    if (!category) return badRequest(res, "Kategorie ist ein Pflichtfeld");
    if (amountNumber == null) return badRequest(res, "Betrag muss groesser 0 sein");
    if (!spentAt || Number.isNaN(spentAt.getTime())) return badRequest(res, "Datum ist ungueltig");
    if (!recurrence) return badRequest(res, "Wiederholung muss once, weekly oder monthly sein");

    await rememberUserCategory(db, userId, "expense", category);

    const existing = await db.collection(COLLECTIONS.expenseEntries).findOne(
      { _id: entryId, ...accountFilter }, { projection: { _id: 1, amount: 1, bank_account_id: 1 } }
    );
    if (!existing) return notFound(res, "Eintrag wurde nicht gefunden");

    const nextBankAccountId = requestedBankAccountId && accountIds.some((id) => String(id) === String(requestedBankAccountId))
      ? requestedBankAccountId : existing.bank_account_id;

    const updated = await db.collection(COLLECTIONS.expenseEntries).findOneAndUpdate(
      { _id: entryId },
      { $set: { bank_account_id: nextBankAccountId, source, category, note, amount: toDecimal(amountNumber), theo_amount: toDecimal(amountNumber), spent_at: spentAt, due_date: spentAt, pay_date: spentAt, info: source || note || null, state: recurrence === "once" ? "open" : (isActive ? "open" : "paused"), recurrence, cycle: recurrence, is_active: recurrence === "once" ? true : isActive, updated_at: new Date() } },
      { returnDocument: "after" }
    );
    if (!updated) return notFound(res, "Eintrag wurde nicht gefunden");

    const previousAmount = toFixedAmount(existing.amount);
    const nextAmount = Number(amountNumber.toFixed(2));
    if (String(existing.bank_account_id) === String(nextBankAccountId)) {
      await incrementBankAccountBalance(db, nextBankAccountId, previousAmount - nextAmount);
    } else {
      await incrementBankAccountBalance(db, existing.bank_account_id, previousAmount);
      await incrementBankAccountBalance(db, nextBankAccountId, -nextAmount);
    }
    return sendJson(res, 200, { ok: true, entry: serializeExpenseEntry(updated, userId) });
  }

  async function loadUserBankAccountsLocal(userId) {
    const userObjectId = parseObjectId(userId);
    if (!userObjectId) return [];
    const accounts = await db.collection(COLLECTIONS.bankAccounts)
      .find({ user_id: userObjectId }).project({ _id: 1, label: 1, name: 1, balance: 1, created_at: 1 }).sort({ created_at: 1 }).toArray();
    return accounts.map((account, index) => ({
      id: String(account._id),
      label: String(account?.label || account?.name || `Bankkonto ${index + 1}`),
      balance: toFixedAmount(account?.balance)
    }));
  }

  async function loadUserShareAccountsLocal(userId) {
    const userObjectId = parseObjectId(userId);
    if (!userObjectId) return [];
    const shareAccounts = await listUserShareAccounts(db, userObjectId);
    return shareAccounts.map((account, index) => ({
      id: String(account._id),
      label: String(account?.label || account?.name || `Aktienkonto ${index + 1}`)
    }));
  }

  async function loadUserPositions(userId, shareAccountIdRaw = "") {
    const userObjectId = parseObjectId(userId);
    if (!userObjectId) return [];
    const shareAccounts = await listUserShareAccounts(db, userObjectId);
    if (!shareAccounts.length) return [];

    const shareAccountIds = shareAccounts.map((account) => account._id);
    let filteredShareAccountIds = shareAccountIds;
    const selectedAccountId = parseObjectId(shareAccountIdRaw);
    if (shareAccountIdRaw && !selectedAccountId) return [];
    if (selectedAccountId) {
      const isAllowed = shareAccountIds.some((id) => String(id) === String(selectedAccountId));
      if (!isAllowed) return [];
      filteredShareAccountIds = [selectedAccountId];
    }

    const accountIdFilter = { $in: filteredShareAccountIds };
    const shares = await db.collection(COLLECTIONS.shares)
      .find({ $or: [{ share_account_id: accountIdFilter }, { depot_id: accountIdFilter }, { bank_account_id: accountIdFilter }] })
      .sort({ bought_at: 1 }).limit(500).toArray();

    return shares.map((share) => {
      const symbol = String(share?.symbol || "").trim().toUpperCase();
      const amount = toNumber(share?.units);
      const boughtFor = toNumber(share?.bought_for);
      const boughtAtMs = share?.bought_at instanceof Date ? share.bought_at.getTime() : Date.parse(String(share?.bought_at || ""));
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
    const userId = parseObjectId(session.user.id);
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

    const createdAt = new Date();
    const insert = await db.collection(COLLECTIONS.bankAccounts).insertOne({ user_id: userId, label, balance: toDecimal(0), created_at: createdAt });
    return sendJson(res, 201, { ok: true, account: { id: String(insert.insertedId), label, balance: 0 } });
  }

  async function handleBankAccountById(req, res, accountIdRaw, session) {
    const accountId = parseObjectId(accountIdRaw);
    if (!accountId) return badRequest(res, "bank_account_id ist ungueltig");

    const userId = parseObjectId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");

    if (req.method === "PATCH") {
      const payload = await parseBody(req, res);
      if (!payload) return;
      const label = String(payload?.label || payload?.name || "").trim();
      if (!label) return badRequest(res, "Kontoname ist erforderlich");
      const updated = await db.collection(COLLECTIONS.bankAccounts).findOneAndUpdate(
        { _id: accountId, user_id: userId }, { $set: { label } }, { returnDocument: "after", projection: { _id: 1, label: 1, name: 1, balance: 1 } }
      );
      if (!updated) return notFound(res, "Bankkonto nicht gefunden");
      return sendJson(res, 200, { ok: true, account: { id: String(updated._id), label: String(updated?.label || updated?.name || "Bankkonto"), balance: toFixedAmount(updated?.balance) } });
    }

    if (req.method === "DELETE") {
      const sourceAccount = await db.collection(COLLECTIONS.bankAccounts).findOne({ _id: accountId, user_id: userId }, { projection: { _id: 1, label: 1, balance: 1 } });
      if (!sourceAccount) return notFound(res, "Bankkonto nicht gefunden");

      let payload = {};
      try { payload = await readBody(req); } catch (error) {
        if (error.message !== "invalid_json") {
          if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
          return badRequest(res, "Invalid JSON body");
        }
        payload = {};
      }

      const transferTargetId = parseObjectId(payload?.transfer_to_bank_account_id);
      const transferRequested = Boolean(transferTargetId);
      const sourceBalance = toFixedAmount(sourceAccount.balance);
      const transferOptions = await db.collection(COLLECTIONS.bankAccounts)
        .find({ user_id: userId, _id: { $ne: accountId } }, { projection: { _id: 1, label: 1, name: 1, balance: 1 } }).sort({ created_at: 1, _id: 1 }).toArray();
      const hasAlternativeAccount = transferOptions.length > 0;
      const needsTransferPrompt = sourceBalance !== 0 && hasAlternativeAccount;

      if (needsTransferPrompt && !transferRequested) {
        return sendJson(res, 409, { ok: false, code: "transfer_required", requires_transfer: true, balance: sourceBalance, message: "Bankkonto kann nur mit Transfer auf ein anderes Konto geloescht werden.", transfer_options: transferOptions.map((account, index) => ({ id: String(account._id), label: String(account?.label || account?.name || `Bankkonto ${index + 1}`), balance: toFixedAmount(account?.balance) })) });
      }

      if (sourceBalance !== 0 && !hasAlternativeAccount) {
        return sendJson(res, 409, { ok: false, requires_transfer: false, message: "Dieses Konto hat einen Kontostand ungleich 0. Lege zuerst ein weiteres Bankkonto an, um den Betrag zu uebertragen." });
      }

      if (transferRequested) {
        if (String(transferTargetId) === String(accountId)) return badRequest(res, "Zielkonto muss ein anderes Konto sein");
        const targetAccount = await db.collection(COLLECTIONS.bankAccounts).findOne({ _id: transferTargetId, user_id: userId }, { projection: { _id: 1 } });
        if (!targetAccount) return badRequest(res, "Zielkonto wurde nicht gefunden");
        if (sourceBalance !== 0) await incrementBankAccountBalance(db, transferTargetId, sourceBalance);
      }

      await deleteBankAccountAssociations(db, accountId);
      const deletion = await db.collection(COLLECTIONS.bankAccounts).deleteOne({ _id: accountId, user_id: userId });
      if (!deletion || deletion.deletedCount !== 1) return notFound(res, "Bankkonto nicht gefunden");
      return sendJson(res, 200, { ok: true, message: "Bankkonto geloescht" });
    }

    res.setHeader("Allow", "PATCH, DELETE");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  async function handleShareAccounts(req, res, session) {
    const userId = parseObjectId(session.user.id);
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

    const createdAt = new Date();
    const insert = await db.collection(COLLECTIONS.shareAccounts).insertOne({ user_id: userId, label, created_at: createdAt });
    return sendJson(res, 201, { ok: true, account: { id: String(insert.insertedId), label } });
  }

  async function handleShareAccountById(req, res, accountIdRaw, session) {
    const accountId = parseObjectId(accountIdRaw);
    if (!accountId) return badRequest(res, "share_account_id ist ungueltig");

    const userId = parseObjectId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");

    if (req.method === "PATCH") {
      const payload = await parseBody(req, res);
      if (!payload) return;
      const label = String(payload?.label || payload?.name || "").trim();
      if (!label) return badRequest(res, "Kontoname ist erforderlich");
      let updatedDoc = await db.collection(COLLECTIONS.shareAccounts).findOneAndUpdate({ _id: accountId, user_id: userId }, { $set: { label } }, { returnDocument: "after", projection: { _id: 1, label: 1, name: 1 } });
      if (!updatedDoc) updatedDoc = await db.collection(COLLECTIONS.depots).findOneAndUpdate({ _id: accountId, user_id: userId }, { $set: { label } }, { returnDocument: "after", projection: { _id: 1, label: 1, name: 1 } });
      if (!updatedDoc) return notFound(res, "Aktienkonto nicht gefunden");
      return sendJson(res, 200, { ok: true, account: { id: String(updatedDoc._id), label: String(updatedDoc?.label || updatedDoc?.name || "Aktienkonto") } });
    }

    if (req.method === "DELETE") {
      const sourceAccount = await db.collection(COLLECTIONS.shareAccounts).findOne({ _id: accountId, user_id: userId }, { projection: { _id: 1, label: 1, name: 1 } }) || await db.collection(COLLECTIONS.depots).findOne({ _id: accountId, user_id: userId }, { projection: { _id: 1, label: 1, name: 1 } });
      if (!sourceAccount) return notFound(res, "Aktienkonto nicht gefunden");

      let payload = {};
      try { payload = await readBody(req); } catch (error) {
        if (error.message !== "invalid_json") {
          if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
          return badRequest(res, "Invalid JSON body");
        }
        payload = {};
      }

      const transferTargetId = parseObjectId(payload?.transfer_to_share_account_id);
      const transferRequested = Boolean(transferTargetId);
      const shareAccounts = await listUserShareAccounts(db, session.user.id);
      const transferOptions = shareAccounts.filter((account) => String(account?._id) !== String(accountId)).map((account, index) => ({ id: String(account._id), label: String(account?.label || account?.name || `Aktienkonto ${index + 1}`) }));
      const hasAlternativeAccount = transferOptions.length > 0;

      if (!hasAlternativeAccount) {
        return sendJson(res, 409, { ok: false, requires_transfer: false, message: "Du hast nur ein Aktienkonto. Lege zuerst ein weiteres an, bevor du dieses loescht." });
      }

      const sharesFilter = { $or: [{ share_account_id: accountId }, { depot_id: accountId }, { bank_account_id: accountId }] };
      const shareCount = await db.collection(COLLECTIONS.shares).countDocuments(sharesFilter, { limit: 1 });

      if (shareCount > 0 && !transferRequested) {
        return sendJson(res, 409, { ok: false, code: "transfer_required", requires_transfer: true, message: "Aktienkonto kann nur geloescht werden, wenn die Shares auf ein anderes Aktienkonto uebertragen werden.", transfer_options: transferOptions });
      }

      if (transferRequested) {
        if (String(transferTargetId) === String(accountId)) return badRequest(res, "Zielkonto muss ein anderes Konto sein");
        const targetAccount = await db.collection(COLLECTIONS.shareAccounts).findOne({ _id: transferTargetId, user_id: userId }, { projection: { _id: 1 } }) || await db.collection(COLLECTIONS.depots).findOne({ _id: transferTargetId, user_id: userId }, { projection: { _id: 1 } });
        if (!targetAccount) return badRequest(res, "Zielkonto wurde nicht gefunden");
        await Promise.all([
          db.collection(COLLECTIONS.shares).updateMany({ share_account_id: accountId }, { $set: { share_account_id: transferTargetId } }),
          db.collection(COLLECTIONS.shares).updateMany({ depot_id: accountId }, { $set: { depot_id: transferTargetId } }),
          db.collection(COLLECTIONS.shares).updateMany({ bank_account_id: accountId }, { $set: { bank_account_id: transferTargetId } })
        ]);
      }

      let deletion = await db.collection(COLLECTIONS.shareAccounts).deleteOne({ _id: accountId, user_id: userId });
      if (!deletion || deletion.deletedCount !== 1) deletion = await db.collection(COLLECTIONS.depots).deleteOne({ _id: accountId, user_id: userId });
      if (!deletion || deletion.deletedCount !== 1) return notFound(res, "Aktienkonto nicht gefunden");
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
