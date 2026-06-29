'use client';

import { useState } from 'react';
import { apiUrl, getCsrfToken } from '@/lib/api-client';
import { useFinanceInvalidator } from '@/lib/finance-mutations';
import { toast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import { formatMoney, type IncomeEntry, type ExpenseEntry } from './types';
import {
  isRecurring,
  getNextOccurrence,
  elapsedOccurrences,
  getCycleLabel,
  getEntryDate,
} from './recurring';

interface RecurringListProps {
  income: IncomeEntry[];
  expenses: ExpenseEntry[];
  onEditIncome: (e: IncomeEntry) => void;
  onEditExpense: (e: ExpenseEntry) => void;
  onDeleteIncome: (id: string) => void;
  onDeleteExpense: (id: string) => void;
}

type Kind = 'income' | 'expense';

function formatDateShort(d: Date | null): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

// Build the full payload the backend expects. The PATCH endpoints require all main fields,
// so when only `recurrence` changes we still need to repeat the rest from the entry.
function buildPatchPayload(
  kind: Kind,
  entry: IncomeEntry | ExpenseEntry,
  recurrenceOverride: number | null,
): Record<string, unknown> {
  const dateIso = getEntryDate(entry);
  const base = {
    source: entry.source,
    category: entry.category,
    amount: Number(entry.amount),
    cycle: entry.cycle,
    bank_account_id: entry.bank_account_id,
    note: entry.note ?? '',
    is_active: entry.is_active ?? true,
    recurrence: recurrenceOverride,
  };
  return kind === 'income'
    ? { ...base, received_at: dateIso }
    : { ...base, spent_at: dateIso };
}

async function patchEntry(
  kind: Kind,
  entry: IncomeEntry | ExpenseEntry,
  recurrenceOverride: number | null,
): Promise<{ ok: boolean; message?: string }> {
  const url = kind === 'income' ? `/api/finance/income/${entry.id}` : `/api/finance/expenses/${entry.id}`;
  const res = await fetch(apiUrl(url), {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
    body: JSON.stringify(buildPatchPayload(kind, entry, recurrenceOverride)),
  });
  return res.json();
}

function RecurringRow({
  entry,
  kind,
  isExpense,
  onEdit,
  onDelete,
  onEnd,
  onExtend,
}: {
  entry: IncomeEntry | ExpenseEntry;
  kind: Kind;
  isExpense: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onEnd: () => void;
  onExtend: () => void;
}) {
  const now = new Date();
  const next = getNextOccurrence(entry, now);
  const elapsed = elapsedOccurrences(entry, now);
  const rawTotal = entry.recurrence ?? null;
  const isUnbounded = rawTotal == null || rawTotal <= 0;
  const total = isUnbounded ? null : rawTotal;
  const remaining = total == null ? null : Math.max(0, total - elapsed);

  return (
    <li className="recurring-item">
      <div className="recurring-item__main">
        <span className="recurring-item__source">{entry.source}</span>
        <span className="recurring-cycle-badge">{getCycleLabel(entry.cycle)}</span>
      </div>
      <div className="recurring-item__meta">
        <span className="recurring-item__started">
          seit {formatDateShort(new Date(getEntryDate(entry)))}
        </span>
        <span className="recurring-next-date">
          nächster Termin: {formatDateShort(next)}
        </span>
        <span className="recurring-item__remaining">
          {total == null ? 'unbegrenzt' : `${remaining} von ${total} verbleibend`}
        </span>
      </div>
      <div className="recurring-item__amount-col">
        <span className={`recurring-item__amount${isExpense ? ' is-expense' : ''}`}>
          {formatMoney(Number(entry.amount))}
        </span>
        <div className="recurring-item__actions">
          <button className="inline-action" type="button" onClick={onExtend}>Verlängern</button>
          <button className="inline-action" type="button" onClick={onEnd} disabled={total != null && remaining === 0}>Beenden</button>
          <button className="inline-action" type="button" onClick={onEdit}>Bearbeiten</button>
          <button className="inline-action delete" type="button" onClick={onDelete}>Löschen</button>
        </div>
      </div>
    </li>
  );
}

export function RecurringList({
  income,
  expenses,
  onEditIncome,
  onEditExpense,
  onDeleteIncome,
  onDeleteExpense,
}: RecurringListProps) {
  const invalidate = useFinanceInvalidator();
  const recurringIncome = income.filter(isRecurring);
  const recurringExpenses = expenses.filter(isRecurring);

  const [endTarget, setEndTarget] = useState<{ kind: Kind; entry: IncomeEntry | ExpenseEntry } | null>(null);
  const [extendTarget, setExtendTarget] = useState<{ kind: Kind; entry: IncomeEntry | ExpenseEntry } | null>(null);
  const [extendValue, setExtendValue] = useState('');

  const confirmEnd = async () => {
    if (!endTarget) return;
    // "End" means: set recurrence to the number of occurrences that have already happened
    // (including the original), so no further projections are produced.
    const elapsed = elapsedOccurrences(endTarget.entry, new Date());
    const cap = Math.max(1, elapsed);
    const result = await patchEntry(endTarget.kind, endTarget.entry, cap);
    if (!result.ok) { toast.error(result.message ?? 'Beenden fehlgeschlagen'); return; }
    toast.success('Dauerauftrag beendet');
    setEndTarget(null);
    invalidate();
  };

  const confirmExtend = async () => {
    if (!extendTarget) return;
    const raw = extendValue.trim();
    const next = raw === '' ? null : Number(raw);
    if (next != null && (!Number.isFinite(next) || next < 1)) {
      toast.error('Bitte eine positive Zahl eingeben');
      return;
    }
    const result = await patchEntry(extendTarget.kind, extendTarget.entry, next);
    if (!result.ok) { toast.error(result.message ?? 'Verlängern fehlgeschlagen'); return; }
    toast.success(next == null ? 'Dauerauftrag auf unbegrenzt gesetzt' : `Dauerauftrag auf ${next} Termine gesetzt`);
    setExtendTarget(null);
    setExtendValue('');
    invalidate();
  };

  const renderSection = (title: string, entries: (IncomeEntry | ExpenseEntry)[], kind: Kind, isExpense: boolean) => (
    <section className="recurring-section">
      <h3 className="recurring-section__title">{title}</h3>
      {entries.length === 0 ? (
        <p className="recurring-empty">Keine aktiven Daueraufträge.</p>
      ) : (
        <ul className="recurring-list">
          {entries.map((e) => (
            <RecurringRow
              key={e.id}
              entry={e}
              kind={kind}
              isExpense={isExpense}
              onEdit={() => kind === 'income' ? onEditIncome(e as IncomeEntry) : onEditExpense(e as ExpenseEntry)}
              onDelete={() => kind === 'income' ? onDeleteIncome(e.id) : onDeleteExpense(e.id)}
              onEnd={() => setEndTarget({ kind, entry: e })}
              onExtend={() => {
                setExtendTarget({ kind, entry: e });
                setExtendValue(e.recurrence != null ? String(e.recurrence) : '');
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="recurring-tab">
      {renderSection('Wiederkehrende Einnahmen', recurringIncome, 'income', false)}
      {renderSection('Wiederkehrende Ausgaben', recurringExpenses, 'expense', true)}

      {endTarget && (
        <Modal open onClose={() => setEndTarget(null)} title="Dauerauftrag beenden" size="sm">
          <p>
            Soll <strong>{endTarget.entry.source}</strong> beendet werden? Die Wiederholungen werden auf die bisher erfolgten Termine abgeschnitten — keine weiteren Buchungen mehr.
          </p>
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button className="btn btn-danger" onClick={confirmEnd}>Beenden bestätigen</button>
            <button className="btn btn-ghost" onClick={() => setEndTarget(null)}>Abbrechen</button>
          </div>
        </Modal>
      )}

      {extendTarget && (
        <Modal open onClose={() => { setExtendTarget(null); setExtendValue(''); }} title="Dauerauftrag verlängern" size="sm">
          <p>
            Neue Gesamt-Anzahl Wiederholungen für <strong>{extendTarget.entry.source}</strong>.
            Leer lassen für unbegrenzt.
          </p>
          <input
            className="form-input"
            type="number"
            min="1"
            step="1"
            value={extendValue}
            onChange={(e) => setExtendValue(e.target.value)}
            placeholder="leer = unbegrenzt"
            autoFocus
          />
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={confirmExtend}>Speichern</button>
            <button className="btn btn-ghost" onClick={() => { setExtendTarget(null); setExtendValue(''); }}>Abbrechen</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default RecurringList;
