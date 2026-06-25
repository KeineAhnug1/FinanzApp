'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { useAppStore } from '@/stores/app-store';
import { toast } from '@/components/ui/Toast';
import { apiUrl, getCsrfToken } from '@/lib/api-client';

// API-shape types: the backend's /api/finance and /api/budgets endpoints return
// stringified IDs and a non-nullable `label`/`source`/`category` that the DB
// row types in @/types/db (which model raw PostgreSQL rows) cannot express.
interface BankAccount { id: string; label: string; balance: number; type: string; }
interface IncomeEntry { id: string; source: string; amount: number; category: string; cycle: string; received_at: string; bank_account_id: string; note?: string; }
interface ExpenseEntry { id: string; source: string; amount: number; category: string; cycle: string; spent_at: string; bank_account_id: string; note?: string; }
interface BudgetAlert { category: string; spent: number; target: number; percentage: number; exceeded: boolean; }

const INCOME_CATEGORIES = [
  { value: 'salary', label: 'Gehalt' }, { value: 'freelance', label: 'Freelance' },
  { value: 'bonus', label: 'Bonus' }, { value: 'refund', label: 'Rückzahlung' },
  { value: 'investment', label: 'Kapitalerträge' }, { value: 'other', label: 'Sonstiges' },
];
const EXPENSE_CATEGORIES = [
  { value: 'rent', label: 'Miete' }, { value: 'groceries', label: 'Lebensmittel' },
  { value: 'utilities', label: 'Nebenkosten' }, { value: 'transport', label: 'Mobilität' },
  { value: 'health', label: 'Gesundheit' }, { value: 'entertainment', label: 'Freizeit' },
  { value: 'other', label: 'Sonstiges' },
];
const CYCLE_OPTIONS = [
  { value: 'once', label: 'Einmalig' }, { value: 'weekly', label: 'Wöchentlich' }, { value: 'monthly', label: 'Monatlich' },
];
const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].map(({ value, label }) => [value, label])
);
const PIE_COLORS_WARM = ['#ef5b2a', '#f57c00', '#f9a825', '#f4a261', '#e76f51', '#f7b267', '#ff7043', '#d97706'];
const PIE_COLORS_COOL = ['#2563eb', '#0891b2', '#0d9488', '#4f46e5', '#7c3aed', '#1d4ed8', '#0369a1', '#059669'];

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}
function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(dateStr));
}
function toDatetimeLocal(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function getCategoryLabel(cat: string): string { return CATEGORY_LABELS[cat] || cat; }

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(apiUrl(url), { credentials: 'include', ...options });
  return res.json();
}

// Vermögen is cumulative (income − expenses) from the user's founding year
// up to each visible year, so the line keeps continuity across windows.
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

type ChartLevel = 'timeline' | 'year' | 'month';

function DrilldownCashflowChart({
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

function CategoryPieChart({ income, expenses, mode }: { income: IncomeEntry[]; expenses: ExpenseEntry[]; mode: 'income' | 'expense' | 'both' }) {
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
    const cat = (e as {category?: string}).category ?? 'other';
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

function BudgetAlerts({ alerts }: { alerts: BudgetAlert[] }) {
  const critical = alerts.filter((a) => a.percentage >= 80);
  if (!critical.length) return null;
  return (
    <div className="budget-alerts">
      <ul className="budget-alerts-list">
        {critical.map((a) => (
          <li key={a.category} className={`budget-alert-item ${a.exceeded ? 'is-danger' : 'is-warning'}`}>
            {a.exceeded
              ? `⚠️ ${getCategoryLabel(a.category)}: Budget überschritten (${formatMoney(a.spent)} / ${formatMoney(a.target)})`
              : `⚡ ${getCategoryLabel(a.category)}: ${a.percentage}% des Budgets (${formatMoney(a.spent)} / ${formatMoney(a.target)})`}
          </li>
        ))}
      </ul>
    </div>
  );
}

type AnyEntry = IncomeEntry | ExpenseEntry;

function groupByDate(entries: AnyEntry[], dateField: string) {
  const byYear: Record<string, Record<string, Record<string, AnyEntry[]>>> = {};
  for (const e of entries) {
    const d = new Date((e as unknown as Record<string, string>)[dateField]);
    const year = String(d.getFullYear());
    const month = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(d);
    const day = formatDate((e as unknown as Record<string, string>)[dateField]);
    byYear[year] = byYear[year] ?? {};
    byYear[year][month] = byYear[year][month] ?? {};
    byYear[year][month][day] = byYear[year][month][day] ?? [];
    byYear[year][month][day].push(e);
  }
  return byYear;
}

function GroupedList({ entries, type, onEdit, onDelete }: {
  entries: AnyEntry[]; type: 'income' | 'expense';
  onEdit: (e: AnyEntry) => void; onDelete: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const dateField = type === 'income' ? 'received_at' : 'spent_at';

  const filtered = entries.filter(
    (e) => e.source.toLowerCase().includes(search.toLowerCase()) || e.category.toLowerCase().includes(search.toLowerCase())
  );
  const grouped = groupByDate(filtered, dateField);

  return (
    <>
      <div className="list-tools">
        <input className="field-input list-search" placeholder="Suchen…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {filtered.length === 0 ? (
        <p className="income-empty">Keine Einträge gefunden.</p>
      ) : (
        <ul className="income-list">
          {Object.entries(grouped).sort(([a], [b]) => Number(b) - Number(a)).map(([year, months]) => {
            const allEntries = Object.values(months).flatMap(Object.values).flat();
            const yearTotal = allEntries.reduce((s, e) => s + Number(e.amount), 0);
            return (
              <li key={year} className="month-group-item">
                <details className="year-group" open>
                  <summary className="month-summary">
                    <span className="month-title">{year}</span>
                    <span className="month-meta">{allEntries.length} Einträge · {formatMoney(yearTotal)}</span>
                  </summary>
                  <div className="year-content">
                    {Object.entries(months).map(([month, days]) => {
                      const monthTotal = Object.values(days).flat().reduce((s, e) => s + Number(e.amount), 0);
                      return (
                        <details key={month} className="month-group" open>
                          <summary className="month-summary">
                            <span className="month-title">{month}</span>
                            <span className="month-meta">{formatMoney(monthTotal)}</span>
                          </summary>
                          <ul className="month-entry-list">
                            {Object.entries(days).sort(([a], [b]) => b.localeCompare(a)).map(([day, dayEntries]) => (
                              <li key={day}>
                                <details className="day-group">
                                  <summary className="day-summary">
                                    <span className="day-title">{day}</span>
                                  </summary>
                                  <ul style={{ margin: 0, padding: '0 8px 8px', listStyle: 'none', display: 'grid', gap: 8 }}>
                                    {dayEntries.map((entry) => (
                                      <li key={entry.id} className="income-item">
                                        <div className="income-topline">
                                          <span className="income-source">{entry.source}</span>
                                          <span className={`income-amount${type === 'expense' ? ' is-expense' : ''}`}>{formatMoney(Number(entry.amount))}</span>
                                        </div>
                                        <div className="income-tags">
                                          <span className="income-tag">{getCategoryLabel(entry.category)}</span>
                                        </div>
                                        {entry.note && <p className="income-note">{entry.note}</p>}
                                        <div className="income-actions-inline">
                                          <button className="inline-action" type="button" onClick={() => onEdit(entry)}>Bearbeiten</button>
                                          {deleteId === entry.id ? (
                                            <>
                                              <button className="inline-action delete" type="button" onClick={() => { setDeleteId(null); onDelete(entry.id); }}>Löschen</button>
                                              <button className="inline-action" type="button" onClick={() => setDeleteId(null)}>Abbrechen</button>
                                            </>
                                          ) : (
                                            <button className="inline-action delete" type="button" onClick={() => setDeleteId(entry.id)}>Löschen</button>
                                          )}
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                </details>
                              </li>
                            ))}
                          </ul>
                        </details>
                      );
                    })}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

const incomeSchema = z.object({
  source: z.string().min(1, 'Bezeichnung erforderlich'),
  amount: z.coerce.number().positive('Betrag muss positiv sein'),
  category: z.string().min(1),
  cycle: z.string().min(1),
  received_at: z.string().min(1),
  bank_account_id: z.string().min(1, 'Konto erforderlich'),
  note: z.string().optional(),
});
type IncomeFormData = z.infer<typeof incomeSchema>;

function IncomeFormComp({ bankAccounts, editEntry, onSaved, onCancel }: {
  bankAccounts: BankAccount[]; editEntry: IncomeEntry | null; onSaved: () => void; onCancel: () => void;
}) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<IncomeFormData>({
    resolver: zodResolver(incomeSchema),
    defaultValues: {
      source: editEntry?.source ?? '',
      amount: editEntry?.amount ?? ('' as unknown as number),
      category: editEntry?.category ?? 'salary',
      cycle: editEntry?.cycle ?? 'once',
      received_at: editEntry?.received_at ? toDatetimeLocal(new Date(editEntry.received_at)) : toDatetimeLocal(),
      bank_account_id: editEntry?.bank_account_id ?? bankAccounts[0]?.id ?? '',
      note: editEntry?.note ?? '',
    },
  });
  const onSubmit = async (data: IncomeFormData) => {
    const url = editEntry ? `/api/finance/income/${editEntry.id}` : '/api/finance/income';
    const method = editEntry ? 'PATCH' : 'POST';
    const result = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({ ...data, received_at: new Date(data.received_at).toISOString() }),
    });
    if (!result.ok) { toast.error(result.message ?? 'Fehler beim Speichern'); return; }
    toast.success(editEntry ? 'Einnahme aktualisiert' : 'Einnahme gespeichert');
    onSaved();
  };
  return (
    <form className="income-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="form-two-cols">
        <div>
          <label className="field-label">Bezeichnung</label>
          <input className="field-input" placeholder="z.B. Gehalt" {...register('source')} />
          {errors.source && <p className="form-status is-error">{errors.source.message}</p>}
        </div>
        <div>
          <label className="field-label">Betrag (€)</label>
          <input className="field-input" type="number" step="0.01" min="0.01" placeholder="0,00" {...register('amount')} />
          {errors.amount && <p className="form-status is-error">{errors.amount.message}</p>}
        </div>
      </div>
      <div className="form-two-cols">
        <div>
          <label className="field-label">Kategorie</label>
          <select className="field-input" {...register('category')}>
            {INCOME_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Turnus</label>
          <select className="field-input" {...register('cycle')}>
            {CYCLE_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>
      <div className="form-two-cols">
        <div>
          <label className="field-label">Datum</label>
          <input className="field-input" type="datetime-local" {...register('received_at')} />
        </div>
        <div>
          <label className="field-label">Konto</label>
          <select className="field-input" {...register('bank_account_id')}>
            {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.label} ({formatMoney(a.balance)})</option>)}
          </select>
          {errors.bank_account_id && <p className="form-status is-error">{errors.bank_account_id.message}</p>}
        </div>
      </div>
      <div>
        <label className="field-label">Notiz (optional)</label>
        <input className="field-input" placeholder="Optionale Notiz" {...register('note')} />
      </div>
      <div className="income-actions">
        <button className="submit-income" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Speichern…' : editEntry ? 'Änderung speichern' : 'Einnahme speichern'}
        </button>
        {editEntry && <button className="cancel-income" type="button" onClick={onCancel}>Abbrechen</button>}
      </div>
    </form>
  );
}

const expenseSchema = z.object({
  source: z.string().min(1, 'Bezeichnung erforderlich'),
  amount: z.coerce.number().positive('Betrag muss positiv sein'),
  category: z.string().min(1),
  cycle: z.string().min(1),
  spent_at: z.string().min(1),
  bank_account_id: z.string().min(1, 'Konto erforderlich'),
  note: z.string().optional(),
});
type ExpenseFormData = z.infer<typeof expenseSchema>;

function ExpenseFormComp({ bankAccounts, editEntry, onSaved, onCancel }: {
  bankAccounts: BankAccount[]; editEntry: ExpenseEntry | null; onSaved: () => void; onCancel: () => void;
}) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      source: editEntry?.source ?? '',
      amount: editEntry?.amount ?? ('' as unknown as number),
      category: editEntry?.category ?? 'rent',
      cycle: editEntry?.cycle ?? 'once',
      spent_at: editEntry?.spent_at ? toDatetimeLocal(new Date(editEntry.spent_at)) : toDatetimeLocal(),
      bank_account_id: editEntry?.bank_account_id ?? bankAccounts[0]?.id ?? '',
      note: editEntry?.note ?? '',
    },
  });
  const onSubmit = async (data: ExpenseFormData) => {
    const url = editEntry ? `/api/finance/expenses/${editEntry.id}` : '/api/finance/expenses';
    const method = editEntry ? 'PATCH' : 'POST';
    const result = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({ ...data, spent_at: new Date(data.spent_at).toISOString() }),
    });
    if (!result.ok) { toast.error(result.message ?? 'Fehler beim Speichern'); return; }
    toast.success(editEntry ? 'Ausgabe aktualisiert' : 'Ausgabe gespeichert');
    onSaved();
  };
  return (
    <form className="income-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="form-two-cols">
        <div>
          <label className="field-label">Bezeichnung</label>
          <input className="field-input" placeholder="z.B. Miete" {...register('source')} />
          {errors.source && <p className="form-status is-error">{errors.source.message}</p>}
        </div>
        <div>
          <label className="field-label">Betrag (€)</label>
          <input className="field-input" type="number" step="0.01" min="0.01" placeholder="0,00" {...register('amount')} />
          {errors.amount && <p className="form-status is-error">{errors.amount.message}</p>}
        </div>
      </div>
      <div className="form-two-cols">
        <div>
          <label className="field-label">Kategorie</label>
          <select className="field-input" {...register('category')}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Turnus</label>
          <select className="field-input" {...register('cycle')}>
            {CYCLE_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>
      <div className="form-two-cols">
        <div>
          <label className="field-label">Datum</label>
          <input className="field-input" type="datetime-local" {...register('spent_at')} />
        </div>
        <div>
          <label className="field-label">Konto</label>
          <select className="field-input" {...register('bank_account_id')}>
            {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.label} ({formatMoney(a.balance)})</option>)}
          </select>
          {errors.bank_account_id && <p className="form-status is-error">{errors.bank_account_id.message}</p>}
        </div>
      </div>
      <div>
        <label className="field-label">Notiz (optional)</label>
        <input className="field-input" placeholder="Optionale Notiz" {...register('note')} />
      </div>
      <div className="income-actions">
        <button className="submit-income" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Speichern…' : editEntry ? 'Änderung speichern' : 'Ausgabe speichern'}
        </button>
        {editEntry && <button className="cancel-income" type="button" onClick={onCancel}>Abbrechen</button>}
      </div>
    </form>
  );
}

type DashboardView = 'overview' | 'income' | 'expense';

export default function DashboardPage() {
  const [view, setView] = useState<DashboardView>('overview');
  const [pieMode, setPieMode] = useState<'income' | 'expense' | 'both'>('expense');
  const [accountFilter, setAccountFilter] = useState('');
  const [editIncome, setEditIncome] = useState<IncomeEntry | null>(null);
  const [editExpense, setEditExpense] = useState<ExpenseEntry | null>(null);
  const { user } = useAppStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    const stored = localStorage.getItem('finanzapp.dashboardView') as DashboardView | null;
    if (stored && ['overview', 'income', 'expense'].includes(stored)) setView(stored);
  }, []);

  const switchView = (v: DashboardView) => {
    setView(v);
    localStorage.setItem('finanzapp.dashboardView', v);
  };

  const { data: accounts = [] } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: () => apiFetch('/api/finance/bank-accounts').then((d) => d.accounts ?? []),
  });

  const accountParam = accountFilter ? `?bank_account_id=${encodeURIComponent(accountFilter)}` : '';

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['transactions', accountFilter],
    queryFn: () => apiFetch(`/api/finance/transactions${accountParam}`).then((d) => ({
      income: (d.entries ?? []).filter((e: { type: string }) => e.type === 'income') as IncomeEntry[],
      expense: (d.entries ?? []).filter((e: { type: string }) => e.type === 'expense') as ExpenseEntry[],
    })),
  });

  const { data: budgetAlerts = [] } = useQuery<BudgetAlert[]>({
    queryKey: ['budget-alerts'],
    queryFn: () => apiFetch('/api/budgets/status').then((d) => d.alerts ?? []),
  });

  const income = transactions?.income ?? [];
  const expenses = transactions?.expense ?? [];

  const totalIncome = income.reduce((s, e) => s + Number(e.amount), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const savingsRate = totalIncome > 0 ? Math.max(0, ((totalIncome - totalExpenses) / totalIncome) * 100) : 0;

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['budget-alerts'] });
  }, [queryClient]);

  const deleteIncome = async (id: string) => {
    const result = await apiFetch(`/api/finance/income/${id}`, { method: 'DELETE', headers: { 'x-csrf-token': getCsrfToken() } });
    if (result.ok) { toast.success('Einnahme gelöscht'); invalidate(); }
    else toast.error(result.message ?? 'Fehler beim Löschen');
  };

  const deleteExpense = async (id: string) => {
    const result = await apiFetch(`/api/finance/expenses/${id}`, { method: 'DELETE', headers: { 'x-csrf-token': getCsrfToken() } });
    if (result.ok) { toast.success('Ausgabe gelöscht'); invalidate(); }
    else toast.error(result.message ?? 'Fehler beim Löschen');
  };

  return (
    <div className="dash-shell">
      <div className="dash-main">
        <div className="dash-nav-row">
          <div className="entry-tab-nav" role="tablist">
            <button className={`entry-tab-btn${view === 'overview' ? ' is-active' : ''}`} role="tab" aria-selected={view === 'overview'} onClick={() => switchView('overview')}>Übersicht</button>
            <button className={`entry-tab-btn${view === 'income' ? ' is-active' : ''}`} role="tab" aria-selected={view === 'income'} onClick={() => switchView('income')}>Einnahmen</button>
            <button className={`entry-tab-btn${view === 'expense' ? ' is-active' : ''}`} role="tab" aria-selected={view === 'expense'} onClick={() => switchView('expense')}>Ausgaben</button>
          </div>
          {accounts.length > 1 && (
            <div className="nav-account-filter">
              <select className="field-input" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
                <option value="">Alle Konten</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.label} ({formatMoney(a.balance)})</option>)}
              </select>
            </div>
          )}
        </div>

        {isLoading && <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Lade Daten…</p>}

        <div className="view-panel" hidden={view !== 'overview'}>
          <div className="hero-card">
            <p className="hero-label">Gesamtsaldo</p>
            <p className="hero-value">{formatMoney(totalIncome - totalExpenses)}</p>
            <p className="hero-sub">{income.length + expenses.length} Buchungen · {accounts.length} {accounts.length === 1 ? 'Konto' : 'Konten'}</p>
          </div>

          <BudgetAlerts alerts={budgetAlerts} />

          <div className="kpi-grid">
            <div className="kpi-card">
              <p className="kpi-label">Einnahmen</p>
              <p className="kpi-value">{formatMoney(totalIncome)}</p>
              <p className="kpi-trend positive">↑ {income.length} Einträge</p>
            </div>
            <div className="kpi-card">
              <p className="kpi-label">Ausgaben</p>
              <p className="kpi-value">{formatMoney(totalExpenses)}</p>
              <p className="kpi-trend neutral">{expenses.length} Einträge</p>
            </div>
            <div className="kpi-card">
              <p className="kpi-label">Sparquote</p>
              <p className="kpi-value">{savingsRate.toFixed(1)}%</p>
              <p className="kpi-trend neutral">des Nettoeinkommens</p>
            </div>
          </div>

          <div className="detail-grid">
            <div className="panel">
              <h3 className="panel-title">Cashflow</h3>
              <p className="panel-subtitle">Cashflow-Verlauf</p>
              <DrilldownCashflowChart
                income={income}
                expenses={expenses}
                foundingYear={user?.created_at ? new Date(user.created_at).getFullYear() : new Date().getFullYear()}
              />
            </div>
            <div className="panel">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <h3 className="panel-title" style={{ margin: 0 }}>
                  {pieMode === 'expense' ? 'Ausgaben' : pieMode === 'income' ? 'Einnahmen' : 'Ein- & Ausgaben'} nach Kategorie
                </h3>
                <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                  <button
                    className={`entry-tab-btn${pieMode === 'expense' ? ' is-active' : ''}`}
                    style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                    onClick={() => setPieMode('expense')}
                  >
                    Ausgaben
                  </button>
                  <button
                    className={`entry-tab-btn${pieMode === 'income' ? ' is-active' : ''}`}
                    style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                    onClick={() => setPieMode('income')}
                  >
                    Einnahmen
                  </button>
                  <button
                    className={`entry-tab-btn${pieMode === 'both' ? ' is-active' : ''}`}
                    style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                    onClick={() => setPieMode('both')}
                  >
                    Beide
                  </button>
                </div>
              </div>
              <div className="overview-pie-chart">
                <CategoryPieChart income={income} expenses={expenses} mode={pieMode} />
              </div>
            </div>
          </div>
        </div>

        <div className="view-panel" hidden={view !== 'income'}>
          <div className="income-grid">
            <div className="panel panel-span-2">
              <h3 className="panel-title">{editIncome ? 'Einnahme bearbeiten' : 'Neue Einnahme'}</h3>
              {accounts.length > 0 ? (
                <IncomeFormComp
                  key={editIncome?.id ?? 'new'}
                  bankAccounts={accounts}
                  editEntry={editIncome}
                  onSaved={() => { setEditIncome(null); invalidate(); }}
                  onCancel={() => setEditIncome(null)}
                />
              ) : (
                <p className="bars-empty">Bitte zuerst ein Bankkonto anlegen.</p>
              )}
            </div>
            <div className="panel panel-span-2">
              <h3 className="panel-title">Einnahmen</h3>
              <GroupedList entries={income} type="income" onEdit={(e) => setEditIncome(e as IncomeEntry)} onDelete={deleteIncome} />
            </div>
          </div>
        </div>

        <div className="view-panel" hidden={view !== 'expense'}>
          <div className="income-grid">
            <div className="panel panel-span-2">
              <h3 className="panel-title">{editExpense ? 'Ausgabe bearbeiten' : 'Neue Ausgabe'}</h3>
              {accounts.length > 0 ? (
                <ExpenseFormComp
                  key={editExpense?.id ?? 'new'}
                  bankAccounts={accounts}
                  editEntry={editExpense}
                  onSaved={() => { setEditExpense(null); invalidate(); }}
                  onCancel={() => setEditExpense(null)}
                />
              ) : (
                <p className="bars-empty">Bitte zuerst ein Bankkonto anlegen.</p>
              )}
            </div>
            <div className="panel panel-span-2">
              <h3 className="panel-title">Ausgaben</h3>
              <GroupedList entries={expenses} type="expense" onEdit={(e) => setEditExpense(e as ExpenseEntry)} onDelete={deleteExpense} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
