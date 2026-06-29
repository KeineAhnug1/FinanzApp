'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { ShareAccountHistoryModal } from '@/components/accounts/ShareAccountHistoryModal';
import { apiUrl, getCsrfToken } from '@/lib/api-client';
import { useFinanceInvalidator } from '@/lib/finance-mutations';

interface ShareAccountSummary {
  id: number;
  label: string;
  position_count: number;
  total_invested: number;
  created_at: string;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(apiUrl(url), { credentials: 'include', ...options });
  return res.json();
}

const labelSchema = z.object({
  label: z.string().min(1, 'Pflicht').max(50, 'Max. 50 Zeichen'),
});

type LabelData = z.infer<typeof labelSchema>;

function CreateShareAccountModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LabelData>({
    resolver: zodResolver(labelSchema),
    defaultValues: { label: '' },
  });

  const onSubmit = async (data: LabelData) => {
    const result = await apiFetch('/api/finance/share-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify(data),
    });
    if (!result.ok) { toast.error(result.message ?? 'Fehler beim Erstellen'); return; }
    toast.success('Aktienkonto erstellt');
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title="Aktienkonto erstellen">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="entry-form">
        <div>
          <label className="form-label" htmlFor="share-account-label">Name</label>
          <input
            id="share-account-label"
            className="form-input"
            placeholder="z.B. Hauptdepot"
            autoFocus
            {...register('label')}
            aria-invalid={errors.label ? true : undefined}
            aria-describedby={errors.label ? 'share-account-label-error' : undefined}
          />
          {errors.label && <p id="share-account-label-error" className="form-error">{errors.label.message}</p>}
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Erstellen…' : 'Aktienkonto erstellen'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Abbrechen</button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteShareAccountModal({
  account,
  others,
  onClose,
  onDeleted,
}: {
  account: ShareAccountSummary;
  others: ShareAccountSummary[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [transferTarget, setTransferTarget] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const hasPositions = account.position_count > 0;
  const canSubmit = !hasPositions || (transferTarget !== '' && others.length > 0);

  const onConfirm = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const body: Record<string, unknown> = {};
    if (hasPositions && transferTarget) body.transfer_to_share_account_id = Number(transferTarget);
    const result = await apiFetch(`/api/finance/share-accounts/${account.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (!result.ok) { toast.error(result.message ?? 'Fehler beim Löschen'); return; }
    toast.success('Aktienkonto gelöscht');
    onDeleted();
  };

  return (
    <Modal open onClose={onClose} title="Aktienkonto löschen" size="sm">
      {hasPositions ? (
        <>
          <p>
            <strong>{account.label}</strong> hat {account.position_count} Position(en). Wähle ein Zielkonto, auf das die Positionen übertragen werden:
          </p>
          {others.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <label className="form-label" htmlFor="share-account-transfer">Zielkonto (Pflicht):</label>
              <select
                id="share-account-transfer"
                className="form-input form-select"
                value={transferTarget}
                onChange={(e) => setTransferTarget(e.target.value)}
                required
              >
                <option value="">Konto auswählen…</option>
                {others.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
            </div>
          ) : (
            <p style={{ color: 'var(--ui-error, #e53e3e)', marginTop: 8 }}>
              Kein anderes Aktienkonto vorhanden. Bitte zuerst ein weiteres Aktienkonto anlegen.
            </p>
          )}
        </>
      ) : (
        <p>Möchtest du das Aktienkonto <strong>{account.label}</strong> wirklich löschen?</p>
      )}
      <div className="form-actions" style={{ marginTop: 16 }}>
        <button className="btn btn-danger" onClick={onConfirm} disabled={!canSubmit || submitting}>
          {submitting ? 'Löschen…' : 'Löschen bestätigen'}
        </button>
        <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Abbrechen</button>
      </div>
    </Modal>
  );
}

function ShareAccountCard({
  account,
  isRenaming,
  renameDraft,
  onRenameStart,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onDeleteRequest,
  onShowHistory,
}: {
  account: ShareAccountSummary;
  isRenaming: boolean;
  renameDraft: string;
  onRenameStart: () => void;
  onRenameChange: (v: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onDeleteRequest: () => void;
  onShowHistory: () => void;
}) {
  const onTopKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onShowHistory();
    }
  };

  return (
    <div className="share-account-card">
      {isRenaming ? (
        <div className="account-card-top">
          <div className="share-account-card__header">
            <div className="account-rename-wrap">
              <input
                className="form-input account-rename-input"
                value={renameDraft}
                onChange={(e) => onRenameChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onRenameSubmit(); if (e.key === 'Escape') onRenameCancel(); }}
                autoFocus
              />
              <div className="account-rename-actions">
                <button className="btn btn-primary btn-sm" onClick={onRenameSubmit}>Speichern</button>
                <button className="btn btn-ghost btn-sm" onClick={onRenameCancel}>Abbrechen</button>
              </div>
            </div>
          </div>
          <div className="share-account-card__meta">
            {account.position_count} Position{account.position_count === 1 ? '' : 'en'} · {formatMoney(Number(account.total_invested))} investiert
          </div>
        </div>
      ) : (
        <div
          className="account-card-top account-card-top--clickable"
          role="button"
          tabIndex={0}
          onClick={onShowHistory}
          onKeyDown={onTopKey}
          title="Verlauf anzeigen"
        >
          <div className="share-account-card__header">
            <span className="account-name-btn share-account-card__name">{account.label}</span>
          </div>
          <div className="share-account-card__meta">
            {account.position_count} Position{account.position_count === 1 ? '' : 'en'} · {formatMoney(Number(account.total_invested))} investiert
          </div>
        </div>
      )}

      <div className="account-card-actions share-account-card__actions">
        <button className="btn btn-ghost btn-sm" onClick={onRenameStart}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
          </svg>
          Umbenennen
        </button>
        <button className="btn btn-danger btn-sm" onClick={onDeleteRequest}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
          </svg>
          Löschen
        </button>
      </div>
    </div>
  );
}

export default function ShareAccountsSection() {
  const queryClient = useQueryClient();
  const invalidate = useFinanceInvalidator();
  const [showAdd, setShowAdd] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);

  const { data: shareAccounts = [], isLoading } = useQuery<ShareAccountSummary[]>({
    queryKey: ['share-accounts'],
    queryFn: () => apiFetch('/api/finance/share-accounts').then((d) => d.share_accounts ?? []),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['share-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['share-account-history'] });
    invalidate();
  };

  const handleRenameSubmit = async (id: number) => {
    const next = renameDraft.trim();
    if (!next) return;
    const result = await apiFetch(`/api/finance/share-accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({ label: next }),
    });
    if (!result.ok) { toast.error(result.message ?? 'Fehler beim Umbenennen'); return; }
    toast.success('Aktienkonto umbenannt');
    setRenamingId(null);
    setRenameDraft('');
    refresh();
  };

  const deletingAccount = deletingId === null ? null : shareAccounts.find((a) => a.id === deletingId) ?? null;
  const deletingOthers = deletingAccount ? shareAccounts.filter((a) => a.id !== deletingAccount.id) : [];
  const historyAccount = historyId === null ? null : shareAccounts.find((a) => a.id === historyId) ?? null;

  return (
    <section className="share-accounts-section">
      <div className="page-header">
        <h2 className="section-title">Aktienkonten</h2>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Aktienkonto</button>
      </div>

      {isLoading && <div className="loading-state"><span className="spinner" /><span>Lade…</span></div>}

      {!isLoading && shareAccounts.length === 0 && (
        <div className="empty-state">
          <p>Du hast noch kein Aktienkonto.</p>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>Erstes Aktienkonto anlegen</button>
        </div>
      )}

      {shareAccounts.length > 0 && (
        <div className="share-accounts-grid">
          {shareAccounts.map((a) => (
            <ShareAccountCard
              key={a.id}
              account={a}
              isRenaming={renamingId === a.id}
              renameDraft={renameDraft}
              onRenameStart={() => { setRenamingId(a.id); setRenameDraft(a.label); }}
              onRenameChange={setRenameDraft}
              onRenameSubmit={() => handleRenameSubmit(a.id)}
              onRenameCancel={() => { setRenamingId(null); setRenameDraft(''); }}
              onDeleteRequest={() => setDeletingId(a.id)}
              onShowHistory={() => setHistoryId(a.id)}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <CreateShareAccountModal
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); refresh(); }}
        />
      )}

      {deletingAccount && (
        <DeleteShareAccountModal
          account={deletingAccount}
          others={deletingOthers}
          onClose={() => setDeletingId(null)}
          onDeleted={() => { setDeletingId(null); refresh(); }}
        />
      )}

      {historyAccount && (
        <ShareAccountHistoryModal
          accountId={Number(historyAccount.id)}
          accountLabel={historyAccount.label}
          onClose={() => setHistoryId(null)}
        />
      )}
    </section>
  );
}

export { ShareAccountsSection };
