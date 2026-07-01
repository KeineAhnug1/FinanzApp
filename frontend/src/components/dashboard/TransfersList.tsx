'use client';

import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/stores/app-store';
import { apiUrl, safeJsonOrThrow } from '@/lib/api-client';
import { EmptyState, IconArrowLeftRight } from '@/components/ui/EmptyState';
import { formatMoney } from './types';

interface TransferUserDto {
  id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
}

interface TransferDto {
  id: number;
  from_user_id: number;
  to_user_id: number;
  from_bank_account_id: number;
  to_bank_account_id: number;
  amount: number | string | null;
  reason: string | null;
  status: string | null;
  created_at: string | null;
  from_user: TransferUserDto | null;
  to_user: TransferUserDto | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ausstehend',
  completed: 'Abgeschlossen',
  cancelled: 'Storniert',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

function displayName(u: TransferUserDto | null): string {
  if (!u) return '—';
  return u.username ?? '—';
}

function toAmount(v: TransferDto['amount']): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function fetchTransfers(): Promise<TransferDto[]> {
  const res = await fetch(apiUrl('/api/finance/peer-transfers'), { credentials: 'include' });
  const d = await safeJsonOrThrow(res);
  return (d.items ?? []) as TransferDto[];
}

interface TransfersListProps {
  accountFilter: string;
  onNewTransfer: () => void;
}

export function TransfersList({ accountFilter, onNewTransfer }: TransfersListProps) {
  const { user } = useAppStore();
  const currentUserId = user?.id ?? null;

  const { data: transfers = [], isLoading, isError } = useQuery<TransferDto[]>({
    queryKey: ['peer-transfers'],
    queryFn: fetchTransfers,
  });

  const filtered = accountFilter
    ? transfers.filter((t) =>
        Number(t.from_bank_account_id) === Number(accountFilter)
        || Number(t.to_bank_account_id) === Number(accountFilter),
      )
    : transfers;

  return (
    <div className="transfers-section">
      <div className="transfers-section-header">
        <h2 className="panel-title">Überweisungen</h2>
        <button type="button" className="btn btn-primary" onClick={onNewTransfer}>
          → Neue Überweisung
        </button>
      </div>

      {isLoading && (
        <div className="loading-state">
          <span className="spinner" />
          <span>Lade Überweisungen…</span>
        </div>
      )}

      {!isLoading && isError && (
        <p className="transfers-empty">Überweisungen konnten nicht geladen werden.</p>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <EmptyState
          icon={<IconArrowLeftRight />}
          title="Keine Überweisungen"
          description="Sende deine erste Überweisung zwischen Konten oder an andere User."
          cta={onNewTransfer ? { label: 'Neue Überweisung', onClick: onNewTransfer } : undefined}
        />
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="transfers-list">
          {filtered.map((t) => {
            const outgoing = currentUserId !== null && Number(t.from_user_id) === Number(currentUserId);
            const counterparty = outgoing ? t.to_user : t.from_user;
            const amount = toAmount(t.amount);
            const sign = outgoing ? '−' : '+';
            return (
              <div key={t.id} className="transfer-list-item">
                <span className="transfer-list-item__date">{formatDate(t.created_at)}</span>
                <div className="transfer-list-item__main">
                  <span className="transfer-list-item__counterparty">
                    {outgoing ? 'an' : 'von'} {displayName(counterparty)}
                  </span>
                  {t.reason && <span className="transfer-list-item__reason">{t.reason}</span>}
                </div>
                <div className="transfer-list-item__right">
                  <span
                    className={`transfer-list-item__amount transfer-list-item__amount--${outgoing ? 'out' : 'in'}`}
                  >
                    {sign}{formatMoney(amount)}
                  </span>
                  <span className={`transfer-list-item__status transfer-list-item__status--${t.status ?? 'completed'}`}>
                    {STATUS_LABELS[t.status ?? 'completed'] ?? t.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
