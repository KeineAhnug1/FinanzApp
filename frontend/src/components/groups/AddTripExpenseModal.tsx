'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { apiUrl, getCsrfToken } from '@/lib/api-client';
import type { TripParticipantView } from './types';

const addExpenseSchema = z.object({
  payer_user_id: z.coerce.number().int().positive('Zahler erforderlich'),
  description: z.string().min(1, 'Beschreibung erforderlich').max(200, 'Max. 200 Zeichen'),
  amount: z.coerce.number().gt(0, 'Muss > 0 sein'),
  participant_user_ids: z.array(z.number().int().positive()).min(1, 'Mindestens ein Teilnehmer'),
  spent_at: z.string().min(1, 'Datum erforderlich'),
});
type AddExpenseInput = z.input<typeof addExpenseSchema>;
type AddExpenseData = z.output<typeof addExpenseSchema>;

interface AddTripExpenseModalProps {
  groupId: number;
  tripId: number;
  participants: TripParticipantView[];
  currentUserId: number;
  onClose: () => void;
}

function nowLocalIsoMinutes(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

export function AddTripExpenseModal({
  groupId,
  tripId,
  participants,
  currentUserId,
  onClose,
}: AddTripExpenseModalProps) {
  const queryClient = useQueryClient();
  const defaultPayer = participants.find((p) => p.user_id === currentUserId)?.user_id ?? participants[0]?.user_id ?? 0;
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<AddExpenseInput, unknown, AddExpenseData>({
    resolver: zodResolver(addExpenseSchema),
    defaultValues: {
      payer_user_id: defaultPayer,
      description: '',
      amount: '' as unknown as number,
      participant_user_ids: participants.map((p) => p.user_id),
      spent_at: nowLocalIsoMinutes(),
    },
  });

  const onSubmit = async (data: AddExpenseData) => {
    const body = {
      payer_user_id: data.payer_user_id,
      description: data.description.trim(),
      amount: data.amount,
      participant_user_ids: data.participant_user_ids,
      spent_at: new Date(data.spent_at).toISOString(),
    };
    const res = await fetch(apiUrl(`/api/groups/${groupId}/trips/${tripId}/expenses`), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (!result.ok) { toast.error(result.message ?? 'Fehler beim Anlegen'); return; }
    toast.success('Ausgabe hinzugefügt');
    queryClient.invalidateQueries({ queryKey: ['group', groupId, 'trips'] });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Ausgabe hinzufügen">
      <form className="entry-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div>
          <label className="form-label">Bezahlt von</label>
          <select className="form-input" {...register('payer_user_id')}>
            {participants.map((p) => (
              <option key={p.user_id} value={p.user_id}>{p.first_name || p.username || `User ${p.user_id}`}</option>
            ))}
          </select>
          {errors.payer_user_id && <p className="form-error">{errors.payer_user_id.message}</p>}
        </div>
        <div>
          <label className="form-label">Beschreibung</label>
          <input className="form-input" placeholder="z.B. Tankfüllung" {...register('description')} />
          {errors.description && <p className="form-error">{errors.description.message}</p>}
        </div>
        <div>
          <label className="form-label">Betrag (€)</label>
          <input className="form-input" type="number" step="0.01" min="0.01" {...register('amount')} />
          {errors.amount && <p className="form-error">{errors.amount.message}</p>}
        </div>
        <div>
          <label className="form-label">Wann</label>
          <input className="form-input" type="datetime-local" {...register('spent_at')} />
          {errors.spent_at && <p className="form-error">{errors.spent_at.message}</p>}
        </div>
        <div>
          <label className="form-label">Wer war beteiligt</label>
          <Controller
            control={control}
            name="participant_user_ids"
            render={({ field }) => (
              <div className="trip-participant-list">
                {participants.map((p) => {
                  const checked = field.value.includes(p.user_id);
                  return (
                    <label key={p.user_id} className="trip-participant-option">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) field.onChange([...field.value, p.user_id]);
                          else field.onChange(field.value.filter((id) => id !== p.user_id));
                        }}
                      />
                      <span>{p.first_name || p.username || `User ${p.user_id}`}</span>
                    </label>
                  );
                })}
              </div>
            )}
          />
          {errors.participant_user_ids && <p className="form-error">{errors.participant_user_ids.message}</p>}
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>Hinzufügen</button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Abbrechen</button>
        </div>
      </form>
    </Modal>
  );
}
