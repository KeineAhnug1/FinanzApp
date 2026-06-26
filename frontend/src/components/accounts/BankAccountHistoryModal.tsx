'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { apiUrl } from '@/lib/api-client';

type HistoryEntryType = 'income' | 'expense' | 'transfer' | string;

interface HistoryEntry {
  type: HistoryEntryType;
  id: string | number;
  amount: number;
  label: string;
  category?: string | null;
  date: string;
  cycle?: string | null;
  state?: string | null;
  info?: string | null;
}

interface HistoryResponse {
  ok: boolean;
  entries?: HistoryEntry[];
  next_cursor?: string | null;
  message?: string;
}

interface BankAccountHistoryModalProps {
  accountId: number;
  accountLabel: string;
  onClose: () => void;
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

function formatAmount(amount: number, type: HistoryEntryType): string {
  const sign = type === 'income' ? '+' : type === 'expense' ? '−' : '';
  const formatted = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Math.abs(amount));
  return `${sign}${formatted}`;
}

async function fetchHistory(accountId: number, cursor: string | null): Promise<HistoryResponse> {
  const params = new URLSearchParams({ limit: '50' });
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(apiUrl(`/api/finance/bank-accounts/${accountId}/history?${params.toString()}`), {
    credentials: 'include',
  });
  if (!res.ok) return { ok: false, entries: [], next_cursor: null };
  return res.json();
}

export default function BankAccountHistoryModal({ accountId, accountLabel, onClose }: BankAccountHistoryModalProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data, isLoading, isError } = useQuery<HistoryResponse>({
    queryKey: ['bank-account-history', accountId],
    queryFn: () => fetchHistory(accountId, null),
    enabled: Number.isFinite(accountId),
  });

  useEffect(() => {
    if (!data) return;
    setEntries(data.entries ?? []);
    setNextCursor(data.next_cursor ?? null);
  }, [data]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const next = await fetchHistory(accountId, nextCursor);
      setEntries((prev) => [...prev, ...(next.entries ?? [])]);
      setNextCursor(next.next_cursor ?? null);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Verlauf — ${accountLabel}`} size="lg">
      {isLoading ? (
        <div className="loading-state"><span className="spinner" /><span>Lade…</span></div>
      ) : isError ? (
        <div className="history-empty">Verlauf konnte nicht geladen werden.</div>
      ) : entries.length === 0 ? (
        <div className="history-empty">Keine Bewegungen auf diesem Konto.</div>
      ) : (
        <>
          <ul className="history-list">
            {entries.map((entry) => {
              const amountClass =
                entry.type === 'income'
                  ? 'history-item__amount history-item__amount--income'
                  : entry.type === 'expense'
                    ? 'history-item__amount history-item__amount--expense'
                    : 'history-item__amount';
              const showStateBadge = entry.state && entry.state !== 'open';
              return (
                <li key={`${entry.type}-${entry.id}`} className="history-item">
                  <span className="history-item__date">{formatDate(entry.date)}</span>
                  <span className="history-item__label">
                    {entry.label}
                    {showStateBadge && <span className="badge history-item__state">{entry.state}</span>}
                  </span>
                  {entry.category ? (
                    <span className="history-item__category">{entry.category}</span>
                  ) : (
                    <span />
                  )}
                  <span className={amountClass}>{formatAmount(entry.amount, entry.type)}</span>
                </li>
              );
            })}
          </ul>
          {nextCursor && (
            <div className="form-actions" style={{ marginTop: 'var(--ui-space-3)' }}>
              <button className="btn btn-ghost" type="button" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Lade…' : 'Mehr laden'}
              </button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

export { BankAccountHistoryModal };
