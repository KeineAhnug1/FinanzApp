'use client';

import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useController } from 'react-hook-form';
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

const questionSchema = z.object({
  thema: z.string().min(1, 'Thema erforderlich').max(120),
  message: z.string().min(5, 'Mindestens 5 Zeichen').max(2000),
});
type QuestionData = z.infer<typeof questionSchema>;

function AskPanel({ onCreated, onClose }: { onCreated: (q: Question) => void; onClose: () => void }) {
  const { register, handleSubmit, reset, control, formState: { errors, isSubmitting } } = useForm<QuestionData>({
    resolver: zodResolver(questionSchema),
  });

  const { field: messageField } = useController({ name: 'message', control, defaultValue: '' });

  const onSubmit = async (data: QuestionData) => {
    const result = await apiFetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify(data),
    });
    if (!result.ok) { toast.error(result.message ?? 'Fehler'); return; }
    toast.success('Frage gestellt');
    reset();
    onCreated(result.question as Question);
  };

  return (
    <div className="questions-panel-card">
      <div className="questions-panel-thread-header">
        <button className="btn btn-ghost btn-sm" onClick={onClose}>← Zurück</button>
      </div>
      <h2 className="questions-panel-title">Neue Frage</h2>
      <form className="questions-panel-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="questions-panel-field">
          <label className="form-label">Thema</label>
          <input className="form-input" placeholder="z.B. Wie spare ich richtig?" maxLength={120} {...register('thema')} />
          {errors.thema && <p className="form-error">{errors.thema.message}</p>}
        </div>
        <div className="questions-panel-field">
          <label className="form-label">Frage / Beschreibung</label>
          <MentionInput
            value={messageField.value}
            onChange={messageField.onChange}
            rows={5}
            placeholder="Deine Frage… Schreibe @Finzbro für eine KI-Antwort"
          />
          {errors.message && <p className="form-error">{errors.message.message}</p>}
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Posten…' : 'Frage posten'}
          </button>
        </div>
      </form>
    </div>
  );
}

function MentionInput({ value, onChange, rows = 2, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    onChange(val);
    const cursor = e.target.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursor);
    const atMatch = /@(\w*)$/.exec(textBefore);
    setShowSuggestion(!!atMatch && 'finzbro'.startsWith(atMatch[1].toLowerCase()));
  };

  const insertMention = () => {
    const textarea = inputRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart ?? value.length;
    const textBefore = value.slice(0, cursor);
    const textAfter = value.slice(cursor);
    const atMatch = /@(\w*)$/.exec(textBefore);
    if (!atMatch) return;
    const newValue = textBefore.slice(0, atMatch.index) + '@Finzbro ' + textAfter;
    onChange(newValue);
    setShowSuggestion(false);
    setTimeout(() => {
      const pos = atMatch.index + '@Finzbro '.length;
      textarea.setSelectionRange(pos, pos);
      textarea.focus();
    }, 0);
  };

  const escaped = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const highlighted = escaped.replace(/(@Finzbro)/gi, '<mark class="mention-highlight">$1</mark>');

  return (
    <div className="mention-input-wrap">
      <div className="mention-input-mirror" aria-hidden="true" dangerouslySetInnerHTML={{ __html: highlighted.replace(/\n/g, '<br/>') + '&nbsp;' }} />
      <textarea
        ref={inputRef}
        className="form-input mention-input-textarea"
        placeholder={placeholder ?? 'Deine Antwort… Schreibe @Finzbro für eine KI-Antwort'}
        maxLength={2000}
        rows={rows}
        value={value}
        onChange={handleChange}
        onKeyDown={(e) => {
          if (showSuggestion && (e.key === 'Tab' || e.key === 'Enter')) { e.preventDefault(); insertMention(); }
          if (e.key === 'Escape') setShowSuggestion(false);
        }}
      />
      {showSuggestion && (
        <div className="mention-suggestion" onMouseDown={(e) => { e.preventDefault(); insertMention(); }}>
          <span><strong>@Finzbro</strong> — KI-Assistent</span>
        </div>
      )}
    </div>
  );
}

function AnswerForm({ questionId, onSaved }: { questionId: string; onSaved: () => void }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 2) { setError('Antwort zu kurz'); return; }
    setError('');
    setSubmitting(true);
    const result = await apiFetch(`/api/questions/${questionId}/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({ message: message.trim() }),
    });
    setSubmitting(false);
    if (!result.ok) { toast.error(result.message ?? 'Fehler'); return; }
    toast.success('Antwort gepostet');
    setMessage('');
    onSaved();
  };

  return (
    <form className="answer-form" onSubmit={onSubmit} noValidate>
      <MentionInput value={message} onChange={setMessage} />
      {error && <p className="form-error">{error}</p>}
      <button className="btn btn-primary btn-sm" type="submit" disabled={submitting}>
        {submitting ? 'Senden…' : 'Antworten'}
      </button>
    </form>
  );
}

function ThreadPanel({ question, onClose, onUpdate }: { question: Question; onClose: () => void; onUpdate: () => void }) {
  const queryClient = useQueryClient();

  const { data: detail, isLoading } = useQuery({
    queryKey: ['question', question.id],
    queryFn: () => apiFetch(`/api/questions/${question.id}`).then((d) => d.question as Question),
    refetchInterval: (query) => {
      const q = query.state.data as Question | undefined;
      if (q?.answered) return false;
      return 3000;
    },
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
    <div className="questions-panel-card questions-panel-card--thread">
      <div className="questions-panel-thread-header">
        <button className="btn btn-ghost btn-sm" onClick={onClose}>← Zurück</button>
        <div className="question-meta">
          <span className="question-author">{q.author?.first_name || q.author?.username || 'Unbekannt'}</span>
          <span className="question-date">{formatDate(q.created_at)}</span>
          {q.answered && <span className="badge badge-success">Beantwortet</span>}
        </div>
      </div>
      <h2 className="questions-panel-title">{q.thema}</h2>
      <p className="questions-panel-message">{q.message}</p>
      <div className="question-actions">
        <button className={`like-btn${q.liked_by_me ? ' is-liked' : ''}`} onClick={likeQuestion}>
          ♥ {q.likes}
        </button>
      </div>

      <div className="answers-section">
        <h3 className="section-title">Antworten ({(q.answers ?? []).length})</h3>
        {isLoading && <div className="loading-state"><span className="spinner" /><span>Lade…</span></div>}
        {(q.answers ?? []).map((a) => (
          <div key={a.id} className={`answer-item${a.is_bot ? ' is-bot' : ''}`}>
            <div className="answer-meta">
              <span className="answer-author">{a.is_bot ? 'FinzbRo' : a.author?.first_name || a.author?.username || 'Unbekannt'}</span>
              <span className="answer-date">{formatDate(a.created_at)}</span>
            </div>
            <p className="answer-message">{a.message}</p>
            <div className="answer-actions">
              <button className={`like-btn${a.liked_by_me ? ' is-liked' : ''}`} onClick={() => likeAnswer(a.id)}>
                ♥ {a.likes}
              </button>
              {a.is_mine && (
                <button className="btn btn-ghost btn-sm" onClick={() => deleteAnswer(a.id)}>Löschen</button>
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

function QuestionCard({ question, active, onClick, onDelete, onRefresh }: {
  question: Question;
  active: boolean;
  onClick: () => void;
  onDelete: () => Promise<void>;
  onRefresh: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await apiFetch(`/api/questions/${question.id}/like`, { method: 'POST', headers: { 'x-csrf-token': getCsrfToken() } });
    onRefresh();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
  };

  return (
    <div
      className={`question-card${active ? ' is-active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKey}
    >
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
            <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}>Löschen</button>
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

export default function QuestionsPage() {
  const [search, setSearch] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [showAskPanel, setShowAskPanel] = useState(false);
  const queryClient = useQueryClient();

  const panelOpen = !!selectedQuestion || showAskPanel;

  const { data: questions = [], isLoading } = useQuery<Question[]>({
    queryKey: ['questions', search],
    queryFn: () => apiFetch(`/api/questions${search ? `?search=${encodeURIComponent(search)}` : ''}`).then((d) => d.questions ?? []),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['questions'] });

  const deleteQuestion = async (id: string) => {
    const result = await apiFetch(`/api/questions/${id}`, { method: 'DELETE', headers: { 'x-csrf-token': getCsrfToken() } });
    if (!result.ok) { toast.error(result.message ?? 'Fehler'); return; }
    toast.success('Frage gelöscht');
    if (selectedQuestion?.id === id) setSelectedQuestion(null);
    refresh();
  };

  const closePanel = () => {
    setSelectedQuestion(null);
    setShowAskPanel(false);
  };

  return (
    <div className={`questions-layout page-content${panelOpen ? ' questions-layout--panel-open' : ''}`}>
      <div className="questions-list-col">
        <div className="questions-list-header">
          <h1 className="page-title">Forum</h1>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => { setSelectedQuestion(null); setShowAskPanel(true); }}
          >
            Frage stellen
          </button>
        </div>
        <input
          className="form-input questions-search"
          placeholder="Fragen durchsuchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {isLoading && <div className="loading-state"><span className="spinner" /><span>Lade…</span></div>}
        {!isLoading && questions.length === 0 && (
          <div className="empty-state">
            <p>{search ? 'Keine Ergebnisse.' : 'Noch keine Fragen.'}</p>
          </div>
        )}

        <div className="questions-list">
          {questions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              active={selectedQuestion?.id === q.id}
              onClick={() => { setShowAskPanel(false); setSelectedQuestion(q); }}
              onDelete={() => deleteQuestion(q.id)}
              onRefresh={refresh}
            />
          ))}
        </div>
      </div>

      {panelOpen && (
        <div className="questions-panel-col">
          {selectedQuestion ? (
            <ThreadPanel
              question={selectedQuestion}
              onClose={closePanel}
              onUpdate={refresh}
            />
          ) : (
            <AskPanel
              onCreated={(q) => { refresh(); setShowAskPanel(false); setSelectedQuestion(q); }}
              onClose={closePanel}
            />
          )}
        </div>
      )}
    </div>
  );
}
