'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { apiUrl, getCsrfToken } from '@/lib/api-client';

export interface MemberView {
  id: number;
  user_id: number;
  username: string;
  first_name?: string;
  role: string;
  status?: string;
}

interface Props {
  groupId: number;
  member: MemberView;
  canManage: boolean;
}

async function sendJson(url: string, method: 'PATCH' | 'DELETE', body?: unknown) {
  const res = await fetch(apiUrl(url), {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json() as Promise<{ ok: boolean; message?: string }>;
}

export function MembersAdminActions({ groupId, member, canManage }: Props) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!canManage) return null;

  const displayName = member.first_name || member.username;
  const isAdmin = member.role === 'admin';
  const nextRole = isAdmin ? 'member' : 'admin';

  const togglePromote = async () => {
    setBusy(true);
    const result = await sendJson(`/api/groups/${groupId}/members/${member.user_id}`, 'PATCH', { role: nextRole });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.message ?? 'Fehler');
      return;
    }
    toast.success(nextRole === 'admin' ? `${displayName} ist jetzt Admin` : `${displayName} ist jetzt Mitglied`);
    queryClient.invalidateQueries({ queryKey: ['group', groupId] });
  };

  const removeMember = async () => {
    setBusy(true);
    const result = await sendJson(`/api/groups/${groupId}/members/${member.user_id}`, 'DELETE');
    setBusy(false);
    if (!result.ok) {
      toast.error(result.message ?? 'Fehler');
      return;
    }
    toast.success(`${displayName} entfernt`);
    setConfirmOpen(false);
    queryClient.invalidateQueries({ queryKey: ['group', groupId] });
  };

  return (
    <>
      <div className="member-item__actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={togglePromote}
          disabled={busy}
        >
          {isAdmin ? 'Demote' : 'Admin'}
        </button>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          onClick={() => setConfirmOpen(true)}
          disabled={busy}
        >
          Entfernen
        </button>
      </div>
      {confirmOpen && (
        <Modal open size="sm" title="Mitglied entfernen" onClose={() => (busy ? undefined : setConfirmOpen(false))}>
          <p>Möchtest du {displayName} wirklich aus der Gruppe entfernen?</p>
          <div className="form-actions">
            <button type="button" className="btn btn-danger" onClick={removeMember} disabled={busy}>Entfernen</button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmOpen(false)} disabled={busy}>Abbrechen</button>
          </div>
        </Modal>
      )}
    </>
  );
}
