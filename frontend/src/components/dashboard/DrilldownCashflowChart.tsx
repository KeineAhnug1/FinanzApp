'use client';

import { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { formatMoney, type IncomeEntry, type ExpenseEntry } from './types';

type ChartLevel = 'timeline' | 'year' | 'month';

function buildTimelineData(
  income: IncomeEntry[],
  expenses: ExpenseEntry[],
  windowStart: number,
  foundingYear: number,
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

  let runningTotal = 0;
  for (let y = foundingYear; y < windowStart; y++) {
    const d = byYear[y];
    if (d) runningTotal += d.income - d.expense;
  }

  return years.map((y) => {
    const d = byYear[y] ?? { income: 0, expense: 0 };
    runningTotal += d.income - d.expense;
    return {
      name: String(y),
      _key: String(y),
      Einnahmen: Math.round(d.income * 100) / 100,
      Ausgaben: Math.round(d.expense * 100) / 100,
      Vermögen: Math.round(runningTotal * 100) / 100,
    };
  });
}

function buildMonthlyData(income: IncomeEntry[], expenses: ExpenseEntry[], year: string) {
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
  return months.map((k) => {
    const [y, m] = k.split('-');
    const label = new Intl.DateTimeFormat('de-DE', { month: 'short' }).format(new Date(Number(y), Number(m) - 1));
    const v = byMonth[k];
    return { name: label, _key: k, Einnahmen: Math.round(v.income * 100) / 100, Ausgaben: Math.round(v.expense * 100) / 100, Vermögen: Math.round((v.income - v.expense) * 100) / 100 };
  });
}

function buildDailyData(income: IncomeEntry[], expenses: ExpenseEntry[], monthKey: string) {
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
  return days.map((k) => {
    const day = k.split('-')[2];
    const v = byDay[k];
    return { name: day + '.', _key: k, Einnahmen: Math.round(v.income * 100) / 100, Ausgaben: Math.round(v.expense * 100) / 100, Vermögen: Math.round((v.income - v.expense) * 100) / 100 };
  });
}

export function DrilldownCashflowChart({
  income,
  expenses,
  foundingYear,
}: {
  income: IncomeEntry[];
  expenses: ExpenseEntry[];
  foundingYear: number;
}) {
  const currentYear = new Date().getFullYear();
  const defaultWindowStart = currentYear - 4;
  const minWindowStart = foundingYear;

  const [level, setLevel] = useState<ChartLevel>('timeline');
  const [windowStart, setWindowStart] = useState(defaultWindowStart);
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonthKey, setSelectedMonthKey] = useState('');

  const data = useMemo(() => {
    if (level === 'timeline') return buildTimelineData(income, expenses, windowStart, foundingYear);
    if (level === 'year') return buildMonthlyData(income, expenses, selectedYear);
    return buildDailyData(income, expenses, selectedMonthKey);
  }, [level, windowStart, selectedYear, selectedMonthKey, income, expenses, foundingYear]);

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
          <Line type="monotone" dataKey="Vermögen" stroke="var(--accent-violet, #8b5cf6)" strokeWidth={2.6} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
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
