'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { apiUrl, getCsrfToken } from '@/lib/api-client';

interface BankAccount {
  id: string;
  label: string;
  name?: string;
  balance: number;
  type: string;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(apiUrl(url), { credentials: 'include', ...options });
  return res.json();
}

// ---- Add Account Form ----
const addAccountSchema = z.object({
  label: z.string().min(1, 'Name ist erforderlich'),
  initial_balance: z.coerce.number().min(0, 'Anfangsguthaben muss >= 0 sein'),
});

type AddAccountData = z.infer<typeof addAccountSchema>;

function AddAccountModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<AddAccountData>({
    resolver: zodResolver(addAccountSchema),
    defaultValues: { label: '', initial_balance: 0 },
  });

  const onSubmit = async (data: AddAccountData) => {
    const result = await apiFetch('/api/finance/bank-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify(data),
    });
    if (!result.ok) { toast.error(result.message ?? 'Fehler beim Erstellen'); return; }
    toast.success('Konto erstellt');
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title="Konto hinzufügen">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="entry-form">
        <div>
          <label className="form-label">Kontoname</label>
          <input className="form-input" placeholder="z.B. Girokonto" {...register('label')} />
          {errors.label && <p className="form-error">{errors.label.message}</p>}
        </div>
        <div>
          <label className="form-label">Anfangsguthaben (€)</label>
          <input className="form-input" type="number" step="0.01" min="0" {...register('initial_balance')} />
          {errors.initial_balance && <p className="form-error">{errors.initial_balance.message}</p>}
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Erstellen…' : 'Konto erstellen'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Abbrechen</button>
        </div>
      </form>
    </Modal>
  );
}

// ---- Account Card ----
function AccountCard({ account, onUpdate }: { account: BankAccount; onUpdate: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(account.label || account.name || '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const accounts = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: () => apiFetch('/api/finance/bank-accounts').then((d) => d.accounts ?? []),
  });

  const otherAccounts = (accounts.data ?? []).filter((a) => a.id !== account.id);

  const handleRename = async () => {
    if (!newName.trim()) return;
    const result = await apiFetch(`/api/finance/bank-accounts/${account.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({ label: newName.trim() }),
    });
    if (!result.ok) { toast.error(result.message ?? 'Fehler beim Umbenennen'); return; }
    toast.success('Konto umbenannt');
    setRenaming(false);
    onUpdate();
  };

  const handleDelete = async () => {
    if (Math.abs(balance) >= 0.01 && !transferTarget) {
      toast.error('Bitte ein Transferkonto auswählen');
      return;
    }
    const body: Record<string, unknown> = {};
    if (transferTarget) body.transfer_to_id = transferTarget;
    const result = await apiFetch(`/api/finance/bank-accounts/${account.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify(body),
    });
    if (!result.ok) { toast.error(result.message ?? 'Fehler beim Löschen'); return; }
    toast.success('Konto gelöscht');
    setConfirmDelete(false);
    onUpdate();
  };

  const balance = Number(account.balance);

  return (
    <div className="account-card">
      <div className="account-card-header">
        {renaming ? (
          <div className="account-rename-wrap">
            <input
              className="form-input account-rename-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false); }}
              autoFocus
            />
            <div className="account-rename-actions">
              <button className="btn btn-primary btn-sm" onClick={handleRename}>Speichern</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setRenaming(false)}>Abbrechen</button>
            </div>
          </div>
        ) : (
          <>
            <button className="account-name-btn" onClick={() => setRenaming(true)} title="Umbenennen">
              {account.label || account.name || 'Konto'}
            </button>
            <span className={`account-balance ${balance < 0 ? 'is-negative' : ''}`}>
              {formatMoney(balance)}
            </span>
          </>
        )}
      </div>

      <div className="account-type">{account.type || 'Bankkonto'}</div>

      <div className="account-card-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => setRenaming(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
          </svg>
          Umbenennen
        </button>
        <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
          </svg>
          Löschen
        </button>
      </div>

      {confirmDelete && (
        <Modal open onClose={() => { setConfirmDelete(false); setTransferTarget(''); }} title="Konto löschen">
          <p>Möchtest du das Konto <strong>{account.label || account.name}</strong> wirklich löschen?</p>
          {Math.abs(balance) >= 0.01 && (
            <div style={{ marginTop: 12 }}>
              {otherAccounts.length > 0 ? (
                <>
                  <label className="form-label">Guthaben übertragen auf (Pflicht):</label>
                  <select
                    className="form-input form-select"
                    value={transferTarget}
                    onChange={(e) => setTransferTarget(e.target.value)}
                    required
                  >
                    <option value="">Konto auswählen…</option>
                    {otherAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.label || a.name} ({formatMoney(Number(a.balance))})</option>
                    ))}
                  </select>
                </>
              ) : (
                <p style={{ color: 'var(--ui-error, #e53e3e)', marginTop: 8 }}>
                  Kein anderes Konto für Transfer vorhanden. Bitte zuerst ein weiteres Konto anlegen.
                </p>
              )}
            </div>
          )}
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button
              className="btn btn-danger"
              onClick={handleDelete}
              disabled={Math.abs(balance) >= 0.01 && (!transferTarget || otherAccounts.length === 0)}
            >
              Löschen bestätigen
            </button>
            <button className="btn btn-ghost" onClick={() => { setConfirmDelete(false); setTransferTarget(''); }}>Abbrechen</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---- Main Page ----
export default function AccountsPage() {
  const [showAdd, setShowAdd] = useState(false);
  const queryClient = useQueryClient();

  const { data: accounts = [], isLoading } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: () => apiFetch('/api/finance/bank-accounts').then((d) => d.accounts ?? []),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance), 0);

  return (
    <div className="accounts-page page-content">
      <div className="page-header">
        <h1 className="page-title">Konten</h1>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Konto hinzufügen</button>
      </div>

      {isLoading && <div className="loading-state"><span className="spinner" /><span>Lade…</span></div>}

      {!isLoading && accounts.length === 0 && (
        <div className="empty-state">
          <p>Du hast noch keine Bankkonten.</p>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>Erstes Konto anlegen</button>
        </div>
      )}

      {accounts.length > 0 && (
        <>
          <div className="accounts-summary">
            <span className="accounts-summary-label">Gesamtguthaben:</span>
            <span className="accounts-summary-value">{formatMoney(totalBalance)}</span>
          </div>
          <div className="accounts-grid">
            {accounts.map((a) => (
              <AccountCard key={a.id} account={a} onUpdate={refresh} />
            ))}
          </div>
        </>
      )}

      {showAdd && (
        <AddAccountModal
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); refresh(); }}
        />
      )}
    </div>
  );
}
