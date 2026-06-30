'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiUrl } from '@/lib/api-client';
import { formatMoney, getCategoryLabel, type BudgetAlert } from './types';

async function fetchStatus(): Promise<BudgetAlert[]> {
  const res = await fetch(apiUrl('/api/budgets/status'), { credentials: 'include' });
  const data = await res.json();
  return Array.isArray(data?.alerts) ? (data.alerts as BudgetAlert[]) : [];
}

export function BudgetOverview() {
  const { data: alerts = [], isLoading } = useQuery<BudgetAlert[]>({
    queryKey: ['budget-status'],
    queryFn: fetchStatus,
    staleTime: 30_000,
  });

  const sorted = [...alerts].sort((a, b) => b.percentage - a.percentage);

  return (
    <div className="panel panel-span-2 budget-overview">
      <div className="budget-overview__header">
        <h3 className="panel-title">Budgets</h3>
        <Link href="/budgets" className="budget-overview__manage">Verwalten →</Link>
      </div>
      {isLoading ? (
        <p className="dashboard__loading">Lade Budgets…</p>
      ) : sorted.length === 0 ? (
        <p className="budget-overview__empty">
          Noch keine Budgets gesetzt.{' '}
          <Link href="/budgets" className="budget-overview__manage-inline">Jetzt anlegen →</Link>
        </p>
      ) : (
        <ul className="budget-overview__rows">
          {sorted.map((a) => <BudgetRow key={a.category} alert={a} />)}
        </ul>
      )}
    </div>
  );
}

function BudgetRow({ alert }: { alert: BudgetAlert }) {
  const pct = Math.max(0, alert.percentage);
  const variant = alert.exceeded || pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
  const displayWidth = Math.min(100, pct);
  const overshoot = alert.exceeded ? Math.max(0, alert.spent - alert.target) : 0;
  return (
    <li className={`budget-row budget-row--${variant}`}>
      <div className="budget-row__head">
        <span className="budget-row__label">{getCategoryLabel(alert.category)}</span>
        <span className="budget-row__values">
          {formatMoney(alert.spent)} / {formatMoney(alert.target)}
        </span>
      </div>
      <div className="budget-row__bar" aria-hidden="true">
        <div
          className={`budget-row__fill budget-row__fill--${variant}`}
          style={{ width: `${displayWidth}%` }}
        />
      </div>
      <div className="budget-row__foot">
        <span className="budget-row__pct">{pct}%</span>
        {alert.exceeded && (
          <span className="budget-row__over">+{formatMoney(overshoot)} über</span>
        )}
      </div>
    </li>
  );
}
