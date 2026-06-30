'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { apiUrl, getCsrfToken, safeJson } from '@/lib/api-client';
import { csrfHeaders, formatMoney } from './api';
import { AddTripExpenseModal } from './AddTripExpenseModal';
import type {
  TripView,
  TripExpenseView,
  TripSettlementView,
  TripParticipantView,
} from './types';

interface TripDetailViewProps {
  groupId: number;
  tripId: number;
  currentUserId: number;
  isAdmin: boolean;
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Offen',
  closed: 'Geschlossen',
  archived: 'Archiviert',
};

function nameOf(p: TripParticipantView | undefined, fallback?: number): string {
  if (!p) return fallback !== undefined ? `User ${fallback}` : '—';
  return p.first_name || p.username || `User ${p.user_id}`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso ?? '—';
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function mapTripDetail(raw: Record<string, unknown> | null | undefined): TripView | null {
  if (!raw) return null;
  const participants: TripParticipantView[] = (Array.isArray(raw.participants) ? raw.participants : []).map(
    (p: Record<string, unknown>) => ({
      user_id: Number(p.user_id),
      username: p.username ? String(p.username) : undefined,
      first_name: p.first_name ? String(p.first_name) : undefined,
    }),
  );
  const expenses: TripExpenseView[] = (Array.isArray(raw.expenses) ? raw.expenses : []).map(
    (e: Record<string, unknown>) => ({
      id: Number(e.id),
      trip_id: Number(e.trip_id),
      payer_user_id: Number(e.payer_user_id),
      payer_name: e.payer_name ? String(e.payer_name) : undefined,
      description: String(e.description ?? ''),
      amount: Number(e.amount ?? 0),
      spent_at: String(e.spent_at ?? ''),
      participants: (Array.isArray(e.participants) ? e.participants : []).map(
        (p: Record<string, unknown>) => ({
          user_id: Number(p.user_id),
          username: p.username ? String(p.username) : undefined,
          first_name: p.first_name ? String(p.first_name) : undefined,
        }),
      ),
    }),
  );
  const settlements: TripSettlementView[] = (Array.isArray(raw.settlements) ? raw.settlements : []).map(
    (s: Record<string, unknown>) => ({
      id: Number(s.id),
      trip_id: Number(s.trip_id),
      from_user_id: Number(s.from_user_id),
      to_user_id: Number(s.to_user_id),
      from_name: s.from_name ? String(s.from_name) : undefined,
      to_name: s.to_name ? String(s.to_name) : undefined,
      amount: Number(s.amount ?? 0),
      status: ((s.status as string) ?? 'open') as TripSettlementView['status'],
      paid_at: s.paid_at ? String(s.paid_at) : null,
    }),
  );
  return {
    id: Number(raw.id),
    group_id: Number(raw.group_id),
    creator_user_id: Number(raw.creator_user_id),
    name: String(raw.name ?? ''),
    description: raw.description ? String(raw.description) : null,
    status: ((raw.status as string) ?? 'open') as TripView['status'],
    created_at: String(raw.created_at ?? ''),
    closed_at: raw.closed_at ? String(raw.closed_at) : null,
    participants,
    expenses,
    settlements,
  };
}

export function TripDetailView({ groupId, tripId, currentUserId, isAdmin, onClose }: TripDetailViewProps) {
  const queryClient = useQueryClient();
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [deletingExpense, setDeletingExpense] = useState<TripExpenseView | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [payingSettlementId, setPayingSettlementId] = useState<number | null>(null);
  const [closeBusy, setCloseBusy] = useState(false);

  const { data: trip, isLoading } = useQuery<TripView | null>({
    queryKey: ['group', groupId, 'trip', tripId],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/groups/${groupId}/trips/${tripId}`), { credentials: 'include' });
      const json = await safeJson(res);
      if (!json.ok) return null;
      return mapTripDetail(json.trip ?? json);
    },
    enabled: !!tripId,
  });

  const participantById = useMemo(() => {
    const m = new Map<number, TripParticipantView>();
    for (const p of trip?.participants ?? []) m.set(p.user_id, p);
    return m;
  }, [trip]);

  const mySettlementsOwed = useMemo(() =>
    (trip?.settlements ?? []).filter((s) => s.status === 'open' && s.from_user_id === currentUserId),
    [trip, currentUserId],
  );
  const mySettlementsOwedToMe = useMemo(() =>
    (trip?.settlements ?? []).filter((s) => s.status === 'open' && s.to_user_id === currentUserId),
    [trip, currentUserId],
  );

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['group', groupId, 'trips'] });
    queryClient.invalidateQueries({ queryKey: ['group', groupId, 'trip', tripId] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['peer-transfers'] });
  };

  const paySettlement = async (settlementId: number) => {
    setPayingSettlementId(settlementId);
    const res = await fetch(apiUrl(`/api/groups/${groupId}/trips/${tripId}/settlements/${settlementId}/pay`), {
      method: 'POST',
      credentials: 'include',
      headers: csrfHeaders(),
    });
    const result = await safeJson(res);
    setPayingSettlementId(null);
    if (!result.ok) { toast.error(result.message ?? 'Fehler beim Begleichen'); return; }
    toast.success('Schuld beglichen');
    invalidateAll();
  };

  const deleteExpense = async () => {
    if (!deletingExpense) return;
    const res = await fetch(
      apiUrl(`/api/groups/${groupId}/trips/${tripId}/expenses/${deletingExpense.id}`),
      { method: 'DELETE', credentials: 'include', headers: { 'x-csrf-token': getCsrfToken() } },
    );
    const result = await safeJson(res);
    if (!result.ok) { toast.error(result.message ?? 'Fehler beim Löschen'); return; }
    toast.success('Ausgabe gelöscht');
    setDeletingExpense(null);
    queryClient.invalidateQueries({ queryKey: ['group', groupId, 'trip', tripId] });
    queryClient.invalidateQueries({ queryKey: ['group', groupId, 'trips'] });
  };

  const closeTrip = async () => {
    setCloseBusy(true);
    const res = await fetch(apiUrl(`/api/groups/${groupId}/trips/${tripId}`), {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'x-csrf-token': getCsrfToken() },
    });
    const result = await safeJson(res);
    setCloseBusy(false);
    if (!result.ok) { toast.error(result.message ?? 'Ausflug konnte nicht geschlossen werden'); return; }
    toast.success('Ausflug geschlossen');
    setCloseConfirmOpen(false);
    queryClient.invalidateQueries({ queryKey: ['group', groupId, 'trips'] });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={trip?.name ?? 'Ausflug'} size="lg" className="modal-trip-detail">
      {isLoading && <div className="loading-state"><span className="spinner" /><span>Lade…</span></div>}
      {!isLoading && !trip && <p>Ausflug nicht gefunden.</p>}
      {trip && (
        <div className="trip-detail">
          <div className="trip-detail-header">
            <div>
              {trip.description && <p className="trip-detail-description">{trip.description}</p>}
              <p className="trip-detail-meta">
                Status: <strong>{STATUS_LABELS[trip.status] ?? trip.status}</strong>
                {' · '}{trip.participants.length} Teilnehmer
              </p>
            </div>
            {isAdmin && trip.status === 'open' && (
              <button className="btn btn-danger btn-sm" type="button" onClick={() => setCloseConfirmOpen(true)}>
                Ausflug schließen
              </button>
            )}
          </div>

          <div className="trip-detail-actions">
            <button
              className="btn btn-primary btn-sm"
              type="button"
              disabled={trip.status !== 'open'}
              onClick={() => setShowAddExpense(true)}
            >
              + Ausgabe hinzufügen
            </button>
          </div>

          <div className="group-section">
            <h4 className="section-title">Ausgaben</h4>
            {(trip.expenses ?? []).length === 0 ? (
              <p>Noch keine Ausgaben.</p>
            ) : (
              <ul className="trip-expense-list">
                {(trip.expenses ?? []).map((e) => {
                  const payer = participantById.get(e.payer_user_id);
                  const isMyExpense = (trip.participants ?? []).some((p) => p.user_id === currentUserId);
                  return (
                    <li key={e.id} className="trip-expense-item">
                      <div className="trip-expense-item__main">
                        <div className="trip-expense-item__title">{e.description}</div>
                        <div className="trip-expense-item__meta">
                          {formatDateTime(e.spent_at)} · Bezahlt von {e.payer_name ?? nameOf(payer, e.payer_user_id)}
                        </div>
                        <div className="trip-expense-item__participants">
                          Beteiligt: {e.participants.map((p) => nameOf(participantById.get(p.user_id), p.user_id)).join(', ')}
                        </div>
                      </div>
                      <div className="trip-expense-item__amount">{formatMoney(e.amount)}</div>
                      {isMyExpense && trip.status === 'open' && (
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          onClick={() => setDeletingExpense(e)}
                        >
                          Löschen
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="trip-detail-grid">
            <div className="group-section">
              <h4 className="section-title">Ich schulde</h4>
              {mySettlementsOwed.length === 0 ? (
                <p>Keine offenen Schulden.</p>
              ) : (
                <ul className="trip-settlement-list">
                  {mySettlementsOwed.map((s) => {
                    const to = participantById.get(s.to_user_id);
                    return (
                      <li key={s.id} className="trip-settlement-row">
                        <span>
                          An <strong>{s.to_name ?? nameOf(to, s.to_user_id)}</strong>:{' '}
                          <span className="trip-balance-mine">{formatMoney(s.amount)}</span>
                        </span>
                        <button
                          className="btn btn-primary btn-sm"
                          type="button"
                          disabled={payingSettlementId === s.id}
                          onClick={() => paySettlement(s.id)}
                        >
                          {payingSettlementId === s.id ? 'Begleiche…' : 'Begleichen'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="group-section">
              <h4 className="section-title">Mir wird geschuldet</h4>
              {mySettlementsOwedToMe.length === 0 ? (
                <p>Niemand schuldet dir etwas.</p>
              ) : (
                <ul className="trip-settlement-list">
                  {mySettlementsOwedToMe.map((s) => {
                    const from = participantById.get(s.from_user_id);
                    return (
                      <li key={s.id} className="trip-settlement-row">
                        <span>
                          Von <strong>{s.from_name ?? nameOf(from, s.from_user_id)}</strong>:{' '}
                          <span className="trip-balance-theirs">{formatMoney(s.amount)}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {showAddExpense && trip && (
        <AddTripExpenseModal
          groupId={groupId}
          tripId={tripId}
          participants={trip.participants}
          currentUserId={currentUserId}
          onClose={() => setShowAddExpense(false)}
        />
      )}

      {deletingExpense && (
        <Modal open onClose={() => setDeletingExpense(null)} title="Ausgabe löschen?" size="sm">
          <p>Ausgabe <strong>{deletingExpense.description}</strong> ({formatMoney(deletingExpense.amount)}) wirklich löschen?</p>
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button className="btn btn-danger" type="button" onClick={deleteExpense}>Löschen</button>
            <button className="btn btn-ghost" type="button" onClick={() => setDeletingExpense(null)}>Abbrechen</button>
          </div>
        </Modal>
      )}

      {closeConfirmOpen && (
        <Modal open onClose={() => { if (!closeBusy) setCloseConfirmOpen(false); }} title="Ausflug schließen?" size="sm">
          <p>Soll dieser Ausflug wirklich geschlossen werden? Alle offenen Schulden müssen vorher beglichen sein.</p>
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button className="btn btn-danger" type="button" disabled={closeBusy} onClick={closeTrip}>
              {closeBusy ? 'Schließe…' : 'Schließen'}
            </button>
            <button className="btn btn-ghost" type="button" disabled={closeBusy} onClick={() => setCloseConfirmOpen(false)}>
              Abbrechen
            </button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
