'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { EmptyState, IconPiggyBank } from '@/components/ui/EmptyState';
import { apiUrl, getCsrfToken, safeJson } from '@/lib/api-client';
import {
  EXPENSE_CATEGORIES,
  formatMoney,
  getCategoryLabel,
  projectBudgetVariant,
  type BudgetAlert,
} from '@/components/dashboard/types';

interface BudgetRow {
  id: string;
  category: string;
  target_amount: number;
}

interface MergedBudget extends BudgetRow {
  spent: number;
  percentage: number;
  exceeded: boolean;
}

const budgetSchema = z.object({
  category: z.string().min(1, 'Kategorie ist erforderlich'),
  target_amount: z.coerce.number().positive('Zielbetrag muss > 0 sein'),
});
type BudgetFormData = z.infer<typeof budgetSchema>;

interface BudgetManagerProps {
  variant?: 'page' | 'embedded';
}

export function BudgetManager({ variant = 'page' }: BudgetManagerProps) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MergedBudget | null>(null);
  const [deleting, setDeleting] = useState<MergedBudget | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const budgetsQuery = useQuery<BudgetRow[]>({
    queryKey: ['budgets'],
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/budgets'), { credentials: 'include' });
      const data = await safeJson(res);
      return Array.isArray(data?.budgets)
        ? data.budgets.map((b: Record<string, unknown>) => ({
            id: String(b.id),
            category: String(b.category ?? ''),
            target_amount: Number(b.target_amount ?? 0),
          }))
        : [];
    },
  });

  const statusQuery = useQuery<BudgetAlert[]>({
    queryKey: ['budget-status'],
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/budgets/status'), { credentials: 'include' });
      const data = await safeJson(res);
      return Array.isArray(data?.alerts) ? data.alerts : [];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['budgets'] });
    queryClient.invalidateQueries({ queryKey: ['budget-status'] });
  };

  const rows: MergedBudget[] = (budgetsQuery.data ?? [])
    .map((b) => {
      const s = (statusQuery.data ?? []).find(
        (a) => (a.budget_id && String(a.budget_id) === b.id) || a.category === b.category
      );
      return {
        ...b,
        spent: s?.spent ?? 0,
        percentage: s?.percentage ?? 0,
        exceeded: !!s?.exceeded,
      };
    })
    .sort((a, b) => b.percentage - a.percentage);

  const loading = budgetsQuery.isLoading || statusQuery.isLoading;

  const deleteBudget = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(apiUrl(`/api/budgets/${deleting.id}`), {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'x-csrf-token': getCsrfToken() },
      });
      const result = await safeJson(res);
      if (!result.ok) {
        toast.error(result.message ?? 'Löschen fehlgeschlagen');
        return;
      }
      toast.success('Budget gelöscht');
      setDeleting(null);
      invalidate();
    } finally {
      setDeleteBusy(false);
    }
  };

  const wrapperClass = variant === 'embedded' ? 'budgets-manager' : 'budgets-page page-content';

  return (
    <div className={wrapperClass}>
      {variant === 'page' && (
        <div className="page-header">
          <h1 className="page-title">Budgets</h1>
          <button className="btn btn-primary" type="button" onClick={() => setCreating(true)}>
            + Budget anlegen
          </button>
        </div>
      )}

      <div className="budgets-manager__intro-row">
        <p className="budgets-page__intro">
          Budgets gelten pro Monat. Die Auslastung errechnet sich aus deinen Ausgaben im laufenden Kalendermonat.
        </p>
        {variant === 'embedded' && (
          <button className="btn btn-primary btn-sm" type="button" onClick={() => setCreating(true)}>
            + Budget anlegen
          </button>
        )}
      </div>

      {loading && (
        <div className="loading-state">
          <span className="spinner" />
          <span>Lade…</span>
        </div>
      )}

      {!loading && rows.length === 0 && (
        <EmptyState
          icon={<IconPiggyBank />}
          title="Noch keine Budgets"
          description="Lege ein Budget pro Kategorie fest und behalte deine Ausgaben im Griff."
          cta={{ label: 'Erstes Budget anlegen', onClick: () => setCreating(true) }}
        />
      )}

      {!loading && rows.length > 0 && (
        <div className="budgets-page__grid">
          {rows.map((b) => (
            <BudgetCard
              key={b.id}
              budget={b}
              onEdit={() => setEditing(b)}
              onDelete={() => setDeleting(b)}
            />
          ))}
        </div>
      )}

      {creating && (
        <BudgetFormModal
          title="Neues Budget"
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            invalidate();
          }}
        />
      )}
      {editing && (
        <BudgetFormModal
          title="Budget bearbeiten"
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            invalidate();
          }}
        />
      )}
      {deleting && (
        <Modal
          open
          onClose={() => {
            if (!deleteBusy) setDeleting(null);
          }}
          title="Budget löschen"
          size="sm"
        >
          <p>
            Möchtest du das Budget für <strong>{getCategoryLabel(deleting.category)}</strong> wirklich löschen?
          </p>
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button
              className="btn btn-danger"
              type="button"
              disabled={deleteBusy}
              onClick={deleteBudget}
            >
              {deleteBusy ? 'Löschen…' : 'Löschen'}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={deleteBusy}
              onClick={() => setDeleting(null)}
            >
              Abbrechen
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function BudgetCard({
  budget,
  onEdit,
  onDelete,
}: {
  budget: MergedBudget;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const pct = Math.max(0, budget.percentage);
  const variant = projectBudgetVariant(budget.spent, budget.target_amount);
  const displayWidth = Math.min(100, pct);
  const overshoot = budget.exceeded ? Math.max(0, budget.spent - budget.target_amount) : 0;

  return (
    <article className={`budgets-card budgets-card--${variant}`}>
      <header className="budgets-card__head">
        <h3 className="budgets-card__title">{getCategoryLabel(budget.category)}</h3>
        <span className="budgets-card__values">
          {formatMoney(budget.spent)} / {formatMoney(budget.target_amount)}
        </span>
      </header>
      <div className="budgets-card__bar" aria-hidden="true">
        <div
          className={`budgets-card__fill budgets-card__fill--${variant}`}
          style={{ width: `${displayWidth}%` }}
        />
      </div>
      <div className="budgets-card__foot">
        <span className="budgets-card__pct">{pct}%</span>
        {budget.exceeded && (
          <span className="budgets-card__over">+{formatMoney(overshoot)} über</span>
        )}
      </div>
      <div className="budgets-card__actions">
        <button className="btn btn-ghost btn-sm" type="button" onClick={onEdit}>
          Bearbeiten
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={onDelete}>
          Löschen
        </button>
      </div>
    </article>
  );
}

function BudgetFormModal({
  title,
  editing,
  onClose,
  onSaved,
}: {
  title: string;
  editing?: MergedBudget;
  onClose: () => void;
  onSaved: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BudgetFormData>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      category: editing?.category ?? '',
      target_amount: editing?.target_amount ?? ('' as unknown as number),
    },
  });

  const onSubmit = async (data: BudgetFormData) => {
    const url = editing ? `/api/budgets/${editing.id}` : '/api/budgets';
    const method = editing ? 'PATCH' : 'POST';
    const body = editing ? { target_amount: data.target_amount } : data;
    const res = await fetch(apiUrl(url), {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify(body),
    });
    const result = await safeJson(res);
    if (!result.ok) {
      toast.error(result.message ?? 'Fehler beim Speichern');
      return;
    }
    toast.success(editing ? 'Budget aktualisiert' : 'Budget gespeichert');
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={title} size="sm">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="entry-form">
        <div>
          <label className="form-label" htmlFor="budget-category">
            Kategorie
          </label>
          <select
            id="budget-category"
            className="form-input"
            {...register('category')}
            disabled={!!editing}
          >
            <option value="">— wählen —</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          {errors.category && <p className="form-error">{errors.category.message}</p>}
        </div>
        <div>
          <label className="form-label" htmlFor="budget-target">
            Zielbetrag (€)
          </label>
          <input
            id="budget-target"
            className="form-input"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="z.B. 200,00"
            {...register('target_amount')}
          />
          {errors.target_amount && <p className="form-error">{errors.target_amount.message}</p>}
        </div>
        <div className="form-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Speichern…' : editing ? 'Speichern' : 'Anlegen'}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Abbrechen
          </button>
        </div>
      </form>
    </Modal>
  );
}
