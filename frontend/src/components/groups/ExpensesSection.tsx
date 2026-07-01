'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { EmptyState, IconReceipt } from '@/components/ui/EmptyState';
import { apiUrl, getCsrfToken, safeJson } from '@/lib/api-client';
import type { ExpenseView } from './types';

interface ExpensesSectionProps {
  groupId: number;
  fundingId: number;
  fundingAmount: number;
  fundingStatus?: 'open' | 'completed' | 'archived';
  isCreator?: boolean;
  hasCreator?: boolean;
  canClaim?: boolean;
  expenses: ExpenseView[];
  isAdmin: boolean;
}

const STATE_LABELS: Record<NonNullable<ExpenseView['state']>, string> = {
  open: 'Offen',
  paid: 'Bezahlt',
  overdue: 'Überfällig',
};

const CYCLE_LABELS: Record<string, string> = {
  weekly: 'Wöchentlich',
  monthly: 'Monatlich',
  yearly: 'Jährlich',
};

function formatMoney(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-DE');
}

function csrfJsonHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() };
}

const expenseSchema = z.object({
  amount: z.coerce.number().gt(0, 'Muss > 0 sein'),
  info: z.string().max(200).optional(),
  state: z.enum(['open', 'paid', 'overdue']).optional(),
  cycle: z.enum(['once', 'weekly', 'monthly', 'yearly']).optional(),
  due_date: z.string().optional(),
  pay_date: z.string().optional(),
});
type ExpenseFormData = z.infer<typeof expenseSchema>;

interface ExpenseFormDefaults {
  amount?: number;
  info?: string;
  state?: 'open' | 'paid' | 'overdue';
  cycle?: 'once' | 'weekly' | 'monthly' | 'yearly';
  due_date?: string;
  pay_date?: string;
}

function toIsoDateInput(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

function ExpenseFormModal({
  title,
  defaults,
  submitLabel,
  canPayOut,
  onSubmit,
  onClose,
}: {
  title: string;
  defaults: ExpenseFormDefaults;
  submitLabel: string;
  canPayOut: boolean;
  onSubmit: (data: ExpenseFormData) => Promise<void>;
  onClose: () => void;
}) {
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      amount: defaults.amount,
      info: defaults.info ?? '',
      state: defaults.state ?? 'open',
      cycle: defaults.cycle ?? 'once',
      due_date: defaults.due_date ?? '',
      pay_date: defaults.pay_date ?? '',
    },
  });
  const state = watch('state');

  return (
    <Modal open onClose={onClose} title={title}>
      <form className="entry-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div>
          <label className="form-label">Betrag (€)</label>
          <input className="form-input" type="number" step="0.01" min="0.01" {...register('amount')} />
          {errors.amount && <p className="form-error">{errors.amount.message}</p>}
        </div>
        <div>
          <label className="form-label">Beschreibung</label>
          <input className="form-input" placeholder="z.B. Strom Januar" maxLength={200} {...register('info')} />
          {errors.info && <p className="form-error">{errors.info.message}</p>}
        </div>
        <div className="form-row expenses-form__row">
          <div className="expenses-form__col">
            <label className="form-label">Status</label>
            <select className="form-input" {...register('state')}>
              <option value="open">Offen</option>
              <option value="paid" disabled={!canPayOut}>Bezahlt{canPayOut ? '' : ' (Sammelziel offen)'}</option>
              <option value="overdue">Überfällig</option>
            </select>
          </div>
          <div className="expenses-form__col">
            <label className="form-label">Zyklus</label>
            <select className="form-input" {...register('cycle')}>
              <option value="once">Einmalig</option>
              <option value="weekly">Wöchentlich</option>
              <option value="monthly">Monatlich</option>
              <option value="yearly">Jährlich</option>
            </select>
          </div>
        </div>
        <div className="form-row expenses-form__row">
          <div className="expenses-form__col">
            <label className="form-label">Fälligkeit</label>
            <input className="form-input" type="date" {...register('due_date')} />
          </div>
          {state === 'paid' && (
            <div className="expenses-form__col">
              <label className="form-label">Bezahlt am</label>
              <input className="form-input" type="date" {...register('pay_date')} />
            </div>
          )}
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>{submitLabel}</button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Abbrechen</button>
        </div>
      </form>
    </Modal>
  );
}

export default function ExpensesSection({ groupId, fundingId, fundingAmount, fundingStatus = 'open', isCreator = false, hasCreator = true, canClaim = false, expenses }: ExpensesSectionProps) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<ExpenseView | null>(null);
  const [deleting, setDeleting] = useState<ExpenseView | null>(null);
  const [claiming, setClaiming] = useState(false);

  const canManage = isCreator && fundingStatus !== 'archived';
  const canPayOut = isCreator && fundingStatus === 'completed';
  const baseUrl = `/api/groups/${groupId}/funding/${fundingId}/expenses`;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['group', groupId] });

  const claimCreator = async () => {
    if (claiming) return;
    setClaiming(true);
    try {
      const res = await fetch(apiUrl(`/api/groups/${groupId}/funding/${fundingId}/claim-creator`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-csrf-token': getCsrfToken() },
      });
      const result = await safeJson(res);
      if (!result.ok) { toast.error(result.message ?? 'Übernahme fehlgeschlagen'); return; }
      toast.success('Sammelaktion übernommen');
      invalidate();
    } finally {
      setClaiming(false);
    }
  };

  // Sammelaktion ohne Ersteller (Legacy / Migration nicht gelaufen) — read-only Hinweis-Box.
  if (!hasCreator) {
    return (
      <div className="expenses-section">
        <div className="expenses-section__no-creator">
          <p>
            Diese Sammelaktion hat keinen Ersteller hinterlegt. Solange das so ist, können
            keine Ausgaben aus dem Pool angelegt oder bezahlt werden.
          </p>
          {canClaim && (
            <button className="btn btn-primary btn-sm" type="button" onClick={claimCreator} disabled={claiming}>
              {claiming ? 'Übernehme…' : 'Sammelaktion übernehmen'}
            </button>
          )}
        </div>
      </div>
    );
  }

  const buildPayload = (data: ExpenseFormData): Record<string, unknown> => {
    const payload: Record<string, unknown> = { amount: data.amount };
    if (data.info && data.info.trim()) payload.info = data.info.trim();
    if (data.state) payload.state = data.state;
    if (data.cycle) payload.cycle = data.cycle;
    if (data.due_date) payload.due_date = data.due_date;
    if (data.state === 'paid' && data.pay_date) payload.pay_date = data.pay_date;
    return payload;
  };

  const createExpense = async (data: ExpenseFormData) => {
    const res = await fetch(apiUrl(baseUrl), {
      method: 'POST', credentials: 'include', headers: csrfJsonHeaders(),
      body: JSON.stringify(buildPayload(data)),
    });
    const result = await safeJson(res);
    if (!result.ok) { toast.error(result.message ?? 'Fehler beim Anlegen'); return; }
    toast.success('Ausgabe angelegt');
    setShowAdd(false);
    invalidate();
  };

  const updateExpense = async (expenseId: string, payload: Record<string, unknown>, successMsg: string) => {
    const res = await fetch(apiUrl(`${baseUrl}/${expenseId}`), {
      method: 'PATCH', credentials: 'include', headers: csrfJsonHeaders(),
      body: JSON.stringify(payload),
    });
    const result = await safeJson(res);
    if (!result.ok) { toast.error(result.message ?? 'Fehler beim Speichern'); return false; }
    toast.success(successMsg);
    invalidate();
    return true;
  };

  const editExpense = async (data: ExpenseFormData) => {
    if (!editing) return;
    const ok = await updateExpense(editing.group_expense_id, buildPayload(data), 'Ausgabe aktualisiert');
    if (ok) setEditing(null);
  };

  const markPaid = async (expense: ExpenseView) => {
    const today = new Date().toISOString().slice(0, 10);
    await updateExpense(expense.group_expense_id, { state: 'paid', pay_date: today }, 'Als bezahlt markiert');
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const res = await fetch(apiUrl(`${baseUrl}/${deleting.group_expense_id}`), {
      method: 'DELETE', credentials: 'include', headers: { 'x-csrf-token': getCsrfToken() },
    });
    const result = await safeJson(res);
    if (!result.ok) { toast.error(result.message ?? 'Fehler beim Löschen'); return; }
    toast.success('Ausgabe gelöscht');
    setDeleting(null);
    invalidate();
  };

  const totalReserved = expenses.reduce((s, e) => s + e.amount, 0);
  const remaining = Math.max(0, fundingAmount - totalReserved);

  return (
    <div className="expenses-section">
      <div
        className="expenses-section__header"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v); } }}
      >
        <span className="expenses-section__title">
          {expanded ? '▾' : '▸'} Ausgaben aus dem Pool ({expenses.length})
        </span>
        <span className="expenses-section__remaining">Verfügbar: {formatMoney(remaining)}</span>
      </div>

      {expanded && (
        <>
          {isCreator && fundingStatus !== 'completed' && fundingStatus !== 'archived' && (
            <p className="expenses-section__hint">
              Ausgaben kannst du jederzeit anlegen. Auszahlen kannst du sie erst, wenn das Sammelziel erreicht ist.
            </p>
          )}
          {canManage && (
            <div className="expenses-section__actions">
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setShowAdd(true)}>
                + Ausgabe anlegen
              </button>
            </div>
          )}

          {expenses.length === 0 ? (
            <EmptyState
              size="sm"
              icon={<IconReceipt />}
              title="Keine Ausgaben aus dem Pool"
              description="Sobald das Sammelziel erreicht ist, kannst du Ausgaben anlegen."
            />
          ) : (
            <ul className="expenses-list">
              {expenses.map((e) => {
                const stateKey = e.state ?? 'open';
                const cycleLabel = e.cycle && e.cycle !== 'once' ? CYCLE_LABELS[e.cycle] : null;
                return (
                  <li key={e.group_expense_id} className="expense-item">
                    <div className="expense-item__info">
                      <div className="expense-item__top">
                        <span className="expense-item__title">{e.info ?? 'Ohne Beschreibung'}</span>
                        <span className={`expense-status-badge expense-status-badge--${stateKey}`}>
                          {STATE_LABELS[stateKey]}
                        </span>
                        {cycleLabel && <span className="expense-cycle-tag">{cycleLabel}</span>}
                      </div>
                      <div className="expense-item__meta">
                        {e.due_date && <span>Fällig: {formatDate(e.due_date)}</span>}
                        {e.state === 'paid' && e.pay_date && <span>Bezahlt: {formatDate(e.pay_date)}</span>}
                      </div>
                    </div>
                    <div className="expense-item__amount">{formatMoney(e.amount)}</div>
                    {canManage && (
                      <div className="expense-item__actions">
                        {e.state !== 'paid' && canPayOut && (
                          <button className="btn btn-ghost btn-sm" type="button" onClick={() => markPaid(e)}>
                            Als bezahlt
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => setEditing(e)}>
                          Bearbeiten
                        </button>
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => setDeleting(e)}>
                          Löschen
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {showAdd && (
        <ExpenseFormModal
          title="Ausgabe anlegen"
          defaults={{ state: 'open', cycle: 'once' }}
          submitLabel="Anlegen"
          canPayOut={canPayOut}
          onSubmit={createExpense}
          onClose={() => setShowAdd(false)}
        />
      )}

      {editing && (
        <ExpenseFormModal
          title="Ausgabe bearbeiten"
          defaults={{
            amount: editing.amount,
            info: editing.info ?? '',
            state: editing.state ?? 'open',
            cycle: (editing.cycle as 'once' | 'weekly' | 'monthly' | 'yearly' | null) ?? 'once',
            due_date: toIsoDateInput(editing.due_date),
            pay_date: toIsoDateInput(editing.pay_date),
          }}
          submitLabel="Speichern"
          canPayOut={canPayOut}
          onSubmit={editExpense}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting && (
        <Modal open onClose={() => setDeleting(null)} title="Ausgabe löschen?">
          <p>Möchtest du diese Ausgabe wirklich löschen?</p>
          <p><strong>{deleting.info ?? 'Ohne Beschreibung'}</strong> – {formatMoney(deleting.amount)}</p>
          <div className="form-actions">
            <button className="btn btn-primary" type="button" onClick={confirmDelete}>Löschen</button>
            <button className="btn btn-ghost" type="button" onClick={() => setDeleting(null)}>Abbrechen</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export { ExpensesSection };
