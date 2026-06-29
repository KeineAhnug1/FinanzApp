'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { apiUrl, getCsrfToken } from '@/lib/api-client';
import { formatMoney, type BankAccount } from './types';

const peerTransferSchema = z.object({
  recipient_username: z.string().min(1, 'Empfänger ist erforderlich'),
  from_bank_account_id: z.string().min(1, 'Konto erforderlich'),
  amount: z.coerce.number().positive('Betrag muss positiv sein'),
  reason: z.string().optional(),
});

type PeerTransferData = z.infer<typeof peerTransferSchema>;

export function PeerTransferModal({
  open,
  onClose,
  bankAccounts,
}: {
  open: boolean;
  onClose: () => void;
  bankAccounts: BankAccount[];
}) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<PeerTransferData>({
    resolver: zodResolver(peerTransferSchema),
    defaultValues: {
      recipient_username: '',
      from_bank_account_id: bankAccounts[0]?.id ?? '',
      amount: '' as unknown as number,
      reason: '',
    },
  });

  const onSubmit = async (data: PeerTransferData) => {
    const res = await fetch(apiUrl('/api/finance/peer-transfers'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({
        recipient_username: data.recipient_username.trim(),
        from_bank_account_id: Number(data.from_bank_account_id),
        amount: data.amount,
        reason: data.reason?.trim() || undefined,
      }),
    });
    const result = await res.json();
    if (!result.ok) {
      toast.error(result.message ?? 'Überweisung fehlgeschlagen');
      return;
    }
    toast.success('Überweisung gesendet');
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['peer-transfers'] });
    reset();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Überweisung an Nutzer">
      <form className="entry-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div>
          <label className="form-label" htmlFor="peer-recipient">Empfänger (Benutzername)</label>
          <input
            id="peer-recipient"
            className="form-input"
            placeholder="z.B. max.mustermann"
            autoComplete="off"
            aria-invalid={errors.recipient_username ? true : undefined}
            {...register('recipient_username')}
          />
          {errors.recipient_username && <p className="form-error">{errors.recipient_username.message}</p>}
        </div>
        <div>
          <label className="form-label" htmlFor="peer-from-account">Von Konto</label>
          <select
            id="peer-from-account"
            className="form-input form-select"
            aria-invalid={errors.from_bank_account_id ? true : undefined}
            {...register('from_bank_account_id')}
          >
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.label} ({formatMoney(a.balance)})</option>
            ))}
          </select>
          {errors.from_bank_account_id && <p className="form-error">{errors.from_bank_account_id.message}</p>}
        </div>
        <div>
          <label className="form-label" htmlFor="peer-amount">Betrag (€)</label>
          <input
            id="peer-amount"
            className="form-input"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0,00"
            aria-invalid={errors.amount ? true : undefined}
            {...register('amount')}
          />
          {errors.amount && <p className="form-error">{errors.amount.message}</p>}
        </div>
        <div>
          <label className="form-label" htmlFor="peer-reason">Verwendungszweck (optional)</label>
          <input
            id="peer-reason"
            className="form-input"
            placeholder="z.B. Pizza Sa. abend"
            {...register('reason')}
          />
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={isSubmitting || bankAccounts.length === 0}>
            {isSubmitting ? 'Sende…' : 'Überweisung senden'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Abbrechen</button>
        </div>
      </form>
    </Modal>
  );
}
