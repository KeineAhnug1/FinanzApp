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
    const result = await res.json();
    if (!result.ok) { toast.error(result.message ?? 'Fehler beim Anlegen'); return; }
    toast.success('Ausflug erstellt');
    queryClient.invalidateQueries({ queryKey: ['group', groupId, 'trips'] });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Neuer Ausflug">
      <form className="entry-form" onSubmit={handleSubmit(onSubmit)} noValidate>
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
        <div>
          <label className="form-label">Teilnehmer</label>
          <Controller
            control={control}
            name="participant_user_ids"
            render={({ field }) => (
              <div className="trip-participant-list">
                {members.map((m) => {
                  const checked = field.value.includes(m.user_id);
                  return (
                    <label key={m.user_id} className="trip-participant-option">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) field.onChange([...field.value, m.user_id]);
                          else field.onChange(field.value.filter((id) => id !== m.user_id));
                        }}
                      />
                      <span>{m.first_name || m.username}</span>
                    </label>
                  );
                })}
              </div>
            )}
          />
          {errors.participant_user_ids && <p className="form-error">{errors.participant_user_ids.message}</p>}
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>Erstellen</button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Abbrechen</button>
        </div>
      </form>
    </Modal>
  );
}
