'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiUrl, getCsrfToken } from '@/lib/api-client';
import { toast } from '@/components/ui/Toast';
import {
  CYCLE_OPTIONS,
  EXPENSE_CATEGORIES,
  formatMoney,
  toDatetimeLocal,
  type BankAccount,
  type ExpenseEntry,
} from './types';

const expenseSchema = z.object({
  source: z.string().min(1, 'Bezeichnung erforderlich'),
  amount: z.coerce.number().positive('Betrag muss positiv sein'),
  category: z.string().min(1),
  cycle: z.string().min(1),
  spent_at: z.string().min(1),
  bank_account_id: z.string().min(1, 'Konto erforderlich'),
  note: z.string().optional(),
});
type ExpenseFormData = z.infer<typeof expenseSchema>;

export function ExpenseForm({
  bankAccounts,
  editEntry,
  onSaved,
  onCancel,
}: {
  bankAccounts: BankAccount[];
  editEntry: ExpenseEntry | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      source: editEntry?.source ?? '',
      amount: editEntry?.amount ?? ('' as unknown as number),
      category: editEntry?.category ?? 'rent',
      cycle: editEntry?.cycle ?? 'once',
      spent_at: editEntry?.spent_at ? toDatetimeLocal(new Date(editEntry.spent_at)) : toDatetimeLocal(),
      bank_account_id: editEntry?.bank_account_id ?? bankAccounts[0]?.id ?? '',
      note: editEntry?.note ?? '',
    },
  });

  const onSubmit = async (data: ExpenseFormData) => {
    const url = editEntry ? `/api/finance/expenses/${editEntry.id}` : '/api/finance/expenses';
    const method = editEntry ? 'PATCH' : 'POST';
    const res = await fetch(apiUrl(url), {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({ ...data, spent_at: new Date(data.spent_at).toISOString() }),
    });
    const result = await res.json();
    if (!result.ok) {
      toast.error(result.message ?? 'Fehler beim Speichern');
      return;
    }
    toast.success(editEntry ? 'Ausgabe aktualisiert' : 'Ausgabe gespeichert');
    onSaved();
  };

  return (
    <form className="income-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="form-two-cols">
        <div>
          <label className="field-label" htmlFor="expense-source">Bezeichnung</label>
          <input
            id="expense-source"
            className="field-input"
            placeholder="z.B. Miete"
            aria-invalid={errors.source ? true : undefined}
            aria-describedby={errors.source ? 'expense-source-error' : undefined}
            {...register('source')}
          />
          {errors.source && <p id="expense-source-error" className="form-status is-error">{errors.source.message}</p>}
        </div>
        <div>
          <label className="field-label" htmlFor="expense-amount">Betrag (€)</label>
          <input
            id="expense-amount"
            className="field-input"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0,00"
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={errors.amount ? 'expense-amount-error' : undefined}
            {...register('amount')}
          />
          {errors.amount && <p id="expense-amount-error" className="form-status is-error">{errors.amount.message}</p>}
        </div>
      </div>
      <div className="form-two-cols">
        <div>
          <label className="field-label">Kategorie</label>
          <select className="field-input" {...register('category')}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Turnus</label>
          <select className="field-input" {...register('cycle')}>
            {CYCLE_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>
      <div className="form-two-cols">
        <div>
          <label className="field-label">Datum</label>
          <input className="field-input" type="datetime-local" {...register('spent_at')} />
        </div>
        <div>
          <label className="field-label" htmlFor="expense-bank-account">Konto</label>
          <select
            id="expense-bank-account"
            className="field-input"
            aria-invalid={errors.bank_account_id ? true : undefined}
            aria-describedby={errors.bank_account_id ? 'expense-bank-account-error' : undefined}
            {...register('bank_account_id')}
          >
            {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.label} ({formatMoney(a.balance)})</option>)}
          </select>
          {errors.bank_account_id && <p id="expense-bank-account-error" className="form-status is-error">{errors.bank_account_id.message}</p>}
        </div>
      </div>
      <div>
        <label className="field-label">Notiz (optional)</label>
        <input className="field-input" placeholder="Optionale Notiz" {...register('note')} />
      </div>
      <div className="income-actions">
        <button className="submit-income" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Speichern…' : editEntry ? 'Änderung speichern' : 'Ausgabe speichern'}
        </button>
        {editEntry && <button className="cancel-income" type="button" onClick={onCancel}>Abbrechen</button>}
      </div>
    </form>
  );
}
