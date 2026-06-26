import { Hono } from 'hono';
import type { Env } from '@/types';
import { requireAuth } from '@/lib/helpers/auth';
import { checkCsrf } from '@/lib/utils/csrf';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { parseBody } from '@/lib/utils/http';
import { badRequest, notFound, jsonResponse } from '@/lib/utils/responses';
import { getConfig } from '@/lib/config';
import { incrementBankAccountBalance, toFixedAmount } from '@/lib/helpers/finance';
import type { DbClient } from '@/lib/db';

const stocks = new Hono<{ Bindings: Env }>();

const _profileCache = new Map<string, { currency: string; name: string }>();

const SYMBOL_PATTERN = /^[A-Z0-9.\-:]{1,12}$/;
const isValidSymbol = (sym: string): boolean => SYMBOL_PATTERN.test(sym);

// GET /api/stocks/search?q=AAPL
stocks.get('/search', async (c) => {
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 30, windowMs: 60_000, group: 'finnhub' });
  if (rl) return rl;
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const cfg = getConfig(c.env);
  if (!cfg.finnhubApiKey)
    return jsonResponse({ ok: false, message: 'Finnhub not configured' }, 503);

  const q = new URL(c.req.url).searchParams.get('q');
  if (!q?.trim()) return badRequest('q ist ein Pflichtfeld');
  if (q.length > 64) return badRequest('Suchbegriff zu lang');

  type FinnhubSearchItem = { description: string; displaySymbol: string; symbol: string; type: string };
  type FinnhubSearchResponse = { count: number; result?: FinnhubSearchItem[] };

  try {
    const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q.trim())}&token=${cfg.finnhubApiKey}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const raw = await res.json() as FinnhubSearchResponse;

    const results = (raw.result ?? []).slice(0, 20).map((r) => ({
      symbol: r.displaySymbol,
      name: r.description,
      exchange: '',
    }));

    return jsonResponse({ ok: true, results }, 200);
  } catch {
    return jsonResponse({ ok: false, message: 'Finnhub unavailable' }, 503);
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

// GET /api/stocks/positions
stocks.get('/positions', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const { data: account } = await auth.db
    .from('share_accounts')
    .select('id')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (!account) return jsonResponse({ ok: true, positions: [] }, 200);

  const { data: rows } = await auth.db
    .from('shares')
    .select('id, symbol, units, bought_for')
    .eq('share_account_id', account.id);

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

async function fetchCurrentPrice(symbol: string, apiKey: string): Promise<{ price: number; currency: string } | null> {
  type FinnhubQuote = { c: number };
  type FinnhubProfile = { currency: string; name: string };
  try {
    const q = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`,
      { headers: { Accept: 'application/json' } },
    ).then((r) => r.json() as Promise<FinnhubQuote>);
    if (typeof q.c !== 'number' || q.c <= 0) return null;
    let cached = _profileCache.get(symbol);
    if (!cached) {
      try {
        const p = await fetch(
          `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`,
          { headers: { Accept: 'application/json' } },
        ).then((r) => r.json() as Promise<FinnhubProfile>);
        cached = { currency: p.currency ?? 'USD', name: p.name ?? symbol };
        _profileCache.set(symbol, cached);
      } catch {
        cached = { currency: 'USD', name: symbol };
      }
    }
    return { price: q.c, currency: cached.currency };
  } catch {
    return null;
  }
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

  const cfg = getConfig(c.env);
  if (!cfg.finnhubApiKey) return jsonResponse({ ok: false, message: 'Finnhub not configured' }, 503);

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const symbol = String(payload.symbol ?? '').trim().toUpperCase();
  const shares = Number(payload.shares);
  const bankAccountId = Number(payload.bank_account_id);

  if (!symbol || !isValidSymbol(symbol)) return badRequest('Ungültiges Symbol');
  if (!Number.isFinite(shares) || shares <= 0) return badRequest('shares muss eine positive Zahl sein');
  if (!Number.isFinite(bankAccountId) || bankAccountId <= 0) return badRequest('bank_account_id ist erforderlich');

  const { data: bank } = await auth.db
    .from('bank_accounts')
    .select('id, balance')
    .eq('id', bankAccountId)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!bank) return badRequest('Bankkonto nicht gefunden');

  const quote = await fetchCurrentPrice(symbol, cfg.finnhubApiKey);
  if (!quote) return jsonResponse({ ok: false, message: 'Kursdaten nicht verfügbar' }, 503);

  const cost = toFixedAmount(quote.price * shares);
  const balance = toFixedAmount((bank as { balance: unknown }).balance);
  if (balance < cost) return badRequest('Nicht genügend Guthaben auf dem Bankkonto');

  const accountId = await getOrCreateShareAccount(auth.db, auth.user.id);
  if (!accountId) return jsonResponse({ ok: false, message: 'Aktienkonto konnte nicht erstellt werden' }, 500);

  await auth.db.from('shares').insert({
    share_account_id: accountId,
    depot_id: accountId,
    symbol,
    units: shares,
    bought_for: toFixedAmount(quote.price),
    bought_at: new Date().toISOString(),
  });

  await incrementBankAccountBalance(auth.db, bankAccountId, -cost);

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

  const cfg = getConfig(c.env);
  if (!cfg.finnhubApiKey) return jsonResponse({ ok: false, message: 'Finnhub not configured' }, 503);

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const symbol = String(payload.symbol ?? '').trim().toUpperCase();
  const shares = Number(payload.shares);
  const bankAccountId = Number(payload.bank_account_id);

  if (!symbol || !isValidSymbol(symbol)) return badRequest('Ungültiges Symbol');
  if (!Number.isFinite(shares) || shares <= 0) return badRequest('shares muss eine positive Zahl sein');
  if (!Number.isFinite(bankAccountId) || bankAccountId <= 0) return badRequest('bank_account_id ist erforderlich');

  const { data: bank } = await auth.db
    .from('bank_accounts')
    .select('id')
    .eq('id', bankAccountId)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!bank) return badRequest('Bankkonto nicht gefunden');

  const { data: account } = await auth.db
    .from('share_accounts')
    .select('id')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!account) return badRequest('Keine Aktienposition vorhanden');

  const { data: lots } = await auth.db
    .from('shares')
    .select('id, units, bought_for, bought_at')
    .eq('share_account_id', account.id)
    .eq('symbol', symbol)
    .order('bought_at', { ascending: true });

  type LotRow = { id: number; units: string; bought_for: string; bought_at: string };
  const lotRows = (lots ?? []) as LotRow[];
  const owned = lotRows.reduce((sum, l) => sum + Number(l.units), 0);
  if (owned + 1e-9 < shares) return badRequest('Nicht genügend Anteile zum Verkaufen');

  const quote = await fetchCurrentPrice(symbol, cfg.finnhubApiKey);
  if (!quote) return jsonResponse({ ok: false, message: 'Kursdaten nicht verfügbar' }, 503);

  let remaining = shares;
  for (const lot of lotRows) {
    if (remaining <= 1e-9) break;
    const lotUnits = Number(lot.units);
    if (lotUnits <= remaining + 1e-9) {
      await auth.db.from('shares').delete().eq('id', lot.id);
      remaining -= lotUnits;
    } else {
      const newUnits = Math.round((lotUnits - remaining) * 1_000_000) / 1_000_000;
      await auth.db.from('shares').update({ units: newUnits }).eq('id', lot.id);
      remaining = 0;
    }
  }

  const proceeds = toFixedAmount(quote.price * shares);
  await incrementBankAccountBalance(auth.db, bankAccountId, proceeds);

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
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 60, windowMs: 60_000, group: 'finnhub' });
  if (rl) return rl;
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const cfg = getConfig(c.env);
  if (!cfg.finnhubApiKey)
    return jsonResponse({ ok: false, message: 'Finnhub not configured' }, 503);

  const symbols = (new URL(c.req.url).searchParams.get('symbols') ?? '')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (symbols.length === 0) return badRequest('symbols ist ein Pflichtfeld');
  if (symbols.length > 50) return badRequest('Zu viele Symbole (max. 50)');
  if (!symbols.every(isValidSymbol)) return badRequest('Ungültiges Symbol in Liste');

  type FinnhubQuote = { c: number; d: number; dp: number; h: number; l: number; o: number; pc: number; t: number };
  type FinnhubProfile = { currency: string; name: string; logo: string };

  const quoteResults = await Promise.allSettled(
    symbols.map(sym =>
      fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${cfg.finnhubApiKey}`, {
        headers: { Accept: 'application/json' },
      }).then(r => r.json() as Promise<FinnhubQuote>).then(q => ({ sym, q }))
    )
  );

  const quotes: { symbol: string; name: string; price: number; change: number; change_pct: number; currency: string }[] = [];

  for (const result of quoteResults) {
    if (result.status !== 'fulfilled') continue;
    const { sym, q } = result.value;
    if (typeof q.c !== 'number' || q.c === 0) continue; // no data or error response

    let cached = _profileCache.get(sym);
    if (!cached) {
      try {
        const p = await fetch(
          `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${cfg.finnhubApiKey}`,
          { headers: { Accept: 'application/json' } }
        ).then(r => r.json() as Promise<FinnhubProfile>);
        cached = { currency: p.currency ?? 'USD', name: p.name ?? sym };
        _profileCache.set(sym, cached);
      } catch {
        cached = { currency: 'USD', name: sym };
      }
    }

    quotes.push({
      symbol: sym,
      name: cached.name,
      price: q.c,
      change: q.d ?? 0,
      change_pct: q.dp ?? 0,
      currency: cached.currency,
    });
  }

  return jsonResponse({ ok: true, quotes }, 200);
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
  type YahooResult = { timestamp?: number[]; indicators?: { quote?: YahooQuote[] } };
  type YahooResponse = { chart?: { result?: YahooResult[]; error?: { description: string } } };

  const fetchYahoo = async (interval: string, range: string) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
    const raw = await res.json() as YahooResponse;
    const result = raw.chart?.result?.[0];
    if (!result?.timestamp || !result.indicators?.quote?.[0]?.close) return [];
    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0].close;
    return timestamps
      .map((ts, i) => {
        const close = closes[i];
        if (close == null || close === 0) return null;
        const date = new Date(ts * 1000).toISOString().slice(0, 19).replace('T', ' ');
        return { date, close: Math.round(close * 100) / 100 };
      })
      .filter((h): h is { date: string; close: number } => h !== null);
  };

  try {
    let history = await fetchYahoo(cfg.interval, cfg.range);

    // For 1d, try a finer interval to get more intraday points.
    // We avoid fetching '2d' range because mixing yesterday + today creates
    // a visible price jump in the portfolio chart when markets open at different times.
    if (period === '1d' && history.length < 20) {
      const fallback = await fetchYahoo('5m', '1d');
      if (fallback.length > history.length) history = fallback;
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
