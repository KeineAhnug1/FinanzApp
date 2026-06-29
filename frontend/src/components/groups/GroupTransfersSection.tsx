'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch, formatMoney } from './api';

interface TransferUserDto {
  id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
}

interface TransferDto {
  id: number;
  amount: number | string | null;
  reason: string | null;
  status: string | null;
  created_at: string | null;
  group_expense_share_id: number | null;
  trip_settlement_id: number | null;
  from_user: TransferUserDto | null;
  to_user: TransferUserDto | null;
}

interface TransferView {
  id: number;
  amount: number;
  reason: string | null;
  status: string;
  created_at: string | null;
  source: 'ausgabe' | 'ausflug' | 'direkt';
  from_name: string;
  to_name: string;
}

function fullName(u: TransferUserDto | null): string {
  if (!u) return '—';
  const parts = [u.first_name, u.last_name].filter((p): p is string => !!p && p.trim().length > 0);
  if (parts.length > 0) return parts.join(' ');
  return u.username ?? '—';
}

function deriveSource(t: TransferDto): TransferView['source'] {
  if (t.group_expense_share_id !== null && t.group_expense_share_id !== undefined) return 'ausgabe';
  if (t.trip_settlement_id !== null && t.trip_settlement_id !== undefined) return 'ausflug';
  return 'direkt';
}

const SOURCE_LABELS: Record<TransferView['source'], string> = {
  ausgabe: 'Ausgabe',
  ausflug: 'Ausflug',
  direkt: 'Direkt',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ausstehend',
  completed: 'Abgeschlossen',
  cancelled: 'Storniert',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-DE');
}

function toAmount(v: TransferDto['amount']): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function GroupTransfersSection({ groupId }: { groupId: number }) {
  const { data: items = [], isLoading, isError } = useQuery<TransferView[]>({
    queryKey: ['group', groupId, 'transfers'],
    queryFn: async () => {
      const d = await apiFetch(`/api/groups/${groupId}/transfers`);
      const raw = (d.items ?? []) as TransferDto[];
      return raw.map((t) => ({
        id: Number(t.id),
        amount: toAmount(t.amount),
        reason: t.reason ?? null,
        status: t.status ?? 'completed',
        created_at: t.created_at ?? null,
        source: deriveSource(t),
        from_name: fullName(t.from_user),
        to_name: fullName(t.to_user),
      }));
    },
    enabled: Number.isFinite(groupId),
  });

  if (isLoading) {
    return (
      <div className="loading-state">
        <span className="spinner" />
        <span>Lade Überweisungen…</span>
      </div>
    );
  }

  if (isError) {
    return <p className="loading-msg">Überweisungen konnten nicht geladen werden.</p>;
  }

  if (items.length === 0) {
    return <p className="empty-state">Noch keine Überweisungen in dieser Gruppe.</p>;
  }

  return (
    <div className="group-transfers">
      <table className="group-transfers-table">
        <thead>
          <tr>
            <th scope="col">Datum</th>
            <th scope="col">Von</th>
            <th scope="col">An</th>
            <th scope="col">Betrag</th>
            <th scope="col">Verwendungszweck</th>
            <th scope="col">Quelle</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id}>
              <td>{formatDate(t.created_at)}</td>
              <td>{t.from_name}</td>
              <td>{t.to_name}</td>
              <td>{formatMoney(t.amount)}</td>
              <td>{t.reason ?? '—'}</td>
              <td>
                <span className={`transfer-source-badge transfer-source-badge--${t.source}`}>
                  {SOURCE_LABELS[t.source]}
                </span>
              </td>
              <td>{STATUS_LABELS[t.status] ?? t.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
