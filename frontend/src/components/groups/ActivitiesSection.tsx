'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { apiUrl, getCsrfToken } from '@/lib/api-client';
import type { ActivityView } from './types';

interface ActivitiesSectionProps {
  groupId: number;
  activities: ActivityView[];
  canManage: boolean;
}

const activitySchema = z.object({
  info: z.string().min(1, 'Pflicht').max(200, 'Max. 200 Zeichen'),
  date: z.string().optional(),
});
type ActivityData = z.infer<typeof activitySchema>;

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(apiUrl(url), { credentials: 'include', ...options });
  return res.json();
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function sortActivities(list: ActivityView[]): ActivityView[] {
  return [...list].sort((a, b) => {
    const ad = a.date ?? a.created_at ?? '';
    const bd = b.date ?? b.created_at ?? '';
    return bd.localeCompare(ad);
  });
}

function EditActivityModal({
  groupId,
  activity,
  onClose,
}: {
  groupId: number;
  activity: ActivityView;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ActivityData>({
    resolver: zodResolver(activitySchema),
    defaultValues: {
      info: activity.info ?? '',
      date: activity.date ?? '',
    },
  });

  const onSubmit = async (data: ActivityData) => {
    const body: { info: string; date?: string | null } = { info: data.info };
    body.date = data.date && data.date.length > 0 ? data.date : null;
    const result = await apiFetch(`/api/groups/${groupId}/activities/${activity.activity_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify(body),
    });
    if (!result.ok) { toast.error(result.message ?? 'Fehler'); return; }
    toast.success('Aktivität aktualisiert');
    queryClient.invalidateQueries({ queryKey: ['group', groupId] });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Aktivität bearbeiten">
      <form className="entry-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div>
          <label className="form-label">Info</label>
          <input className="form-input" placeholder="Was steht an?" {...register('info')} />
          {errors.info && <p className="form-error">{errors.info.message}</p>}
        </div>
        <div>
          <label className="form-label">Datum (optional)</label>
          <input className="form-input" type="date" {...register('date')} />
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>Speichern</button>
          <button className="btn btn-ghost" type="button" onClick={onClose}>Abbrechen</button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteActivityModal({
  groupId,
  activity,
  onClose,
}: {
  groupId: number;
  activity: ActivityView;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  const confirmDelete = async () => {
    setPending(true);
    const result = await apiFetch(`/api/groups/${groupId}/activities/${activity.activity_id}`, {
      method: 'DELETE',
      headers: { 'x-csrf-token': getCsrfToken() },
    });
    setPending(false);
    if (!result.ok) { toast.error(result.message ?? 'Fehler'); return; }
    toast.success('Aktivität gelöscht');
    queryClient.invalidateQueries({ queryKey: ['group', groupId] });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Aktivität löschen">
      <p>Aktivität wirklich löschen?</p>
      <p className="form-hint">Verknüpfte Sammelaktionen bleiben bestehen (Verknüpfung wird gelöst).</p>
      <div className="form-actions">
        <button className="btn btn-primary" type="button" disabled={pending} onClick={confirmDelete}>Löschen</button>
        <button className="btn btn-ghost" type="button" onClick={onClose}>Abbrechen</button>
      </div>
    </Modal>
  );
}

export default function ActivitiesSection({ groupId, activities, canManage }: ActivitiesSectionProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ActivityView | null>(null);
  const [deleting, setDeleting] = useState<ActivityView | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ActivityData>({
    resolver: zodResolver(activitySchema),
    defaultValues: { info: '', date: '' },
  });

  const sorted = useMemo(() => sortActivities(activities), [activities]);

  const onCreate = async (data: ActivityData) => {
    const body: { info: string; date?: string } = { info: data.info };
    if (data.date && data.date.length > 0) body.date = data.date;
    const result = await apiFetch(`/api/groups/${groupId}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify(body),
    });
    if (!result.ok) { toast.error(result.message ?? 'Fehler'); return; }
    toast.success('Aktivität angelegt');
    reset({ info: '', date: '' });
    queryClient.invalidateQueries({ queryKey: ['group', groupId] });
  };

  return (
    <div className="group-section">
      <h3 className="section-title">Aktivitäten</h3>

      {canManage && (
        <form className="entry-form activities-form" onSubmit={handleSubmit(onCreate)} noValidate>
          <div className="form-row">
            <input className="form-input" placeholder="Info (z.B. Putzdienst)" {...register('info')} />
            <input className="form-input activities-form__date" type="date" {...register('date')} />
          </div>
          {errors.info && <p className="form-error">{errors.info.message}</p>}
          <button className="btn btn-primary btn-sm" type="submit" disabled={isSubmitting}>Aktivität anlegen</button>
        </form>
      )}

      {sorted.length === 0 ? (
        <p className="activities-empty">Noch keine Aktivitäten.</p>
      ) : (
        <ul className="activities-list">
          {sorted.map((a) => (
            <li key={a.activity_id} className="activity-item">
              <span className="activity-item__date">{formatDate(a.date)}</span>
              <span className="activity-item__info">{a.info ?? '—'}</span>
              {canManage && (
                <div className="activity-item__actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(a)}>Bearbeiten</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeleting(a)}>Löschen</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <EditActivityModal groupId={groupId} activity={editing} onClose={() => setEditing(null)} />
      )}
      {deleting && (
        <DeleteActivityModal groupId={groupId} activity={deleting} onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}

export { ActivitiesSection };
