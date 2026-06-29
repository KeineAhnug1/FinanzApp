'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { apiUrl, getCsrfToken } from '@/lib/api-client';
import type { MemberView } from './types';

const createTripSchema = z.object({
  name: z.string().min(1, 'Name erforderlich').max(200, 'Max. 200 Zeichen'),
  description: z.string().max(1000, 'Max. 1000 Zeichen').optional(),
  participant_user_ids: z.array(z.number().int().positive()).min(1, 'Mindestens ein Teilnehmer'),
});
type CreateTripData = z.infer<typeof createTripSchema>;

interface CreateTripModalProps {
  groupId: number;
  members: MemberView[];
  currentUserId: number;
  onClose: () => void;
}

export function CreateTripModal({ groupId, members, currentUserId, onClose }: CreateTripModalProps) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateTripData>({
    resolver: zodResolver(createTripSchema),
    defaultValues: {
      name: '',
      description: '',
      participant_user_ids: [currentUserId],
    },
  });

  const onSubmit = async (data: CreateTripData) => {
    const body: { name: string; description?: string; participant_user_ids: number[] } = {
      name: data.name.trim(),
      participant_user_ids: data.participant_user_ids,
    };
    if (data.description && data.description.trim()) body.description = data.description.trim();

    const res = await fetch(apiUrl(`/api/groups/${groupId}/trips`), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify(body),
    });
    const result = await res.json().catch(() => ({ ok: false, message: 'Antwort konnte nicht gelesen werden' }));
    if (!res.ok || !result.ok) {
      toast.error(result.message ?? 'Ausflug konnte nicht angelegt werden');
      return;
    }
    toast.success('Ausflug erstellt');
    queryClient.invalidateQueries({ queryKey: ['group', groupId, 'trips'] });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Neuer Ausflug" size="lg">
      <form className="entry-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <section className="form-section">
          <h4 className="form-section-title">Ausflug</h4>
          <div>
            <label className="form-label">Name</label>
            <input className="form-input" placeholder="z.B. Berlin-Wochenende" {...register('name')} />
            {errors.name && <p className="form-error">{errors.name.message}</p>}
          </div>
          <div>
            <label className="form-label">Beschreibung (optional)</label>
            <textarea className="form-input" rows={3} placeholder="Was ist geplant?" {...register('description')} />
            {errors.description && <p className="form-error">{errors.description.message}</p>}
          </div>
        </section>

        <section className="form-section">
          <Controller
            control={control}
            name="participant_user_ids"
            render={({ field }) => {
              const allIds = members.map((m) => m.user_id);
              const selectAll = () => field.onChange(allIds);
              const deselectAll = () => field.onChange(currentUserId ? [currentUserId] : []);
              return (
                <>
                  <div className="form-section-header">
                    <h4 className="form-section-title">Teilnehmer</h4>
                    <div className="form-section-actions">
                      <button type="button" className="btn btn-ghost btn-xs" onClick={selectAll}>Alle</button>
                      <button type="button" className="btn btn-ghost btn-xs" onClick={deselectAll}>Nur ich</button>
                    </div>
                  </div>
                  {members.length === 0 ? (
                    <p className="form-hint">Keine Mitglieder verfügbar.</p>
                  ) : (
                    <div className="participant-pill-grid" role="group" aria-label="Teilnehmer auswählen">
                      {members.map((m) => {
                        const selected = field.value.includes(m.user_id);
                        const label = m.first_name || m.username || `User ${m.user_id}`;
                        return (
                          <button
                            type="button"
                            key={m.user_id}
                            className={`participant-pill${selected ? ' participant-pill--selected' : ''}`}
                            aria-pressed={selected}
                            onClick={() => {
                              if (selected) field.onChange(field.value.filter((id) => id !== m.user_id));
                              else field.onChange([...field.value, m.user_id]);
                            }}
                          >
                            <span className="participant-pill__check" aria-hidden="true">{selected ? '✓' : '+'}</span>
                            <span className="participant-pill__name">{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {errors.participant_user_ids && <p className="form-error">{errors.participant_user_ids.message}</p>}
                </>
              );
            }}
          />
        </section>

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>Erstellen</button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Abbrechen</button>
        </div>
      </form>
    </Modal>
  );
}
