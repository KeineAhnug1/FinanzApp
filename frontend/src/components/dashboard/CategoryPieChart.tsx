'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatMoney, getCategoryLabel, type IncomeEntry, type ExpenseEntry } from './types';

const PIE_COLORS_WARM = ['#ef5b2a', '#f57c00', '#f9a825', '#f4a261', '#e76f51', '#f7b267', '#ff7043', '#d97706'];
const PIE_COLORS_COOL = ['#2563eb', '#0891b2', '#0d9488', '#4f46e5', '#7c3aed', '#1d4ed8', '#0369a1', '#059669'];

export function CategoryPieChart({
  income,
  expenses,
  mode,
}: {
  income: IncomeEntry[];
  expenses: ExpenseEntry[];
  mode: 'income' | 'expense' | 'both';
}) {
  if (mode === 'both') {
    const byIncomeCat: Record<string, number> = {};
    income.forEach((e) => {
      const cat = e.category ?? 'other';
      byIncomeCat[cat] = (byIncomeCat[cat] ?? 0) + Number(e.amount);
    });
    const byExpenseCat: Record<string, number> = {};
    expenses.forEach((e) => {
      const cat = e.category ?? 'other';
      byExpenseCat[cat] = (byExpenseCat[cat] ?? 0) + Number(e.amount);
    });

    const incomeSlices = Object.entries(byIncomeCat)
      .map(([cat, val]) => ({ name: getCategoryLabel(cat), value: Math.round(val * 100) / 100, type: 'Einnahme' as const }))
      .sort((a, b) => b.value - a.value).slice(0, 5);
    const expenseSlices = Object.entries(byExpenseCat)
      .map(([cat, val]) => ({ name: getCategoryLabel(cat), value: Math.round(val * 100) / 100, type: 'Ausgabe' as const }))
      .sort((a, b) => b.value - a.value).slice(0, 5);

    const data = [
      ...incomeSlices.map((d, i) => ({ ...d, color: PIE_COLORS_WARM[i % PIE_COLORS_WARM.length] })),
      ...expenseSlices.map((d, i) => ({ ...d, color: PIE_COLORS_COOL[i % PIE_COLORS_COOL.length] })),
    ];
    const total = data.reduce((s, d) => s + d.value, 0);

    if (data.length === 0) return <p className="bars-empty">Keine Einträge vorhanden.</p>;
    return (
      <div className="overview-pie-wrap">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2}>
              {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Pie>
            <Tooltip formatter={(v: number, _name: string, props: { payload?: { type?: string; name?: string } }) => [formatMoney(v), `${props.payload?.type ?? ''}: ${props.payload?.name ?? ''}`]} />
          </PieChart>
        </ResponsiveContainer>
        <ul className="overview-pie-legend">
          {data.map((d, i) => (
            <li key={i} className="overview-pie-legend-item">
              <span className="overview-pie-legend-dot" style={{ background: d.color }} />
              <span className="overview-pie-legend-label">{d.name}</span>
              <span className="overview-pie-legend-value" style={{ color: d.type === 'Einnahme' ? PIE_COLORS_WARM[0] : PIE_COLORS_COOL[0], fontSize: '0.7rem' }}>{d.type}</span>
              <span className="overview-pie-legend-value">{total > 0 ? `${((d.value / total) * 100).toFixed(1)}%` : '—'}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const palette = mode === 'income' ? PIE_COLORS_WARM : PIE_COLORS_COOL;
  const entries = mode === 'income' ? income : expenses;
  const byCategory: Record<string, number> = {};
  entries.forEach((e) => {
    const cat = e.category ?? 'other';
    byCategory[cat] = (byCategory[cat] ?? 0) + Number(e.amount);
  });
  const data = Object.entries(byCategory)
    .map(([cat, val]) => ({ name: getCategoryLabel(cat), value: Math.round(val * 100) / 100 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (data.length === 0) return <p className="bars-empty">{mode === 'income' ? 'Keine Einnahmen vorhanden.' : 'Keine Ausgaben vorhanden.'}</p>;
  return (
    <div className="overview-pie-wrap">
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2}>
            {data.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
          </Pie>
          <Tooltip formatter={(v: number) => formatMoney(v)} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="overview-pie-legend">
        {data.map((d, i) => (
          <li key={d.name} className="overview-pie-legend-item">
            <span className="overview-pie-legend-dot" style={{ background: palette[i % palette.length] }} />
            <span className="overview-pie-legend-label">{d.name}</span>
            <span className="overview-pie-legend-value">{total > 0 ? `${((d.value / total) * 100).toFixed(1)}%` : '—'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
