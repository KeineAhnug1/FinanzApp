'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from '@/components/ui/Toast';
import { apiUrl, getCsrfToken } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';

interface Answer {
  id: string;
  message: string;
  created_at: string;
  likes: number;
  liked_by_me: boolean;
  is_mine: boolean;
  is_bot?: boolean;
  author?: { username: string; first_name: string } | null;
}

interface Question {
  id: string;
  thema: string;
  message: string;
  answered: boolean;
  likes: number;
  liked_by_me: boolean;
  is_mine: boolean;
  created_at: string;
  author?: { username: string; first_name: string } | null;
  answers?: Answer[];
}

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(apiUrl(url), { credentials: 'include', ...options });
  return res.json();
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(dateStr));
}

// ---- New Question Form ----
const questionSchema = z.object({
  thema: z.string().min(1, 'Thema erforderlich').max(120),
  message: z.string().min(5, 'Nachricht zu kurz (min. 5 Zeichen)').max(2000),
});

type QuestionData = z.infer<typeof questionSchema>;

function NewQuestionForm({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<QuestionData>({
    resolver: zodResolver(questionSchema),
  });

  const onSubmit = async (data: QuestionData) => {
    const result = await apiFetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify(data),
    });
    if (!result.ok) { toast.error(result.message ?? 'Fehler beim Posten'); return; }
    toast.success('Frage gestellt');
    reset();
    setOpen(false);
    onSaved();
  };

  if (!open) {
    return (
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        + Frage stellen
      </button>
    );
  }

  return (
    <div className="new-question-form">
      <h3 className="section-title">Neue Frage</h3>
      <form className="entry-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div>
          <label className="form-label">Thema</label>
          <input className="form-input" placeholder="z.B. Wie spare ich richtig?" maxLength={120} {...register('thema')} />
          {errors.thema && <p className="form-error">{errors.thema.message}</p>}
        </div>
        <div>
          <label className="form-label">Frage / Beschreibung</label>
          <textarea className="form-input" rows={4} placeholder="Deine Frage..." maxLength={2000} {...register('message')} />
          {errors.message && <p className="form-error">{errors.message.message}</p>}
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Posten…' : 'Frage posten'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => { setOpen(false); reset(); }}>
            Abbrechen
          </button>
        </div>
      </form>
    </div>
  );
}

// ---- Answer Form ----
const answerSchema = z.object({
  message: z.string().min(2, 'Antwort zu kurz').max(2000),
});

type AnswerData = z.infer<typeof answerSchema>;

function AnswerForm({ questionId, onSaved }: { questionId: string; onSaved: () => void }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<AnswerData>({
    resolver: zodResolver(answerSchema),
  });

  const onSubmit = async (data: AnswerData) => {
    const result = await apiFetch(`/api/questions/${questionId}/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify(data),
    });
    if (!result.ok) { toast.error(result.message ?? 'Fehler'); return; }
    toast.success('Antwort gepostet');
    reset();
    onSaved();
  };

  return (
    <form className="answer-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input className="form-input" placeholder="Deine Antwort…" maxLength={2000} {...register('message')} />
      {errors.message && <p className="form-error">{errors.message.message}</p>}
      <button className="btn btn-primary btn-sm" type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Senden…' : 'Antworten'}
      </button>
    </form>
  );
}

// ---- Question Detail / Thread ----
function QuestionThread({ question, onClose, onUpdate }: { question: Question; onClose: () => void; onUpdate: () => void }) {
  const queryClient = useQueryClient();

  const { data: detail, isLoading } = useQuery({
    queryKey: ['question', question.id],
    queryFn: () => apiFetch(`/api/questions/${question.id}`).then((d) => d.question as Question),
  });

  const q = detail ?? question;

  const likeQuestion = async () => {
    await apiFetch(`/api/questions/${q.id}/like`, { method: 'POST', headers: { 'x-csrf-token': getCsrfToken() } });
    queryClient.invalidateQueries({ queryKey: ['question', q.id] });
    onUpdate();
  };

  const deleteAnswer = async (answerId: string) => {
    const result = await apiFetch(`/api/questions/answers/${answerId}`, { method: 'DELETE', headers: { 'x-csrf-token': getCsrfToken() } });
    if (!result.ok) { toast.error(result.message ?? 'Fehler'); return; }
    queryClient.invalidateQueries({ queryKey: ['question', q.id] });
  };

  const likeAnswer = async (answerId: string) => {
    await apiFetch(`/api/questions/answers/${answerId}/like`, { method: 'POST', headers: { 'x-csrf-token': getCsrfToken() } });
    queryClient.invalidateQueries({ queryKey: ['question', q.id] });
  };

  return (
    <div className="question-thread">
      <div className="thread-header">
        <button className="btn btn-ghost btn-sm" onClick={onClose}>← Zurück</button>
      </div>

      <div className="question-detail">
        <div className="question-meta">
          <span className="question-author">{q.author?.first_name || q.author?.username || 'Unbekannt'}</span>
          <span className="question-date">{formatDate(q.created_at)}</span>
          {q.answered && <span className="badge badge-success">Beantwortet</span>}
        </div>
        <h2 className="question-thema">{q.thema}</h2>
        <p className="question-message">{q.message}</p>
        <div className="question-actions">
          <button className={`like-btn${q.liked_by_me ? ' is-liked' : ''}`} onClick={likeQuestion}>
            ♥ {q.likes}
          </button>
        </div>
      </div>

      <div className="answers-section">
        <h3 className="section-title">Antworten ({(q.answers ?? []).length})</h3>
        {isLoading && <div className="loading-state"><span className="spinner" /><span>Lade…</span></div>}
        {(q.answers ?? []).map((a) => (
          <div key={a.id} className={`answer-item${a.is_bot ? ' is-bot' : ''}`}>
            <div className="answer-meta">
              <span className="answer-author">{a.is_bot ? '🤖 FinzbRo' : a.author?.first_name || a.author?.username || 'Unbekannt'}</span>
              <span className="answer-date">{formatDate(a.created_at)}</span>
            </div>
            <p className="answer-message">{a.message}</p>
            <div className="answer-actions">
              <button className={`like-btn${a.liked_by_me ? ' is-liked' : ''}`} onClick={() => likeAnswer(a.id)}>
                ♥ {a.likes}
              </button>
              {a.is_mine && (
                <button className="btn btn-ghost btn-sm" onClick={() => deleteAnswer(a.id)}>🗑️</button>
              )}
            </div>
          </div>
        ))}

        <AnswerForm
          questionId={q.id}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['question', q.id] })}
        />
      </div>
    </div>
  );
}

// ---- Question Card ----
function QuestionCard({ question, onClick, onDelete, onRefresh }: { question: Question; onClick: () => void; onDelete: () => Promise<void>; onRefresh: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await apiFetch(`/api/questions/${question.id}/like`, { method: 'POST', headers: { 'x-csrf-token': getCsrfToken() } });
    onRefresh();
  };

  return (
    <div className="question-card" onClick={onClick}>
      <div className="question-card-meta">
        <span className="question-author">{question.author?.first_name || question.author?.username || 'Unbekannt'}</span>
        <span className="question-date">{formatDate(question.created_at)}</span>
        {question.answered && <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '1px 6px' }}>Beantwortet</span>}
      </div>
      <h3 className="question-card-title">{question.thema}</h3>
      <p className="question-card-preview">{question.message.slice(0, 120)}{question.message.length > 120 ? '…' : ''}</p>
      <div className="question-card-footer" onClick={(e) => e.stopPropagation()}>
        <button className={`like-btn${question.liked_by_me ? ' is-liked' : ''}`} onClick={handleLike}>♥ {question.likes}</button>
        {question.is_mine && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}>🗑️</button>
            {confirmDelete && (
              <Modal open onClose={() => setConfirmDelete(false)} title="Frage löschen">
                <p>Möchtest du diese Frage wirklich löschen?</p>
                <p style={{ color: 'var(--ui-error, #e53e3e)', marginTop: 8 }}><strong>Alle Antworten werden ebenfalls gelöscht.</strong></p>
                <div className="form-actions" style={{ marginTop: 16 }}>
                  <button className="btn btn-danger" onClick={async (e) => { e.stopPropagation(); await onDelete(); setConfirmDelete(false); }}>Löschen</button>
                  <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}>Abbrechen</button>
                </div>
              </Modal>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---- Main Page ----
export default function QuestionsPage() {
  const [search, setSearch] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const queryClient = useQueryClient();

  const { data: questions = [], isLoading } = useQuery<Question[]>({
    queryKey: ['questions', search],
    queryFn: () => apiFetch(`/api/questions${search ? `?q=${encodeURIComponent(search)}` : ''}`).then((d) => d.questions ?? []),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['questions'] });

  const deleteQuestion = async (id: string) => {
    const result = await apiFetch(`/api/questions/${id}`, { method: 'DELETE', headers: { 'x-csrf-token': getCsrfToken() } });
    if (!result.ok) { toast.error(result.message ?? 'Fehler'); return; }
    toast.success('Frage gelöscht');
    refresh();
  };

  if (selectedQuestion) {
    return (
      <div className="questions-page page-content">
        <QuestionThread
          question={selectedQuestion}
          onClose={() => { setSelectedQuestion(null); refresh(); }}
          onUpdate={refresh}
        />
      </div>
    );
  }

  return (
    <div className="questions-page page-content">
      <div className="page-header">
        <h1 className="page-title">Forum</h1>
        <NewQuestionForm onSaved={refresh} />
      </div>

      <div className="questions-search-wrap">
        <input
          className="form-input"
          placeholder="Fragen durchsuchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
      </div>

      {isLoading && <div className="loading-state"><span className="spinner" /><span>Lade…</span></div>}

      {!isLoading && questions.length === 0 && (
        <div className="empty-state">
          <p>{search ? 'Keine Ergebnisse gefunden.' : 'Noch keine Fragen. Stell die erste!'}</p>
        </div>
      )}

      <div className="questions-list">
        {questions.map((q) => (
          <QuestionCard
            key={q.id}
            question={q}
            onClick={() => setSelectedQuestion(q)}
            onDelete={() => deleteQuestion(q.id)}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ['questions'] })}
          />
        ))}
      </div>
    </div>
  );
}
