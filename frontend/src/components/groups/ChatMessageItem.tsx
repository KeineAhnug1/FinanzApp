'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { apiUrl, getCsrfToken } from '@/lib/api-client';

export interface ChatMessage {
  id: number;
  message: string;
  created_at: string;
  sender_name?: string;
  user_id: string;
}

interface ChatMessageItemProps {
  groupId: number;
  message: ChatMessage;
  canDelete: boolean;
}

export function ChatMessageItem({ groupId, message, canDelete }: ChatMessageItemProps) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    setBusy(true);
    try {
      const res = await fetch(apiUrl(`/api/groups/${groupId}/messages/${message.id}`), {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'x-csrf-token': getCsrfToken() },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        toast.error(data?.message ?? 'Löschen fehlgeschlagen');
        return;
      }
      toast.success('Nachricht gelöscht');
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ['group-messages', groupId] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-message">
      <span className="chat-sender">{message.sender_name ?? 'Unbekannt'}</span>
      <span className="chat-text">{message.message}</span>
      {canDelete && (
        <button
          type="button"
          className="chat-message__delete"
          aria-label="Nachricht löschen"
          onClick={() => setConfirmOpen(true)}
        >
          ✕
        </button>
      )}
      {confirmOpen && (
        <Modal open onClose={() => (busy ? undefined : setConfirmOpen(false))} title="Nachricht löschen" size="sm">
          <p>Möchtest du diese Nachricht wirklich löschen?</p>
          <div className="form-actions chat-message__confirm-actions">
            <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={busy}>Löschen</button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmOpen(false)} disabled={busy}>Abbrechen</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
