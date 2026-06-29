'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { apiUrl } from '@/lib/api-client';
import { csrfHeaders } from './api';
import type { MemberView } from './types';

const schema = z.object({
  title: z.string().min(1, 'Pflicht').max(120, 'Max. 120 Zeichen'),
  total_amount: z.coerce.number().positive('Muss > 0 sein'),
  payment_mode: z.enum(['prepaid', 'postpaid']),
  cycle: z.enum(['once', 'weekly', 'monthly', 'yearly']),
  participant_user_ids: z.array(z.number()).min(1, 'Mindestens ein Teilnehmer'),
  info: z.string().max(500, 'Max. 500 Zeichen').optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  groupId: number;
  members: MemberView[];
  onClose: () => void;
}

export function CreateSharedExpenseModal({ groupId, members, onClose }: Props) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      payment_mode: 'prepaid',
      cycle: 'once',
      participant_user_ids: [],
      info: '',
    },
  });

  const allMemberIds = members.map((m) => m.user_id);

  const onSubmit = async (data: FormData) => {
    const body: Record<string, unknown> = {
      title: data.title.trim(),
      total_amount: data.total_amount,
      payment_mode: data.payment_mode,
      cycle: data.cycle,
      participant_user_ids: data.participant_user_ids,
    };
    if (data.info && data.info.trim()) body.info = data.info.trim();

    const res = await fetch(apiUrl(`/api/groups/${groupId}/shared-expenses`), {
      method: 'POST',
      credentials: 'include',
      headers: csrfHeaders(),
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (!res.ok || !result.ok) {
      toast.error(result.message ?? 'Konnte geteilte Ausgabe nicht anlegen');
      return;
    }
    toast.success('Gruppenausgabe angelegt');
    queryClient.invalidateQueries({ queryKey: ['group', groupId, 'shared-expenses'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Neue Gruppenausgabe" size="lg">
      <form className="entry-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <h3 className="modal-section-header">Grundinfo</h3>
        <div>
          <label className="form-label">Titel</label>
          <input className="form-input" placeholder="z.B. Miete" {...register('title')} />
          {errors.title && <p className="form-error">{errors.title.message}</p>}
        </div>
        <div>
          <label className="form-label">Gesamtbetrag (€)</label>
          <input className="form-input" type="number" step="0.01" min="0.01" {...register('total_amount')} />
          {errors.total_amount && <p className="form-error">{errors.total_amount.message}</p>}
        </div>
        <div>
          <label className="form-label">Zahlungsmodus</label>
          <select className="form-input" {...register('payment_mode')}>
            <option value="prepaid">Vorkasse (Teilnehmer zahlen vorab an Ersteller)</option>
            <option value="postpaid">Nachkasse (Ersteller legt aus, Teilnehmer erstatten)</option>
          </select>
          {errors.payment_mode && <p className="form-error">{errors.payment_mode.message}</p>}
        </div>
        <div>
          <label className="form-label">Zyklus</label>
          <select className="form-input" {...register('cycle')}>
            <option value="once">Einmalig</option>
            <option value="weekly">Wöchentlich</option>
            <option value="monthly">Monatlich</option>
            <option value="yearly">Jährlich</option>
          </select>
          {errors.cycle && <p className="form-error">{errors.cycle.message}</p>}
        </div>

        <h3 className="modal-section-header">Teilnehmer</h3>
        <Controller
          control={control}
          name="participant_user_ids"
          render={({ field }) => (
            <div>
              {members.length === 0 ? (
                <p className="form-hint">Keine Mitglieder verfügbar.</p>
              ) : (
                <>
                  <div className="participant-pill-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => field.onChange(allMemberIds)}
                    >
                      Alle auswählen
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => field.onChange([])}
                    >
                      Alle abwählen
                    </button>
                  </div>
                  <div className="participant-pill-grid">
                    {members.map((m) => {
                      const selected = field.value.includes(m.user_id);
                      const label = m.first_name || m.username;
                      return (
                        <button
                          key={m.user_id}
                          type="button"
                          className={`participant-pill${selected ? ' participant-pill--selected' : ''}`}
                          aria-pressed={selected}
                          onClick={() => {
                            if (selected) field.onChange(field.value.filter((id) => id !== m.user_id));
                            else field.onChange([...field.value, m.user_id]);
                          }}
                        >
                          <span>{label}</span>
                          <span className="participant-pill-check" aria-hidden="true">✓</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {errors.participant_user_ids && (
                <p className="form-error">{errors.participant_user_ids.message}</p>
              )}
            </div>
          )}
        />

        <h3 className="modal-section-header">Notiz</h3>
        <div>
          <label className="form-label">Info (optional)</label>
          <textarea className="form-input" rows={2} maxLength={500} {...register('info')} />
          {errors.info && <p className="form-error">{errors.info.message}</p>}
        </div>

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>Anlegen</button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Abbrechen</button>
        </div>
      </form>
    </Modal>
  );
}
