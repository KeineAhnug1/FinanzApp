import { Hono } from 'hono';
import type { Env } from '@/types';
import { requireAuth } from '@/lib/helpers/auth';
import { checkCsrf } from '@/lib/utils/csrf';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { parseBody } from '@/lib/utils/http';
import { badRequest, notFound, jsonResponse } from '@/lib/utils/responses';
import { getConfig } from '@/lib/config';
import { toFixedAmount } from '@/lib/helpers/finance';
import type { DbClient } from '@/lib/db';

const stocks = new Hono<{ Bindings: Env }>();

type ProfileData = { currency: string; name: string };
type ProfileEntry = { data: ProfileData; expiresAt: number };
const PROFILE_CACHE_TTL_MS = 60 * 60 * 1000;
const PROFILE_CACHE_MAX = 500;
const _profileCache = new Map<string, ProfileEntry>();

export function getCachedProfile(symbol: string): ProfileData | null {
  const entry = _profileCache.get(symbol);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    _profileCache.delete(symbol);
    return null;
  }
  _profileCache.delete(symbol);
  _profileCache.set(symbol, entry);
  return entry.data;
}

export function setCachedProfile(symbol: string, data: ProfileData): void {
  if (_profileCache.size >= PROFILE_CACHE_MAX && !_profileCache.has(symbol)) {
    const oldest = _profileCache.keys().next().value;
    if (oldest !== undefined) _profileCache.delete(oldest);
  }
  _profileCache.set(symbol, { data, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS });
}

export function _clearProfileCacheForTests(): void {
  _profileCache.clear();
}

const SYMBOL_PATTERN = /^[A-Z0-9.\-:]{1,12}$/;
const isValidSymbol = (sym: string): boolean => SYMBOL_PATTERN.test(sym);

// GET /api/stocks/search?q=AAPL
stocks.get('/search', async (c) => {
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 30, windowMs: 60_000, group: 'yahoo-search' });
  if (rl) return rl;
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const q = new URL(c.req.url).searchParams.get('q');
  if (!q?.trim()) return badRequest('q ist ein Pflichtfeld');
  if (q.length > 64) return badRequest('Suchbegriff zu lang');

  type YahooSearchQuote = {
    symbol?: string;
    longname?: string;
    shortname?: string;
    exchange?: string;
    quoteType?: string;
  };
  type YahooSearchResponse = { quotes?: YahooSearchQuote[] };

  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q.trim())}&quotesCount=20&newsCount=0`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
    const raw = await res.json() as YahooSearchResponse;

    const results = (raw.quotes ?? [])
      .filter((r) => r.symbol && isValidSymbol(r.symbol.toUpperCase()) && (r.quoteType === 'EQUITY' || r.quoteType === 'ETF'))
      .slice(0, 20)
      .map((r) => ({
        symbol: r.symbol!.toUpperCase(),
        name: (r.longname ?? r.shortname ?? r.symbol!).trim(),
        exchange: r.exchange ?? '',
      }));

    return jsonResponse({ ok: true, results }, 200);
  } catch {
    return jsonResponse({ ok: false, message: 'Yahoo Finance unavailable' }, 503);
  }
});

// GET /api/stocks/logo?ticker=AAPL  (or legacy ?domain=apple.com)
stocks.get('/logo', async (c) => {
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 60, windowMs: 60_000, group: 'stock-logo' });
  if (rl) return rl;
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const cfg = getConfig(c.env);
  if (!cfg.logoDevApiKey) return jsonResponse({ ok: true, url: null }, 200);

  const sp = new URL(c.req.url).searchParams;
  const ticker = sp.get('ticker');
  const domain = sp.get('domain');

  let logoUrl: string;
  if (ticker?.trim()) {
    const t = ticker.trim().toUpperCase();
    if (!isValidSymbol(t)) return badRequest('Ungültiges Ticker-Symbol');
    logoUrl = `https://img.logo.dev/ticker/${encodeURIComponent(t)}?token=${cfg.logoDevApiKey}&format=png&size=64`;
  } else if (domain?.trim()) {
    const d = domain.trim();
    if (d.length > 100 || !/^[a-zA-Z0-9.\-]+$/.test(d)) return badRequest('Ungültige Domain');
    logoUrl = `https://img.logo.dev/${encodeURIComponent(d)}?token=${cfg.logoDevApiKey}&format=png&size=64`;
  } else {
    return badRequest('ticker oder domain ist ein Pflichtfeld');
  }

  return jsonResponse({ ok: true, url: logoUrl }, 200);
});

const YAHOO_PERIOD_CONFIG: Record<string, { interval: string; range: string }> = {
  '1d':  { interval: '5m',  range: '1d'  },
  '5d':  { interval: '30m', range: '5d'  },
  '1mo': { interval: '1h',  range: '1mo' },
  '1y':  { interval: '1d',  range: '1y'  },
  'max': { interval: '1wk', range: 'max' },
};

type YahooQuoteData = {
  price: number;
  currency: string;
  name: string;
  prevClose: number;
};

// Finnhub's free tier returns c:0 for non-US listings (".DE", ".PA", ".L", …).
// Yahoo Finance has no such restriction and exposes price, currency and name
// in the chart meta — so we use it as a fallback / for non-US symbols.
async function fetchYahooQuote(symbol: string): Promise<YahooQuoteData | null> {
  type YahooMeta = {
    currency?: string;
    regularMarketPrice?: number;
    chartPreviousClose?: number;
    previousClose?: number;
    longName?: string;
    shortName?: string;
  };
  type YahooResponse = { chart?: { result?: { meta?: YahooMeta }[] } };
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
    const raw = await res.json() as YahooResponse;
    const meta = raw.chart?.result?.[0]?.meta;
    if (!meta || typeof meta.regularMarketPrice !== 'number' || meta.regularMarketPrice <= 0) {
      return null;
    }
    const prev = typeof meta.chartPreviousClose === 'number' && meta.chartPreviousClose > 0
      ? meta.chartPreviousClose
      : typeof meta.previousClose === 'number' && meta.previousClose > 0
        ? meta.previousClose
        : meta.regularMarketPrice;
    return {
      price: meta.regularMarketPrice,
      currency: meta.currency ?? 'USD',
      name: (meta.longName ?? meta.shortName ?? symbol).trim(),
      prevClose: prev,
    };
  } catch {
    return null;
  }
}

// GET /api/stocks/positions
stocks.get('/positions', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const shareAccountIdRaw = new URL(c.req.url).searchParams.get('share_account_id');
  const shareAccountId = shareAccountIdRaw ? Number(shareAccountIdRaw) : null;
  if (shareAccountId !== null && (!Number.isFinite(shareAccountId) || shareAccountId <= 0)) {
    return badRequest('Ungültige share_account_id');
  }

  let rows: unknown[] | null;
  if (shareAccountId !== null) {
    const { data: target } = await auth.db
      .from('share_accounts')
      .select('id')
      .eq('id', shareAccountId)
      .eq('user_id', auth.user.id)
      .maybeSingle();
    if (!target) return badRequest('Aktienkonto nicht gefunden');
    const { data } = await auth.db
      .from('shares')
      .select('id, symbol, units, bought_for')
      .eq('share_account_id', shareAccountId);
    rows = data;
  } else {
    const { data: accountIds } = await auth.db
      .from('share_accounts')
      .select('id')
      .eq('user_id', auth.user.id);
    const ownedIds = ((accountIds ?? []) as { id: number }[]).map((a) => Number(a.id));
    if (ownedIds.length === 0) return jsonResponse({ ok: true, positions: [] }, 200);
    const { data } = await auth.db
      .from('shares')
      .select('id, symbol, units, bought_for')
      .in('share_account_id', ownedIds);
    rows = data;
  }

  const aggregated = new Map<string, { shares: number; cost: number }>();
  for (const r of (rows ?? []) as { id: number; symbol: string; units: string; bought_for: string }[]) {
    const sym = r.symbol;
    const units = Number(r.units);
    const price = Number(r.bought_for);
    if (!Number.isFinite(units) || units <= 0 || !Number.isFinite(price) || price < 0) continue;
    const existing = aggregated.get(sym);
    if (existing) {
      existing.shares += units;
      existing.cost += units * price;
    } else {
      aggregated.set(sym, { shares: units, cost: units * price });
    }
  }

  const positions = [...aggregated.entries()].map(([symbol, agg]) => ({
    id: symbol,
    symbol,
    name: symbol,
    shares: Math.round(agg.shares * 1_000_000) / 1_000_000,
    avg_buy_price: agg.shares > 0 ? Math.round((agg.cost / agg.shares) * 100) / 100 : 0,
  }));

  return jsonResponse({ ok: true, positions }, 200);
});

type FxEntry = { rate: number; expiresAt: number };
const FX_CACHE_TTL_MS = 10 * 60 * 1000;
const _fxCache = new Map<string, FxEntry>();

// Returns the multiplier to convert one unit of `currency` to EUR.
// EUR → 1. Other currencies via Yahoo's <CCY>EUR=X (e.g. USDEUR=X). Cached 10 min.
async function getFxToEur(currency: string): Promise<number | null> {
  const ccy = currency.toUpperCase();
  if (ccy === 'EUR') return 1;
  const cached = _fxCache.get(ccy);
  if (cached && cached.expiresAt > Date.now()) return cached.rate;

  type YahooMeta = { regularMarketPrice?: number };
  type YahooResponse = { chart?: { result?: { meta?: YahooMeta }[] } };
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ccy}EUR=X?interval=1d&range=5d`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
    const raw = await res.json() as YahooResponse;
    const rate = raw.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof rate !== 'number' || rate <= 0) return null;
    _fxCache.set(ccy, { rate, expiresAt: Date.now() + FX_CACHE_TTL_MS });
    return rate;
  } catch {
    return null;
  }
}

export function _clearFxCacheForTests(): void {
  _fxCache.clear();
}

async function fetchCurrentPrice(symbol: string): Promise<{ price: number; currency: string } | null> {
  const yahoo = await fetchYahooQuote(symbol);
  if (!yahoo) return null;
  setCachedProfile(symbol, { currency: yahoo.currency, name: yahoo.name });
  return { price: yahoo.price, currency: yahoo.currency };
}

async function getOrCreateShareAccount(db: DbClient, userId: string | number): Promise<number | null> {
  const { data: existing } = await db
    .from('share_accounts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (existing) return Number((existing as { id: number }).id);
  const { data: created } = await db
    .from('share_accounts')
    .insert({ user_id: userId, label: 'Aktienkonto 1' })
    .select('id')
    .single();
  return created ? Number((created as { id: number }).id) : null;
}

// POST /api/stocks/positions/buy  { symbol, shares, bank_account_id }
stocks.post('/positions/buy', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const rl = checkRateLimit(c.req.raw, { maxAttempts: 30, windowMs: 60_000, group: 'stocks-trade' });
  if (rl) return rl;

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const symbol = String(payload.symbol ?? '').trim().toUpperCase();
  const shares = Number(payload.shares);
  const bankAccountId = Number(payload.bank_account_id);
  const shareAccountIdRaw = payload.share_account_id;
  const shareAccountId = shareAccountIdRaw != null && shareAccountIdRaw !== '' ? Number(shareAccountIdRaw) : null;

  if (!symbol || !isValidSymbol(symbol)) return badRequest('Ungültiges Symbol');
  if (!Number.isFinite(shares) || shares <= 0) return badRequest('shares muss eine positive Zahl sein');
  if (!Number.isFinite(bankAccountId) || bankAccountId <= 0) return badRequest('bank_account_id ist erforderlich');
  if (shareAccountId !== null && (!Number.isFinite(shareAccountId) || shareAccountId <= 0)) {
    return badRequest('Ungültige share_account_id');
  }

  const { data: bank } = await auth.db
    .from('bank_accounts')
    .select('id')
    .eq('id', bankAccountId)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!bank) return badRequest('Bankkonto nicht gefunden');

  const quote = await fetchCurrentPrice(symbol);
  if (!quote) return jsonResponse({ ok: false, message: 'Kursdaten nicht verfügbar' }, 503);

  const fxToEur = await getFxToEur(quote.currency);
  if (fxToEur == null) return jsonResponse({ ok: false, message: 'Wechselkurs nicht verfügbar' }, 503);

  const cost = toFixedAmount(quote.price * shares * fxToEur);

  let accountId: number | null;
  if (shareAccountId !== null) {
    const { data: target } = await auth.db
      .from('share_accounts')
      .select('id')
      .eq('id', shareAccountId)
      .eq('user_id', auth.user.id)
      .maybeSingle();
    if (!target) return badRequest('Aktienkonto nicht gefunden');
    accountId = shareAccountId;
  } else {
    accountId = await getOrCreateShareAccount(auth.db, auth.user.id);
  }
  if (!accountId) return jsonResponse({ ok: false, message: 'Aktienkonto konnte nicht erstellt werden' }, 500);

  const nowIso = new Date().toISOString();
  await auth.db.from('shares').insert({
    share_account_id: accountId,
    symbol,
    units: shares,
    bought_for: toFixedAmount(quote.price),
    bought_at: nowIso,
  });

  await auth.db.from('private_expenses').insert({
    bank_account_id: bankAccountId,
    source: `Aktienkauf ${symbol}`,
    category: 'investment',
    amount: cost,
    spent_at: nowIso,
    due_date: nowIso,
    pay_date: nowIso,
    info: `Kauf von ${shares} Anteilen ${symbol} à ${toFixedAmount(quote.price)} ${quote.currency}`,
    note: '',
    state: 'open',
    cycle: 'once',
    is_active: true,
    recurrence: null,
  });

  return jsonResponse({
    ok: true,
    trade: { symbol, shares, price: toFixedAmount(quote.price), total: cost, currency: quote.currency },
  }, 201);
});

// POST /api/stocks/positions/sell  { symbol, shares, bank_account_id }
stocks.post('/positions/sell', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const rl = checkRateLimit(c.req.raw, { maxAttempts: 30, windowMs: 60_000, group: 'stocks-trade' });
  if (rl) return rl;

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const symbol = String(payload.symbol ?? '').trim().toUpperCase();
  const shares = Number(payload.shares);
  const bankAccountId = Number(payload.bank_account_id);
  const shareAccountIdRaw = payload.share_account_id;
  const shareAccountId = shareAccountIdRaw != null && shareAccountIdRaw !== '' ? Number(shareAccountIdRaw) : null;

  if (!symbol || !isValidSymbol(symbol)) return badRequest('Ungültiges Symbol');
  if (!Number.isFinite(shares) || shares <= 0) return badRequest('shares muss eine positive Zahl sein');
  if (!Number.isFinite(bankAccountId) || bankAccountId <= 0) return badRequest('bank_account_id ist erforderlich');
  if (shareAccountId !== null && (!Number.isFinite(shareAccountId) || shareAccountId <= 0)) {
    return badRequest('Ungültige share_account_id');
  }

  const { data: bank } = await auth.db
    .from('bank_accounts')
    .select('id')
    .eq('id', bankAccountId)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!bank) return badRequest('Bankkonto nicht gefunden');

  if (shareAccountId !== null) {
    const { data: target } = await auth.db
      .from('share_accounts')
      .select('id')
      .eq('id', shareAccountId)
      .eq('user_id', auth.user.id)
      .maybeSingle();
    if (!target) return badRequest('Aktienkonto nicht gefunden');
  }

  let lots: unknown[] | null;
  if (shareAccountId !== null) {
    const { data } = await auth.db
      .from('shares')
      .select('id, units, bought_for, bought_at')
      .eq('share_account_id', shareAccountId)
      .eq('symbol', symbol)
      .order('bought_at', { ascending: true });
    lots = data;
  } else {
    const { data: ownedAccounts } = await auth.db
      .from('share_accounts')
      .select('id')
      .eq('user_id', auth.user.id);
    const ownedIds = ((ownedAccounts ?? []) as { id: number }[]).map((a) => Number(a.id));
    if (ownedIds.length === 0) return badRequest('Keine Aktienposition vorhanden');
    const { data } = await auth.db
      .from('shares')
      .select('id, units, bought_for, bought_at')
      .in('share_account_id', ownedIds)
      .eq('symbol', symbol)
      .order('bought_at', { ascending: true });
    lots = data;
  }

  type LotRow = { id: number; units: string; bought_for: string; bought_at: string };
  const lotRows = (lots ?? []) as LotRow[];
  const owned = lotRows.reduce((sum, l) => sum + Number(l.units), 0);
  if (owned + 1e-9 < shares) {
    return badRequest(shareAccountId !== null
      ? 'Nicht genügend Anteile in diesem Aktienkonto'
      : 'Nicht genügend Anteile zum Verkaufen');
  }

  const quote = await fetchCurrentPrice(symbol);
  if (!quote) return jsonResponse({ ok: false, message: 'Kursdaten nicht verfügbar' }, 503);

  const fxToEur = await getFxToEur(quote.currency);
  if (fxToEur == null) return jsonResponse({ ok: false, message: 'Wechselkurs nicht verfügbar' }, 503);

  let remaining = shares;
  const lotsToDelete: number[] = [];
  let partialUpdate: { id: number; newUnits: number } | null = null;
  for (const lot of lotRows) {
    if (remaining <= 1e-9) break;
    const lotUnits = Number(lot.units);
    if (lotUnits <= remaining + 1e-9) {
      lotsToDelete.push(lot.id);
      remaining -= lotUnits;
    } else {
      const newUnits = Math.round((lotUnits - remaining) * 1_000_000) / 1_000_000;
      partialUpdate = { id: lot.id, newUnits };
      remaining = 0;
    }
  }

  if (lotsToDelete.length > 0) {
    await auth.db.from('shares').delete().in('id', lotsToDelete);
  }
  if (partialUpdate) {
    await auth.db.from('shares').update({ units: partialUpdate.newUnits }).eq('id', partialUpdate.id);
  }

  const proceeds = toFixedAmount(quote.price * shares * fxToEur);
  const nowIso = new Date().toISOString();
  await auth.db.from('income').insert({
    bank_account_id: bankAccountId,
    source: `Aktienverkauf ${symbol}`,
    category: 'investment',
    amount: proceeds,
    received_at: nowIso,
    pay_date: nowIso,
    info: `Verkauf von ${shares} Anteilen ${symbol} à ${toFixedAmount(quote.price)} ${quote.currency}`,
    note: '',
    state: 'open',
    cycle: 'once',
    is_active: true,
    recurrence: null,
  });

  return jsonResponse({
    ok: true,
    trade: { symbol, shares, price: toFixedAmount(quote.price), total: proceeds, currency: quote.currency },
  }, 200);
});

// DELETE /api/stocks/positions/:symbol — removes the entire position (all lots) for a symbol.
stocks.delete('/positions/:symbol', async (c) => {
  const symbol = c.req.param('symbol').toUpperCase();
  if (!isValidSymbol(symbol)) return badRequest('Ungültiges Symbol');

  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const rl = checkRateLimit(c.req.raw, { maxAttempts: 30, windowMs: 60_000, group: 'stock-sell-all' });
  if (rl) return rl;

  const { data: account } = await auth.db
    .from('share_accounts')
    .select('id')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (!account) return notFound('Position nicht gefunden');

  const { data: existing } = await auth.db
    .from('shares')
    .select('id')
    .eq('share_account_id', account.id)
    .eq('symbol', symbol)
    .limit(1);

  if (!existing?.length) return notFound('Position nicht gefunden');

  await auth.db.from('shares').delete().eq('share_account_id', account.id).eq('symbol', symbol);

  return jsonResponse({ ok: true }, 200);
});

// GET /api/stocks/quotes?symbols=AAPL,TSLA
stocks.get('/quotes', async (c) => {
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 60, windowMs: 60_000, group: 'yahoo-quotes' });
  if (rl) return rl;
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const symbols = (new URL(c.req.url).searchParams.get('symbols') ?? '')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (symbols.length === 0) return badRequest('symbols ist ein Pflichtfeld');
  if (symbols.length > 50) return badRequest('Zu viele Symbole (max. 50)');
  if (!symbols.every(isValidSymbol)) return badRequest('Ungültiges Symbol in Liste');

  const quoteResults = await Promise.allSettled(
    symbols.map((sym) => fetchYahooQuote(sym).then((y) => ({ sym, y })))
  );

  const quotes: { symbol: string; name: string; price: number; change: number; change_pct: number; currency: string }[] = [];

  for (const r of quoteResults) {
    if (r.status !== 'fulfilled' || !r.value.y) continue;
    const { sym, y } = r.value;
    setCachedProfile(sym, { currency: y.currency, name: y.name });
    const change = y.price - y.prevClose;
    const changePct = y.prevClose > 0 ? (change / y.prevClose) * 100 : 0;
    quotes.push({
      symbol: sym,
      name: y.name,
      price: y.price,
      change,
      change_pct: changePct,
      currency: y.currency,
    });
  }

  return jsonResponse({ ok: true, quotes }, 200);
});

// GET /api/stocks/fx?from=USD — EUR-multiplier for `from` currency (e.g. 0.92 for USD).
stocks.get('/fx', async (c) => {
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 60, windowMs: 60_000, group: 'yahoo-fx' });
  if (rl) return rl;
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const from = (new URL(c.req.url).searchParams.get('from') ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(from)) return badRequest('Ungültige Quellwährung');

  const rate = await getFxToEur(from);
  if (rate == null) return jsonResponse({ ok: false, message: 'Wechselkurs nicht verfügbar' }, 503);
  return jsonResponse({ ok: true, from, to: 'EUR', rate }, 200);
});

// GET /api/stocks/history/:symbol?period=1mo
stocks.get('/history/:symbol', async (c) => {
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 60, windowMs: 60_000, group: 'yahoo' });
  if (rl) return rl;
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const symbol = c.req.param('symbol').toUpperCase();
  if (!isValidSymbol(symbol)) return badRequest('Ungültiges Symbol');
  const period = new URL(c.req.url).searchParams.get('period') ?? '1mo';
  const cfg = YAHOO_PERIOD_CONFIG[period] ?? { interval: '1d', range: '1mo' };

  type YahooQuote = { close: (number | null)[] };
  type YahooMeta = {
    currency?: string;
    regularMarketPrice?: number;
    chartPreviousClose?: number;
    previousClose?: number;
    longName?: string;
    shortName?: string;
  };
  type YahooResult = { timestamp?: number[]; indicators?: { quote?: YahooQuote[] }; meta?: YahooMeta };
  type YahooResponse = { chart?: { result?: YahooResult[]; error?: { description: string } } };
  type HistoryPoint = { date: string; close: number };

  const formatDate = (ts: number): string =>
    new Date(ts * 1000).toISOString().slice(0, 19).replace('T', ' ');

  const fetchYahoo = async (
    interval: string,
    range: string,
  ): Promise<{ history: HistoryPoint[]; meta: YahooMeta | null }> => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
    const raw = await res.json() as YahooResponse;
    const result = raw.chart?.result?.[0];
    const meta = result?.meta ?? null;
    if (!result?.timestamp || !result.indicators?.quote?.[0]?.close) {
      return { history: [], meta };
    }
    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0].close;
    const history = timestamps
      .map((ts, i) => {
        const close = closes[i];
        if (close == null || close === 0) return null;
        return { date: formatDate(ts), close: Math.round(close * 100) / 100 };
      })
      .filter((h): h is HistoryPoint => h !== null);
    return { history, meta };
  };

  try {
    const { history, meta } = await fetchYahoo(cfg.interval, cfg.range);

    // Markets closed (e.g. US pre-open before 15:30 CET) → Yahoo returns empty
    // timestamps but meta still carries regularMarketPrice + chartPreviousClose.
    // Inject a synthetic 2-point line so the 1T chart renders instead of the
    // "Keine Kursdaten" empty state.
    if (
      period === '1d'
      && history.length === 0
      && meta
      && typeof meta.regularMarketPrice === 'number'
      && meta.regularMarketPrice > 0
    ) {
      const current = Math.round(meta.regularMarketPrice * 100) / 100;
      const prevRaw = typeof meta.chartPreviousClose === 'number' && meta.chartPreviousClose > 0
        ? meta.chartPreviousClose
        : typeof meta.previousClose === 'number' && meta.previousClose > 0
          ? meta.previousClose
          : meta.regularMarketPrice;
      const prev = Math.round(prevRaw * 100) / 100;
      const nowSec = Math.floor(Date.now() / 1000);
      const synthetic: HistoryPoint[] = [
        { date: formatDate(nowSec - 24 * 60 * 60), close: prev },
        { date: formatDate(nowSec), close: current },
      ];
      return jsonResponse({ ok: true, history: synthetic }, 200);
    }

    return jsonResponse({ ok: true, history }, 200);
  } catch {
    return jsonResponse({ ok: false, message: 'Yahoo Finance unavailable' }, 503);
  }
});

// GET /api/stocks/ws — WebSocket proxy to Finnhub.
// Browser opens wss://<backend>/api/stocks/ws; we authenticate the session
// (via cookie), open an upstream wss://ws.finnhub.io connection with our
// server-side API key, and pipe frames in both directions. The API key never
// reaches the browser.
stocks.get('/ws', async (c) => {
  if (c.req.header('Upgrade') !== 'websocket') {
    return new Response('Expected websocket', { status: 426 });
  }

  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const cfg = getConfig(c.env);
  if (!cfg.finnhubApiKey) {
    return jsonResponse({ ok: false, message: 'Finnhub not configured' }, 503);
  }

  const upstreamRes = await fetch(`https://ws.finnhub.io/?token=${cfg.finnhubApiKey}`, {
    headers: { Upgrade: 'websocket' },
  });
  const upstream = upstreamRes.webSocket;
  if (!upstream) {
    return jsonResponse({ ok: false, message: 'Finnhub upstream unavailable' }, 502);
  }

  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];

  server.accept();
  upstream.accept();

  server.addEventListener('message', (ev: MessageEvent) => {
    try { upstream.send(ev.data as string | ArrayBuffer); } catch { /* upstream closed */ }
  });
  upstream.addEventListener('message', (ev: MessageEvent) => {
    try { server.send(ev.data as string | ArrayBuffer); } catch { /* client closed */ }
  });

  const closeBoth = () => {
    try { server.close(); } catch { /* */ }
    try { upstream.close(); } catch { /* */ }
  };
  server.addEventListener('close', closeBoth);
  upstream.addEventListener('close', closeBoth);
  server.addEventListener('error', closeBoth);
  upstream.addEventListener('error', closeBoth);

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
});

export default stocks;
