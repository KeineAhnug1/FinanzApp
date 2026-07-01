// Wealth calculation — the single source of truth for "how much money is on the account
// at any given point in time".
//
// Model: opening capital + Σ signed cashflows up to `t`.
//
//   - Opening capital is the `income` row with category === 'opening', which the backend
//     creates automatically when the account is first opened. Its amount is the number
//     the user entered when creating the account.
//   - Every other entry (real one-off row OR recurring occurrence — past AND future) is
//     added on top: income positive, expense negative.
//   - Recurring entries live in the DB as a single row; the frontend expands them into
//     per-occurrence virtual rows via `expandAllRecurring`. We treat those the same as
//     real rows for wealth purposes: the money moved (or will move) at that date.
//
// The `bank_accounts.balance` field the backend maintains is NOT used here — it only
// reflects the sum of the *originally inserted rows* (one per recurring definition, not
// one per occurrence), which drifts from reality the moment a monthly rent has run for
// more than one month. We compute the true balance client-side from the entry list.

import type { IncomeEntry, ExpenseEntry } from './types';
import { expandAllRecurring } from './recurring';

export interface WealthPoint {
  ts: number;
  cumulative: number;
}

export interface WealthTimeline {
  openingAmount: number;
  openingTs: number | null;
  points: WealthPoint[]; // sorted ascending by ts; each entry is cumulative AFTER that event
}

function isOpeningIncome(e: IncomeEntry): boolean {
  return e.category === 'opening';
}

// Build a sorted, cumulative wealth timeline from the raw entry lists.
// `horizonEnd` bounds recurrence expansion; leave it undefined to skip future projections
// (e.g. for the header saldo which only cares about "up to today").
export function buildWealthTimeline(
  income: IncomeEntry[],
  expenses: ExpenseEntry[],
  horizonEnd: Date | null,
): WealthTimeline {
  // 1. Extract opening capital. There may be one per bank account; sum them so a
  //    multi-account view still starts at the correct pooled opening balance.
  let openingAmount = 0;
  let openingTs: number | null = null;
  const openingIds = new Set<string>();
  for (const e of income) {
    if (!isOpeningIncome(e)) continue;
    openingIds.add(e.id);
    openingAmount += Number(e.amount) || 0;
    const ts = new Date(e.received_at).getTime();
    if (Number.isFinite(ts) && (openingTs == null || ts < openingTs)) openingTs = ts;
  }

  // 2. Expand recurring entries into per-occurrence rows. Skip opening entries: they
  //    should never be recurring, and even if flagged we don't want to double-count.
  const nonOpeningIncome = income.filter((e) => !openingIds.has(e.id));
  const projectedIncome = horizonEnd ? expandAllRecurring(nonOpeningIncome, horizonEnd) : nonOpeningIncome;
  const projectedExpenses = horizonEnd ? expandAllRecurring(expenses, horizonEnd) : expenses;

  // 3. Merge into a signed, time-sorted event stream.
  const events: { ts: number; amount: number }[] = [];
  for (const e of projectedIncome) {
    const ts = new Date(e.received_at).getTime();
    if (!Number.isFinite(ts)) continue;
    events.push({ ts, amount: Number(e.amount) || 0 });
  }
  for (const e of projectedExpenses) {
    const ts = new Date(e.spent_at).getTime();
    if (!Number.isFinite(ts)) continue;
    events.push({ ts, amount: -(Number(e.amount) || 0) });
  }
  events.sort((a, b) => a.ts - b.ts);

  // 4. Roll forward from the opening amount.
  const points: WealthPoint[] = [];
  let running = openingAmount;
  for (const ev of events) {
    running += ev.amount;
    points.push({ ts: ev.ts, cumulative: running });
  }

  return { openingAmount, openingTs, points };
}

// Wealth at the END of `boundary` (inclusive of any event that lands on that day).
// Returns the opening amount when `boundary` is before the first event.
export function wealthAt(timeline: WealthTimeline, boundary: Date): number {
  const t = boundary.getTime();
  const { points, openingAmount } = timeline;
  if (points.length === 0) return openingAmount;
  // Binary search for the last point whose ts <= t.
  let lo = 0;
  let hi = points.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.ts <= t) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (idx === -1) return openingAmount;
  return points[idx]!.cumulative;
}

// Current effective balance (opening + everything that has happened up to now).
export function currentEffectiveBalance(
  income: IncomeEntry[],
  expenses: ExpenseEntry[],
  now: Date = new Date(),
): number {
  const timeline = buildWealthTimeline(income, expenses, now);
  return wealthAt(timeline, now);
}
