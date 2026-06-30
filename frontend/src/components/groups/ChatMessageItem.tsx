'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { apiUrl, getCsrfToken } from '@/lib/api-client';
import { initials } from '@/lib/initials';

export interface ChatMessage {
  id: number;
  message: string;
  created_at: string;
  sender_name?: string;
  sender_profile_image?: string | null;
  user_id: string;
  deleted?: boolean;
}

interface ChatMessageItemProps {
  groupId: number;
  message: ChatMessage;
  canDelete: boolean;
  isOwn: boolean;
}

export function ChatMessageItem({ groupId, message, canDelete, isOwn }: ChatMessageItemProps) {
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

  const senderLabel = isOwn ? 'Ich' : (message.sender_name ?? 'Unbekannt');
  const avatar = message.sender_profile_image;
  const isDeleted = message.deleted === true;
  const canActuallyDelete = canDelete && !isDeleted;

  return (
    <div className={`chat-message ${isOwn ? 'chat-message--own' : 'chat-message--other'}${isDeleted ? ' chat-message--deleted' : ''}`}>
      {!isOwn && (
        <div className="chat-message__avatar" aria-hidden="true">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="chat-message__avatar-img" />
          ) : (
            <span className="chat-message__avatar-fallback">{initials(message.sender_name)}</span>
          )}
        </div>
      )}
      <div className="chat-message__body">
        <span className="chat-sender">{senderLabel}</span>
        <div className="chat-bubble">
          {isDeleted ? (
            <span className="chat-text chat-text--deleted">Diese Nachricht wurde gelöscht</span>
          ) : (
            <span className="chat-text">{message.message}</span>
          )}
          {canActuallyDelete && (
            <button
              type="button"
              className="chat-message__delete"
              aria-label="Nachricht löschen"
              onClick={() => setConfirmOpen(true)}
            >
              ✕
            </button>
          )}
        </div>
      </div>
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
