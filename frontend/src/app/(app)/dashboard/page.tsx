'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/stores/app-store';
import { toast } from '@/components/ui/Toast';
import { apiUrl, getCsrfToken } from '@/lib/api-client';
import {
  formatMoney,
  type BankAccount,
  type ExpenseEntry,
  type IncomeEntry,
} from '@/components/dashboard/types';
import { DrilldownCashflowChart } from '@/components/dashboard/DrilldownCashflowChart';
import { CategoryPieChart } from '@/components/dashboard/CategoryPieChart';
import { BudgetAlerts } from '@/components/dashboard/BudgetAlerts';
import { EntriesList } from '@/components/dashboard/EntriesList';
import { IncomeForm } from '@/components/dashboard/IncomeForm';
import { ExpenseForm } from '@/components/dashboard/ExpenseForm';

type DashboardView = 'overview' | 'income' | 'expense';

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(apiUrl(url), { credentials: 'include', ...options });
  return res.json();
}

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

          <BudgetAlerts />

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
                <IncomeForm
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
              <EntriesList entries={income} type="income" onEdit={(e) => setEditIncome(e as IncomeEntry)} onDelete={deleteIncome} />
            </div>
          </div>
        </div>

        <div className="view-panel" hidden={view !== 'expense'}>
          <div className="income-grid">
            <div className="panel panel-span-2">
              <h3 className="panel-title">{editExpense ? 'Ausgabe bearbeiten' : 'Neue Ausgabe'}</h3>
              {accounts.length > 0 ? (
                <ExpenseForm
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
              <EntriesList entries={expenses} type="expense" onEdit={(e) => setEditExpense(e as ExpenseEntry)} onDelete={deleteExpense} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
