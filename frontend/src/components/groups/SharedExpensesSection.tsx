'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { EmptyState, IconReceipt } from '@/components/ui/EmptyState';
import { apiUrl, getCsrfToken, safeJson } from '@/lib/api-client';
import { csrfHeaders, formatMoney } from './api';
import { CreateSharedExpenseModal } from './CreateSharedExpenseModal';
import type {
  MemberView,
  SharedExpense,
  SharedExpenseCycle,
  SharedExpensePaymentMode,
  SharedExpenseShare,
  SharedExpenseStatus,
} from './types';

interface Props {
  groupId: number;
  isAdmin: boolean;
  sessionUserId?: number;
  members: MemberView[];
}

const STATUS_LABELS: Record<SharedExpenseStatus, string> = {
  pending: 'Ausstehend',
  active: 'Aktiv',
  completed: 'Abgeschlossen',
  cancelled: 'Storniert',
};

const PAYMENT_MODE_LABELS: Record<SharedExpensePaymentMode, string> = {
  prepaid: 'Vorkasse',
  postpaid: 'Nachkasse',
};

const CYCLE_LABELS: Record<SharedExpenseCycle, string> = {
  once: 'Einmalig',
  weekly: 'Wöchentlich',
  monthly: 'Monatlich',
  yearly: 'Jährlich',
};

const SHARE_STATUS_LABELS: Record<SharedExpenseShare['status'], string> = {
  pending: 'Ausstehend',
  accepted: 'Akzeptiert',
  paid: 'Bezahlt',
  rejected: 'Abgelehnt',
  stopped: 'Beendet',
  left: 'Verlassen',
};

function memberLabel(share: SharedExpenseShare, members: MemberView[]): string {
  if (share.first_name) return share.first_name;
  if (share.username) return share.username;
  const m = members.find((mm) => mm.user_id === share.user_id);
  return m ? (m.first_name || m.username) : `User #${share.user_id}`;
}

function parseExpense(raw: Record<string, unknown>): SharedExpense {
  const sharesRaw = Array.isArray(raw.shares) ? raw.shares as Record<string, unknown>[] : [];
  const periodsRaw = Array.isArray(raw.periods) ? raw.periods as Record<string, unknown>[] : [];
  return {
    shared_expense_id: Number(raw.shared_expense_id ?? raw.id ?? 0),
    group_id: Number(raw.group_id ?? 0),
    title: String(raw.title ?? ''),
    info: raw.info != null ? String(raw.info) : null,
    total_amount: Number(raw.total_amount ?? 0),
    payment_mode: (raw.payment_mode === 'postpaid' ? 'postpaid' : 'prepaid') as SharedExpensePaymentMode,
    cycle: (['once', 'weekly', 'monthly', 'yearly'].includes(String(raw.cycle))
      ? String(raw.cycle)
      : 'once') as SharedExpenseCycle,
    status: (['pending', 'active', 'completed', 'cancelled'].includes(String(raw.status))
      ? String(raw.status)
      : 'pending') as SharedExpenseStatus,
    created_by: Number(raw.created_by ?? 0),
    created_at: String(raw.created_at ?? ''),
    shares: sharesRaw.map((s) => ({
      share_id: Number(s.share_id ?? s.id ?? 0),
      user_id: Number(s.user_id ?? 0),
      username: s.username ? String(s.username) : undefined,
      first_name: s.first_name ? String(s.first_name) : undefined,
      share_amount: Number(s.share_amount ?? 0),
      status: (['pending', 'accepted', 'paid', 'rejected', 'left', 'stopped'].includes(String(s.status))
        ? String(s.status)
        : 'pending') as SharedExpenseShare['status'],
      decided_at: s.decided_at ? String(s.decided_at) : null,
      stopped_at: s.stopped_at ? String(s.stopped_at) : null,
    })),
    periods: periodsRaw.map((p) => ({
      period_id: Number(p.period_id ?? p.id ?? 0),
      shared_expense_id: Number(p.shared_expense_id ?? 0),
      period_start: String(p.period_start ?? ''),
      period_end: p.period_end ? String(p.period_end) : null,
      status: (['pending', 'active', 'completed', 'cancelled'].includes(String(p.status))
        ? String(p.status)
        : 'pending') as SharedExpenseStatus,
      created_at: p.created_at ? String(p.created_at) : undefined,
    })),
  };
}

export function SharedExpensesSection({ groupId, isAdmin, sessionUserId, members }: Props) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [busyShareId, setBusyShareId] = useState<number | null>(null);
  const [busyExpenseId, setBusyExpenseId] = useState<number | null>(null);

  const queryKey = ['group', groupId, 'shared-expenses'] as const;

  const { data: expenses = [], isLoading } = useQuery<SharedExpense[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/groups/${groupId}/shared-expenses`), { credentials: 'include' });
      const json = await safeJson(res);
      if (!res.ok || !json.ok) throw new Error(json.message ?? 'Fehler beim Laden');
      // Backend returns { ok: true, items: [...] }; older shapes (shared_expenses, expenses) supported as fallback.
      const list = Array.isArray(json.items)
        ? json.items
        : Array.isArray(json.shared_expenses)
          ? json.shared_expenses
          : Array.isArray(json.expenses)
            ? json.expenses
            : [];
      return (list as Record<string, unknown>[]).map(parseExpense);
    },
    enabled: !!groupId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ['group', groupId] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['peer-transfers'] });
    queryClient.invalidateQueries({ queryKey: ['group', groupId, 'transfers'] });
  };

  const decide = async (expenseId: number, shareId: number, decision: 'accept' | 'reject') => {
    setBusyShareId(shareId);
    try {
      const res = await fetch(apiUrl(`/api/groups/${groupId}/shared-expenses/${expenseId}/decide`), {
        method: 'POST',
        credentials: 'include',
        headers: csrfHeaders(),
        body: JSON.stringify({ decision }),
      });
      const result = await safeJson(res);
      if (!res.ok || !result.ok) { toast.error(result.message ?? 'Fehler'); return; }
      toast.success(decision === 'accept' ? 'Akzeptiert' : 'Abgelehnt');
      invalidate();
    } catch {
      toast.error('Netzwerkfehler');
    } finally {
      setBusyShareId(null);
    }
  };

  const stopParticipation = async (expenseId: number, shareId: number) => {
    setBusyShareId(shareId);
    try {
      const res = await fetch(apiUrl(`/api/groups/${groupId}/shared-expenses/${expenseId}/stop`), {
        method: 'POST',
        credentials: 'include',
        headers: csrfHeaders(),
        body: JSON.stringify({}),
      });
      const result = await safeJson(res);
      if (!res.ok || !result.ok) { toast.error(result.message ?? 'Fehler'); return; }
      toast.success('Teilnahme beendet');
      invalidate();
    } catch {
      toast.error('Netzwerkfehler');
    } finally {
      setBusyShareId(null);
    }
  };

  const deleteExpense = async (expenseId: number) => {
    setBusyExpenseId(expenseId);
    try {
      const res = await fetch(apiUrl(`/api/groups/${groupId}/shared-expenses/${expenseId}`), {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'x-csrf-token': getCsrfToken() },
      });
      const result = await safeJson(res);
      if (!res.ok || !result.ok) { toast.error(result.message ?? 'Fehler beim Löschen'); return; }
      toast.success('Gruppenausgabe gelöscht');
      setDeletingId(null);
      invalidate();
    } catch {
      toast.error('Netzwerkfehler');
    } finally {
      setBusyExpenseId(null);
    }
  };

  return (
    <div className="group-section">
      <div className="group-section__header">
        <h3 className="section-title">Gruppenausgaben</h3>
        {isAdmin && (
          <button className="btn btn-primary btn-sm" type="button" onClick={() => setShowCreate(true)}>
            + Neue Gruppenausgabe
          </button>
        )}
      </div>

      {isLoading && <div className="loading-state"><span className="spinner" /><span>Lade…</span></div>}

      {!isLoading && expenses.length === 0 && (
        <EmptyState
          size="sm"
          icon={<IconReceipt />}
          title="Keine Gruppenausgaben"
          description="Trage eine gemeinsame Ausgabe ein und teile sie auf die Mitglieder."
          cta={isAdmin ? { label: 'Gruppenausgabe anlegen', onClick: () => setShowCreate(true) } : undefined}
        />
      )}

      <div className="shared-expense-list">
        {expenses.map((e) => {
          const ownShare = sessionUserId !== undefined
            ? e.shares.find((s) => s.user_id === sessionUserId)
            : undefined;
          const canDelete = isAdmin && e.status !== 'cancelled';
          const pendingShares = e.shares.filter((s) => s.status === 'pending');
          const acceptedShares = e.shares.filter((s) => s.status === 'accepted' || s.status === 'paid');
          const rejectedShares = e.shares.filter((s) => s.status === 'rejected');
          const totalShares = e.shares.length;
          return (
            <div key={e.shared_expense_id} className="shared-expense-card">
              <div className="shared-expense-header">
                <div>
                  <div className="shared-expense-title">{e.title}</div>
                  {e.info && <div className="shared-expense-info">{e.info}</div>}
                  <div className="shared-expense-badges">
                    <span className="badge badge-info">{PAYMENT_MODE_LABELS[e.payment_mode]}</span>
                    <span className="badge badge-info">{CYCLE_LABELS[e.cycle]}</span>
                    <span className={`shared-expense-status shared-expense-status--${e.status}`}>
                      {STATUS_LABELS[e.status]}
                    </span>
                  </div>
                  {totalShares > 0 && e.status !== 'cancelled' && (
                    <div className="shared-expense-progress" aria-live="polite">
                      {pendingShares.length > 0 ? (
                        <span className="shared-expense-progress__pending">
                          ⏳ {pendingShares.length} von {totalShares} ausstehend
                          {pendingShares.length <= 3 && pendingShares.length > 0 && (
                            <span className="shared-expense-progress__names">
                              {' — '}
                              {pendingShares.map((s) => memberLabel(s, members)).join(', ')}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="shared-expense-progress__done">
                          ✓ Alle {acceptedShares.length} Teilnehmer haben akzeptiert
                        </span>
                      )}
                      {rejectedShares.length > 0 && (
                        <span className="shared-expense-progress__rejected">
                          {' · '}{rejectedShares.length} abgelehnt
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="shared-expense-amount">{formatMoney(e.total_amount)}</div>
              </div>

              <div className="shared-expense-shares-list">
                {e.shares.map((s) => {
                  const isOwn = sessionUserId !== undefined && s.user_id === sessionUserId;
                  return (
                    <div key={s.share_id} className="shared-expense-share-row">
                      <div>
                        <span>{memberLabel(s, members)}</span>
                        {isOwn && <span className="form-hint shared-expense-self"> (du)</span>}
                      </div>
                      <div className="shared-expense-share-meta">
                        <span>{formatMoney(s.share_amount)}</span>
                        <span className={`shared-expense-status shared-expense-status--${shareStatusToCardStatus(s.status)}`}>
                          {SHARE_STATUS_LABELS[s.status]}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {ownShare && ownShare.status === 'pending' && e.status !== 'cancelled' && (
                <div className="form-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    type="button"
                    disabled={busyShareId === ownShare.share_id}
                    onClick={() => decide(e.shared_expense_id, ownShare.share_id, 'accept')}
                  >
                    Akzeptieren
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    disabled={busyShareId === ownShare.share_id}
                    onClick={() => decide(e.shared_expense_id, ownShare.share_id, 'reject')}
                  >
                    Ablehnen
                  </button>
                </div>
              )}

              {ownShare && ownShare.status === 'accepted' && e.cycle !== 'once' && e.status === 'active' && (
                <div className="form-actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    disabled={busyShareId === ownShare.share_id}
                    onClick={() => stopParticipation(e.shared_expense_id, ownShare.share_id)}
                  >
                    Teilnahme beenden
                  </button>
                </div>
              )}

              {canDelete && (
                <div className="form-actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    onClick={() => setDeletingId(e.shared_expense_id)}
                  >
                    Löschen
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showCreate && (
        <CreateSharedExpenseModal
          groupId={groupId}
          members={members}
          onClose={() => setShowCreate(false)}
        />
      )}

      {deletingId !== null && (
        <Modal open onClose={() => setDeletingId(null)} title="Gruppenausgabe löschen?">
          <p>Diese Gruppenausgabe wird storniert. Bereits erfolgte Buchungen bleiben bestehen.</p>
          <div className="form-actions">
            <button
              className="btn btn-danger"
              type="button"
              disabled={busyExpenseId === deletingId}
              onClick={() => deleteExpense(deletingId)}
            >
              Löschen
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setDeletingId(null)}>
              Abbrechen
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function shareStatusToCardStatus(s: SharedExpenseShare['status']): SharedExpenseStatus {
  if (s === 'accepted' || s === 'paid') return 'active';
  if (s === 'rejected') return 'cancelled';
  if (s === 'stopped' || s === 'left') return 'completed';
  return 'pending';
}

export default SharedExpensesSection;
