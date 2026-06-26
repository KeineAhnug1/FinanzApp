'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { apiUrl, getCsrfToken } from '@/lib/api-client';
import { ChatMessageItem } from '@/components/groups/ChatMessageItem';

interface GroupMemberView {
  id: number;
  user_id: number;
  username: string;
  first_name?: string;
  role: string;
  status?: string;
}

interface GroupFundingView {
  id: number;
  title: string;
  target_amount: number;
  current_amount: number;
  description?: string;
}

interface GroupView {
  id: number;
  name: string;
  address?: string;
  created_at: string;
  members?: GroupMemberView[];
  funding?: GroupFundingView[];
  is_admin?: boolean;
  session_user_id?: string;
}

interface Invitation {
  id: number;
  group_id: number;
  group_name: string;
  invited_by: string;
}

interface GroupMessageView {
  id: number;
  message: string;
  sender_name?: string;
  created_at: string;
  user_id: string;
}

interface GroupSummary {
  id: number;
  name: string;
  address?: string;
  member_count?: number;
}

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(apiUrl(url), { credentials: 'include', ...options });
  return res.json();
}

function formatMoney(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}

const createGroupSchema = z.object({
  name: z.string().min(2, 'Name erforderlich'),
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
  const [donateAmount, setDonateAmount] = useState<Record<number, string>>({});

  const { data: group, isLoading } = useQuery<GroupView | null>({
    queryKey: ['group', groupId],
    queryFn: () => apiFetch(`/api/groups/${groupId}`).then((d) => {
      if (!d.ok || !d.group) return null;
      return {
        id: Number(d.group.group_id),
        name: d.group.name,
        address: d.group.address ?? undefined,
        created_at: d.group.created_at,
        is_admin: d.is_admin ?? false,
        session_user_id: d.session_user_id ? String(d.session_user_id) : undefined,
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
          target_amount: Number(f.amount ?? 0),
          current_amount: Number(f.total_donated ?? 0),
          description: f.description ? String(f.description) : undefined,
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

  const leaveGroup = async () => {
    const result = await apiFetch(`/api/groups/${groupId}/leave`, { method: 'POST', headers: { 'x-csrf-token': getCsrfToken() } });
    if (!result.ok) { toast.error(result.message ?? 'Fehler'); return; }
    toast.success('Gruppe verlassen');
    onBack();
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgInput.trim()) return;
    await apiFetch(`/api/groups/${groupId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({ message: msgInput.trim() }),
    });
    setMsgInput('');
    queryClient.invalidateQueries({ queryKey: ['group-messages', groupId] });
  };

  const createFunding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fundTitle.trim() || !fundTarget) return;
    const result = await apiFetch(`/api/groups/${groupId}/funding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({ info: fundTitle, amount: Number(fundTarget) }),
    });
    if (!result.ok) { toast.error(result.message ?? 'Fehler'); return; }
    toast.success('Sammelaktion erstellt');
    setFundTitle(''); setFundTarget(''); setFundDesc('');
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
    toast.success('Spende gesendet');
    setDonateAmount((prev) => ({ ...prev, [fundingId]: '' }));
    queryClient.invalidateQueries({ queryKey: ['group', groupId] });
  };

  return (
    <div className="group-detail">
      <div className="group-detail-header">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Zurück</button>
        <h2 className="group-name">{group.name}</h2>
        {group.address && <span className="group-address">{group.address}</span>}
        <button className="btn btn-ghost btn-sm" onClick={leaveGroup}>Gruppe verlassen</button>
      </div>

      <div className="group-section">
        <h3 className="section-title">Mitglieder ({(group.members ?? []).length})</h3>
        <div className="members-list">
          {(group.members ?? []).map((m) => (
            <div key={m.id} className="member-item">
              <span>{m.first_name || m.username}</span>
              {m.role === 'admin' && <span className="badge badge-info">Admin</span>}
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

      <div className="group-section">
        <h3 className="section-title">Sammelaktionen</h3>
        {(group.funding ?? []).map((f) => (
          <div key={f.id} className="funding-item">
            <div className="funding-header">
              <span className="funding-title">{f.title}</span>
              <span className="funding-progress">{formatMoney(f.current_amount)} / {formatMoney(f.target_amount)}</span>
            </div>
            {f.description && <p className="funding-desc">{f.description}</p>}
            <div className="funding-bar-wrap">
              <div className="funding-bar" style={{ width: `${f.target_amount > 0 ? Math.min(100, (f.current_amount / f.target_amount) * 100) : 0}%` }} />
            </div>
            <div className="form-row groups-page__donate-row">
              <input
                className="form-input"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Betrag (€)"
                value={donateAmount[f.id] ?? ''}
                onChange={(e) => setDonateAmount((prev) => ({ ...prev, [f.id]: e.target.value }))}
              />
              <button className="btn btn-primary btn-sm" onClick={() => donate(f.id)}>Spenden</button>
            </div>
          </div>
        ))}
        {isAdmin && (
          <form className="entry-form groups-page__funding-form" onSubmit={createFunding}>
            <div className="form-row">
              <input className="form-input" placeholder="Titel der Sammelaktion" value={fundTitle} onChange={(e) => setFundTitle(e.target.value)} required />
              <input className="form-input" type="number" min="0.01" placeholder="Ziel (€)" value={fundTarget} onChange={(e) => setFundTarget(e.target.value)} required />
            </div>
            <input className="form-input" placeholder="Beschreibung (optional)" value={fundDesc} onChange={(e) => setFundDesc(e.target.value)} />
            <button className="btn btn-primary btn-sm" type="submit">Sammelaktion erstellen</button>
          </form>
        )}
      </div>

      <div className="group-section">
        <h3 className="section-title">Gruppenkanal</h3>
        <div className="chat-messages">
          {messages.map((m) => (
            <ChatMessageItem
              key={m.id}
              groupId={groupId}
              message={m}
              canDelete={(!!group.session_user_id && m.user_id === group.session_user_id) || !!group.is_admin}
            />
          ))}
        </div>
        <form className="chat-input-form" onSubmit={sendMessage}>
          <input className="form-input" placeholder="Nachricht…" value={msgInput} onChange={(e) => setMsgInput(e.target.value)} />
          <button className="btn btn-primary btn-sm" type="submit">Senden</button>
        </form>
      </div>
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
