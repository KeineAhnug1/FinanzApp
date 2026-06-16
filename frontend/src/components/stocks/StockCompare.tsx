'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { apiUrl } from '@/lib/api-client';

const COMPARE_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];
const MAX_SYMBOLS = 5;

type Range = '1W' | '1M' | '1J' | 'Max';
const RANGE_PERIODS: Record<Range, string> = { '1W': '5d', '1M': '1mo', '1J': '1y', 'Max': 'max' };
const RANGES: Range[] = ['1W', '1M', '1J', 'Max'];

interface SearchResult { symbol: string; name: string; exchange?: string }
interface HistoryPoint { date: string; close: number }

function fmtDateLabel(raw: string, range: Range) {
  const d = new Date(raw.slice(0, 10));
  if (range === 'Max') return d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
  if (range === '1J') return d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

interface CompareTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string; color: string }>;
  label?: string;
}

function CompareTooltip({ active, payload, label }: CompareTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="stocks-chart-tooltip">
      <div className="stocks-chart-tooltip-label">{label}</div>
      {payload
        .filter(p => p.value != null)
        .map(p => (
          <div key={p.dataKey} className="stocks-compare-tooltip-row">
            <span className="stocks-compare-tooltip-dot" style={{ background: p.color }} aria-hidden="true" />
            <span className="stocks-compare-tooltip-sym">{p.dataKey}</span>
            <span
              className="stocks-compare-tooltip-val"
              style={{ color: p.value >= 0 ? 'var(--clr-success)' : 'var(--clr-danger)' }}
            >
              {p.value >= 0 ? '+' : ''}{p.value.toFixed(2)}%
            </span>
          </div>
        ))}
    </div>
  );
}

export function StockCompare() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [range, setRange] = useState<Range>('1J');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); setShowResults(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(apiUrl(`/api/stocks/search?q=${encodeURIComponent(q)}`), { credentials: 'include' });
        const d: { results?: SearchResult[] } = await res.json();
        const seen = new Set<string>();
        const unique = (d.results ?? []).filter(r => seen.has(r.symbol) ? false : seen.add(r.symbol));
        setSearchResults(unique);
        setShowResults(true);
      } catch { setSearchResults([]); }
    }, 280);
  }, []);

  const addSymbol = (sym: string) => {
    const s = sym.toUpperCase();
    if (symbols.includes(s) || symbols.length >= MAX_SYMBOLS) return;
    setSymbols([...symbols, s]);
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
  };

  const removeSymbol = (sym: string) => setSymbols(symbols.filter(s => s !== sym));

  const period = RANGE_PERIODS[range];
  const queries = useQueries({
    queries: symbols.map(symbol => ({
      queryKey: ['stock-history', symbol, period],
      queryFn: async (): Promise<HistoryPoint[]> => {
        const res = await fetch(apiUrl(`/api/stocks/history/${encodeURIComponent(symbol)}?period=${period}`), { credentials: 'include' });
        const d: { ok?: boolean; history?: HistoryPoint[] } = await res.json();
        return d.history ?? [];
      },
      enabled: symbols.length > 0,
      staleTime: 60_000,
    })),
  });

  const isLoading = queries.some(q => q.isLoading);
  const hasError = queries.some(q => q.isError);

  type ChartRow = { date: string } & Record<string, number | string | null>;

  const chartData: ChartRow[] = useMemo(() => {
    if (symbols.length === 0) return [];
    const rowsBySymbol = symbols.map((sym, i) => {
      const hist = queries[i]?.data ?? [];
      const first = hist.find(p => p.close > 0)?.close;
      if (!first || first === 0) return new Map<string, number>();
      const m = new Map<string, number>();
      hist.forEach(p => {
        if (p.close > 0) m.set(p.date, ((p.close - first) / first) * 100);
      });
      return m;
    });
    const allDates = new Set<string>();
    rowsBySymbol.forEach(m => m.forEach((_, k) => allDates.add(k)));
    const sorted = Array.from(allDates).sort();
    return sorted.map(date => {
      const row: ChartRow = { date };
      symbols.forEach((sym, i) => {
        const v = rowsBySymbol[i].get(date);
        row[sym] = v === undefined ? null : Math.round(v * 100) / 100;
      });
      return row;
    });
  }, [symbols, queries]);

  const latestPct: Record<string, number | undefined> = useMemo(() => {
    const out: Record<string, number | undefined> = {};
    symbols.forEach((sym, i) => {
      const hist = queries[i]?.data ?? [];
      if (hist.length < 2) { out[sym] = undefined; return; }
      const first = hist.find(p => p.close > 0)?.close;
      const last = [...hist].reverse().find(p => p.close > 0)?.close;
      if (!first || !last) { out[sym] = undefined; return; }
      out[sym] = ((last - first) / first) * 100;
    });
    return out;
  }, [symbols, queries]);

  return (
    <section className="stocks-compare">
      <header className="stocks-compare-header">
        <button
          type="button"
          className="stocks-compare-toggle"
          onClick={() => setCollapsed(c => !c)}
          aria-expanded={!collapsed}
        >
          <span className="stocks-compare-title">Aktien vergleichen</span>
          <span className="stocks-compare-sub">
            {symbols.length === 0 ? 'Mehrere Aktien hinzufügen, um die Performance gegenüberzustellen' : `${symbols.length} ausgewählt`}
          </span>
          <svg
            className={`stocks-compare-chevron${collapsed ? '' : ' is-open'}`}
            width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </header>

      {!collapsed && (
        <div className="stocks-compare-body">
          <div className="stocks-compare-controls">
            <div className="stocks-compare-chips">
              {symbols.map((sym, i) => (
                <span key={sym} className="stocks-compare-chip" style={{ borderColor: COMPARE_COLORS[i] }}>
                  <span className="stocks-compare-chip-dot" style={{ background: COMPARE_COLORS[i] }} aria-hidden="true" />
                  <span className="stocks-compare-chip-sym">{sym}</span>
                  {latestPct[sym] !== undefined && (
                    <span
                      className="stocks-compare-chip-pct"
                      style={{ color: latestPct[sym]! >= 0 ? 'var(--clr-success)' : 'var(--clr-danger)' }}
                    >
                      {latestPct[sym]! >= 0 ? '+' : ''}{latestPct[sym]!.toFixed(2)}%
                    </span>
                  )}
                  <button
                    type="button"
                    className="stocks-compare-chip-remove"
                    onClick={() => removeSymbol(sym)}
                    aria-label={`${sym} entfernen`}
                  >×</button>
                </span>
              ))}
              {symbols.length < MAX_SYMBOLS && (
                <div ref={wrapRef} className="stocks-compare-search-wrap">
                  <input
                    className="stocks-compare-search-input"
                    type="text"
                    placeholder={symbols.length === 0 ? 'Erste Aktie suchen…' : 'Weitere Aktie hinzufügen…'}
                    value={searchQuery}
                    onChange={e => handleSearch(e.target.value)}
                    onFocus={() => searchResults.length > 0 && setShowResults(true)}
                  />
                  {showResults && searchResults.length > 0 && (
                    <div className="stocks-compare-search-results">
                      {searchResults.slice(0, 8).map(r => (
                        <button
                          key={r.symbol}
                          type="button"
                          className="stocks-compare-search-item"
                          onClick={() => addSymbol(r.symbol)}
                          disabled={symbols.includes(r.symbol)}
                        >
                          <strong>{r.symbol}</strong>
                          <span>{r.name}</span>
                          {r.exchange && <span className="stocks-compare-search-exchange">{r.exchange}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {symbols.length > 0 && (
              <div className="range-bar">
                {RANGES.map(r => (
                  <button
                    key={r}
                    type="button"
                    className={`range-btn${range === r ? ' is-active' : ''}`}
                    onClick={() => setRange(r)}
                  >{r}</button>
                ))}
              </div>
            )}
          </div>

          <div className="stocks-compare-chart">
            {symbols.length === 0 ? (
              <div className="stocks-compare-hint">
                Wähle 2 oder mehr Aktien, um ihre prozentuale Performance über den gewählten Zeitraum zu vergleichen.
              </div>
            ) : isLoading ? (
              <div className="stocks-chart-loading" style={{ height: 320 }}>
                <div className="stocks-chart-spinner" />
              </div>
            ) : hasError || chartData.length === 0 ? (
              <div className="stocks-chart-empty" style={{ height: 320 }}>
                Keine Vergleichsdaten verfügbar.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--clr-border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d: string) => fmtDateLabel(d, range)}
                    stroke="var(--clr-text-muted)"
                    tick={{ fontSize: 11 }}
                    minTickGap={28}
                  />
                  <YAxis
                    stroke="var(--clr-text-muted)"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`}
                    width={50}
                  />
                  <Tooltip content={<CompareTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {symbols.map((sym, i) => (
                    <Line
                      key={sym}
                      type="monotone"
                      dataKey={sym}
                      stroke={COMPARE_COLORS[i]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
