import { describe, expect, it } from 'vitest';
import {
  isRecurring,
  expandRecurring,
  expandAllRecurring,
  getNextOccurrence,
  elapsedOccurrences,
} from '../recurring';
import type { IncomeEntry, ExpenseEntry, AnyEntry } from '../types';

function income(overrides: Partial<IncomeEntry> = {}): IncomeEntry {
  return {
    id: '1',
    source: 'Gehalt',
    amount: 1000,
    category: 'salary',
    cycle: 'monthly',
    received_at: '2026-01-15T00:00:00.000Z',
    bank_account_id: 'acc-1',
    ...overrides,
  };
}

function expense(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: '2',
    source: 'Miete',
    amount: 800,
    category: 'rent',
    cycle: 'monthly',
    spent_at: '2026-01-01T00:00:00.000Z',
    bank_account_id: 'acc-1',
    ...overrides,
  };
}

describe('isRecurring', () => {
  it('returns false for once', () => {
    expect(isRecurring(income({ cycle: 'once' }))).toBe(false);
  });

  it('returns true for monthly/weekly/yearly when active', () => {
    expect(isRecurring(income({ cycle: 'monthly' }))).toBe(true);
    expect(isRecurring(income({ cycle: 'weekly' }))).toBe(true);
    expect(isRecurring(income({ cycle: 'yearly' }))).toBe(true);
  });

  it('returns false when is_active is false', () => {
    expect(isRecurring(income({ cycle: 'monthly', is_active: false }))).toBe(false);
  });

  it('returns false when state is paused or completed', () => {
    expect(isRecurring(income({ state: 'paused' }))).toBe(false);
    expect(isRecurring(income({ state: 'completed' }))).toBe(false);
  });
});

describe('expandRecurring', () => {
  it('returns no projections for once', () => {
    const out = expandRecurring(income({ cycle: 'once' }), new Date('2030-01-01'));
    expect(out).toHaveLength(0);
  });

  it('projects recurrence-1 times (recurrence counts original + projections)', () => {
    const e = income({ cycle: 'monthly', recurrence: 12, received_at: '2026-01-15T00:00:00.000Z' });
    const out = expandRecurring(e, new Date('2030-01-01'));
    // recurrence: 12 means 12 total occurrences (1 original + 11 projections).
    expect(out).toHaveLength(11);
    expect(out[0]?.id).toBe('1__proj_1');
    expect((out[0] as IncomeEntry).received_at.slice(0, 7)).toBe('2026-02');
    expect((out[10] as IncomeEntry).received_at.slice(0, 7)).toBe('2026-12');
  });

  it('respects horizonEnd when recurrence is null (unbounded)', () => {
    const e = income({ cycle: 'monthly', recurrence: null, received_at: '2026-01-15T00:00:00.000Z' });
    const out = expandRecurring(e, new Date('2026-07-15T00:00:00.000Z'));
    expect(out).toHaveLength(6);
  });

  it('handles weekly cycle (recurrence=4 → 3 projections)', () => {
    const e = expense({ cycle: 'weekly', recurrence: 4, spent_at: '2026-01-01T00:00:00.000Z' });
    const out = expandRecurring(e, new Date('2030-01-01'));
    expect(out).toHaveLength(3);
    expect((out[0] as ExpenseEntry).spent_at.slice(0, 10)).toBe('2026-01-08');
    expect((out[2] as ExpenseEntry).spent_at.slice(0, 10)).toBe('2026-01-22');
  });

  it('handles yearly cycle (recurrence=3 → 2 projections)', () => {
    const e = income({ cycle: 'yearly', recurrence: 3, received_at: '2026-06-01T00:00:00.000Z' });
    const out = expandRecurring(e, new Date('2035-01-01'));
    expect(out).toHaveLength(2);
    expect((out[0] as IncomeEntry).received_at.slice(0, 4)).toBe('2027');
    expect((out[1] as IncomeEntry).received_at.slice(0, 4)).toBe('2028');
  });

  it('tags projections as isProjected with stable id pattern', () => {
    const e = income({ cycle: 'monthly', recurrence: 3 });
    const out = expandRecurring(e, new Date('2030-01-01'));
    for (const p of out) {
      expect(p.isProjected).toBe(true);
      expect(p.projectedFromId).toBe('1');
      expect(p.id.startsWith('1__proj_')).toBe(true);
    }
  });
});

describe('expandAllRecurring', () => {
  it('returns originals plus projections (count = recurrence including original)', () => {
    const entries: AnyEntry[] = [
      income({ id: 'a', cycle: 'once' }),
      income({ id: 'b', cycle: 'monthly', recurrence: 3 }),
    ];
    const out = expandAllRecurring(entries, new Date('2030-01-01'));
    // a (once): 1 entry. b (monthly, recurrence: 3): 1 original + 2 projections = 3. Total 4.
    expect(out).toHaveLength(4);
    expect(out[0]?.id).toBe('a');
    expect(out[1]?.id).toBe('b');
    expect(out[2]?.id).toBe('b__proj_1');
    expect(out[3]?.id).toBe('b__proj_2');
  });
});

describe('getNextOccurrence', () => {
  it('returns the next future date for monthly when total cap not reached', () => {
    const e = income({ cycle: 'monthly', recurrence: 12, received_at: '2026-01-15T00:00:00.000Z' });
    const next = getNextOccurrence(e, new Date('2026-03-20T00:00:00.000Z'));
    expect(next?.toISOString().slice(0, 7)).toBe('2026-04');
  });

  it('returns null when all recurrences are exhausted (recurrence=3, all 3 in the past)', () => {
    // recurrence: 3 → original (Jan) + Feb + Mar are all in the past at Apr 2026
    const e = income({ cycle: 'monthly', recurrence: 3, received_at: '2026-01-15T00:00:00.000Z' });
    const next = getNextOccurrence(e, new Date('2026-04-20'));
    expect(next).toBeNull();
  });

  it('returns the original date for once-entry in the future', () => {
    const e = income({ cycle: 'once', received_at: '2030-01-01T00:00:00.000Z' });
    const next = getNextOccurrence(e, new Date('2026-01-01'));
    expect(next?.toISOString().slice(0, 10)).toBe('2030-01-01');
  });
});

describe('elapsedOccurrences', () => {
  it('counts the original plus already-occurred monthly steps', () => {
    const e = income({ cycle: 'monthly', recurrence: 12, received_at: '2026-01-15T00:00:00.000Z' });
    // Jan (original) + Feb + Mar + Apr = 4 occurrences elapsed by Apr 20
    expect(elapsedOccurrences(e, new Date('2026-04-20T00:00:00.000Z'))).toBe(4);
  });

  it('returns 0 if now is before start', () => {
    const e = income({ cycle: 'monthly', received_at: '2030-01-01T00:00:00.000Z' });
    expect(elapsedOccurrences(e, new Date('2026-01-01'))).toBe(0);
  });

  it('returns 1 when now equals start (the original counts)', () => {
    const e = income({ cycle: 'monthly', received_at: '2026-01-15T00:00:00.000Z' });
    expect(elapsedOccurrences(e, new Date('2026-01-15T00:00:00.000Z'))).toBe(1);
  });
});
