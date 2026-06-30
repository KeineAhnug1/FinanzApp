'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiUrl } from '@/lib/api-client';
import { formatMoney } from './api';
import { CreateTripModal } from './CreateTripModal';
import { TripDetailView } from './TripDetailView';
import type { MemberView, TripView, TripSettlementView, TripParticipantView } from './types';

interface TripsSectionProps {
  groupId: number;
  members: MemberView[];
  currentUserId: number;
  isAdmin: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Offen',
  closed: 'Geschlossen',
  archived: 'Archiviert',
};

function mapTrip(raw: Record<string, unknown>): TripView {
  const idArr = Array.isArray(raw.participant_user_ids) ? raw.participant_user_ids : [];
  const participantsObj = Array.isArray(raw.participants) ? raw.participants : [];
  const participants: TripParticipantView[] = participantsObj.length
    ? participantsObj.map((p: Record<string, unknown>) => ({
        user_id: Number(p.user_id),
        username: p.username ? String(p.username) : undefined,
        first_name: p.first_name ? String(p.first_name) : undefined,
      }))
    : idArr.map((id) => ({ user_id: Number(id) }));
  const settlements: TripSettlementView[] = (Array.isArray(raw.settlements) ? raw.settlements : []).map(
    (s: Record<string, unknown>) => ({
      id: Number(s.id),
      trip_id: Number(s.trip_id ?? raw.id ?? 0),
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
    creator_user_id: Number(raw.creator_user_id ?? 0),
    name: String(raw.name ?? ''),
    description: raw.description ? String(raw.description) : null,
    status: ((raw.status as string) ?? 'open') as TripView['status'],
    created_at: String(raw.created_at ?? ''),
    closed_at: raw.closed_at ? String(raw.closed_at) : null,
    participants,
    settlements,
  };
}

function computeMyNet(trip: TripView, currentUserId: number): number {
  let net = 0;
  for (const s of trip.settlements ?? []) {
    if (s.status !== 'open') continue;
    if (s.to_user_id === currentUserId) net += s.amount;
    else if (s.from_user_id === currentUserId) net -= s.amount;
  }
  return net;
}

export function TripsSection({ groupId, members, currentUserId, isAdmin }: TripsSectionProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [activeTripId, setActiveTripId] = useState<number | null>(null);

  const { data: trips = [], isLoading } = useQuery<TripView[]>({
    queryKey: ['group', groupId, 'trips'],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/groups/${groupId}/trips`), { credentials: 'include' });
      const json = await res.json();
      if (!json.ok) return [];
      const list = Array.isArray(json.trips) ? json.trips : [];
      return list.map(mapTrip);
    },
    enabled: !!groupId,
  });

  const sortedTrips = useMemo(() => {
    return [...trips].sort((a, b) => {
      if (a.status === 'open' && b.status !== 'open') return -1;
      if (a.status !== 'open' && b.status === 'open') return 1;
      return (b.created_at ?? '').localeCompare(a.created_at ?? '');
    });
  }, [trips]);

  return (
    <div className="group-section">
      <div className="group-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h3 className="section-title">Ausflüge</h3>
        <button className="btn btn-primary btn-sm" type="button" onClick={() => setShowCreate(true)}>
          + Neuer Ausflug
        </button>
      </div>

      {isLoading && <div className="loading-state"><span className="spinner" /><span>Lade…</span></div>}

      {!isLoading && sortedTrips.length === 0 && (
        <div className="trips-empty">
          <div className="trips-empty-icon" aria-hidden="true">🧳</div>
          <p>Noch keine Ausflüge — erstelle deinen ersten Ausflug.</p>
          <button className="btn btn-primary btn-sm" type="button" onClick={() => setShowCreate(true)}>
            + Neuer Ausflug
          </button>
        </div>
      )}

      <div className="trip-list">
        {sortedTrips.map((trip) => {
          const net = computeMyNet(trip, currentUserId);
          const netClass = net > 0.005 ? 'trip-balance-theirs' : net < -0.005 ? 'trip-balance-mine' : 'trip-balance-zero';
          const netLabel = net > 0.005
            ? `Mir wird geschuldet: ${formatMoney(net)}`
            : net < -0.005
              ? `Ich schulde: ${formatMoney(-net)}`
              : 'Ausgeglichen';
          const statusClass = `trip-card-status trip-card-status--${trip.status}`;
          return (
            <div
              key={trip.id}
              className="trip-card"
              role="button"
              tabIndex={0}
              onClick={() => setActiveTripId(trip.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveTripId(trip.id); } }}
            >
              <div className="trip-card-head">
                <div className="trip-card-title">
                  <span className="trip-card-icon" aria-hidden="true">🧳</span>
                  <strong>{trip.name}</strong>
                </div>
                <span className={statusClass}>{STATUS_LABELS[trip.status] ?? trip.status}</span>
              </div>
              {trip.description && <span className="trip-card-description">{trip.description}</span>}
              <span className="trip-card-meta">{trip.participants.length} Teilnehmer</span>
              <span className={netClass}>{netLabel}</span>
            </div>
          );
        })}
      </div>

      {showCreate && (
        <CreateTripModal
          groupId={groupId}
          members={members}
          currentUserId={currentUserId}
          onClose={() => setShowCreate(false)}
        />
      )}

      {activeTripId !== null && (
        <TripDetailView
          groupId={groupId}
          tripId={activeTripId}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onClose={() => setActiveTripId(null)}
        />
      )}
    </div>
  );
}
