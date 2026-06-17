'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from '@/components/ui/Toast';
import { apiUrl, getCsrfToken } from '@/lib/api-client';

const schema = z.object({
  thema: z.string().min(1, 'Thema erforderlich').max(120),
  message: z.string().min(5, 'Mindestens 5 Zeichen').max(2000),
});

type FormData = z.infer<typeof schema>;

export default function AskPage() {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    const res = await fetch(apiUrl('/api/questions'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify(data),
    });
    const result = await res.json() as { ok: boolean; message?: string };
    if (!result.ok) { toast.error(result.message ?? 'Fehler'); return; }
    toast.success('Frage gestellt');
    router.push('/questions');
  };

  return (
    <div className="ask-page page-content">
      <div className="ask-page-card">
        <h1 className="ask-page-title">Neue Frage</h1>
        <p className="ask-page-hint">
          Schreibe <strong>@Finzbro</strong> in deiner Frage, um eine automatische KI-Antwort zu erhalten.
        </p>
        <form className="ask-page-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="ask-field">
            <label className="form-label">Thema</label>
            <input
              className="form-input"
              placeholder="z.B. Wie spare ich richtig?"
              maxLength={120}
              {...register('thema')}
            />
            {errors.thema && <p className="form-error">{errors.thema.message}</p>}
          </div>
          <div className="ask-field">
            <label className="form-label">Frage / Beschreibung</label>
            <textarea
              className="form-input"
              rows={6}
              placeholder="Deine Frage…"
              maxLength={2000}
              {...register('message')}
            />
            {errors.message && <p className="form-error">{errors.message.message}</p>}
          </div>
          <div className="ask-page-actions">
            <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Posten…' : 'Frage posten'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => router.push('/questions')}>
              Abbrechen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
