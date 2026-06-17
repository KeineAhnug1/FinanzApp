'use client';

import { useState, useRef, useEffect } from 'react';
import { apiUrl, getCsrfToken } from '@/lib/api-client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const BOT_ICON = (
  <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <path d="M9 11V7a3 3 0 0 1 6 0v4" />
    <circle cx="9" cy="16" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="16" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const SEND_ICON = (
  <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

export default function FinzbroChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(apiUrl('/api/questions/finzbro'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
        body: JSON.stringify({ message: text, history: messages.slice(-10) }),
      });
      const data = await res.json() as { ok: boolean; reply?: string; message?: string };
      setMessages([...newMessages, {
        role: 'assistant',
        content: (data.ok && data.reply) ? data.reply : (data.message ?? 'FinzbRo ist gerade nicht verfügbar.'),
      }]);
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: 'Verbindungsfehler. Bitte versuche es erneut.' }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  return (
    <div className="finzbro-chat-page page-content">
      <div className="finzbro-chat-header">
        <div className="finzbro-chat-title-wrap">
          <span className="finzbro-chat-avatar-icon">{BOT_ICON}</span>
          <div>
            <h1 className="finzbro-chat-title">FinzbRo</h1>
            <p className="finzbro-chat-subtitle">KI Finanz-Assistent</p>
          </div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setMessages([])}
          disabled={messages.length === 0}
        >
          Verlauf löschen
        </button>
      </div>

      <div className="finzbro-chat-messages">
        {messages.length === 0 && (
          <div className="finzbro-chat-empty">
            <span className="finzbro-chat-empty-icon">{BOT_ICON}</span>
            <p className="finzbro-chat-empty-title">Hallo! Ich bin FinzbRo.</p>
            <p className="finzbro-chat-empty-sub">Stell mir deine Finanzfragen — ich helfe dir gerne weiter.</p>
            <div className="finzbro-chat-suggestions">
              {['Was ist ein ETF?', 'Wie funktioniert das Zinseszinsprinzip?', 'Wie diversifiziere ich mein Portfolio?'].map((s) => (
                <button key={s} className="finzbro-chat-suggestion" onClick={() => { setInput(s); inputRef.current?.focus(); }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`finzbro-msg finzbro-msg--${m.role}`}>
            {m.role === 'assistant' && (
              <span className="finzbro-msg-avatar">{BOT_ICON}</span>
            )}
            <div className="finzbro-msg-bubble">{m.content}</div>
          </div>
        ))}

        {loading && (
          <div className="finzbro-msg finzbro-msg--assistant">
            <span className="finzbro-msg-avatar">{BOT_ICON}</span>
            <div className="finzbro-msg-bubble finzbro-msg-bubble--typing">
              <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="finzbro-chat-input-bar">
        <textarea
          ref={inputRef}
          className="finzbro-chat-input"
          placeholder="Stell FinzbRo eine Frage… (Enter zum Senden)"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          disabled={loading}
        />
        <button
          className="finzbro-chat-send"
          onClick={send}
          disabled={loading || !input.trim()}
          aria-label="Senden"
        >
          {SEND_ICON}
        </button>
      </div>
    </div>
  );
}
