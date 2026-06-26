import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _clearProfileCacheForTests,
  getCachedProfile,
  setCachedProfile,
} from '../index';

beforeEach(() => {
  _clearProfileCacheForTests();
});

afterEach(() => {
  vi.useRealTimers();
  _clearProfileCacheForTests();
});

describe('profile cache', () => {
  it('returns null for unknown symbol', () => {
    expect(getCachedProfile('NOPE')).toBeNull();
  });

  it('round-trips a value', () => {
    setCachedProfile('AAPL', { currency: 'USD', name: 'Apple Inc.' });
    expect(getCachedProfile('AAPL')).toEqual({ currency: 'USD', name: 'Apple Inc.' });
  });

  it('expires entries after TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    setCachedProfile('AAPL', { currency: 'USD', name: 'Apple Inc.' });
    expect(getCachedProfile('AAPL')).not.toBeNull();

    vi.advanceTimersByTime(60 * 60 * 1000 + 1);
    expect(getCachedProfile('AAPL')).toBeNull();
  });

  it('evicts oldest when exceeding max size', () => {
    for (let i = 0; i < 501; i++) {
      setCachedProfile(`SYM${i}`, { currency: 'USD', name: `Stock ${i}` });
    }
    expect(getCachedProfile('SYM0')).toBeNull();
    expect(getCachedProfile('SYM500')).not.toBeNull();
  });

  it('moves entry to most-recent position on hit (LRU)', () => {
    for (let i = 0; i < 500; i++) {
      setCachedProfile(`SYM${i}`, { currency: 'USD', name: `Stock ${i}` });
    }
    getCachedProfile('SYM0');
    setCachedProfile('NEW', { currency: 'USD', name: 'New Stock' });

    expect(getCachedProfile('SYM0')).not.toBeNull();
    expect(getCachedProfile('SYM1')).toBeNull();
    expect(getCachedProfile('NEW')).not.toBeNull();
  });
});
