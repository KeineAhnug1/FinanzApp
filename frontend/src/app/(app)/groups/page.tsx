'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { getCsrfToken } from '@/lib/api-client';
import { apiFetch, formatMoney } from '@/components/groups/api';
import type { GroupView, GroupMessageView, GroupSummary, Invitation } from '@/components/groups/types';
import { MembersAdminActions } from '@/components/groups/MembersAdminSection';
import { ActivitiesSection } from '@/components/groups/ActivitiesSection';
import { ExpensesSection } from '@/components/groups/ExpensesSection';
import { ChatMessageItem } from '@/components/groups/ChatMessageItem';
import { FundingBalance } from '@/components/groups/FundingBalance';
import { SharedExpensesSection } from '@/components/groups/SharedExpensesSection';
import { TripsSection } from '@/components/groups/TripsSection';
import { GroupTransfersSection } from '@/components/groups/GroupTransfersSection';
import { GroupArchiveSection } from '@/components/groups/GroupArchiveSection';

type GroupTab = 'overview' | 'members' | 'activities' | 'fundings' | 'shared-expenses' | 'trips' | 'transfers' | 'archive' | 'chat';

const VALID_TABS: GroupTab[] = ['overview', 'members', 'activities', 'fundings', 'shared-expenses', 'trips', 'transfers', 'archive', 'chat'];

const createGroupSchema = z.object({
  name: z.string().min(2, 'Name erforderlich'),
  info: z.string().max(500, 'Max. 500 Zeichen').optional(),
  address: z.string().optional(),
});
type CreateGroupData = z.infer<typeof createGroupSchema>;

function CreateGroupModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CreateGroupData>({
    resolver: zodResolver(createGroupSchema),
  });

  const onSubmit = async (data: CreateGroupData) => {
    const result = await apiFetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify(data),
    });
    if (!result.ok) { toast.error(result.message ?? 'Fehler'); return; }
    toast.success('Gruppe erstellt');
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title="Gruppe erstellen">
      <form className="entry-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div>
          <label className="form-label">Gruppenname</label>
          <input className="form-input" placeholder="z.B. WG Müller" {...register('name')} />
          {errors.name && <p className="form-error">{errors.name.message}</p>}
        </div>
        <div>
          <label className="form-label">Beschreibung (optional)</label>
          <textarea className="form-input" rows={3} placeholder="Worum geht es in der Gruppe?" {...register('info')} />
          {errors.info && <p className="form-error">{errors.info.message}</p>}
        </div>
        <div>
          <label className="form-label">Adresse (optional)</label>
          <input className="form-input" placeholder="Musterstr. 1, 12345 Stadt" {...register('address')} />
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>Erstellen</button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Abbrechen</button>
        </div>
      </form>
    </Modal>
  );
}

function InvitationsModal({ onClose, onUpdate }: { onClose: () => void; onUpdate: () => void }) {
  const queryClient = useQueryClient();
  const { data: invitations = [], isLoading } = useQuery<Invitation[]>({
    queryKey: ['invitations'],
    queryFn: () => apiFetch('/api/groups/invitations').then((d) =>
      (d.invitations ?? []).map((inv: Record<string, unknown>) => ({
        id: Number(inv.group_id),
        group_id: Number(inv.group_id),
        group_name: String(inv.name ?? ''),
        invited_by: String(inv.invited_by ?? ''),
      }))
    ),
  });

  const respond = async (groupId: number, accept: boolean) => {
    const result = await apiFetch(`/api/groups/${groupId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({ decision: accept ? 'accept' : 'decline' }),
    });
    if (!result.ok) { toast.error(result.message ?? 'Fehler'); return; }
    toast.success(accept ? 'Einladung angenommen' : 'Einladung abgelehnt');
    queryClient.invalidateQueries({ queryKey: ['invitations'] });
    onUpdate();
  };

  return (
    <Modal open onClose={onClose} title="Einladungen">
      {isLoading && <div className="loading-state"><span className="spinner" /><span>Lade…</span></div>}
      {invitations.length === 0 && !isLoading && <p>Keine Einladungen.</p>}
      {invitations.map((inv) => (
        <div key={inv.id} className="invitation-item">
          <span><strong>{inv.group_name}</strong> – eingeladen von {inv.invited_by}</span>
          <div className="form-actions">
            <button className="btn btn-primary btn-sm" onClick={() => respond(inv.group_id, true)}>Annehmen</button>
            <button className="btn btn-ghost btn-sm" onClick={() => respond(inv.group_id, false)}>Ablehnen</button>
          </div>
        </div>
      ))}
    </Modal>
  );
}

function GroupDetail({ groupId, onBack }: { groupId: number; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [inviteUsername, setInviteUsername] = useState('');
  const [msgInput, setMsgInput] = useState('');
  const [fundTitle, setFundTitle] = useState('');
  const [fundTarget, setFundTarget] = useState('');
  const [fundDesc, setFundDesc] = useState('');
  const [fundActivity, setFundActivity] = useState('');
  const [donateAmount, setDonateAmount] = useState<Record<number, string>>({});
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [tab, setTab] = useState<GroupTab>('overview');

  useEffect(() => {
    const stored = localStorage.getItem('finanzapp.groupTab') as GroupTab | null;
    if (stored && VALID_TABS.includes(stored)) setTab(stored);
  }, []);

  const switchTab = (t: GroupTab) => {
    setTab(t);
    localStorage.setItem('finanzapp.groupTab', t);
  };

  const { data: group, isLoading } = useQuery<GroupView | null>({
    queryKey: ['group', groupId],
    queryFn: () => apiFetch(`/api/groups/${groupId}`).then((d) => {
      if (!d.ok || !d.group) return null;
      return {
        id: Number(d.group.group_id),
        name: d.group.name,
        address: d.group.address ?? undefined,
        info: d.group.info ?? undefined,
        created_at: d.group.created_at,
        is_admin: d.is_admin ?? false,
        session_user_id: d.session_user_id ? Number(d.session_user_id) : undefined,
        members: (d.members ?? []).map((m: Record<string, unknown>) => ({
          id: Number(m.user_id),
          user_id: Number(m.user_id),
          username: String(m.username ?? ''),
          first_name: m.first_name ? String(m.first_name) : undefined,
          role: String(m.role ?? ''),
          status: m.status ? String(m.status) : undefined,
        })),
        funding: (d.fundings ?? []).map((f: Record<string, unknown>) => ({
          id: Number(f.funding_id),
          title: String(f.info ?? f.title ?? ''),
          target_amount: Number(f.target_amount ?? f.amount ?? 0),
          current_amount: Number(f.total_donated ?? f.amount ?? 0),
          description: f.description ? String(f.description) : undefined,
          status: (f.status as 'open' | 'completed' | 'archived' | undefined) ?? 'open',
          completed_at: f.completed_at ? String(f.completed_at) : null,
          archived_at: f.archived_at ? String(f.archived_at) : null,
          contributions: (Array.isArray(f.contributions) ? f.contributions : []).map(
            (c: Record<string, unknown>) => ({ amount: Number(c.amount ?? 0) })
          ),
        })),
        archived_fundings: (d.archived_fundings ?? []).map((f: Record<string, unknown>) => ({
          id: Number(f.funding_id),
          title: String(f.info ?? f.title ?? ''),
          target_amount: Number(f.target_amount ?? 0),
          current_amount: Number(f.total_donated ?? f.amount ?? 0),
          archived_at: f.archived_at ? String(f.archived_at) : null,
          created_at: f.created_at ? String(f.created_at) : null,
        })),
        activities: (d.activities ?? []).map((a: Record<string, unknown>) => ({
          activity_id: String(a.activity_id),
          info: a.info != null ? String(a.info) : null,
          date: a.date != null ? String(a.date) : null,
          created_at: a.created_at != null ? String(a.created_at) : null,
        })),
        expenses: (d.expenses ?? []).map((e: Record<string, unknown>) => ({
          group_expense_id: String(e.group_expense_id ?? ''),
          group_funding_id: String(e.group_funding_id ?? ''),
          amount: Number(e.amount ?? 0),
          info: e.info ? String(e.info) : null,
          state: (e.state as 'open' | 'paid' | 'overdue' | null) ?? null,
          cycle: e.cycle ? String(e.cycle) : null,
          due_date: e.due_date ? String(e.due_date) : null,
          pay_date: e.pay_date ? String(e.pay_date) : null,
          created_at: e.created_at ? String(e.created_at) : null,
        })),
      } as GroupView;
    }),
    enabled: !!groupId,
  });

  const { data: messages = [] } = useQuery<GroupMessageView[]>({
    queryKey: ['group-messages', groupId],
    queryFn: () => apiFetch(`/api/groups/${groupId}/messages`).then((d) =>
      (d.messages ?? []).map((m: Record<string, unknown>) => {
        const u = m.user as Record<string, unknown> | null;
        return {
          id: Number(m.message_id),
          message: String(m.message ?? ''),
          created_at: String(m.created_at ?? ''),
          sender_name: u?.first_name ? String(u.first_name) : (u?.username ? String(u.username) : undefined),
          user_id: String(u?.user_id ?? ''),
        };
      })
    ),
    refetchInterval: 10000,
    enabled: !!groupId,
  });

  if (isLoading || !group) return <p className="loading-msg">Lädt Gruppe…</p>;

  const isAdmin = group.is_admin;

  const invite = async () => {
    if (!inviteUsername.trim()) return;
    const result = await apiFetch(`/api/groups/${groupId}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({ username: inviteUsername.trim() }),
    });
    if (!result.ok) { toast.error(result.message ?? 'Fehler'); return; }
    toast.success('Einladung gesendet');
    setInviteUsername('');
  };

  const leaveGroup = async (): Promise<boolean> => {
    const result = await apiFetch(`/api/groups/${groupId}/leave`, { method: 'POST', headers: { 'x-csrf-token': getCsrfToken() } });
    if (!result.ok) { toast.error(result.message ?? 'Fehler'); return false; }
    toast.success('Gruppe verlassen');
    onBack();
    return true;
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgInput.trim()) return;
    const result = await apiFetch(`/api/groups/${groupId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({ message: msgInput.trim() }),
    });
    if (!result.ok) { toast.error(result.message ?? 'Nachricht konnte nicht gesendet werden'); return; }
    setMsgInput('');
    queryClient.invalidateQueries({ queryKey: ['group-messages', groupId] });
  };

  const createFunding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fundTitle.trim() || !fundTarget) return;
    const target = Number(fundTarget);
    if (!Number.isFinite(target) || target <= 0) { toast.error('Zielbetrag muss > 0 sein'); return; }
    const body: { info: string; target_amount: number; description?: string; group_activity_id?: number } = {
      info: fundTitle,
      target_amount: target,
    };
    if (fundDesc.trim()) body.description = fundDesc.trim();
    if (fundActivity !== '') body.group_activity_id = Number(fundActivity);
    const result = await apiFetch(`/api/groups/${groupId}/funding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify(body),
    });
    if (!result.ok) { toast.error(result.message ?? 'Fehler'); return; }
    toast.success('Sammelaktion erstellt');
    setFundTitle(''); setFundTarget(''); setFundDesc(''); setFundActivity('');
    queryClient.invalidateQueries({ queryKey: ['group', groupId] });
  };

  const donate = async (fundingId: number) => {
    const amount = Number(donateAmount[fundingId] || 0);
    if (!amount || amount <= 0) { toast.error('Ungültiger Betrag'); return; }
    const bankAccounts = await apiFetch('/api/finance/bank-accounts').then((d) => d.accounts ?? []);
    if (!bankAccounts[0]) { toast.error('Kein Bankkonto gefunden'); return; }
    const result = await apiFetch(`/api/groups/${groupId}/funding/${fundingId}/donate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({ amount, bank_account_id: bankAccounts[0].id }),
    });
    if (!result.ok) { toast.error(result.message ?? 'Fehler'); return; }
    const actual = Number(result.actual_amount ?? amount);
    if (result.capped) {
      toast.success(`Nur ${formatMoney(actual)} wurden angenommen — Ziel erreicht.`);
    } else {
      toast.success('Spende gesendet');
    }
    setDonateAmount((prev) => ({ ...prev, [fundingId]: '' }));
    queryClient.invalidateQueries({ queryKey: ['group', groupId] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
  };

  const archiveFunding = async (fundingId: number) => {
    const result = await apiFetch(`/api/groups/${groupId}/funding/${fundingId}/archive`, {
      method: 'POST',
      headers: { 'x-csrf-token': getCsrfToken() },
    });
    if (!result.ok) { toast.error(result.message ?? 'Fehler'); return; }
    toast.success('Sammelaktion archiviert');
    queryClient.invalidateQueries({ queryKey: ['group', groupId] });
  };

  return (
    <div className="group-detail">
      <div className="group-detail-header">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurück</button>
        <h2 className="group-name">{group.name}</h2>
        {group.address && <span className="group-address">{group.address}</span>}
        <button className="btn btn-ghost btn-sm" onClick={() => setLeaveConfirmOpen(true)}>Gruppe verlassen</button>
      </div>

      <nav className="entry-tab-nav" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'overview'} className={`entry-tab-btn${tab === 'overview' ? ' is-active' : ''}`} onClick={() => switchTab('overview')}>Übersicht</button>
        <button type="button" role="tab" aria-selected={tab === 'members'} className={`entry-tab-btn${tab === 'members' ? ' is-active' : ''}`} onClick={() => switchTab('members')}>Mitglieder</button>
        <button type="button" role="tab" aria-selected={tab === 'activities'} className={`entry-tab-btn${tab === 'activities' ? ' is-active' : ''}`} onClick={() => switchTab('activities')}>Aktivitäten</button>
        <button type="button" role="tab" aria-selected={tab === 'fundings'} className={`entry-tab-btn${tab === 'fundings' ? ' is-active' : ''}`} onClick={() => switchTab('fundings')}>Sammelaktionen</button>
        <button type="button" role="tab" aria-selected={tab === 'shared-expenses'} className={`entry-tab-btn${tab === 'shared-expenses' ? ' is-active' : ''}`} onClick={() => switchTab('shared-expenses')}>Ausgaben</button>
        <button type="button" role="tab" aria-selected={tab === 'trips'} className={`entry-tab-btn${tab === 'trips' ? ' is-active' : ''}`} onClick={() => switchTab('trips')}>Ausflüge</button>
        <button type="button" role="tab" aria-selected={tab === 'transfers'} className={`entry-tab-btn${tab === 'transfers' ? ' is-active' : ''}`} onClick={() => switchTab('transfers')}>Überweisungen</button>
        <button type="button" role="tab" aria-selected={tab === 'archive'} className={`entry-tab-btn${tab === 'archive' ? ' is-active' : ''}`} onClick={() => switchTab('archive')}>Archiv</button>
        <button type="button" role="tab" aria-selected={tab === 'chat'} className={`entry-tab-btn${tab === 'chat' ? ' is-active' : ''}`} onClick={() => switchTab('chat')}>Chat</button>
      </nav>

      {tab === 'overview' && (
        <div className="group-section">
          <h3 className="section-title">Übersicht</h3>
          <div className="group-overview-stats">
            <div><strong>{(group.members ?? []).length}</strong> Mitglieder</div>
            <div><strong>{(group.activities ?? []).length}</strong> Aktivitäten</div>
            <div><strong>{(group.funding ?? []).length}</strong> Sammelaktionen</div>
          </div>
          {group.info && <p className="group-overview-info">{group.info}</p>}
        </div>
      )}

      {tab === 'members' && (
        <div className="group-section">
          <h3 className="section-title">Mitglieder ({(group.members ?? []).length})</h3>
          <div className="members-list">
            {(group.members ?? []).map((m) => (
              <div key={m.id} className="member-item">
                <span>{m.first_name || m.username}</span>
                {m.role === 'admin' && <span className="badge badge-info">Admin</span>}
                <MembersAdminActions
                  groupId={groupId}
                  member={m}
                  canManage={!!isAdmin && group.session_user_id !== undefined && m.user_id !== group.session_user_id}
                />
              </div>
            ))}
          </div>
          {isAdmin && (
            <div className="invite-form groups-page__invite-form">
              <input className="form-input groups-page__invite-input" placeholder="Username einladen" value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)} />
              <button className="btn btn-primary btn-sm" onClick={invite}>Einladen</button>
            </div>
          )}
        </div>
      )}

      {tab === 'activities' && (
        <ActivitiesSection groupId={groupId} activities={group.activities ?? []} canManage={true} />
      )}

      {tab === 'fundings' && (
        <div className="group-section">
          <h3 className="section-title">Sammelaktionen</h3>
          {(group.funding ?? []).map((f) => {
            const remaining = Math.max(0, Number((f.target_amount - f.current_amount).toFixed(2)));
            const isCompleted = f.status === 'completed';
            const progressPct = f.target_amount > 0 ? Math.min(100, (f.current_amount / f.target_amount) * 100) : 0;
            return (
              <div key={f.id} className="funding-item">
                <div className="funding-header">
                  <span className="funding-title">
                    {f.title}
                    {isCompleted && <span className="funding-completed-badge">Fertig</span>}
                  </span>
                  <span className="funding-progress">{formatMoney(f.current_amount)} / {formatMoney(f.target_amount)}</span>
                </div>
                {f.description && <p className="funding-desc">{f.description}</p>}
                <div className="funding-bar-wrap">
                  <div className="funding-bar" style={{ width: `${progressPct}%` }} />
                </div>
                <FundingBalance funding={f} />
                {!isCompleted && (
                  <div className="form-row groups-page__donate-row">
                    <div className="amount-input-wrap">
                      <input
                        className="form-input amount-input"
                        type="number"
                        min="0.01"
                        step="0.01"
                        max={remaining > 0 ? remaining : undefined}
                        placeholder="Betrag"
                        value={donateAmount[f.id] ?? ''}
                        onChange={(e) => setDonateAmount((prev) => ({ ...prev, [f.id]: e.target.value }))}
                      />
                      <span className="amount-input-suffix" aria-hidden="true">€</span>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={() => donate(f.id)}>Spenden</button>
                  </div>
                )}
                {isCompleted && isAdmin && (
                  <div className="form-actions" style={{ marginTop: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => archiveFunding(f.id)}>
                      Als fertig markieren (archivieren)
                    </button>
                  </div>
                )}
                <ExpensesSection
                  groupId={groupId}
                  fundingId={f.id}
                  fundingAmount={f.target_amount}
                  expenses={(group.expenses ?? []).filter((e) => String(e.group_funding_id) === String(f.id))}
                  isAdmin={!!isAdmin}
                />
              </div>
            );
          })}
          {isAdmin && (
            <form className="entry-form groups-page__funding-form" onSubmit={createFunding}>
              <div className="form-row">
                <input className="form-input" placeholder="Titel der Sammelaktion" value={fundTitle} onChange={(e) => setFundTitle(e.target.value)} required />
                <div className="amount-input-wrap">
                  <input className="form-input amount-input" type="number" min="0.01" step="0.01" placeholder="Ziel" value={fundTarget} onChange={(e) => setFundTarget(e.target.value)} required />
                  <span className="amount-input-suffix" aria-hidden="true">€</span>
                </div>
              </div>
              <input className="form-input" placeholder="Beschreibung (optional)" value={fundDesc} onChange={(e) => setFundDesc(e.target.value)} />
              {(group.activities?.length ?? 0) > 0 && (
                <select
                  className="form-input form-select"
                  value={fundActivity}
                  onChange={(e) => setFundActivity(e.target.value)}
                >
                  <option value="">Keine Aktivität verknüpfen</option>
                  {(group.activities ?? []).map((a) => (
                    <option key={a.activity_id} value={a.activity_id}>{a.info ?? '—'}</option>
                  ))}
                </select>
              )}
              <button className="btn btn-primary btn-sm" type="submit">Sammelaktion erstellen</button>
            </form>
          )}
        </div>
      )}

      {tab === 'shared-expenses' && (
        <SharedExpensesSection
          groupId={groupId}
          isAdmin={!!isAdmin}
          sessionUserId={group.session_user_id}
          members={group.members ?? []}
        />
      )}

      {tab === 'trips' && group.session_user_id !== undefined && (
        <TripsSection
          groupId={groupId}
          members={group.members ?? []}
          currentUserId={group.session_user_id}
          isAdmin={!!isAdmin}
        />
      )}

      {tab === 'transfers' && (
        <GroupTransfersSection groupId={groupId} />
      )}

      {tab === 'archive' && (
        <GroupArchiveSection groupId={groupId} archivedFundings={group.archived_fundings ?? []} />
      )}

      {tab === 'chat' && (
        <div className="group-section">
          <h3 className="section-title">Gruppenkanal</h3>
          <div className="chat-messages">
            {messages.map((m) => (
              <ChatMessageItem
                key={m.id}
                groupId={groupId}
                message={m}
                canDelete={(group.session_user_id !== undefined && Number(m.user_id) === group.session_user_id) || !!group.is_admin}
              />
            ))}
          </div>
          <form className="chat-input-form" onSubmit={sendMessage}>
            <input className="form-input" placeholder="Nachricht…" value={msgInput} onChange={(e) => setMsgInput(e.target.value)} />
            <button className="btn btn-primary btn-sm" type="submit">Senden</button>
          </form>
        </div>
      )}

      {leaveConfirmOpen && (
        <Modal open onClose={() => { if (!leaveBusy) setLeaveConfirmOpen(false); }} title="Gruppe verlassen" size="sm">
          <p>Möchtest du die Gruppe <strong>{group.name}</strong> wirklich verlassen?</p>
          <p style={{ color: 'var(--ui-text-muted)', fontSize: '0.85rem', marginTop: 8 }}>
            Falls du wieder beitreten möchtest, musst du erneut eingeladen werden.
          </p>
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button
              className="btn btn-danger"
              disabled={leaveBusy}
              onClick={async () => {
                setLeaveBusy(true);
                const ok = await leaveGroup();
                setLeaveBusy(false);
                if (ok) setLeaveConfirmOpen(false);
              }}
            >
              {leaveBusy ? 'Verlassen…' : 'Verlassen'}
            </button>
            <button className="btn btn-ghost" onClick={() => setLeaveConfirmOpen(false)} disabled={leaveBusy}>
              Abbrechen
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function GroupListItem({ group, onClick }: { group: GroupSummary; onClick: () => void }) {
  return (
    <button type="button" className="group-card group-card-button" onClick={onClick}>
      <h3 className="group-card-name">{group.name}</h3>
      {group.address && <p className="group-card-address">{group.address}</p>}
      {group.member_count !== undefined && (
        <span className="group-card-members">{group.member_count} Mitglieder</span>
      )}
    </button>
  );
}

export default function GroupsPage() {
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showInvitations, setShowInvitations] = useState(false);
  const queryClient = useQueryClient();

  const { data: groups = [], isLoading } = useQuery<GroupSummary[]>({
    queryKey: ['groups'],
    queryFn: () => apiFetch('/api/groups').then((d) =>
      (d.groups ?? []).map((g: Record<string, unknown>) => ({
        id: Number(g.group_id),
        name: String(g.name ?? ''),
        address: g.address ? String(g.address) : undefined,
      }))
    ),
  });

  const { data: invitations = [] } = useQuery<Invitation[]>({
    queryKey: ['invitations'],
    queryFn: () => apiFetch('/api/groups/invitations').then((d) =>
      (d.invitations ?? []).map((inv: Record<string, unknown>) => ({
        id: Number(inv.group_id),
        group_id: Number(inv.group_id),
        group_name: String(inv.name ?? ''),
        invited_by: String(inv.invited_by ?? ''),
      }))
    ),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['groups'] });
    queryClient.invalidateQueries({ queryKey: ['invitations'] });
  };

  if (selectedGroupId !== null) {
    return (
      <div className="groups-page page-content">
        <GroupDetail groupId={selectedGroupId} onBack={() => { setSelectedGroupId(null); refresh(); }} />
      </div>
    );
  }

  return (
    <div className="groups-page page-content">
      <div className="page-header">
        <h1 className="page-title">Gruppen</h1>
        <div className="form-actions">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Gruppe erstellen</button>
          <button className="btn btn-secondary" onClick={() => setShowInvitations(true)}>
            Einladungen {invitations.length > 0 && <span className="badge badge-error">{invitations.length}</span>}
          </button>
        </div>
      </div>

      {isLoading && <div className="loading-state"><span className="spinner" /><span>Lade…</span></div>}

      {!isLoading && groups.length === 0 && (
        <div className="empty-state">
          <p>Du bist noch in keiner Gruppe.</p>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Erste Gruppe erstellen</button>
        </div>
      )}

      <div className="groups-list">
        {groups.map((g) => (
          <GroupListItem key={g.id} group={g} onClick={() => setSelectedGroupId(g.id)} />
        ))}
      </div>

      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); refresh(); }}
        />
      )}

      {showInvitations && (
        <InvitationsModal onClose={() => setShowInvitations(false)} onUpdate={refresh} />
      )}
    </div>
  );
}
