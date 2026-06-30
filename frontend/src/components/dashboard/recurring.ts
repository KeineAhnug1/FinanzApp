import type { AnyEntry, IncomeEntry, ExpenseEntry } from './types';

const CYCLE_LABELS: Record<string, string> = {
  once: 'Einmalig',
  weekly: 'Wöchentlich',
  monthly: 'Monatlich',
  yearly: 'Jährlich',
};

export function getCycleLabel(cycle: string | null | undefined): string {
  return CYCLE_LABELS[cycle ?? 'once'] ?? cycle ?? 'Einmalig';
}

export function getEntryDate(entry: AnyEntry): string {
  return (entry as IncomeEntry).received_at ?? (entry as ExpenseEntry).spent_at;
}

export function getEntryDateField(entry: AnyEntry): 'received_at' | 'spent_at' {
  return 'received_at' in entry && entry.received_at ? 'received_at' : 'spent_at';
}

export function isRecurring(entry: AnyEntry): boolean {
  const cycle = (entry.cycle ?? 'once').toLowerCase();
  if (cycle === 'once' || !['weekly', 'monthly', 'yearly'].includes(cycle)) return false;
  if (entry.is_active === false) return false;
  if (entry.state === 'paused' || entry.state === 'completed') return false;
  return true;
}

function advance(date: Date, cycle: string): void {
  switch (cycle) {
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
  }
}

// Number of occurrences that have already happened (inclusive of the original entry date).
// For `recurrence: N` semantics where N counts the original AND all repetitions, this counts
// how many of the N slots are already in the past.
export function elapsedOccurrences(entry: AnyEntry, now: Date = new Date()): number {
  if (!isRecurring(entry)) return 0;
  const startStr = getEntryDate(entry);
  if (!startStr) return 0;
  const start = new Date(startStr);
  if (Number.isNaN(start.getTime())) return 0;
  if (now < start) return 0;
  // The original counts as 1 if it's already happened.
  let count = 1;
  const cursor = new Date(start);
  while (count < 10000) {
    advance(cursor, entry.cycle);
    if (cursor > now) break;
    count++;
  }
  return count;
}

export function getNextOccurrence(entry: AnyEntry, after: Date = new Date()): Date | null {
  const startStr = getEntryDate(entry);
  if (!startStr) return null;
  const start = new Date(startStr);
  if (Number.isNaN(start.getTime())) return null;
  if (!isRecurring(entry)) {
    return start > after ? start : null;
  }
  // Step forward from start until we land after `after`.
  const cursor = new Date(start);
  let safety = 0;
  while (cursor <= after && safety < 10000) {
    advance(cursor, entry.cycle);
    safety++;
  }
  // Check recurrence cap: if `maxCount` (= total occurrences including original) has
  // already been reached, there is no next occurrence.
  const maxCount = entry.recurrence ?? null;
  if (maxCount != null && maxCount > 0) {
    // `safety` counts how many steps we took past `start` to land on `cursor`.
    // Including the original, `cursor` is the (safety+1)-th occurrence (1-based).
    if (safety + 1 > maxCount) return null;
  }
  return cursor;
}

// Builds a list of virtual entries representing the future occurrences (excluding the
// original entry, which is rendered separately). For `recurrence: N` (total), this
// returns N-1 projections.
export function expandRecurring(entry: AnyEntry, horizonEnd: Date): AnyEntry[] {
  if (!isRecurring(entry)) return [];
  const startStr = getEntryDate(entry);
  if (!startStr) return [];
  const start = new Date(startStr);
  if (Number.isNaN(start.getTime())) return [];

  const maxCount = entry.recurrence ?? null;
  const dateField = getEntryDateField(entry);
  const projections: AnyEntry[] = [];
  const cursor = new Date(start);
  let index = 0; // counts how many projections produced so far

  const HARD_CAP = 2000;

  while (index < HARD_CAP) {
    advance(cursor, entry.cycle);
    index++;
    // maxCount counts total occurrences including the original, so projections cap at maxCount-1.
    if (maxCount != null && maxCount > 0 && index > maxCount - 1) break;
    if (cursor > horizonEnd) break;

    const projection = {
      ...entry,
      [dateField]: cursor.toISOString(),
      id: `${entry.id}__proj_${index}`,
      isProjected: true,
      projectedFromId: entry.id,
    } as AnyEntry;
    projections.push(projection);
  }

  return projections;
}

export function expandAllRecurring<T extends AnyEntry>(entries: T[], horizonEnd: Date): T[] {
  const out: T[] = [];
  for (const entry of entries) {
    out.push(entry);
    if (isRecurring(entry)) {
      const projected = expandRecurring(entry, horizonEnd) as T[];
      out.push(...projected);
    }
  }
  return out;
}

// Past-only expansion: keep the original entry as-is and add a virtual entry for
// each occurrence that already happened between the original date and `now`.
// Future occurrences are NOT generated — they only live in the Daueraufträge tab.
export function expandPastRecurring<T extends AnyEntry>(entry: T, now: Date = new Date()): T[] {
  if (!isRecurring(entry)) return [];
  const startStr = getEntryDate(entry);
  if (!startStr) return [];
  const start = new Date(startStr);
  if (Number.isNaN(start.getTime())) return [];
  if (now <= start) return [];

  const dateField = getEntryDateField(entry);
  const maxCount = entry.recurrence ?? null;
  const projections: T[] = [];
  const cursor = new Date(start);
  let index = 0;
  const HARD_CAP = 2000;

  while (index < HARD_CAP) {
    advance(cursor, entry.cycle);
    index++;
    if (cursor > now) break;
    if (maxCount != null && maxCount > 0 && index > maxCount - 1) break;

    const projection = {
      ...entry,
      [dateField]: cursor.toISOString(),
      id: `${entry.id}__past_${index}`,
      isPastRecurring: true,
      projectedFromId: entry.id,
    } as unknown as T;
    projections.push(projection);
  }

  return projections;
}

export function expandPastRecurringAll<T extends AnyEntry>(entries: T[], now: Date = new Date()): T[] {
  const out: T[] = [];
  for (const entry of entries) {
    if (isRecurring(entry)) {
      const startStr = getEntryDate(entry);
      const start = startStr ? new Date(startStr) : null;
      const originalInPast = start && !Number.isNaN(start.getTime()) && start <= now;
      if (originalInPast) out.push(entry);
      out.push(...expandPastRecurring(entry, now));
    } else {
      out.push(entry);
    }
  }
  return out;
}
