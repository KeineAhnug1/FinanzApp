'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/stores/app-store';
import { toast } from '@/components/ui/Toast';
import { apiUrl, getCsrfToken, safeJson } from '@/lib/api-client';
import {
  formatMoney,
  type BankAccount,
  type ExpenseEntry,
  type IncomeEntry,
} from '@/components/dashboard/types';
import { DrilldownCashflowChart } from '@/components/dashboard/DrilldownCashflowChart';
import { CategoryPieChart } from '@/components/dashboard/CategoryPieChart';
import { currentEffectiveBalancesByAccount } from '@/components/dashboard/wealth';
import { expandAllRecurring } from '@/components/dashboard/recurring';
import { BudgetOverview } from '@/components/dashboard/BudgetOverview';
import { EntriesList } from '@/components/dashboard/EntriesList';
import { IncomeForm } from '@/components/dashboard/IncomeForm';
import { ExpenseForm } from '@/components/dashboard/ExpenseForm';
import { PeerTransferModal } from '@/components/dashboard/PeerTransferModal';
import { RecurringList } from '@/components/dashboard/RecurringList';
import { TransfersList } from '@/components/dashboard/TransfersList';
import { BudgetManager } from '@/components/budgets/BudgetManager';

type DashboardView = 'overview' | 'income' | 'expense' | 'recurring' | 'transfers' | 'budgets';

const VALID_TABS: DashboardView[] = ['overview', 'income', 'expense', 'recurring', 'transfers', 'budgets'];

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(apiUrl(url), { credentials: 'include', ...options });
  return safeJson(res);
}

export default function DashboardPage() {
  const [view, setView] = useState<DashboardView>('overview');
  const [pieMode, setPieMode] = useState<'income' | 'expense' | 'both'>('expense');
  const [accountFilter, setAccountFilter] = useState('');
  const [editIncome, setEditIncome] = useState<IncomeEntry | null>(null);
  const [editExpense, setEditExpense] = useState<ExpenseEntry | null>(null);
  const [peerTransferOpen, setPeerTransferOpen] = useState(false);
  const { user } = useAppStore();
  const queryClient = useQueryClient();

  const dashboardViewKey = user?.id ? `finanzapp.dashboardView.${user.id}` : null;

  useEffect(() => {
    if (!dashboardViewKey) return;
    const stored = localStorage.getItem(dashboardViewKey) as DashboardView | null;
    if (stored && (VALID_TABS as string[]).includes(stored)) setView(stored);
  }, [dashboardViewKey]);

  const switchView = (v: DashboardView) => {
    setView(v);
    if (dashboardViewKey) localStorage.setItem(dashboardViewKey, v);
  };

  const { data: accounts = [] } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: () => apiFetch('/api/finance/bank-accounts').then((d) => {
      if (!d.ok) console.warn('[dashboard] bank-accounts request failed:', d.message);
      return (d.accounts ?? []) as BankAccount[];
    }),
  });

  const accountParam = accountFilter ? `?bank_account_id=${encodeURIComponent(accountFilter)}` : '';

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['transactions', accountFilter],
    queryFn: () => apiFetch(`/api/finance/transactions${accountParam}${accountParam ? '&' : '?'}limit=2000`).then((d) => {
      type RawEntry = { type: string; is_active?: boolean; state?: string };
      // Soft-deleted entries (state: 'completed' AND is_active: false) are hidden from
      // every user-facing list. They stay in the DB to keep the audit-log constraint
      // satisfied.
      const visible = (d.entries ?? []).filter((e: RawEntry) => !(e.is_active === false && e.state === 'completed'));
      return {
        income: visible.filter((e: RawEntry) => e.type === 'income') as IncomeEntry[],
        expense: visible.filter((e: RawEntry) => e.type === 'expense') as ExpenseEntry[],
      };
    }),
  });

  // Separate query with NO account filter, used solely to compute per-account
  // effective balances for the account picker dropdown. The main `transactions` query
  // may be scoped to a single account (when a filter is active), which would leave
  // the other accounts' entries invisible and their balances stuck at 0.
  const { data: allTransactions } = useQuery({
    queryKey: ['transactions', 'all'],
    queryFn: () => apiFetch('/api/finance/transactions?limit=2000').then((d) => {
      type RawEntry = { type: string; is_active?: boolean; state?: string };
      const visible = (d.entries ?? []).filter((e: RawEntry) => !(e.is_active === false && e.state === 'completed'));
      return {
        income: visible.filter((e: RawEntry) => e.type === 'income') as IncomeEntry[],
        expense: visible.filter((e: RawEntry) => e.type === 'expense') as ExpenseEntry[],
      };
    }),
  });

  const income = transactions?.income ?? [];
  const expenses = transactions?.expense ?? [];

  // Aggregate over all occurrences (real rows + past recurrence expansions) up to today,
  // so "Einnahmen / Ausgaben / Sparquote" reflect what the user actually earned and spent.
  // The `opening` income row is excluded — starting capital is neither an income nor an
  // expense and would distort the savings rate.
  const aggregates = useMemo(() => {
    const now = new Date();
    const realIncomeNonOpening = income.filter((e) => e.category !== 'opening');
    const expandedIncome = expandAllRecurring(realIncomeNonOpening, now);
    const expandedExpenses = expandAllRecurring(expenses, now);
    let totalIncome = 0;
    let totalExpenses = 0;
    let incomeCount = 0;
    let expenseCount = 0;
    for (const e of expandedIncome) {
      const ts = new Date(e.received_at).getTime();
      if (!Number.isFinite(ts) || ts > now.getTime()) continue;
      totalIncome += Number(e.amount) || 0;
      incomeCount++;
    }
    for (const e of expandedExpenses) {
      const ts = new Date(e.spent_at).getTime();
      if (!Number.isFinite(ts) || ts > now.getTime()) continue;
      totalExpenses += Number(e.amount) || 0;
      expenseCount++;
    }
    return { totalIncome, totalExpenses, incomeCount, expenseCount };
  }, [income, expenses]);

  const { totalIncome, totalExpenses, incomeCount, expenseCount } = aggregates;
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

  // Per-account balances for the account-picker dropdown. Same math as the Konten page,
  // powered by the unfiltered `allTransactions` query so every account gets a value.
  const accountsWithEffectiveBalances = useMemo(() => {
    if (!allTransactions) return accounts;
    const balances = currentEffectiveBalancesByAccount(allTransactions.income, allTransactions.expense, accounts);
    return accounts.map((a) => ({ ...a, balance: balances.get(String(a.id)) ?? 0 }));
  }, [accounts, allTransactions]);

  const filteredAccounts = accountFilter
    ? accountsWithEffectiveBalances.filter((a) => String(a.id) === String(accountFilter))
    : accountsWithEffectiveBalances;
  // Same slice, but with the untouched `bank_accounts.balance` field. The chart's
  // opening-seed math needs the raw backend value (from which it derives what the
  // account started with) — passing the already-recomputed value here would feed the
  // seed function back its own output and produce garbage seeds.
  const filteredRawAccounts = accountFilter
    ? accounts.filter((a) => String(a.id) === String(accountFilter))
    : accounts;
  // Effective balance: opening capital + every income/expense (real + past recurring
  // occurrences) up to now. This replaces the raw `bank_accounts.balance`, which only
  // counts each recurring definition once and drifts from reality after month one.
  // Sum the per-account effective balances so the header matches what the dropdown
  // shows and legacy accounts (without an opening income row) still contribute.
  const totalBalance = useMemo(
    () => filteredAccounts.reduce((s, a) => s + Number(a.balance), 0),
    [filteredAccounts],
  );
  const earliestAccountOpenedAt = filteredAccounts.reduce<number | null>((min, a) => {
    if (!a.created_at) return min;
    const ts = new Date(a.created_at).getTime();
    if (!Number.isFinite(ts)) return min;
    return min == null || ts < min ? ts : min;
  }, null);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['budget-status'] });
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
        <h1 className="page-title">Dashboard</h1>
        <div className="dash-nav-row">
          <div className="entry-tab-nav" role="tablist">
            <button id="tab-overview" className={`entry-tab-btn${view === 'overview' ? ' is-active' : ''}`} role="tab" aria-selected={view === 'overview'} aria-controls="panel-overview" onClick={() => switchView('overview')}>Übersicht</button>
            <button id="tab-income" className={`entry-tab-btn${view === 'income' ? ' is-active' : ''}`} role="tab" aria-selected={view === 'income'} aria-controls="panel-income" onClick={() => switchView('income')}>Einnahmen</button>
            <button id="tab-expense" className={`entry-tab-btn${view === 'expense' ? ' is-active' : ''}`} role="tab" aria-selected={view === 'expense'} aria-controls="panel-expense" onClick={() => switchView('expense')}>Ausgaben</button>
            <button id="tab-recurring" className={`entry-tab-btn${view === 'recurring' ? ' is-active' : ''}`} role="tab" aria-selected={view === 'recurring'} aria-controls="panel-recurring" onClick={() => switchView('recurring')}>Daueraufträge</button>
            <button id="tab-transfers" className={`entry-tab-btn${view === 'transfers' ? ' is-active' : ''}`} role="tab" aria-selected={view === 'transfers'} aria-controls="panel-transfers" onClick={() => switchView('transfers')}>Überweisungen</button>
            <button id="tab-budgets" className={`entry-tab-btn${view === 'budgets' ? ' is-active' : ''}`} role="tab" aria-selected={view === 'budgets'} aria-controls="panel-budgets" onClick={() => switchView('budgets')}>Budgets</button>
          </div>
          {accounts.length > 1 && (
            <div className="nav-account-filter">
              <select className="field-input" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
                <option value="">Alle Konten</option>
                {accountsWithEffectiveBalances.map((a) => <option key={a.id} value={a.id}>{a.label} ({formatMoney(a.balance)})</option>)}
              </select>
            </div>
          )}
        </div>

        {isLoading && <p className="dashboard__loading">Lade Daten…</p>}

        <div className="view-panel" id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" tabIndex={0} hidden={view !== 'overview'}>
          <div className="hero-card">
            <p className="hero-label">Gesamtsaldo</p>
            <p className="hero-value">{formatMoney(totalBalance)}</p>
            <p className="hero-sub">{incomeCount + expenseCount} Buchungen · {filteredAccounts.length} {filteredAccounts.length === 1 ? 'Konto' : 'Konten'}</p>
          </div>

          <div className="kpi-grid">
            <div className="kpi-card">
              <p className="kpi-label">Einnahmen</p>
              <p className="kpi-value">{formatMoney(totalIncome)}</p>
              <p className="kpi-trend positive">↑ {incomeCount} Einträge</p>
            </div>
            <div className="kpi-card">
              <p className="kpi-label">Ausgaben</p>
              <p className="kpi-value">{formatMoney(totalExpenses)}</p>
              <p className="kpi-trend neutral">{expenseCount} Einträge</p>
            </div>
            <div className="kpi-card">
              <p className="kpi-label">Sparquote</p>
              <p className={`kpi-value${savingsRate < 0 ? ' is-negative' : ''}`}>{savingsRate.toFixed(1)}%</p>
              <p className={`kpi-trend ${savingsRate < 0 ? 'negative' : 'neutral'}`}>
                {savingsRate < 0 ? 'Ausgaben übersteigen Einnahmen' : 'des Nettoeinkommens'}
              </p>
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
                currentBalance={totalBalance}
                earliestAccountOpenedAt={earliestAccountOpenedAt}
                accounts={filteredRawAccounts}
              />
            </div>
            <div className="panel">
              <div className="dashboard__pie-header">
                <h3 className="panel-title">
                  {pieMode === 'expense' ? 'Ausgaben' : pieMode === 'income' ? 'Einnahmen' : 'Ein- & Ausgaben'} nach Kategorie
                </h3>
                <div className="dashboard__pie-mode-toggle">
                  <button
                    className={`entry-tab-btn dashboard__pie-mode-btn${pieMode === 'expense' ? ' is-active' : ''}`}
                    onClick={() => setPieMode('expense')}
                  >
                    Ausgaben
                  </button>
                  <button
                    className={`entry-tab-btn dashboard__pie-mode-btn${pieMode === 'income' ? ' is-active' : ''}`}
                    onClick={() => setPieMode('income')}
                  >
                    Einnahmen
                  </button>
                  <button
                    className={`entry-tab-btn dashboard__pie-mode-btn${pieMode === 'both' ? ' is-active' : ''}`}
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

          <BudgetOverview onManageClick={() => switchView('budgets')} />
        </div>

        <div className="view-panel" id="panel-income" role="tabpanel" aria-labelledby="tab-income" tabIndex={0} hidden={view !== 'income'}>
          <div className="income-grid">
            <div className="panel panel-span-2" id="income-form-panel">
              <h3 className="panel-title">{editIncome ? 'Einnahme bearbeiten' : 'Neue Einnahme'}</h3>
              {accounts.length > 0 ? (
                <IncomeForm
                  key={editIncome?.id ?? 'new'}
                  bankAccounts={accountsWithEffectiveBalances}
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
              <EntriesList
                entries={income}
                type="income"
                onEdit={(e) => setEditIncome(e as IncomeEntry)}
                onDelete={deleteIncome}
                onAddClick={() => {
                  document.getElementById('income-form-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              />
            </div>
          </div>
        </div>

        <div className="view-panel" id="panel-expense" role="tabpanel" aria-labelledby="tab-expense" tabIndex={0} hidden={view !== 'expense'}>
          <div className="income-grid">
            <div className="panel panel-span-2" id="expense-form-panel">
              <h3 className="panel-title">{editExpense ? 'Ausgabe bearbeiten' : 'Neue Ausgabe'}</h3>
              {accounts.length > 0 ? (
                <ExpenseForm
                  key={editExpense?.id ?? 'new'}
                  bankAccounts={accountsWithEffectiveBalances}
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
              <EntriesList
                entries={expenses}
                type="expense"
                onEdit={(e) => setEditExpense(e as ExpenseEntry)}
                onDelete={deleteExpense}
                onAddClick={() => {
                  document.getElementById('expense-form-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              />
            </div>
          </div>
        </div>

        <div className="view-panel" id="panel-recurring" role="tabpanel" aria-labelledby="tab-recurring" tabIndex={0} hidden={view !== 'recurring'}>
          <RecurringList
            income={income}
            expenses={expenses}
            onEditIncome={(e) => { setEditIncome(e); switchView('income'); }}
            onEditExpense={(e) => { setEditExpense(e); switchView('expense'); }}
            onDeleteIncome={deleteIncome}
            onDeleteExpense={deleteExpense}
          />
        </div>

        <div className="view-panel" id="panel-transfers" role="tabpanel" aria-labelledby="tab-transfers" tabIndex={0} hidden={view !== 'transfers'}>
          {view === 'transfers' && (
            <TransfersList
              accountFilter={accountFilter}
              onNewTransfer={() => setPeerTransferOpen(true)}
            />
          )}
        </div>

        <div className="view-panel" id="panel-budgets" role="tabpanel" aria-labelledby="tab-budgets" tabIndex={0} hidden={view !== 'budgets'}>
          {view === 'budgets' && <BudgetManager variant="embedded" />}
        </div>
      </div>
      <PeerTransferModal
        open={peerTransferOpen}
        onClose={() => setPeerTransferOpen(false)}
        bankAccounts={accountsWithEffectiveBalances}
      />
    </div>
  );
}
