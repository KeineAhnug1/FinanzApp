import { describe, expect, it } from 'vitest';
import {
  toFixedAmount,
  normalizeCycle,
  categoryKey,
  normalizeCategoryValue,
  parseRecurrence,
  parseBoolean,
  uniqueCategoryList,
  resolveEntryState,
  resolveRequestedBankAccountFilter,
} from '../finance';

describe('toFixedAmount', () => {
  it('rounds to two decimal places', () => {
    expect(toFixedAmount(1.234)).toBe(1.23);
    expect(toFixedAmount(1.235)).toBe(1.24);
  });

  it('returns 0 for nullish or invalid input', () => {
    expect(toFixedAmount(null)).toBe(0);
    expect(toFixedAmount(undefined)).toBe(0);
    expect(toFixedAmount('not-a-number')).toBe(0);
  });

  it('coerces numeric strings', () => {
    expect(toFixedAmount('42.5')).toBe(42.5);
  });
});

describe('normalizeCycle', () => {
  it('accepts known cycle values', () => {
    expect(normalizeCycle('Weekly')).toBe('weekly');
    expect(normalizeCycle('MONTHLY')).toBe('monthly');
    expect(normalizeCycle('yearly')).toBe('yearly');
    expect(normalizeCycle('once')).toBe('once');
  });

  it('defaults nullish values to "once"', () => {
    expect(normalizeCycle(null)).toBe('once');
    expect(normalizeCycle(undefined)).toBe('once');
  });

  it('returns null for unknown values', () => {
    expect(normalizeCycle('daily')).toBeNull();
  });
});

describe('categoryKey / normalizeCategoryValue', () => {
  it('collapses whitespace and lowercases', () => {
    expect(categoryKey('  Food    And   Drinks  ')).toBe('food and drinks');
  });

  it('preserves original casing in normalizeCategoryValue', () => {
    expect(normalizeCategoryValue('  Food   Items ')).toBe('Food Items');
  });

  it('returns empty string for nullish', () => {
    expect(categoryKey(null)).toBe('');
  });
});

describe('parseRecurrence', () => {
  it('treats null-like inputs as null', () => {
    expect(parseRecurrence(null)).toBeNull();
    expect(parseRecurrence('')).toBeNull();
    expect(parseRecurrence('null')).toBeNull();
  });

  it('accepts non-negative integers', () => {
    expect(parseRecurrence(0)).toBe(0);
    expect(parseRecurrence('5')).toBe(5);
  });

  it('rejects negatives, fractions, and NaN', () => {
    expect(parseRecurrence(-1)).toBeUndefined();
    expect(parseRecurrence(1.5)).toBeUndefined();
    expect(parseRecurrence('abc')).toBeUndefined();
  });
});

describe('parseBoolean', () => {
  it('passes through booleans', () => {
    expect(parseBoolean(true)).toBe(true);
    expect(parseBoolean(false)).toBe(false);
  });

  it('parses string forms case-insensitively', () => {
    expect(parseBoolean('TRUE')).toBe(true);
    expect(parseBoolean('False')).toBe(false);
  });

  it('uses fallback for unknown input', () => {
    expect(parseBoolean('maybe', true)).toBe(true);
    expect(parseBoolean(null)).toBe(false);
  });
});

describe('uniqueCategoryList', () => {
  it('dedupes case-insensitively and sorts (de locale)', () => {
    expect(uniqueCategoryList(['Food', 'food', 'Bills', 'BILLS'])).toEqual(['Bills', 'Food']);
  });

  it('skips empty values', () => {
    expect(uniqueCategoryList(['', '  ', 'Rent'])).toEqual(['Rent']);
  });
});

describe('resolveEntryState', () => {
  it('forces "once" cycle into open, no recurrence', () => {
    expect(resolveEntryState('once', 5, false)).toEqual({
      effectiveRecurrence: null,
      effectiveIsActive: true,
      effectiveState: 'open',
    });
  });

  it('respects isActive for recurring cycles', () => {
    expect(resolveEntryState('monthly', 3, false)).toEqual({
      effectiveRecurrence: 3,
      effectiveIsActive: false,
      effectiveState: 'paused',
    });
  });
});

describe('resolveRequestedBankAccountFilter', () => {
  it('returns all accounts when filter is absent', () => {
    const result = resolveRequestedBankAccountFilter(new URLSearchParams(), ['1', '2']);
    expect(result).toEqual({ ok: true, accountIds: [1, 2] });
  });

  it('rejects an invalid id', () => {
    const result = resolveRequestedBankAccountFilter(new URLSearchParams('bank_account_id=abc'), [1]);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it('returns 404 when id is not in the allowed set', () => {
    const result = resolveRequestedBankAccountFilter(new URLSearchParams('bank_account_id=99'), [1, 2]);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });

  it('returns the filtered id when valid', () => {
    const result = resolveRequestedBankAccountFilter(new URLSearchParams('bank_account_id=2'), [1, 2]);
    expect(result).toEqual({ ok: true, accountIds: [2] });
  });
});
