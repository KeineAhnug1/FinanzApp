'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { apiUrl, getCsrfToken } from '@/lib/api-client';

interface GroupMember { id: number; user_id: number; username: string; first_name?: string; role: string; }
interface GroupFunding { id: number; title: string; target_amount: number; current_amount: number; description?: string; }
interface Group {
  id: number;
  name: string;
  address?: string;
  created_at: string;
  members?: GroupMember[];
  funding?: GroupFunding[];
  is_admin?: boolean;
}
interface Invitation { id: number; group_id: number; group_name: string; invited_by: string; }
interface GroupMessage { id: number; message: string; sender_name?: string; created_at: string; }
async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(apiUrl(url), { credentials: 'include', ...options });
  return res.json();
}
function formatMoney(n: number) { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n); }

// ---- Create Group Modal ----
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

// ---- Invitations Modal ----
function InvitationsModal({ onClose, onUpdate }: { onClose: () => void; onUpdate: () => void }) {
  const queryClient = useQueryClient();
  const { data: invitations = [], isLoading } = useQuery<Invitation[]>({
    queryKey: ['invitations'],
    queryFn: () => apiFetch('/api/groups/invitations').then((d) => d.invitations ?? []),
  });

  const respond = async (groupId: number, accept: boolean) => {
    const result = await apiFetch(`/api/groups/${groupId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({ accept }),
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

// ---- Group Detail ----
function GroupDetail({ groupId, onBack }: { groupId: number; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [inviteUsername, setInviteUsername] = useState('');
  const [msgInput, setMsgInput] = useState('');
  const [fundTitle, setFundTitle] = useState('');
  const [fundTarget, setFundTarget] = useState('');
  const [fundDesc, setFundDesc] = useState('');
  const [donateAmount, setDonateAmount] = useState<Record<number, string>>({});

  const { data: group, isLoading } = useQuery<Group>({
    queryKey: ['group', groupId],
    queryFn: () => apiFetch(`/api/groups/${groupId}`).then((d) => d.group),
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['group-messages', groupId],
    queryFn: () => apiFetch(`/api/groups/${groupId}/messages`).then((d) => d.messages ?? []),
    refetchInterval: 10000,
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
      body: JSON.stringify({ title: fundTitle, target_amount: Number(fundTarget), description: fundDesc }),
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

      {/* Members */}
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
          <div className="invite-form" style={{ marginTop: 12 }}>
            <input className="form-input" placeholder="Username einladen" value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)} style={{ maxWidth: 200 }} />
            <button className="btn btn-primary btn-sm" onClick={invite}>Einladen</button>
          </div>
        )}
      </div>

      {/* Funding */}
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
            <div className="form-row" style={{ marginTop: 8 }}>
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
          <form className="entry-form" onSubmit={createFunding} style={{ marginTop: 12 }}>
            <div className="form-row">
              <input className="form-input" placeholder="Titel der Sammelaktion" value={fundTitle} onChange={(e) => setFundTitle(e.target.value)} required />
              <input className="form-input" type="number" min="0.01" placeholder="Ziel (€)" value={fundTarget} onChange={(e) => setFundTarget(e.target.value)} required />
            </div>
            <input className="form-input" placeholder="Beschreibung (optional)" value={fundDesc} onChange={(e) => setFundDesc(e.target.value)} />
            <button className="btn btn-primary btn-sm" type="submit">Sammelaktion erstellen</button>
          </form>
        )}
      </div>

      {/* Chat */}
      <div className="group-section">
        <h3 className="section-title">Gruppenkanal</h3>
        <div className="chat-messages">
          {(messages as GroupMessage[]).map((m) => (
            <div key={m.id} className="chat-message">
              <span className="chat-sender">{m.sender_name ?? 'Unbekannt'}</span>
              <span className="chat-text">{m.message}</span>
            </div>
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

// ---- Group List Item ----
function GroupListItem({ group, onClick }: { group: { id: number; name: string; address?: string; member_count?: number }; onClick: () => void }) {
  return (
    <div className="group-card" onClick={onClick}>
      <h3 className="group-card-name">{group.name}</h3>
      {group.address && <p className="group-card-address">{group.address}</p>}
      {group.member_count !== undefined && (
        <span className="group-card-members">{group.member_count} Mitglieder</span>
      )}
    </div>
  );
}

// ---- Main Page ----
export default function GroupsPage() {
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showInvitations, setShowInvitations] = useState(false);
  const queryClient = useQueryClient();

  const { data: groups = [], isLoading } = useQuery<{ id: number; name: string; address?: string; member_count?: number }[]>({
    queryKey: ['groups'],
    queryFn: () => apiFetch('/api/groups').then((d) => d.groups ?? []),
  });

  const { data: invitations = [] } = useQuery<{ id: number }[]>({
    queryKey: ['invitations'],
    queryFn: () => apiFetch('/api/groups/invitations').then((d) => d.invitations ?? []),
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
            📬 Einladungen {invitations.length > 0 && <span className="badge badge-error">{invitations.length}</span>}
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
