'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { apiUrl } from '@/lib/api-client';
import { useFinnhubWs } from '@/hooks/useFinnhubWs';
import { StockDetailDrawer, fmtPrice, fmtEur, fmtPct } from '@/components/stocks/StockDetailDrawer';

const PIE_COLORS = ['#3b82f6','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#6366f1','#14b8a6','#f97316'];

interface StockPosition {
  id: string; symbol: string; name: string; shares: number; avg_buy_price: number;
}
interface StockQuote {
  symbol: string; price: number; change: number; change_pct: number;
  name?: string; currency?: string;
}
interface HistoryPoint { date: string; close: number; }
interface SearchResult { symbol: string; name: string; exchange?: string; }

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(apiUrl(url), { credentials: 'include', ...options });
  return res.json();
}

type Range = '1T' | '1W' | '1M' | '1J' | 'Max';
const RANGE_PERIODS: Record<Range, string> = { '1T': '1d', '1W': '5d', '1M': '1mo', '1J': '1y', 'Max': 'max' };
const RANGES: Range[] = ['1T', '1W', '1M', '1J', 'Max'];

function fmtDateLabel(raw: string, range: Range) {
  if (range === '1T') {
    // raw: "YYYY-MM-DD HH:MM:SS"
    return raw.split(' ')[1]?.slice(0, 5) ?? '';
  }
  if (range === '1W') {
    // raw: "YYYY-MM-DD HH" (hourly bucket)
    const [datePart, hourPart] = raw.split(' ');
    const d = new Date(datePart ?? raw);
    const weekday = d.toLocaleDateString('de-DE', { weekday: 'short' });
    return hourPart ? `${weekday} ${hourPart}:00` : weekday;
  }
  if (range === '1M') {
    // raw: "YYYY-MM-DD HH" (hourly bucket) — show date only to avoid clutter
    const d = new Date(raw.slice(0, 10));
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  }
  if (range === 'Max') {
    const d = new Date(raw.slice(0, 10));
    return d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
  }
  // 1J
  const d = new Date(raw.slice(0, 10));
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function StockLogo({ symbol, size = 36 }: { symbol: string; size?: number }) {
  const [logoUrl, setLogoUrl] = useState<string | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/stocks/logo?ticker=${encodeURIComponent(symbol)}`)
      .then((d: { ok: boolean; url: string | null }) => {
        if (!cancelled) setLogoUrl(d.url ?? null);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [symbol]);

  const style = { width: size, height: size, borderRadius: '50%', flexShrink: 0 } as const;
  const initials = symbol.replace(/[-_.]/g, '').slice(0, 2).toUpperCase();

  if (logoUrl === undefined && !failed) {
    return <div className="stock-logo-circle" style={style} aria-hidden="true" />;
  }
  if (failed || !logoUrl) {
    return (
      <div className="stock-logo-circle stock-logo-fallback" style={style} aria-hidden="true">
        {initials}
      </div>
    );
  }
  return (
    <div className="stock-logo-circle" style={style}>
      <img src={logoUrl} alt={symbol} className="stock-logo" onError={() => { setFailed(true); setLogoUrl(null); }} />
    </div>
  );
}

function Sparkline({ data, positive }: { data: HistoryPoint[]; positive: boolean }) {
  if (data.length < 2) {
    return (
      <div className="stock-sparkline">
        <svg width="80" height="28" viewBox="0 0 80 28">
          <line x1="0" y1="14" x2="80" y2="14" stroke="var(--clr-border)" strokeWidth="1.5" strokeDasharray="3 3" />
        </svg>
      </div>
    );
  }
  const vals = data.map(h => h.close);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const color = positive ? '#22c55e' : '#ef4444';
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * 80},${24 - ((v - min) / span) * 20}`).join(' ');
  const fillPts = `0,24 ${pts} 80,24`;
  return (
    <div className="stock-sparkline">
      <svg width="80" height="28" viewBox="0 0 80 28" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`spk-${positive ? 'pos' : 'neg'}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={fillPts} fill={`url(#spk-${positive ? 'pos' : 'neg'})`} />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function PerfBadge({ pct }: { pct: number }) {
  return <span className={`stock-perf-badge ${pct >= 0 ? 'positive' : 'negative'}`}>{fmtPct(pct)}</span>;
}

function ArrowIcon({ up }: { up: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: 'middle' }}>
      {up
        ? <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>
        : <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>
      }
    </svg>
  );
}

function buildPortfolioSeries(
  allHistories: Record<string, HistoryPoint[]>,
  enriched: { symbol: string; shares: number }[],
  range: Range,
  liveQuotes: Record<string, number>,
): { date: string; Wert: number }[] {
  if (!Object.keys(allHistories).length) return [];

  // Normalize timestamps to avoid cross-exchange settlement-time gaps creating
  // spurious jumps in the portfolio chart:
  // - 1T: keep full timestamp (5m resolution, same-exchange intraday)
  // - 1W/1M: truncate to YYYY-MM-DD HH — hourly buckets merge SAP.DE (07:00 UTC)
  //   and US stocks (13:30 UTC) correctly without losing intraday detail
  // - 1J/Max: truncate to YYYY-MM-DD (daily candles, no intraday detail needed)
  const normalizeDate = (raw: string): string => {
    if (range === '1T') return raw;
    if (range === '1W' || range === '1M') return raw.slice(0, 13); // "YYYY-MM-DD HH"
    return raw.slice(0, 10); // "YYYY-MM-DD"
  };

  const dateSet = new Set<string>();
  for (const hist of Object.values(allHistories)) {
    for (const h of hist) dateSet.add(normalizeDate(h.date));
  }
  if (!dateSet.size) return [];

  const dates = [...dateSet].sort();

  const closeMaps: Record<string, Map<string, number>> = {};
  for (const [sym, hist] of Object.entries(allHistories)) {
    const m = new Map<string, number>();
    for (const h of hist) {
      const key = normalizeDate(h.date);
      // Last price of the day wins (handles multiple intraday points on same date)
      m.set(key, h.close);
    }
    closeMaps[sym] = m;
  }

  const result: { date: string; Wert: number }[] = [];
  const lastKnown: Record<string, number> = {};
  const symbolsWithData = enriched.filter(p => closeMaps[p.symbol]);
  // Require ALL symbols with data to have a real price at each bucket.
  // A lower threshold still allows cross-exchange gaps (SAP.DE trades 07-15 UTC,
  // US stocks 13:30-20 UTC) to slip through, producing visible jumps when the
  // missing symbol's carry-forward value differs from its real price at that time.
  const threshold = symbolsWithData.length;

  for (const date of dates) {
    let liveCount = 0;
    for (const p of symbolsWithData) {
      if (closeMaps[p.symbol]?.has(date)) liveCount++;
    }
    if (liveCount < threshold) continue;

    let total = 0;
    let hasAny = false;
    for (const p of enriched) {
      const map = closeMaps[p.symbol];
      if (!map) continue;
      if (map.has(date)) lastKnown[p.symbol] = map.get(date)!;
      const price = lastKnown[p.symbol] ?? 0;
      if (price > 0) { total += price * p.shares; hasAny = true; }
    }
    if (hasAny) result.push({ date, Wert: Math.round(total * 100) / 100 });
  }

  // Append a live-price point so the chart terminus matches the Hero value.
  // Only add it when enough symbols have live quotes to avoid a misleading endpoint.
  const liveSymbolCount = enriched.filter(p => liveQuotes[p.symbol] != null).length;
  if (liveSymbolCount >= threshold) {
    let liveTotal = 0;
    for (const p of enriched) {
      const price = liveQuotes[p.symbol] ?? lastKnown[p.symbol] ?? 0;
      if (price > 0) liveTotal += price * p.shares;
    }
    if (liveTotal > 0) {
      const nowLabel = new Date().toISOString().slice(0, 16).replace('T', ' ');
      result.push({ date: nowLabel, Wert: Math.round(liveTotal * 100) / 100 });
    }
  }

  return result;
}

function ChartTooltip({ active, payload, label, currency, label2 }: {
  active?: boolean; payload?: { value: number }[]; label?: string; currency: string; label2: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="stocks-chart-tooltip">
      <span className="stocks-chart-tooltip-label">{label}</span>
      <span className="stocks-chart-tooltip-val">{fmtPrice(payload[0]?.value ?? 0, currency)}</span>
      <span className="stocks-chart-tooltip-sub">{label2}</span>
    </div>
  );
}

function StockSearch({ onPick, inputRef }: {
  onPick: (symbol: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); setShowResults(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const d = await apiFetch(`/api/stocks/search?q=${encodeURIComponent(q)}`);
        const seen = new Set<string>();
        const unique = (d.results ?? []).filter((r: SearchResult) => seen.has(r.symbol) ? false : seen.add(r.symbol));
        setSearchResults(unique);
        setShowResults(true);
      } catch { setSearchResults([]); }
    }, 280);
  }, []);

  const pick = (symbol: string) => {
    onPick(symbol);
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
  };

  return (
    <div ref={wrapRef} className="stocks-topbar-search">
      <div className="stocks-search-wrap">
        <svg className="stocks-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          ref={inputRef}
          className="analysis-search-input stocks-search-field"
          placeholder="Aktie suchen (z.B. AAPL, Tesla)…"
          value={searchQuery}
          onChange={e => handleSearch(e.target.value)}
          onFocus={() => searchResults.length > 0 && setShowResults(true)}
        />
        {searchQuery && (
          <button
            className="stocks-search-clear"
            onClick={() => { setSearchQuery(''); setSearchResults([]); setShowResults(false); }}
            aria-label="Suche löschen"
            type="button"
          >×</button>
        )}
      </div>
      {showResults && searchResults.length > 0 && (
        <div className="analysis-search-results stocks-topbar-results">
          {searchResults.slice(0, 10).map(r => (
            <button
              key={r.symbol}
              className="analysis-search-item"
              onClick={() => pick(r.symbol)}
              type="button"
            >
              <div className="analysis-search-item-logo">
                <StockLogo symbol={r.symbol} size={26} />
              </div>
              <div style={{ minWidth: 0 }}>
                <strong>{r.symbol}</strong>
                <span className="analysis-search-item-name">{r.name}</span>
              </div>
              {r.exchange && <span className="analysis-search-item-exchange">{r.exchange}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StocksPage() {
  const [range, setRange] = useState<Range>('1M');
  const [drawerSymbol, setDrawerSymbol] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<'buy' | 'sell'>('buy');
  const [liveQuotes, setLiveQuotes] = useState<Record<string, number>>({});
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { data: positions = [] } = useQuery<StockPosition[]>({
    queryKey: ['stock-positions'],
    queryFn: () => apiFetch('/api/stocks/positions').then(d => d.positions ?? []),
  });

  const symbolKey = useMemo(() => positions.map(p => p.symbol).join(','), [positions]);

  const { data: quotes = {} } = useQuery<Record<string, StockQuote>>({
    queryKey: ['stock-quotes', symbolKey],
    enabled: positions.length > 0,
    staleTime: 2 * 60 * 1000,
    retry: 2,
    queryFn: async () => {
      const symbols = [...new Set(positions.map(p => p.symbol))].join(',');
      const d = await apiFetch(`/api/stocks/quotes?symbols=${encodeURIComponent(symbols)}`);
      if (!d.ok) return {};
      const map: Record<string, StockQuote> = {};
      for (const q of (d.quotes ?? [])) map[q.symbol] = q;
      return map;
    },
  });

  const enriched = positions.map(p => {
    const q = quotes[p.symbol];
    const currentPrice = liveQuotes[p.symbol] ?? q?.price ?? p.avg_buy_price;
    const value = currentPrice * p.shares;
    const cost = p.avg_buy_price * p.shares;
    const pnl = value - cost;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    return { ...p, currentPrice, value, cost, pnl, pnlPct, quote: q };
  });

  const totalValue = enriched.reduce((s, p) => s + p.value, 0);
  const totalCost = enriched.reduce((s, p) => s + p.cost, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  const dailyChange = enriched.reduce((s, p) => s + (p.quote?.change ?? 0) * p.shares, 0);
  const dailyChangePct = totalValue > 0 ? (dailyChange / (totalValue - dailyChange)) * 100 : 0;

  const pieData = enriched.filter(p => p.value > 0).map(p => ({
    name: p.symbol,
    value: Math.round(p.value * 100) / 100,
    pct: totalValue > 0 ? (p.value / totalValue) * 100 : 0,
  }));

  const quotesSettled = positions.length > 0 && Object.keys(quotes).length > 0;

  const symbolList = positions.map(p => p.symbol);
  const { connected: wsConnected } = useFinnhubWs(symbolList, (symbol, price) => {
    setLiveQuotes(prev => ({ ...prev, [symbol]: price }));
  });

  const { data: allHistories = {}, isLoading: allHistLoading } = useQuery<Record<string, HistoryPoint[]>>({
    queryKey: ['all-histories', symbolKey, range],
    enabled: quotesSettled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const entries = await Promise.allSettled(
        positions.map(async (p) => {
          const d = await apiFetch(`/api/stocks/history/${p.symbol}?period=${RANGE_PERIODS[range]}`);
          return { symbol: p.symbol, history: (d.history ?? []) as HistoryPoint[] };
        })
      );
      const results: Record<string, HistoryPoint[]> = {};
      for (const entry of entries) {
        if (entry.status === 'fulfilled') results[entry.value.symbol] = entry.value.history;
      }
      return results;
    },
  });

  const portfolioSeries = buildPortfolioSeries(allHistories, enriched, range, liveQuotes);
  const chartData = portfolioSeries.map(p => ({ ...p, date: fmtDateLabel(p.date, range) }));

  const firstVal = chartData[0]?.Wert ?? 0;
  const lastVal = chartData[chartData.length - 1]?.Wert ?? 0;
  const chartPositive = lastVal >= firstVal;
  const chartColor = chartPositive ? '#22c55e' : '#ef4444';
  const chartGradId = chartPositive ? 'stockGradPos' : 'stockGradNeg';

  const chartLoading = allHistLoading && chartData.length === 0;

  const openDrawer = (symbol: string, tab: 'buy' | 'sell' = 'buy') => {
    setDrawerSymbol(symbol);
    setDrawerTab(tab);
  };

  const scrollToSearch = () => {
    searchInputRef.current?.focus();
    searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const drawerOwnedShares = drawerSymbol
    ? (positions.find(p => p.symbol === drawerSymbol)?.shares ?? 0)
    : 0;
  const drawerAvgBuyPrice = drawerSymbol
    ? positions.find(p => p.symbol === drawerSymbol)?.avg_buy_price
    : undefined;
  const drawerLivePrice = drawerSymbol ? liveQuotes[drawerSymbol] : undefined;

  return (
    <div className="depot-page">
      <div className="stocks-topbar">
        <StockSearch onPick={(sym) => openDrawer(sym, 'buy')} inputRef={searchInputRef} />
      </div>

      {positions.length === 0 ? (
        <div className="stocks-empty stocks-empty--rich">
          <div className="stocks-empty-icon">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
            </svg>
          </div>
          <p className="stocks-empty-title">Noch keine Aktien</p>
          <p className="stocks-empty-sub">Suche oben nach einer Aktie, um deine erste Position zu eröffnen.</p>
          <button className="stocks-empty-cta" onClick={scrollToSearch} type="button">Zur Suche</button>
        </div>
      ) : (
        <>
          <div className="spc-card">
            <div className="spc-hero-row">
              <div className="spc-hero-left">
                <span className="spc-label">Gesamtwert Portfolio</span>
                <strong className="spc-total">{fmtEur(totalValue)}</strong>
                <div className={`spc-gain-row ${totalPnl >= 0 ? 'positive' : 'negative'}`}>
                  <ArrowIcon up={totalPnl >= 0} />
                  <span className="spc-gain-abs">{fmtEur(Math.abs(totalPnl))}</span>
                  <span className="spc-gain-pct">({fmtPct(totalPnlPct)})</span>
                  <span className="spc-gain-label">Gesamt</span>
                </div>
                {Object.keys(quotes).length > 0 && (
                  <div className={`spc-daily-row ${dailyChange >= 0 ? 'positive' : 'negative'}`}>
                    <span className="spc-daily-label">Heute</span>
                    <span>{dailyChange >= 0 ? '+' : ''}{fmtEur(dailyChange)}</span>
                    <span className="spc-daily-pct">({fmtPct(dailyChangePct)})</span>
                  </div>
                )}
              </div>
              <div className="spc-mini-kpis">
                <div className="spc-mini-kpi">
                  <span className="spc-mini-label">Positionen</span>
                  <strong className="spc-mini-val">{enriched.length}</strong>
                </div>
                <div className="spc-mini-kpi">
                  <span className="spc-mini-label">Investiert</span>
                  <strong className="spc-mini-val">{fmtEur(totalCost)}</strong>
                </div>
                <div className="spc-mini-kpi">
                  <span className="spc-mini-label">Gewinn/Verlust</span>
                  <strong className={`spc-mini-val ${totalPnl >= 0 ? 'clr-success' : 'clr-danger'}`}>
                    {fmtEur(totalPnl)}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          <div className="spc-chart-section">
            <div className="stocks-chart-row">
              <div className="spc-chart-card">
                <div className="stocks-chart-header">
                  <div className="stocks-chart-header-left">
                    <span className="stocks-chart-title">Portfolio</span>
                    <span className="stocks-chart-value">{fmtEur(totalValue)}</span>
                  </div>
                  <div className="stocks-chart-header-right">
                    {wsConnected && (
                      <span className="stocks-live-badge" aria-label="Kurse werden live aktualisiert">
                        <span className="stocks-live-dot" aria-hidden="true" />
                        Live
                      </span>
                    )}
                    <div className="range-bar">
                      {RANGES.map(r => (
                        <button key={r} className={`range-btn${range === r ? ' is-active' : ''}`} onClick={() => setRange(r)} type="button">{r}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {chartLoading ? (
                  <div className="stocks-chart-loading" style={{ height: 220 }}>
                    <span className="stocks-chart-loading-spinner" />
                    Kursdaten werden geladen…
                  </div>
                ) : chartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id={chartGradId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={chartColor} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--clr-border)" opacity={0.4} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--clr-text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--clr-text-muted)' }} tickFormatter={(v: number) => fmtPrice(v, 'EUR')} width={86} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                      <Tooltip content={<ChartTooltip currency="EUR" label2="Portfoliowert" />} />
                      <Area type="monotone" dataKey="Wert" stroke={chartColor} strokeWidth={2} fill={`url(#${chartGradId})`} dot={false} activeDot={{ r: 4, fill: chartColor, strokeWidth: 0 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="stocks-chart-empty" style={{ height: 220 }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.35}>
                      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                    </svg>
                    Keine Kursdaten verfügbar
                  </div>
                )}
              </div>

              <div className="spc-pie-card">
                <span className="spc-pie-title">Allokation</span>
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={32} outerRadius={54} dataKey="value" paddingAngle={3}>
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => [fmtEur(v), 'Wert']}
                      contentStyle={{ borderRadius: 10, fontSize: 12, background: 'var(--clr-surface)', border: '1px solid var(--clr-border)', color: 'var(--clr-text)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="pie-legend">
                  {pieData.map((d, i) => (
                    <li key={d.name} className="pie-legend-item">
                      <span className="pie-legend-dot" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span title={d.name}>{d.name}</span>
                      <strong>{d.pct.toFixed(1)}%</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="stocks-fm-table">
            <div className="stocks-fm-header">
              <span>Aktie</span>
              <span>Trend</span>
              <span className="align-right">Anteile</span>
              <span className="align-right">Ø Kauf</span>
              <span className="align-right">Aktuell</span>
              <span className="align-right">Wert</span>
              <span className="align-right">+/–</span>
            </div>
            {enriched.map((p, idx) => {
              const currency = p.quote?.currency ?? 'USD';
              const sparkData = allHistories[p.symbol] ?? [];
              return (
                <div
                  key={p.id}
                  className="stocks-fm-row"
                  style={{ animationDelay: `${idx * 40}ms` }}
                  onClick={() => openDrawer(p.symbol, 'buy')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') openDrawer(p.symbol, 'buy'); }}
                >
                  <div className="stocks-fm-cell-name">
                    <StockLogo symbol={p.symbol} />
                    <div className="stock-cell-info">
                      <strong className="stock-row-symbol">{p.symbol}</strong>
                      <span className="stock-row-name" title={p.quote?.name ?? ''}>{p.quote?.name ?? ''}</span>
                    </div>
                  </div>
                  <div className="stocks-fm-cell-spark">
                    <Sparkline data={sparkData} positive={p.pnl >= 0} />
                  </div>
                  <div className="stocks-fm-cell align-right">{p.shares}</div>
                  <div className="stocks-fm-cell align-right">{fmtPrice(p.avg_buy_price, currency)}</div>
                  <div className="stocks-fm-cell align-right">
                    <span className={p.quote?.change && p.quote.change >= 0 ? 'clr-success' : p.quote?.change && p.quote.change < 0 ? 'clr-danger' : ''}>
                      {fmtPrice(p.currentPrice, currency)}
                    </span>
                  </div>
                  <div className="stocks-fm-cell align-right"><strong>{fmtPrice(p.value, currency)}</strong></div>
                  <div className="stocks-fm-cell align-right">
                    <PerfBadge pct={p.pnlPct} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <StockDetailDrawer
        symbol={drawerSymbol}
        onClose={() => setDrawerSymbol(null)}
        ownedShares={drawerOwnedShares}
        avgBuyPrice={drawerAvgBuyPrice}
        livePrice={drawerLivePrice}
        initialTab={drawerTab}
      />
    </div>
  );
}
