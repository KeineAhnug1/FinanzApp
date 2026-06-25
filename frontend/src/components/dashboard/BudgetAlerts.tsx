'use client';

import { useQuery } from '@tanstack/react-query';
import { apiUrl } from '@/lib/api-client';
import { formatMoney, getCategoryLabel, type BudgetAlert } from './types';

async function fetchBudgetAlerts(): Promise<BudgetAlert[]> {
  const res = await fetch(apiUrl('/api/budgets/status'), { credentials: 'include' });
  const data = await res.json();
  return data.alerts ?? [];
}

export function BudgetAlerts() {
  const { data: alerts = [] } = useQuery<BudgetAlert[]>({
    queryKey: ['budget-alerts'],
    queryFn: fetchBudgetAlerts,
  });

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
