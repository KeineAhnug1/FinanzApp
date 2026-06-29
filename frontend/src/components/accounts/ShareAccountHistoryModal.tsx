'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { apiUrl } from '@/lib/api-client';

interface Trade {
  id: string;
  units: number;
  bought_for: number;
  total: number;
  created_at: string | null;
}

interface Position {
  symbol: string;
  total_shares: number;
  total_invested: number;
  trades: Trade[];
}

interface HistoryResponse {
  ok: boolean;
  label?: string;
  positions?: Position[];
  message?: string;
}

interface ShareAccountHistoryModalProps {
  accountId: number;
  accountLabel: string;
  onClose: () => void;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

function formatShares(units: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 6 }).format(units);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

async function fetchHistory(accountId: number): Promise<HistoryResponse> {
  const res = await fetch(apiUrl(`/api/finance/share-accounts/${accountId}/history`), {
    credentials: 'include',
  });
  const body = (await res.json().catch(() => null)) as HistoryResponse | null;
  if (!body) return { ok: false, positions: [], message: `HTTP ${res.status}` };
  return body;
}

export function ShareAccountHistoryModal({ accountId, accountLabel, onClose }: ShareAccountHistoryModalProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading, isError } = useQuery<HistoryResponse>({
    queryKey: ['share-account-history', accountId],
    queryFn: () => fetchHistory(accountId),
    enabled: Number.isFinite(accountId),
  });

  const positions = data?.positions ?? [];

  const toggle = (symbol: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  };

  return (
    <Modal open onClose={onClose} title={`Verlauf — ${accountLabel}`} size="lg">
      {isLoading ? (
        <div className="loading-state"><span className="spinner" /><span>Lade…</span></div>
      ) : isError || data?.ok === false ? (
        <div className="history-empty">{data?.message ?? 'Verlauf konnte nicht geladen werden.'}</div>
      ) : positions.length === 0 ? (
        <div className="history-empty">Keine Positionen in diesem Aktienkonto.</div>
      ) : (
        <ul className="share-history-list">
          {positions.map((p) => {
            const open = expanded.has(p.symbol);
            return (
              <li key={p.symbol} className="share-history-position">
                <button
                  type="button"
                  className="share-history-position__header"
                  onClick={() => toggle(p.symbol)}
                  aria-expanded={open}
                >
                  <span className="share-history-position__symbol">{p.symbol}</span>
                  <span className="share-history-position__shares">{formatShares(p.total_shares)} Stück</span>
                  <span className="share-history-position__total">{formatMoney(p.total_invested)}</span>
                  <span className="share-history-position__chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
                </button>
                {open && (
                  <ul className="share-history-trades">
                    {p.trades.map((t) => (
                      <li key={t.id} className="share-history-trade">
                        <span className="share-history-trade__date">{formatDate(t.created_at)}</span>
                        <span className="share-history-trade__units">{formatShares(t.units)} ×</span>
                        <span className="share-history-trade__price">{formatMoney(t.bought_for)}</span>
                        <span className="share-history-trade__total">{formatMoney(t.total)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

export default ShareAccountHistoryModal;
