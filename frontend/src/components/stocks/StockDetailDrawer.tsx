'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { apiUrl, getCsrfToken, safeJson } from '@/lib/api-client';
import { currentEffectiveBalancesByAccount } from '@/components/dashboard/wealth';
import type { BankAccount as BankAccountForBalance, IncomeEntry as IncomeEntryForBalance, ExpenseEntry as ExpenseEntryForBalance } from '@/components/dashboard/types';

export type DrawerRange = '1T' | '1W' | '1M' | '1J' | 'Max';
const RANGE_PERIODS: Record<DrawerRange, string> = { '1T': '1d', '1W': '5d', '1M': '1mo', '1J': '1y', 'Max': 'max' };
const RANGES: DrawerRange[] = ['1T', '1W', '1M', '1J', 'Max'];

interface HistoryPoint { date: string; close: number; }
interface Quote { symbol: string; price: number; change: number; change_pct: number; name?: string; currency?: string; }
// API response shape (id stringified, label non-null) — differs from the DB row in @/types/db.
interface BankAccount { id: string; label: string; balance: number; }
interface ShareAccount { id: number | string; label: string; }
interface PositionRow { symbol: string; units?: number; shares?: number; }

interface Props {
  symbol: string | null;
  onClose: () => void;
  ownedShares: number;
  avgBuyPrice?: number;
  livePrice?: number;
  initialTab?: 'buy' | 'sell';
  defaultShareAccountId?: number | null;
}

export function fmtPrice(v: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency}`;
  }
}
export const fmtEur = (v: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v);
export const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

function fmtDateLabel(raw: string, range: DrawerRange) {
  if (range === '1T' || range === '1W') {
    const parts = raw.split(' ');
    const time = parts[1]?.slice(0, 5) ?? '';
    if (range === '1W' && parts[0]) {
      const d = new Date(parts[0]);
      return `${d.toLocaleDateString('de-DE', { weekday: 'short' })} ${time}`;
    }
    return time;
  }
  if (range === 'Max') {
    const d = new Date(raw.slice(0, 10));
    return d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
  }
  const d = new Date(raw.slice(0, 10));
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function ChartTip({ active, payload, label, currency }: {
  active?: boolean; payload?: { value: number }[]; label?: string; currency: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="stocks-chart-tooltip">
      <span className="stocks-chart-tooltip-label">{label}</span>
      <span className="stocks-chart-tooltip-val">{fmtPrice(payload[0]?.value ?? 0, currency)}</span>
      <span className="stocks-chart-tooltip-sub">Kurs</span>
    </div>
  );
}

export function StockDetailDrawer({ symbol, onClose, ownedShares, avgBuyPrice, livePrice, initialTab = 'buy', defaultShareAccountId }: Props) {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<DrawerRange>('1M');
  const [tab, setTab] = useState<'buy' | 'sell'>(initialTab);
  const [shares, setShares] = useState('');
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const [shareAccountId, setShareAccountId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setTab(initialTab); }, [initialTab, symbol]);
  useEffect(() => { if (!symbol) { setShares(''); } }, [symbol]);

  const open = symbol !== null;

  const { data: quote } = useQuery<Quote | null>({
    queryKey: ['drawer-quote', symbol],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      if (!symbol) return null;
      const r = await fetch(apiUrl(`/api/stocks/quotes?symbols=${encodeURIComponent(symbol)}`), { credentials: 'include' });
      const d = await safeJson(r) as { ok: boolean; quotes?: Quote[] };
      return d.quotes?.[0] ?? null;
    },
  });

  const { data: history = [], isLoading: histLoading } = useQuery<HistoryPoint[]>({
    queryKey: ['drawer-history', symbol, range],
    enabled: open,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!symbol) return [];
      const r = await fetch(apiUrl(`/api/stocks/history/${symbol}?period=${RANGE_PERIODS[range]}`), { credentials: 'include' });
      const d = await safeJson(r) as { ok: boolean; history?: HistoryPoint[] };
      return d.history ?? [];
    },
  });

  const { data: bankAccountsRaw = [] } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const r = await fetch(apiUrl('/api/finance/bank-accounts'), { credentials: 'include' });
      const d = await safeJson(r) as { ok: boolean; accounts?: BankAccount[] };
      return d.accounts ?? [];
    },
  });
  // The raw `bank_accounts.balance` field on the backend counts a recurring entry
  // once instead of once per past occurrence and misses legacy opening capital, so
  // we recompute per-account balances the same way the rest of the app does.
  const { data: bankTransactions } = useQuery({
    queryKey: ['transactions', 'all'],
    enabled: open,
    queryFn: async () => {
      const r = await fetch(apiUrl('/api/finance/transactions?limit=2000'), { credentials: 'include' });
      const d = await safeJson(r) as { ok: boolean; entries?: unknown[] };
      type RawEntry = { type: string; is_active?: boolean; state?: string };
      const visible = ((d.entries ?? []) as RawEntry[]).filter((e) => !(e.is_active === false && e.state === 'completed'));
      return {
        income: visible.filter((e) => e.type === 'income') as unknown as IncomeEntryForBalance[],
        expense: visible.filter((e) => e.type === 'expense') as unknown as ExpenseEntryForBalance[],
      };
    },
  });
  const bankAccounts = useMemo<BankAccount[]>(() => {
    if (!bankTransactions) return bankAccountsRaw;
    const balances = currentEffectiveBalancesByAccount(bankTransactions.income, bankTransactions.expense, bankAccountsRaw as unknown as BankAccountForBalance[]);
    return bankAccountsRaw.map((a) => ({ ...a, balance: balances.get(String(a.id)) ?? 0 }));
  }, [bankAccountsRaw, bankTransactions]);

  useEffect(() => {
    if (!bankAccountId && bankAccounts.length > 0) setBankAccountId(bankAccounts[0]!.id);
  }, [bankAccounts, bankAccountId]);

  const { data: shareAccounts = [] } = useQuery<ShareAccount[]>({
    queryKey: ['share-accounts'],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const r = await fetch(apiUrl('/api/finance/share-accounts'), { credentials: 'include' });
      const d = await safeJson(r) as { ok: boolean; share_accounts?: ShareAccount[] };
      return d.share_accounts ?? [];
    },
  });

  useEffect(() => {
    if (shareAccounts.length === 0) return;
    if (defaultShareAccountId != null) {
      const match = shareAccounts.find((a) => Number(a.id) === defaultShareAccountId);
      if (match) { setShareAccountId(String(match.id)); return; }
    }
    setShareAccountId(String(shareAccounts[0]!.id));
  }, [shareAccounts, defaultShareAccountId, symbol]);

  const { data: depotPositions = [] } = useQuery<PositionRow[]>({
    queryKey: ['stock-positions', shareAccountId, 'drawer'],
    enabled: open && shareAccountId !== '',
    staleTime: 30_000,
    queryFn: async () => {
      const r = await fetch(
        apiUrl(`/api/stocks/positions?share_account_id=${encodeURIComponent(shareAccountId)}`),
        { credentials: 'include' },
      );
      const d = await safeJson(r) as { ok: boolean; positions?: PositionRow[] };
      return d.positions ?? [];
    },
  });

  const depotOwnedShares = useMemo(() => {
    if (!symbol || shareAccountId === '') return ownedShares;
    const row = depotPositions.find((p) => p.symbol === symbol);
    if (!row) return 0;
    return Number(row.shares ?? row.units ?? 0);
  }, [depotPositions, symbol, shareAccountId, ownedShares]);

  const currency = quote?.currency ?? 'USD';
  const price = livePrice ?? quote?.price ?? 0;
  const sharesNum = Number(shares);
  const totalValue = Number.isFinite(sharesNum) && sharesNum > 0 ? sharesNum * price : 0;

  const { data: fxRate = 1 } = useQuery<number>({
    queryKey: ['fx-to-eur', currency],
    enabled: open && currency !== 'EUR',
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (currency === 'EUR') return 1;
      const r = await fetch(apiUrl(`/api/stocks/fx?from=${encodeURIComponent(currency)}`), { credentials: 'include' });
      const d = await safeJson(r) as { ok: boolean; rate?: number };
      return d.ok && typeof d.rate === 'number' ? d.rate : 1;
    },
  });

  const totalValueEur = totalValue * fxRate;

  const pnlPerShare = avgBuyPrice != null && price > 0 ? price - avgBuyPrice : null;
  const tradePnl = pnlPerShare != null && sharesNum > 0 ? pnlPerShare * sharesNum : null;

  const chartData = useMemo(
    () => history.map((h) => ({ date: fmtDateLabel(h.date, range), close: h.close })),
    [history, range],
  );
  const firstVal = chartData[0]?.close ?? 0;
  const lastVal = chartData[chartData.length - 1]?.close ?? 0;
  const chartPositive = lastVal >= firstVal;
  const chartColor = chartPositive ? '#22c55e' : '#ef4444';

  const selectedBank = bankAccounts.find((b) => b.id === bankAccountId);
  const insufficientFunds = tab === 'buy' && selectedBank ? selectedBank.balance < totalValueEur : false;
  const insufficientShares = tab === 'sell' && sharesNum > depotOwnedShares;

  const handleTrade = async () => {
    if (!symbol || !sharesNum || sharesNum <= 0 || !bankAccountId || !shareAccountId) return;
    setSubmitting(true);
    try {
      const res = await fetch(apiUrl(`/api/stocks/positions/${tab}`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
        body: JSON.stringify({
          symbol,
          shares: sharesNum,
          bank_account_id: Number(bankAccountId),
          share_account_id: Number(shareAccountId),
        }),
      });
      const data = await safeJson(res) as { ok: boolean; message?: string };
      if (data.ok) {
        toast.success(tab === 'buy' ? `${sharesNum} ${symbol} gekauft` : `${sharesNum} ${symbol} verkauft`);
        setShares('');
        queryClient.invalidateQueries({ queryKey: ['stock-positions'] });
        queryClient.invalidateQueries({ queryKey: ['stock-quotes'] });
        queryClient.invalidateQueries({ queryKey: ['all-histories'] });
        queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
      } else {
        toast.error(data.message ?? 'Fehler');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !symbol) return null;

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="stocks-drawer">
        <div className="stocks-drawer-head">
          <div className="stocks-drawer-title">
            <strong>{symbol}</strong>
            {quote?.name && <span className="stocks-drawer-name">{quote.name}</span>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Schließen" type="button">✕</button>
        </div>

        <div className="stocks-drawer-price-row">
          <span className="stocks-drawer-price">{fmtPrice(price, currency)}</span>
          {quote && (
            <span className={`stock-perf-badge ${quote.change_pct >= 0 ? 'positive' : 'negative'}`}>
              {fmtPct(quote.change_pct)}
            </span>
          )}
          {ownedShares > 0 && (
            <span className="stocks-drawer-owned">
              Bestand: <strong>{ownedShares}</strong>
            </span>
          )}
        </div>

        <div className="stocks-drawer-chart">
          <div className="stocks-drawer-chart-head">
            <div className="range-bar">
              {RANGES.map((r) => (
                <button
                  key={r}
                  className={`range-btn${range === r ? ' is-active' : ''}`}
                  onClick={() => setRange(r)}
                  type="button"
                >{r}</button>
              ))}
            </div>
          </div>
          {histLoading ? (
            <div className="stocks-chart-loading" style={{ height: 220 }}>
              <span className="stocks-chart-loading-spinner" />
              Kursdaten werden geladen…
            </div>
          ) : chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`drawerGrad-${chartPositive ? 'p' : 'n'}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColor} stopOpacity={0.22} />
                    <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--clr-border)" opacity={0.4} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--clr-text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: 'var(--clr-text-muted)' }} tickFormatter={(v: number) => fmtPrice(v, currency)} width={86} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                <Tooltip content={<ChartTip currency={currency} />} />
                <Area type="monotone" dataKey="close" stroke={chartColor} strokeWidth={2} fill={`url(#drawerGrad-${chartPositive ? 'p' : 'n'})`} dot={false} activeDot={{ r: 4, fill: chartColor, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="stocks-chart-empty" style={{ height: 220 }}>Keine Kursdaten verfügbar</div>
          )}
        </div>

        <div className="stocks-drawer-trade">
          <div className="stocks-drawer-tabs" role="tablist">
            <button
              className={`stocks-drawer-tab${tab === 'buy' ? ' is-active' : ''}`}
              onClick={() => setTab('buy')}
              type="button"
              role="tab"
              aria-selected={tab === 'buy'}
            >Kaufen</button>
            <button
              className={`stocks-drawer-tab${tab === 'sell' ? ' is-active' : ''}${ownedShares <= 0 ? ' is-disabled' : ''}`}
              onClick={() => ownedShares > 0 && setTab('sell')}
              type="button"
              role="tab"
              aria-selected={tab === 'sell'}
              disabled={ownedShares <= 0}
            >Verkaufen</button>
          </div>

          <div className="stocks-drawer-form">
            <label className="stocks-drawer-field">
              <span>Anteile</span>
              <input
                type="number"
                min="0.0001"
                step="0.0001"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder={tab === 'sell' ? `max. ${ownedShares}` : 'z.B. 1'}
              />
            </label>
            <label className="stocks-drawer-field">
              <span>Bankkonto</span>
              <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                {bankAccounts.length === 0 && <option value="">Kein Konto</option>}
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>{b.label} — {fmtEur(b.balance)}</option>
                ))}
              </select>
            </label>
            <div className="stocks-drawer-summary">
              <span>Kurs</span>
              <strong>{fmtPrice(price, currency)}</strong>
              {tab === 'sell' && avgBuyPrice != null && (
                <>
                  <span>Ø Kaufkurs</span>
                  <strong>{fmtPrice(avgBuyPrice, currency)}</strong>
                </>
              )}
              <span>{tab === 'buy' ? 'Kosten' : 'Erlös'}</span>
              <strong className={tab === 'buy' ? 'clr-danger' : 'clr-success'}>
                {fmtPrice(totalValue, currency)}
                {currency !== 'EUR' && totalValue > 0 && (
                  <span className="stocks-drawer-fx-hint"> ≈ {fmtEur(totalValueEur)}</span>
                )}
              </strong>
              {tab === 'sell' && tradePnl != null && sharesNum > 0 && (
                <>
                  <span>Gewinn/Verlust</span>
                  <strong className={tradePnl >= 0 ? 'clr-success' : 'clr-danger'}>
                    {tradePnl >= 0 ? '+' : ''}{fmtPrice(tradePnl, currency)}
                    {pnlPerShare != null && (
                      <span className="stocks-drawer-pnl-per-share">
                        {' '}({pnlPerShare >= 0 ? '+' : ''}{fmtPrice(pnlPerShare, currency)}/Aktie)
                      </span>
                    )}
                  </strong>
                </>
              )}
            </div>
            {insufficientFunds && (
              <div className="stocks-drawer-warning">Nicht genügend Guthaben auf diesem Bankkonto.</div>
            )}
            {insufficientShares && (
              <div className="stocks-drawer-warning">Du besitzt nur {ownedShares} Anteile.</div>
            )}
            <button
              className={`stocks-drawer-submit ${tab}`}
              type="button"
              disabled={
                submitting ||
                !sharesNum ||
                sharesNum <= 0 ||
                !bankAccountId ||
                insufficientFunds ||
                insufficientShares
              }
              onClick={handleTrade}
            >
              {submitting
                ? 'Wird verarbeitet…'
                : tab === 'buy'
                  ? `${symbol} kaufen`
                  : `${symbol} verkaufen`}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
