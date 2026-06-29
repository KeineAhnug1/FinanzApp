import { describe, expect, it } from 'vitest';
import { computeTripBalances, netSettlements } from '../group-shared';

describe('netSettlements', () => {
  it('returns empty array for empty balances', () => {
    expect(netSettlements(new Map())).toEqual([]);
  });

  it('returns empty array when all balances are within EPS', () => {
    const balances = new Map<number, number>([
      [1, 0],
      [2, 0.005],
      [3, -0.005],
    ]);
    expect(netSettlements(balances)).toEqual([]);
  });

  it('handles a single creditor/debtor pair', () => {
    const balances = new Map<number, number>([
      [1, 10],
      [2, -10],
    ]);
    expect(netSettlements(balances)).toEqual([{ from: 2, to: 1, amount: 10 }]);
  });

  it('produces the minimal settlement set for a 3-way scenario', () => {
    const balances = new Map<number, number>([
      [1, 10],
      [2, 10],
      [3, -20],
    ]);
    const result = netSettlements(balances);
    const totalFromC = result.filter((s) => s.from === 3).reduce((sum, s) => sum + s.amount, 0);
    expect(Math.round(totalFromC * 100) / 100).toBe(20);
    expect(result.every((s) => s.from === 3)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('tolerates floating-point noise', () => {
    const balances = new Map<number, number>([
      [1, 10 + 1e-9],
      [2, -(10 + 1e-9)],
    ]);
    const result = netSettlements(balances);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ from: 2, to: 1, amount: 10 });
  });

  it('matches partial debts against the largest creditor first', () => {
    const balances = new Map<number, number>([
      [1, 30],
      [2, 10],
      [3, -25],
      [4, -15],
    ]);
    const result = netSettlements(balances);
    const sumByDebtor = new Map<number, number>();
    for (const s of result) {
      sumByDebtor.set(s.from, (sumByDebtor.get(s.from) ?? 0) + s.amount);
    }
    expect(Math.round((sumByDebtor.get(3) ?? 0) * 100) / 100).toBe(25);
    expect(Math.round((sumByDebtor.get(4) ?? 0) * 100) / 100).toBe(15);
  });
});

describe('computeTripBalances', () => {
  it('returns empty balances when there are no expenses', () => {
    expect(computeTripBalances([], [], new Map())).toEqual(new Map());
  });

  it('splits an expense evenly across participants', () => {
    const balances = computeTripBalances(
      [{ id: 1, payer_user_id: 10, amount: 30 }],
      [
        { trip_expense_id: 1, user_id: 10 },
        { trip_expense_id: 1, user_id: 11 },
        { trip_expense_id: 1, user_id: 12 },
      ],
      new Map(),
    );
    expect(balances.get(10)).toBe(20);
    expect(balances.get(11)).toBe(-10);
    expect(balances.get(12)).toBe(-10);
  });

  it('subtracts already-paid settlement amounts', () => {
    const balances = computeTripBalances(
      [{ id: 1, payer_user_id: 10, amount: 20 }],
      [
        { trip_expense_id: 1, user_id: 10 },
        { trip_expense_id: 1, user_id: 11 },
      ],
      new Map([['11-10', 10]]),
    );
    expect(balances.get(10)).toBe(0);
    expect(balances.get(11)).toBe(0);
  });
});
