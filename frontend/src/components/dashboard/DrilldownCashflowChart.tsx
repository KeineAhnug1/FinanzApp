'use client';

import { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { formatMoney, type IncomeEntry, type ExpenseEntry } from './types';
import { expandAllRecurring } from './recurring';

type ChartLevel = 'timeline' | 'year' | 'month';

interface SignedCashflow {
  ts: number;
  amount: number; // signed: income positive, expense negative
  isProjected: boolean;
}

function buildCashflowIndex(income: IncomeEntry[], expenses: ExpenseEntry[]): SignedCashflow[] {
  const out: SignedCashflow[] = [];
  for (const e of income) {
    const ts = new Date(e.received_at).getTime();
    if (!Number.isFinite(ts)) continue;
    out.push({ ts, amount: Number(e.amount), isProjected: e.isProjected === true });
  }
  for (const e of expenses) {
    const ts = new Date(e.spent_at).getTime();
    if (!Number.isFinite(ts)) continue;
    out.push({ ts, amount: -Number(e.amount), isProjected: e.isProjected === true });
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

// Predicted balance at the END of the given boundary date.
//
// `currentBalance` is the live `bank_accounts.balance`, which already reflects every entry
// the backend has booked — including entries dated in the future. So when projecting the
// balance curve forward, only `isProjected` cashflows (virtual recurrence projections that
// are NOT yet stored) should move the balance; real entries already counted in
// `currentBalance` would otherwise be double-counted.
//
// When reaching backward into the past, we have the opposite situation: we need to undo
// the real bookings that have happened between the past boundary and today. Projected
// cashflows are by definition not stored, so they do not need to be undone.
function balanceAt(boundary: Date, today: number, currentBalance: number, cashflow: SignedCashflow[]): number {
  const t = boundary.getTime();
  if (t === today) return currentBalance;

  if (t > today) {
    let delta = 0;
    for (const cf of cashflow) {
      if (!cf.isProjected) continue;
      if (cf.ts <= today) continue;
      if (cf.ts > t) break;
      delta += cf.amount;
    }
    return currentBalance + delta;
  }

  // boundary is in the past: subtract every REAL booking that occurred after boundary up to today
  let delta = 0;
  for (let i = cashflow.length - 1; i >= 0; i--) {
    const cf = cashflow[i]!;
    if (cf.isProjected) continue;
    if (cf.ts > today) continue;
    if (cf.ts <= t) break;
    delta += cf.amount;
  }
  return currentBalance - delta;
}

function buildTimelineData(
  income: IncomeEntry[],
  expenses: ExpenseEntry[],
  windowStart: number,
  currentBalance: number,
  cashflow: SignedCashflow[],
  earliestAccountTs: number | null,
) {
  const byYear: Record<number, { income: number; expense: number }> = {};
  for (const e of income) {
    const y = new Date(e.received_at).getFullYear();
    if (!byYear[y]) byYear[y] = { income: 0, expense: 0 };
    byYear[y].income += Number(e.amount);
  }
  for (const e of expenses) {
    const y = new Date(e.spent_at).getFullYear();
    if (!byYear[y]) byYear[y] = { income: 0, expense: 0 };
    byYear[y].expense += Number(e.amount);
  }

  const years: number[] = [];
  for (let y = windowStart; y < windowStart + 8; y++) years.push(y);
  const today = Date.now();

  return years.map((y) => {
    const d = byYear[y] ?? { income: 0, expense: 0 };
    const yearEnd = new Date(y, 11, 31, 23, 59, 59);
    const hasWealth = earliestAccountTs == null || yearEnd.getTime() >= earliestAccountTs;
    return {
      name: String(y),
      _key: String(y),
      Einnahmen: Math.round(d.income * 100) / 100,
      Ausgaben: Math.round(d.expense * 100) / 100,
      Vermögen: hasWealth ? Math.round(balanceAt(yearEnd, today, currentBalance, cashflow) * 100) / 100 : null,
    };
  });
}

function buildMonthlyData(
  income: IncomeEntry[],
  expenses: ExpenseEntry[],
  year: string,
  currentBalance: number,
  cashflow: SignedCashflow[],
  earliestAccountTs: number | null,
) {
  const months: string[] = [];
  for (let m = 1; m <= 12; m++) months.push(`${year}-${String(m).padStart(2, '0')}`);
  const byMonth: Record<string, { income: number; expense: number }> = {};
  for (const k of months) byMonth[k] = { income: 0, expense: 0 };
  for (const e of income) {
    const d = new Date(e.received_at);
    if (String(d.getFullYear()) !== year) continue;
    const k = `${year}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byMonth[k].income += Number(e.amount);
  }
  for (const e of expenses) {
    const d = new Date(e.spent_at);
    if (String(d.getFullYear()) !== year) continue;
    const k = `${year}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byMonth[k].expense += Number(e.amount);
  }
  const today = Date.now();
  return months.map((k) => {
    const [y, m] = k.split('-');
    const yNum = Number(y);
    const mNum = Number(m);
    const label = new Intl.DateTimeFormat('de-DE', { month: 'short' }).format(new Date(yNum, mNum - 1));
    const v = byMonth[k];
    const monthEnd = new Date(yNum, mNum, 0, 23, 59, 59);
    const hasWealth = earliestAccountTs == null || monthEnd.getTime() >= earliestAccountTs;
    return {
      name: label,
      _key: k,
      Einnahmen: Math.round(v.income * 100) / 100,
      Ausgaben: Math.round(v.expense * 100) / 100,
      Vermögen: hasWealth ? Math.round(balanceAt(monthEnd, today, currentBalance, cashflow) * 100) / 100 : null,
    };
  });
}

function buildDailyData(
  income: IncomeEntry[],
  expenses: ExpenseEntry[],
  monthKey: string,
  currentBalance: number,
  cashflow: SignedCashflow[],
  earliestAccountTs: number | null,
) {
  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const days: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) days.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  const byDay: Record<string, { income: number; expense: number }> = {};
  for (const k of days) byDay[k] = { income: 0, expense: 0 };
  for (const e of income) {
    const d = new Date(e.received_at);
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue;
    const k = `${year}-${String(month).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (byDay[k]) byDay[k].income += Number(e.amount);
  }
  for (const e of expenses) {
    const d = new Date(e.spent_at);
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue;
    const k = `${year}-${String(month).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (byDay[k]) byDay[k].expense += Number(e.amount);
  }
  const today = Date.now();
  return days.map((k) => {
    const [yStr, mStr, dStr] = k.split('-');
    const day = dStr;
    const v = byDay[k];
    const dayEnd = new Date(Number(yStr), Number(mStr) - 1, Number(dStr), 23, 59, 59);
    const hasWealth = earliestAccountTs == null || dayEnd.getTime() >= earliestAccountTs;
    return {
      name: day + '.',
      _key: k,
      Einnahmen: Math.round(v.income * 100) / 100,
      Ausgaben: Math.round(v.expense * 100) / 100,
      Vermögen: hasWealth ? Math.round(balanceAt(dayEnd, today, currentBalance, cashflow) * 100) / 100 : null,
    };
  });
}

export function DrilldownCashflowChart({
  income,
  expenses,
  foundingYear,
  currentBalance,
  earliestAccountOpenedAt = null,
}: {
  income: IncomeEntry[];
  expenses: ExpenseEntry[];
  foundingYear: number;
  currentBalance: number;
  earliestAccountOpenedAt?: number | null;
}) {
  const currentYear = new Date().getFullYear();
  const defaultWindowStart = currentYear - 4;
  const minWindowStart = foundingYear;

  const [level, setLevel] = useState<ChartLevel>('timeline');
  const [windowStart, setWindowStart] = useState(defaultWindowStart);
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonthKey, setSelectedMonthKey] = useState('');

  const horizonEnd = useMemo(() => {
    const endYear = Math.max(windowStart + 7, currentYear + 1);
    return new Date(endYear, 11, 31, 23, 59, 59);
  }, [windowStart, currentYear]);

  const projectedIncome = useMemo(
    () => expandAllRecurring(income, horizonEnd),
    [income, horizonEnd],
  );
  const projectedExpenses = useMemo(
    () => expandAllRecurring(expenses, horizonEnd),
    [expenses, horizonEnd],
  );

  const cashflow = useMemo(
    () => buildCashflowIndex(projectedIncome, projectedExpenses),
    [projectedIncome, projectedExpenses],
  );

  const data = useMemo(() => {
    if (level === 'timeline') return buildTimelineData(projectedIncome, projectedExpenses, windowStart, currentBalance, cashflow, earliestAccountOpenedAt);
    if (level === 'year') return buildMonthlyData(projectedIncome, projectedExpenses, selectedYear, currentBalance, cashflow, earliestAccountOpenedAt);
    return buildDailyData(projectedIncome, projectedExpenses, selectedMonthKey, currentBalance, cashflow, earliestAccountOpenedAt);
  }, [level, windowStart, selectedYear, selectedMonthKey, projectedIncome, projectedExpenses, currentBalance, cashflow, earliestAccountOpenedAt]);

  type ChartClickPayload = { activePayload?: { payload?: { _key?: string } }[] };
  const handleClick = (payload: ChartClickPayload) => {
    const key = payload?.activePayload?.[0]?.payload?._key;
    if (!key) return;
    if (level === 'timeline') {
      setSelectedYear(key);
      setLevel('year');
    } else if (level === 'year') {
      setSelectedMonthKey(key);
      setLevel('month');
    }
  };

  const goBack = () => {
    if (level === 'month') setLevel('year');
    else if (level === 'year') { setSelectedYear(''); setLevel('timeline'); }
  };

  const shiftWindow = (dir: -1 | 1) => {
    setWindowStart((prev) => {
      const next = prev + dir;
      if (next < minWindowStart) return minWindowStart;
      return next;
    });
  };

  const breadcrumb =
    level === 'timeline' ? `${windowStart} – ${windowStart + 7}` :
    level === 'year' ? selectedYear :
    (() => { const [my, mm] = selectedMonthKey.split('-').map(Number); return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(new Date(my, mm - 1, 1)); })();

  return (
    <div className="cashflow-chart">
      <div className="chart-breadcrumb">
        {level !== 'timeline' ? (
          <button className="btn btn-ghost btn-sm" onClick={goBack}>← Zurück</button>
        ) : (
          <div className="chart-window-nav">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => shiftWindow(-1)}
              disabled={windowStart <= minWindowStart}
              title="Früher"
            >
              ←
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => shiftWindow(1)}
              title="Später"
            >
              →
            </button>
          </div>
        )}
        <span className="chart-breadcrumb-label">{breadcrumb}</span>
        {level !== 'month' && (
          <span className="chart-hint">Klicken zum Einzoomen</span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart
          data={data}
          onClick={level !== 'month' ? handleClick : undefined}
          style={{ cursor: level !== 'month' ? 'pointer' : 'default' }}
          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="cashflow-grid" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={(v: number) => `${v}€`} width={64} />
          <Tooltip formatter={(v: number) => formatMoney(v)} />
          <Line type="monotone" dataKey="Einnahmen" stroke="var(--accent-blue, #3b82f6)" strokeWidth={2.6} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
          <Line type="monotone" dataKey="Ausgaben" stroke="var(--accent-orange, #ef5b2a)" strokeWidth={2.6} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
          <Line type="monotone" dataKey="Vermögen" stroke="var(--accent-violet, #8b5cf6)" strokeWidth={2.6} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
      <div className="cashflow-legend">
        <span className="cashflow-legend-item"><span className="cashflow-legend-dot income" /> Einnahmen</span>
        <span className="cashflow-legend-item"><span className="cashflow-legend-dot expense" /> Ausgaben</span>
        <span className="cashflow-legend-item"><span className="cashflow-legend-dot savings" /> Vermögen</span>
      </div>
    </div>
  );
}
