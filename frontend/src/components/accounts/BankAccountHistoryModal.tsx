'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, IconHistory } from '@/components/ui/EmptyState';
import { apiUrl } from '@/lib/api-client';
import { getCategoryLabel } from '@/components/dashboard/types';

type HistoryEntryType = 'income' | 'expense' | 'transfer' | string;

interface HistoryEntry {
  type: HistoryEntryType;
  id: string | number;
  amount: number;
  source?: string;
  label?: string;
  category?: string | null;
  note?: string | null;
  info?: string | null;
  received_at?: string | null;
  spent_at?: string | null;
  date?: string | null;
  cycle?: string | null;
  state?: string | null;
  transfer_id?: number | null;
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

const moneyFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

function entryDate(entry: HistoryEntry): string {
  return entry.date ?? entry.received_at ?? entry.spent_at ?? '';
}

function entryTitle(entry: HistoryEntry): string {
  return (entry.source ?? entry.label ?? '').trim() || '—';
}

function entryNote(entry: HistoryEntry): string {
  const note = (entry.note ?? entry.info ?? '').trim();
  if (!note) return '';
  if (note === entryTitle(entry)) return '';
  return note;
}

function formatDayHeader(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const m = d.getMinutes();
  if (h === 0 && m === 0) return '';
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(d);
}

function dayKey(iso: string): string {
  if (!iso) return 'unknown';
  return iso.slice(0, 10);
}

function formatAmount(amount: number, type: HistoryEntryType): string {
  const sign = type === 'income' ? '+' : type === 'expense' ? '−' : '';
  return `${sign}${moneyFormatter.format(Math.abs(amount))}`;
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
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [search, setSearch] = useState('');

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter !== 'all' && e.type !== filter) return false;
      if (!q) return true;
      const hay = `${entryTitle(e)} ${entryNote(e)} ${e.category ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [entries, filter, search]);

  const groups = useMemo(() => {
    const byDay = new Map<string, { date: string; entries: HistoryEntry[]; total: number }>();
    for (const e of filtered) {
      const key = dayKey(entryDate(e));
      const sign = e.type === 'income' ? 1 : e.type === 'expense' ? -1 : 0;
      const existing = byDay.get(key);
      if (existing) {
        existing.entries.push(e);
        existing.total += sign * Math.abs(e.amount);
      } else {
        byDay.set(key, { date: entryDate(e), entries: [e], total: sign * Math.abs(e.amount) });
      }
    }
    return Array.from(byDay.values()).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  }, [filtered]);

  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const e of entries) {
      if (e.type === 'income') income += Math.abs(e.amount);
      else if (e.type === 'expense') expense += Math.abs(e.amount);
    }
    return { income, expense, net: income - expense, count: entries.length };
  }, [entries]);

  return (
    <Modal open onClose={onClose} title={`Verlauf — ${accountLabel}`} size="lg" className="modal-history">
      {isLoading ? (
        <div className="loading-state"><span className="spinner" /><span>Lade…</span></div>
      ) : isError ? (
        <div className="history-empty">Verlauf konnte nicht geladen werden.</div>
      ) : entries.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<IconHistory />}
          title="Keine Buchungen"
          description="In diesem Zeitraum gab es keine Bewegungen."
        />
      ) : (
        <>
          <div className="history-summary">
            <div className="history-summary__stat history-summary__stat--income">
              <span className="history-summary__label">Einnahmen</span>
              <span className="history-summary__value">+{moneyFormatter.format(summary.income)}</span>
            </div>
            <div className="history-summary__stat history-summary__stat--expense">
              <span className="history-summary__label">Ausgaben</span>
              <span className="history-summary__value">−{moneyFormatter.format(summary.expense)}</span>
            </div>
            <div className={`history-summary__stat history-summary__stat--net${summary.net < 0 ? ' is-negative' : ''}`}>
              <span className="history-summary__label">Netto</span>
              <span className="history-summary__value">{summary.net >= 0 ? '+' : '−'}{moneyFormatter.format(Math.abs(summary.net))}</span>
            </div>
          </div>

          <div className="history-toolbar">
            <div className="history-toolbar__filters" role="tablist" aria-label="Filter">
              <button
                type="button"
                className={`chip${filter === 'all' ? ' chip--active' : ''}`}
                onClick={() => setFilter('all')}
              >Alle ({summary.count})</button>
              <button
                type="button"
                className={`chip chip--income${filter === 'income' ? ' chip--active' : ''}`}
                onClick={() => setFilter('income')}
              >Einnahmen</button>
              <button
                type="button"
                className={`chip chip--expense${filter === 'expense' ? ' chip--active' : ''}`}
                onClick={() => setFilter('expense')}
              >Ausgaben</button>
            </div>
            <input
              type="search"
              className="field-input history-toolbar__search"
              placeholder="Suchen (Quelle, Kategorie, Notiz)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {filtered.length === 0 ? (
            <div className="history-empty">Keine Treffer für deine Suche.</div>
          ) : (
            <ul className="history-day-list">
              {groups.map((g) => (
                <li key={dayKey(g.date)} className="history-day">
                  <div className="history-day__header">
                    <span className="history-day__date">{formatDayHeader(g.date)}</span>
                    <span className={`history-day__total${g.total < 0 ? ' is-negative' : g.total > 0 ? ' is-positive' : ''}`}>
                      {g.total >= 0 ? '+' : '−'}{moneyFormatter.format(Math.abs(g.total))}
                    </span>
                  </div>
                  <ul className="history-day__list">
                    {g.entries.map((entry) => {
                      const title = entryTitle(entry);
                      const note = entryNote(entry);
                      const time = formatTime(entryDate(entry));
                      const isTransfer = entry.transfer_id != null || entry.category === 'transfer';
                      const amountClass =
                        entry.type === 'income'
                          ? 'history-entry__amount history-entry__amount--income'
                          : entry.type === 'expense'
                            ? 'history-entry__amount history-entry__amount--expense'
                            : 'history-entry__amount';
                      const iconClass = entry.type === 'income'
                        ? 'history-entry__icon history-entry__icon--income'
                        : 'history-entry__icon history-entry__icon--expense';
                      return (
                        <li key={`${entry.type}-${entry.id}`} className="history-entry">
                          <div className={iconClass} aria-hidden="true">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              {entry.type === 'income' ? (
                                <>
                                  <path d="M12 19V5" />
                                  <path d="M5 12l7-7 7 7" />
                                </>
                              ) : (
                                <>
                                  <path d="M12 5v14" />
                                  <path d="M5 12l7 7 7-7" />
                                </>
                              )}
                            </svg>
                          </div>
                          <div className="history-entry__main">
                            <div className="history-entry__title-row">
                              <span className="history-entry__title">{title}</span>
                              {isTransfer && <span className="history-entry__badge history-entry__badge--transfer">Überweisung</span>}
                              {entry.state && entry.state !== 'open' && entry.state !== 'completed' && (
                                <span className="history-entry__badge">{entry.state}</span>
                              )}
                            </div>
                            <div className="history-entry__meta">
                              {entry.category && <span className="history-entry__chip">{getCategoryLabel(entry.category)}</span>}
                              {time && <span className="history-entry__time">{time}</span>}
                            </div>
                            {note && <p className="history-entry__note">{note}</p>}
                          </div>
                          <span className={amountClass}>{formatAmount(entry.amount, entry.type)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}

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
