'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

type Listener = (msg: ToastMessage) => void;

const toastBus = {
  listeners: new Set<Listener>(),
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  },
  emit(msg: ToastMessage): void {
    for (const listener of this.listeners) listener(msg);
  },
};

export function toast(message: string, type: ToastType = 'info') {
  const id = Math.random().toString(36).slice(2);
  toastBus.emit({ id, type, message });
}
toast.success = (msg: string) => toast(msg, 'success');
toast.error = (msg: string) => toast(msg, 'error');
toast.warning = (msg: string) => toast(msg, 'warning');

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const unsubscribe = toastBus.subscribe((msg) => {
      setToasts((prev) => [...prev, msg]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== msg.id));
      }, 4000);
    });
    return unsubscribe;
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
