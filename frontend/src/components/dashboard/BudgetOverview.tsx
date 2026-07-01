'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiUrl } from '@/lib/api-client';
import { EmptyState, IconPiggyBank } from '@/components/ui/EmptyState';
import { formatMoney, getCategoryLabel, projectBudgetVariant, type BudgetAlert } from './types';

async function fetchStatus(): Promise<BudgetAlert[]> {
  const res = await fetch(apiUrl('/api/budgets/status'), { credentials: 'include' });
  const data = await res.json();
  return Array.isArray(data?.alerts) ? (data.alerts as BudgetAlert[]) : [];
}

interface BudgetOverviewProps {
  onManageClick?: () => void;
}

export function BudgetOverview({ onManageClick }: BudgetOverviewProps = {}) {
  const router = useRouter();
  const { data: alerts = [], isLoading } = useQuery<BudgetAlert[]>({
    queryKey: ['budget-status'],
    queryFn: fetchStatus,
    staleTime: 30_000,
  });

  const sorted = [...alerts].sort((a, b) => b.percentage - a.percentage);

  const manageButton = onManageClick ? (
    <button type="button" className="budget-overview__manage" onClick={onManageClick}>
      Verwalten →
    </button>
  ) : (
    <Link href="/budgets" className="budget-overview__manage">Verwalten →</Link>
  );

  const handleEmptyCta = onManageClick ?? (() => router.push('/budgets'));

  return (
    <div className="panel panel-span-2 budget-overview">
      <div className="budget-overview__header">
        <h3 className="panel-title">Budgets</h3>
        {manageButton}
      </div>
      {isLoading ? (
        <p className="dashboard__loading">Lade Budgets…</p>
      ) : sorted.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<IconPiggyBank />}
          title="Keine Budgets gesetzt"
          description="Lege ein Budget pro Kategorie fest und behalte deine Ausgaben im Griff."
          cta={{ label: 'Jetzt anlegen', onClick: handleEmptyCta }}
        />
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
  const variant = projectBudgetVariant(alert.spent, alert.target);
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
