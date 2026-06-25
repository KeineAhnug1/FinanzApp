'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiUrl, getCsrfToken } from '@/lib/api-client';
import { toast } from '@/components/ui/Toast';
import {
  CYCLE_OPTIONS,
  INCOME_CATEGORIES,
  formatMoney,
  toDatetimeLocal,
  type BankAccount,
  type IncomeEntry,
} from './types';

const incomeSchema = z.object({
  source: z.string().min(1, 'Bezeichnung erforderlich'),
  amount: z.coerce.number().positive('Betrag muss positiv sein'),
  category: z.string().min(1),
  cycle: z.string().min(1),
  received_at: z.string().min(1),
  bank_account_id: z.string().min(1, 'Konto erforderlich'),
  note: z.string().optional(),
});
type IncomeFormData = z.infer<typeof incomeSchema>;

export function IncomeForm({
  bankAccounts,
  editEntry,
  onSaved,
  onCancel,
}: {
  bankAccounts: BankAccount[];
  editEntry: IncomeEntry | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<IncomeFormData>({
    resolver: zodResolver(incomeSchema),
    defaultValues: {
      source: editEntry?.source ?? '',
      amount: editEntry?.amount ?? ('' as unknown as number),
      category: editEntry?.category ?? 'salary',
      cycle: editEntry?.cycle ?? 'once',
      received_at: editEntry?.received_at ? toDatetimeLocal(new Date(editEntry.received_at)) : toDatetimeLocal(),
      bank_account_id: editEntry?.bank_account_id ?? bankAccounts[0]?.id ?? '',
      note: editEntry?.note ?? '',
    },
  });

  const onSubmit = async (data: IncomeFormData) => {
    const url = editEntry ? `/api/finance/income/${editEntry.id}` : '/api/finance/income';
    const method = editEntry ? 'PATCH' : 'POST';
    const res = await fetch(apiUrl(url), {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({ ...data, received_at: new Date(data.received_at).toISOString() }),
    });
    const result = await res.json();
    if (!result.ok) {
      toast.error(result.message ?? 'Fehler beim Speichern');
      return;
    }
    toast.success(editEntry ? 'Einnahme aktualisiert' : 'Einnahme gespeichert');
    onSaved();
  };

  return (
    <form className="income-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="form-two-cols">
        <div>
          <label className="field-label">Bezeichnung</label>
          <input className="field-input" placeholder="z.B. Gehalt" {...register('source')} />
          {errors.source && <p className="form-status is-error">{errors.source.message}</p>}
        </div>
        <div>
          <label className="field-label">Betrag (€)</label>
          <input className="field-input" type="number" step="0.01" min="0.01" placeholder="0,00" {...register('amount')} />
          {errors.amount && <p className="form-status is-error">{errors.amount.message}</p>}
        </div>
      </div>
      <div className="form-two-cols">
        <div>
          <label className="field-label">Kategorie</label>
          <select className="field-input" {...register('category')}>
            {INCOME_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
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
          <input className="field-input" type="datetime-local" {...register('received_at')} />
        </div>
        <div>
          <label className="field-label">Konto</label>
          <select className="field-input" {...register('bank_account_id')}>
            {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.label} ({formatMoney(a.balance)})</option>)}
          </select>
          {errors.bank_account_id && <p className="form-status is-error">{errors.bank_account_id.message}</p>}
        </div>
      </div>
      <div>
        <label className="field-label">Notiz (optional)</label>
        <input className="field-input" placeholder="Optionale Notiz" {...register('note')} />
      </div>
      <div className="income-actions">
        <button className="submit-income" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Speichern…' : editEntry ? 'Änderung speichern' : 'Einnahme speichern'}
        </button>
        {editEntry && <button className="cancel-income" type="button" onClick={onCancel}>Abbrechen</button>}
      </div>
    </form>
  );
}
