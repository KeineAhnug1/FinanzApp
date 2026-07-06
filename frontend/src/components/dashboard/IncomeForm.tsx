'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiUrl, getCsrfToken, safeJson } from '@/lib/api-client';
import { useFinanceInvalidator } from '@/lib/finance-mutations';
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
  recurrence: z.union([z.string(), z.number()]).optional(),
});
type IncomeFormData = z.infer<typeof incomeSchema>;

function parseRecurrence(raw: string | number | undefined): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

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
  const invalidate = useFinanceInvalidator();
  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<IncomeFormData>({
    resolver: zodResolver(incomeSchema),
    defaultValues: {
      source: editEntry?.source ?? '',
      amount: editEntry?.amount ?? ('' as unknown as number),
      category: editEntry?.category ?? 'salary',
      cycle: editEntry?.cycle ?? 'once',
      received_at: editEntry?.received_at ? toDatetimeLocal(new Date(editEntry.received_at)) : toDatetimeLocal(),
      bank_account_id: editEntry?.bank_account_id ?? bankAccounts[0]?.id ?? '',
      note: editEntry?.note ?? '',
      recurrence: editEntry?.recurrence != null ? String(editEntry.recurrence) : '',
    },
  });

  const cycleValue = useWatch({ control, name: 'cycle' });
  const selectedAccountId = useWatch({ control, name: 'bank_account_id' });
  const isRecurring = cycleValue && cycleValue !== 'once';

  const onSubmit = async (data: IncomeFormData) => {
    const url = editEntry ? `/api/finance/income/${editEntry.id}` : '/api/finance/income';
    const method = editEntry ? 'PATCH' : 'POST';
    const recurrence = data.cycle === 'once' ? null : parseRecurrence(data.recurrence);
    const body = {
      ...data,
      received_at: new Date(data.received_at).toISOString(),
      recurrence,
    };
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
    toast.success(editEntry ? 'Einnahme aktualisiert' : 'Einnahme gespeichert');
    invalidate();
    onSaved();
  };

  return (
    <form className="income-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="form-two-cols">
        <div>
          <label className="field-label" htmlFor="income-source">Bezeichnung</label>
          <input
            id="income-source"
            className="field-input"
            placeholder="z.B. Gehalt"
            aria-invalid={errors.source ? true : undefined}
            aria-describedby={errors.source ? 'income-source-error' : undefined}
            {...register('source')}
          />
          {errors.source && <p id="income-source-error" className="form-status is-error">{errors.source.message}</p>}
        </div>
        <div>
          <label className="field-label" htmlFor="income-amount">Betrag (€)</label>
          <input
            id="income-amount"
            className="field-input"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0,00"
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={errors.amount ? 'income-amount-error' : undefined}
            {...register('amount')}
          />
          {errors.amount && <p id="income-amount-error" className="form-status is-error">{errors.amount.message}</p>}
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
      {isRecurring && (
        <div>
          <label className="field-label" htmlFor="income-recurrence">Dauer (Anzahl Zyklen)</label>
          <input
            id="income-recurrence"
            className="field-input"
            type="number"
            min="0"
            step="1"
            placeholder="leer = unbegrenzt"
            {...register('recurrence')}
          />
          <p className="field-hint">12 = 12 Buchungen, leer oder 0 = unbegrenzt.</p>
        </div>
      )}
      <div className="form-two-cols">
        <div>
          <label className="field-label">Datum</label>
          <input className="field-input" type="datetime-local" {...register('received_at')} />
        </div>
        <div>
          <label className="field-label" htmlFor="income-bank-account">Konto</label>
          <select
            id="income-bank-account"
            className="field-input"
            aria-invalid={errors.bank_account_id ? true : undefined}
            aria-describedby={errors.bank_account_id ? 'income-bank-account-error' : undefined}
            {...register('bank_account_id')}
          >
            {bankAccounts.map((a) => <option key={a.id} value={a.id}>{a.label} ({formatMoney(a.balance)})</option>)}
          </select>
          {errors.bank_account_id && <p id="income-bank-account-error" className="form-status is-error">{errors.bank_account_id.message}</p>}
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
