'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { ShareAccountsSection } from '@/components/accounts/ShareAccountsSection';
import { DefaultAccountSelector } from '@/components/accounts/DefaultAccountSelector';
import { BankAccountHistoryModal } from '@/components/accounts/BankAccountHistoryModal';
import { apiUrl, getCsrfToken, safeJson } from '@/lib/api-client';
import { useFinanceInvalidator } from '@/lib/finance-mutations';

// Diverges from db BankAccount: backend serializes id as string and adds optional name/type fields not present in the DB row.
interface BankAccount {
  id: string;
  label: string;
  name?: string;
  balance: number;
  type: string;
  created_at?: string;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(apiUrl(url), { credentials: 'include', ...options });
  return safeJson(res);
}

const addAccountSchema = z.object({
  label: z.string().min(1, 'Name ist erforderlich'),
  initial_balance: z.coerce.number().min(0, 'Anfangsguthaben muss >= 0 sein'),
});

type AddAccountData = z.infer<typeof addAccountSchema>;

const transferSchema = z.object({
  from_account_id: z.string().min(1, 'Quellkonto wählen'),
  to_account_id: z.string().min(1, 'Zielkonto wählen'),
  amount: z.coerce.number().positive('Betrag muss größer 0 sein'),
  date: z.string().min(1, 'Datum erforderlich'),
  label: z.string().optional(),
}).refine((d) => d.from_account_id !== d.to_account_id, {
  message: 'Quell- und Zielkonto müssen unterschiedlich sein',
  path: ['to_account_id'],
});

type TransferData = z.infer<typeof transferSchema>;

function toDatetimeLocal(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function TransferModal({
  accounts,
  onClose,
  onSaved,
}: {
  accounts: BankAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const defaultFrom = accounts[0]?.id ?? '';
  const defaultTo = accounts.find((a) => a.id !== defaultFrom)?.id ?? '';
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<TransferData>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      from_account_id: defaultFrom,
      to_account_id: defaultTo,
      amount: '' as unknown as number,
      date: toDatetimeLocal(),
      label: '',
    },
  });

  const selectedFrom = watch('from_account_id');
  const selectedTo = watch('to_account_id');

  const fromAccount = accounts.find((a) => a.id === selectedFrom);
  const toAccount = accounts.find((a) => a.id === selectedTo);
  const minDate = (() => {
    const candidates = [fromAccount?.created_at, toAccount?.created_at].filter(Boolean) as string[];
    if (candidates.length === 0) return undefined;
    // Both accounts must already exist at the transfer date — pick the later of the two openings.
    const latestTs = Math.max(...candidates.map((iso) => new Date(iso).getTime()));
    if (!Number.isFinite(latestTs)) return undefined;
    return toDatetimeLocal(new Date(latestTs));
  })();

  const onSubmit = async (data: TransferData) => {
    if (minDate && data.date < minDate) {
      toast.error('Datum liegt vor der Eröffnung eines der Konten');
      return;
    }
    const result = await apiFetch('/api/finance/transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({
        from_account_id: Number(data.from_account_id),
        to_account_id: Number(data.to_account_id),
        amount: Number(data.amount),
        date: new Date(data.date).toISOString(),
        label: data.label?.trim() || undefined,
      }),
    });
    if (!result.ok) { toast.error(result.message ?? 'Überweisung fehlgeschlagen'); return; }
    toast.success('Überweisung gebucht');
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title="Überweisung zwischen Konten">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="entry-form">
        <div>
          <label className="form-label" htmlFor="transfer-from">Von Konto</label>
          <select id="transfer-from" className="form-input form-select" {...register('from_account_id')}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label || a.name || 'Konto'} ({formatMoney(Number(a.balance))})
              </option>
            ))}
          </select>
          {errors.from_account_id && <p className="form-error">{errors.from_account_id.message}</p>}
        </div>
        <div>
          <label className="form-label" htmlFor="transfer-to">Auf Konto</label>
          <select id="transfer-to" className="form-input form-select" {...register('to_account_id')}>
            {accounts
              .filter((a) => a.id !== selectedFrom)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label || a.name || 'Konto'} ({formatMoney(Number(a.balance))})
                </option>
              ))}
          </select>
          {errors.to_account_id && <p className="form-error">{errors.to_account_id.message}</p>}
        </div>
        <div>
          <label className="form-label" htmlFor="transfer-amount">Betrag (€)</label>
          <input
            id="transfer-amount"
            className="form-input"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0,00"
            {...register('amount')}
          />
          {errors.amount && <p className="form-error">{errors.amount.message}</p>}
        </div>
        <div>
          <label className="form-label" htmlFor="transfer-date">Datum</label>
          <input id="transfer-date" className="form-input" type="datetime-local" min={minDate} {...register('date')} />
          {errors.date && <p className="form-error">{errors.date.message}</p>}
        </div>
        <div>
          <label className="form-label" htmlFor="transfer-label">Bezeichnung (optional)</label>
          <input
            id="transfer-label"
            className="form-input"
            placeholder="z.B. Sparrate Juni"
            {...register('label')}
          />
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Buche…' : 'Überweisung buchen'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Abbrechen</button>
        </div>
      </form>
    </Modal>
  );
}

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
          <label className="form-label" htmlFor="account-label">Kontoname</label>
          <input
            id="account-label"
            className="form-input"
            placeholder="z.B. Girokonto"
            {...register('label')}
            aria-invalid={errors.label ? true : undefined}
            aria-describedby={errors.label ? 'account-label-error' : undefined}
          />
          {errors.label && <p id="account-label-error" className="form-error">{errors.label.message}</p>}
        </div>
        <div>
          <label className="form-label" htmlFor="account-initial-balance">Anfangsguthaben (€)</label>
          <input
            id="account-initial-balance"
            className="form-input"
            type="number"
            step="0.01"
            min="0"
            {...register('initial_balance')}
            aria-invalid={errors.initial_balance ? true : undefined}
            aria-describedby={errors.initial_balance ? 'account-initial-balance-error' : undefined}
          />
          {errors.initial_balance && <p id="account-initial-balance-error" className="form-error">{errors.initial_balance.message}</p>}
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

function AccountCard({ account, isDefault, onUpdate }: { account: BankAccount; isDefault: boolean; onUpdate: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(account.label || account.name || '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [showHistory, setShowHistory] = useState(false);
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
  const accountIdNum = Number(account.id);
  const displayName = account.label || account.name || 'Konto';

  const openHistory = () => setShowHistory(true);
  const onHeaderKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openHistory();
    }
  };

  return (
    <div className="account-card">
      {renaming ? (
        <div className="account-card-top">
          <div className="account-card-header">
            <div className="account-rename-wrap">
              <input
                className="form-input account-rename-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename();
                  if (e.key === 'Escape') setRenaming(false);
                }}
                autoFocus
              />
              <div className="account-rename-actions">
                <button className="btn btn-primary btn-sm" onClick={handleRename}>Speichern</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setRenaming(false)}>Abbrechen</button>
              </div>
            </div>
          </div>
          <div className="account-type">{account.type || 'Bankkonto'}</div>
        </div>
      ) : (
        <div
          className="account-card-top account-card-top--clickable"
          role="button"
          tabIndex={0}
          onClick={openHistory}
          onKeyDown={onHeaderKey}
          title="Verlauf anzeigen"
        >
          <div className="account-card-header">
            <span className="account-name-btn">{displayName}</span>
            <span className={`account-balance ${balance < 0 ? 'is-negative' : ''}`}>
              {formatMoney(balance)}
            </span>
          </div>
          <div className="account-type">{account.type || 'Bankkonto'}</div>
        </div>
      )}

      <div className="account-card-default" onClick={(e) => e.stopPropagation()}>
        <DefaultAccountSelector accountId={Number(account.id)} isDefault={isDefault} />
      </div>

      <div className="account-card-actions" onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setRenaming(true); }}>
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

      {showHistory && Number.isFinite(accountIdNum) && (
        <BankAccountHistoryModal
          accountId={accountIdNum}
          accountLabel={displayName}
          onClose={() => setShowHistory(false)}
        />
      )}

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

export default function AccountsPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const invalidate = useFinanceInvalidator();
  const queryClient = useQueryClient();

  const { data: accounts = [], isLoading } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: () => apiFetch('/api/finance/bank-accounts').then((d) => d.accounts ?? []),
  });

  const { data: defaultAccount } = useQuery<{ default_bank_account_id: number | null }>({
    queryKey: ['user', 'default-account'],
    queryFn: () => apiFetch('/api/users/me/default-account'),
  });
  const defaultId = defaultAccount?.default_bank_account_id ?? null;

  const refresh = () => {
    invalidate();
    queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['share-accounts'] });
  };
  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance), 0);
  const canTransfer = accounts.length >= 2;

  return (
    <div className="accounts-page page-content">
      <div className="page-header">
        <h1 className="page-title">Konten</h1>
        <div className="form-actions">
          <button
            className="btn btn-secondary"
            onClick={() => setShowTransfer(true)}
            disabled={!canTransfer}
            title={canTransfer ? 'Überweisung zwischen zwei Konten' : 'Mindestens zwei Konten erforderlich'}
          >
            → Überweisung
          </button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Konto hinzufügen</button>
        </div>
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
              <AccountCard key={a.id} account={a} isDefault={Number(a.id) === defaultId} onUpdate={refresh} />
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

      {showTransfer && (
        <TransferModal
          accounts={accounts}
          onClose={() => setShowTransfer(false)}
          onSaved={() => { setShowTransfer(false); refresh(); }}
        />
      )}

      <ShareAccountsSection />
    </div>
  );
}
