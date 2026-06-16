'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

let listeners: Array<(msg: ToastMessage) => void> = [];

export function toast(message: string, type: ToastType = 'info') {
  const id = Math.random().toString(36).slice(2);
  for (const listener of listeners) listener({ id, type, message });
}
toast.success = (msg: string) => toast(msg, 'success');
toast.error = (msg: string) => toast(msg, 'error');
toast.warning = (msg: string) => toast(msg, 'warning');

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler = (msg: ToastMessage) => {
      setToasts((prev) => [...prev, msg]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== msg.id));
      }, 4000);
    };
    listeners.push(handler);
    return () => {
      listeners = listeners.filter((l) => l !== handler);
    };
  }, []);

  if (!toasts.length) return null;

  return createPortal(
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} role="status">
          {t.message}
        </div>
      ))}
    </div>,
    document.body
  );
}
