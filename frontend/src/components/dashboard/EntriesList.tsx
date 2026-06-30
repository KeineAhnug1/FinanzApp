'use client';

import { useMemo, useState } from 'react';
import { formatDate, formatMoney, getCategoryLabel, type AnyEntry } from './types';
import { isRecurring } from './recurring';

function groupByDate(entries: AnyEntry[], dateField: 'received_at' | 'spent_at') {
  const byYear: Record<string, Record<string, Record<string, AnyEntry[]>>> = {};
  for (const e of entries) {
    const raw = (e as unknown as Record<string, string>)[dateField];
    const d = new Date(raw);
    const year = String(d.getFullYear());
    const month = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(d);
    const day = formatDate(raw);
    byYear[year] = byYear[year] ?? {};
    byYear[year][month] = byYear[year][month] ?? {};
    byYear[year][month][day] = byYear[year][month][day] ?? [];
    byYear[year][month][day].push(e);
  }
  return byYear;
}

function endOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function EntriesList({
  entries,
  type,
  onEdit,
  onDelete,
  onAddClick,
}: {
  entries: AnyEntry[];
  type: 'income' | 'expense';
  onEdit: (e: AnyEntry) => void;
  onDelete: (id: string) => void;
  onAddClick?: () => void;
}) {
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showFuture, setShowFuture] = useState(false);
  const dateField = type === 'income' ? 'received_at' : 'spent_at';

  // Exclude recurring originals — they live in the "Daueraufträge" tab.
  // Show only true one-time entries (and any projected occurrences are no longer
  // injected since we drop expandAllRecurring entirely).
  const oneTimeEntries = useMemo(
    () => entries.filter((e) => !isRecurring(e) && !e.isProjected),
    [entries],
  );

  const searchMatch = (e: AnyEntry) =>
    e.source.toLowerCase().includes(search.toLowerCase()) ||
    e.category.toLowerCase().includes(search.toLowerCase());

  const monthEnd = endOfCurrentMonth().getTime();

  // Split into past/current-month (descending main list) and future (collapsed "Vorgemerkt").
  const { mainEntries, futureEntries } = useMemo(() => {
    const past: AnyEntry[] = [];
    const future: AnyEntry[] = [];
    for (const e of oneTimeEntries) {
      if (!searchMatch(e)) continue;
      const raw = (e as unknown as Record<string, string>)[dateField];
      const ts = new Date(raw).getTime();
      if (!Number.isFinite(ts) || ts <= monthEnd) past.push(e);
      else future.push(e);
    }
    return { mainEntries: past, futureEntries: future };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oneTimeEntries, search, dateField, monthEnd]);

  const grouped = groupByDate(mainEntries, dateField);
  const futureSorted = useMemo(
    () => [...futureEntries].sort((a, b) => {
      const ta = new Date((a as unknown as Record<string, string>)[dateField]).getTime();
      const tb = new Date((b as unknown as Record<string, string>)[dateField]).getTime();
      return ta - tb;
    }),
    [futureEntries, dateField],
  );

  const hasAnyEntries = oneTimeEntries.length > 0;
  const isIncome = type === 'income';

  return (
    <>
      <div className="list-tools">
        <input
          className="field-input list-search"
          placeholder="Suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {mainEntries.length === 0 && futureEntries.length === 0 ? (
        !hasAnyEntries ? (
          <div className="entries-empty">
            <div className="entries-empty__icon" aria-hidden="true">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                {isIncome ? (
                  <>
                    <path d="M12 5v14" />
                    <path d="M5 12l7 7 7-7" />
                  </>
                ) : (
                  <>
                    <path d="M12 19V5" />
                    <path d="M5 12l7-7 7 7" />
                  </>
                )}
              </svg>
            </div>
            <p className="entries-empty__title">
              {isIncome ? 'Noch keine Einnahmen' : 'Noch keine Ausgaben'}
            </p>
            <p className="entries-empty__sub">
              {isIncome
                ? 'Erfasse deine erste Einnahme, um Übersicht über dein Einkommen zu bekommen.'
                : 'Erfasse deine erste Ausgabe, um deine Ausgaben im Blick zu behalten.'}
            </p>
            {onAddClick && (
              <button className="entries-empty__cta" onClick={onAddClick} type="button">
                {isIncome ? 'Einnahme erfassen' : 'Ausgabe erfassen'}
              </button>
            )}
          </div>
        ) : (
          <p className="income-empty">Keine Treffer für deine Suche.</p>
        )
      ) : (
        <>
          {futureEntries.length > 0 && (
            <details
              className="entries-future"
              open={showFuture}
              onToggle={(e) => setShowFuture((e.target as HTMLDetailsElement).open)}
            >
              <summary className="entries-future__summary">
                <span className="entries-future__title">
                  Vorgemerkt
                  <span className="entries-future__count">{futureEntries.length}</span>
                </span>
                <span className="entries-future__hint">
                  {showFuture ? 'Ausblenden' : 'Anzeigen'}
                </span>
              </summary>
              <ul className="entries-future__list">
                {futureSorted.map((entry) => {
                  const isTransfer = entry.transfer_id != null;
                  const raw = (entry as unknown as Record<string, string>)[dateField];
                  return (
                    <li key={entry.id} className="income-item">
                      <div className="income-topline">
                        <span className="income-source">
                          {entry.source}
                          {isTransfer && <span className="transfer-badge">Überweisung</span>}
                        </span>
                        <span className={`income-amount${type === 'expense' ? ' is-expense' : ''}`}>{formatMoney(Number(entry.amount))}</span>
                      </div>
                      <div className="income-tags">
                        <span className="income-tag">{getCategoryLabel(entry.category)}</span>
                        <span className="income-tag income-tag--muted">{formatDate(raw)}</span>
                      </div>
                      {entry.note && <p className="income-note">{entry.note}</p>}
                      <div className="income-actions-inline">
                        <button
                          className="inline-action"
                          type="button"
                          onClick={() => onEdit(entry)}
                          disabled={isTransfer}
                          title={isTransfer ? 'Überweisungen sind unveränderlich' : undefined}
                        >Bearbeiten</button>
                        {deleteId === entry.id ? (
                          <>
                            <button className="inline-action delete" type="button" onClick={() => { setDeleteId(null); onDelete(entry.id); }}>Wirklich löschen?</button>
                            <button className="inline-action" type="button" onClick={() => setDeleteId(null)}>Abbrechen</button>
                          </>
                        ) : (
                          <button
                            className="inline-action delete"
                            type="button"
                            onClick={() => setDeleteId(entry.id)}
                            disabled={isTransfer}
                            title={isTransfer ? 'Überweisungen sind unveränderlich' : undefined}
                          >Löschen</button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}

          {mainEntries.length === 0 ? (
            <p className="income-empty">Keine Treffer für deine Suche.</p>
          ) : (
        <ul className="income-list">
          {Object.entries(grouped).sort(([a], [b]) => Number(b) - Number(a)).map(([year, months]) => {
            const allEntries = Object.values(months).flatMap(Object.values).flat();
            const yearTotal = allEntries.reduce((s, e) => s + Number(e.amount), 0);
            return (
              <li key={year} className="month-group-item">
                <details className="year-group" open>
                  <summary className="month-summary">
                    <span className="month-title">{year}</span>
                    <span className="month-meta">{allEntries.length} Einträge · {formatMoney(yearTotal)}</span>
                  </summary>
                  <div className="year-content">
                    {Object.entries(months)
                      .map(([month, days]) => {
                        const sample = Object.values(days)[0]?.[0];
                        const ts = sample
                          ? new Date((sample as unknown as Record<string, string>)[dateField]).getTime()
                          : 0;
                        return { month, days, ts };
                      })
                      .sort((a, b) => b.ts - a.ts)
                      .map(({ month, days }) => {
                      const monthTotal = Object.values(days).flat().reduce((s, e) => s + Number(e.amount), 0);
                      return (
                        <details key={month} className="month-group" open>
                          <summary className="month-summary">
                            <span className="month-title">{month}</span>
                            <span className="month-meta">{formatMoney(monthTotal)}</span>
                          </summary>
                          <ul className="month-entry-list">
                            {Object.entries(days).sort(([a], [b]) => b.localeCompare(a)).map(([day, dayEntries]) => (
                              <li key={day}>
                                <details className="day-group">
                                  <summary className="day-summary">
                                    <span className="day-title">{day}</span>
                                  </summary>
                                  <ul style={{ margin: 0, padding: '0 8px 8px', listStyle: 'none', display: 'grid', gap: 8 }}>
                                    {dayEntries.map((entry) => {
                                      const isTransfer = entry.transfer_id != null;
                                      return (
                                      <li key={entry.id} className={`income-item${entry.isProjected ? ' income-item--projected' : ''}`}>
                                        <div className="income-topline">
                                          <span className="income-source">
                                            {entry.source}
                                            {isTransfer && <span className="transfer-badge">Überweisung</span>}
                                            {entry.isProjected && <span className="entry-projected-badge">geplant</span>}
                                          </span>
                                          <span className={`income-amount${type === 'expense' ? ' is-expense' : ''}`}>{formatMoney(Number(entry.amount))}</span>
                                        </div>
                                        <div className="income-tags">
                                          <span className="income-tag">{getCategoryLabel(entry.category)}</span>
                                        </div>
                                        {entry.note && <p className="income-note">{entry.note}</p>}
                                        {!entry.isProjected && (
                                          <div className="income-actions-inline">
                                            <button
                                              className="inline-action"
                                              type="button"
                                              onClick={() => onEdit(entry)}
                                              disabled={isTransfer}
                                              title={isTransfer ? 'Überweisungen sind unveränderlich' : undefined}
                                            >Bearbeiten</button>
                                            {deleteId === entry.id ? (
                                              <>
                                                <button className="inline-action delete" type="button" onClick={() => { setDeleteId(null); onDelete(entry.id); }}>Wirklich löschen?</button>
                                                <button className="inline-action" type="button" onClick={() => setDeleteId(null)}>Abbrechen</button>
                                              </>
                                            ) : (
                                              <button
                                                className="inline-action delete"
                                                type="button"
                                                onClick={() => setDeleteId(entry.id)}
                                                disabled={isTransfer}
                                                title={isTransfer ? 'Überweisungen sind unveränderlich' : undefined}
                                              >Löschen</button>
                                            )}
                                          </div>
                                        )}
                                      </li>
                                      );
                                    })}
                                  </ul>
                                </details>
                              </li>
                            ))}
                          </ul>
                        </details>
                      );
                    })}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
          )}
        </>
      )}
    </>
  );
}
