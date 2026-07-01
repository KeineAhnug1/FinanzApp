import { describe, expect, it } from 'vitest';
import { buildWealthTimeline, wealthAt, currentEffectiveBalance } from '../wealth';
import type { IncomeEntry, ExpenseEntry } from '../types';

function income(overrides: Partial<IncomeEntry> = {}): IncomeEntry {
  return {
    id: 'i1',
    source: 'Gehalt',
    amount: 1500,
    category: 'salary',
    cycle: 'once',
    received_at: '2024-01-15T00:00:00.000Z',
    bank_account_id: 'acc-1',
    ...overrides,
  };
}

function expense(overrides: Partial<ExpenseEntry> = {}): ExpenseEntry {
  return {
    id: 'e1',
    source: 'Miete',
    amount: 500,
    category: 'rent',
    cycle: 'once',
    spent_at: '2024-01-20T00:00:00.000Z',
    bank_account_id: 'acc-1',
    ...overrides,
  };
}

const opening = (amount: number, at = '2024-01-01T00:00:00.000Z'): IncomeEntry =>
  income({ id: 'open', category: 'opening', source: 'Startkapital', amount, received_at: at, cycle: 'once' });

describe('wealth timeline', () => {
  it('starts at opening amount before any event', () => {
    const t = buildWealthTimeline([opening(1000)], [], null);
    expect(t.openingAmount).toBe(1000);
    expect(wealthAt(t, new Date('2023-12-31'))).toBe(1000);
  });

  it('accumulates a single income on top of opening', () => {
    const t = buildWealthTimeline(
      [opening(1000), income({ id: 'i2', amount: 500, received_at: '2024-02-01T00:00:00.000Z', cycle: 'once' })],
      [],
      null,
    );
    expect(wealthAt(t, new Date('2024-01-15'))).toBe(1000);
    expect(wealthAt(t, new Date('2024-02-15'))).toBe(1500);
  });

  it('subtracts one-off expenses', () => {
    const t = buildWealthTimeline(
      [opening(1000)],
      [expense({ amount: 300, spent_at: '2024-02-10T00:00:00.000Z' })],
      null,
    );
    expect(wealthAt(t, new Date('2024-02-15'))).toBe(700);
  });

  it('expands monthly recurring occurrences up to the horizon', () => {
    // Use noon local-time timestamps so DST shifts don't move occurrences across
    // day boundaries (recurring.ts advances via setMonth on a local Date).
    const t = buildWealthTimeline(
      [opening(0)],
      [
        expense({
          id: 'rent',
          amount: 500,
          cycle: 'monthly',
          spent_at: '2024-01-01T12:00:00.000Z',
        }),
      ],
      new Date('2024-12-31T23:59:59.000Z'),
    );
    // Jan through Dec = 12 occurrences; wealth at year-end = -6000.
    expect(wealthAt(t, new Date('2024-12-31T23:59:59.000Z'))).toBe(-6000);
    // At end of April 15 = 4 occurrences (Jan/Feb/Mar/Apr) = -2000.
    expect(wealthAt(t, new Date('2024-04-15T00:00:00.000Z'))).toBe(-2000);
  });

  it('reproduces the reported bug: wealth rises when income > expenses', () => {
    // Setup: opening 5000, monthly salary 1200 and monthly rent 500 starting Jan 2024.
    // Net +700 per month.
    const t = buildWealthTimeline(
      [
        opening(5000),
        income({ id: 'sal', amount: 1200, cycle: 'monthly', received_at: '2024-01-05T12:00:00.000Z' }),
      ],
      [
        expense({ id: 'rent', amount: 500, cycle: 'monthly', spent_at: '2024-01-01T12:00:00.000Z' }),
      ],
      new Date('2024-12-31T23:59:59.000Z'),
    );
    // End of Jan: opening + 1 salary - 1 rent = 5000 + 1200 - 500 = 5700.
    const jan = wealthAt(t, new Date('2024-01-31T23:59:59.000Z'));
    // End of Aug: opening + 8*(1200-500) = 5000 + 5600 = 10600.
    const aug = wealthAt(t, new Date('2024-08-31T23:59:59.000Z'));
    expect(jan).toBe(5700);
    expect(aug).toBe(10600);
    expect(aug).toBeGreaterThan(jan);
  });

  it('currentEffectiveBalance sums opening + all past occurrences up to now', () => {
    const now = new Date('2024-04-15T12:00:00.000Z');
    const bal = currentEffectiveBalance(
      [
        opening(1000, '2024-01-01T12:00:00.000Z'),
        income({ id: 'sal', amount: 1200, cycle: 'monthly', received_at: '2024-01-05T12:00:00.000Z' }),
      ],
      [
        expense({ id: 'rent', amount: 500, cycle: 'monthly', spent_at: '2024-01-01T12:00:00.000Z' }),
      ],
      now,
    );
    // Jan 5, Feb 5, Mar 5, Apr 5 = 4 salaries; Jan 1, Feb 1, Mar 1, Apr 1 = 4 rents.
    // Opening 1000 + 4*1200 - 4*500 = 1000 + 4800 - 2000 = 3800.
    expect(bal).toBe(3800);
  });

  it('does not double-count if opening is flagged (defensive: opening should be `once`)', () => {
    // An opening entry accidentally marked monthly should still count only once.
    const openingMonthly = opening(1000);
    openingMonthly.cycle = 'monthly';
    const t = buildWealthTimeline([openingMonthly], [], new Date('2025-12-31T00:00:00.000Z'));
    expect(t.openingAmount).toBe(1000);
    expect(wealthAt(t, new Date('2025-06-30'))).toBe(1000);
  });
});
