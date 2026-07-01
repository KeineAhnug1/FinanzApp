// Wealth calculation — the single source of truth for "how much money is on the account
// at any given point in time".
//
// Model: opening capital + Σ signed cashflows up to `t`.
//
//   - Opening capital is derived from either:
//       (a) an `income` row with category === 'opening' — the current backend creates
//           this row when an account is opened via the app, OR
//       (b) `bank_accounts.balance` dated at `created_at` — the starting capital the
//           user entered. The backend keeps this column as the initial amount and does
//           NOT increment it on every booking, so it always represents the opening
//           capital. Any account without an (a)-style opening row uses this fallback.
//   - Every other entry (real one-off row OR recurring occurrence — past AND future) is
//     added on top: income positive, expense negative.
//   - Recurring entries live in the DB as a single row; the frontend expands them into
//     per-occurrence virtual rows via `expandAllRecurring`. We treat those the same as
//     real rows for wealth purposes: the money moved (or will move) at that date.

import type { IncomeEntry, ExpenseEntry, BankAccount } from './types';
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

// Extra opening capital that needs to be seeded from account metadata (see fallback
// case in the file header). One entry per account; the timeline treats it as a signed
// event dated at the account's creation.
export interface OpeningSeed {
  ts: number;
  amount: number;
}

function isOpeningIncome(e: IncomeEntry): boolean {
  return e.category === 'opening';
}

// Build a sorted, cumulative wealth timeline from the raw entry lists.
// `horizonEnd` bounds recurrence expansion; leave it undefined to skip future projections
// (e.g. for the header saldo which only cares about "up to today").
// `openingSeeds` inject synthetic opening amounts for accounts that lack an `income`
// row with category='opening' (legacy accounts — see file header).
export function buildWealthTimeline(
  income: IncomeEntry[],
  expenses: ExpenseEntry[],
  horizonEnd: Date | null,
  openingSeeds: OpeningSeed[] = [],
): WealthTimeline {
  // 1. Extract opening capital from real `opening` income rows.
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

  // 2. Fold in fallback seeds. If the account was created before real opening rows
  //    existed, its starting capital lives on the `bank_accounts.balance` snapshot
  //    dated at `created_at`. Seeds are dated events, so they land on the timeline
  //    at the right moment — a historical wealth query BEFORE the account existed
  //    correctly returns 0 for that account's portion.
  for (const seed of openingSeeds) {
    openingAmount += seed.amount;
    if (Number.isFinite(seed.ts) && (openingTs == null || seed.ts < openingTs)) {
      openingTs = seed.ts;
    }
  }

  // 3. Expand recurring entries into per-occurrence rows. Skip opening entries: they
  //    should never be recurring, and even if flagged we don't want to double-count.
  const nonOpeningIncome = income.filter((e) => !openingIds.has(e.id));
  const projectedIncome = horizonEnd ? expandAllRecurring(nonOpeningIncome, horizonEnd) : nonOpeningIncome;
  const projectedExpenses = horizonEnd ? expandAllRecurring(expenses, horizonEnd) : expenses;

  // 4. Merge into a signed, time-sorted event stream. Real opening rows are baked into
  //    the initial `openingAmount` above and would double-count if re-added here.
  //    Fallback seeds behave the same way — already in `openingAmount`.
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

  // 5. Roll forward from the (real + fallback) opening amount.
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

// Compute the fallback opening seed for a single account. Rule:
//   - If the account already has an `income` row with category='opening', return null
//     (the real row is authoritative; we must NOT double-count on top of it).
//   - Otherwise, use `bank_accounts.balance` verbatim as the opening amount dated at
//     `created_at`. The backend stores the user's originally entered starting capital
//     in this column and does NOT increment it on every booking — so its value is
//     always the starting amount, regardless of what entries the account accumulated
//     later. Trust the column directly.
export function openingSeedForAccount(account: BankAccount, income: IncomeEntry[], _expenses: ExpenseEntry[]): OpeningSeed | null {
  const acctId = String(account.id);
  const acctIncome = income.filter((e) => String(e.bank_account_id) === acctId);
  if (acctIncome.some(isOpeningIncome)) return null;

  const rawBalance = Number(account.balance) || 0;
  if (Math.abs(rawBalance) < 0.005) return null; // effectively zero → nothing to seed

  const createdMs = account.created_at ? new Date(account.created_at).getTime() : NaN;
  const ts = Number.isFinite(createdMs) ? createdMs : 0;
  return { ts, amount: rawBalance };
}

// Build seeds for every account that needs one. Convenience wrapper.
export function buildOpeningSeeds(accounts: BankAccount[], income: IncomeEntry[], expenses: ExpenseEntry[]): OpeningSeed[] {
  const seeds: OpeningSeed[] = [];
  for (const a of accounts) {
    const seed = openingSeedForAccount(a, income, expenses);
    if (seed) seeds.push(seed);
  }
  return seeds;
}

// Current effective balance (opening + everything that has happened up to now).
// Accepts optional `accounts` list; when provided, seeds legacy accounts as described
// in the file header.
export function currentEffectiveBalance(
  income: IncomeEntry[],
  expenses: ExpenseEntry[],
  now: Date = new Date(),
  accounts: BankAccount[] = [],
): number {
  const seeds = buildOpeningSeeds(accounts, income, expenses);
  const timeline = buildWealthTimeline(income, expenses, now, seeds);
  return wealthAt(timeline, now);
}

// Per-account effective balances. Same math as `currentEffectiveBalance`, but grouped
// by `bank_account_id` so every account gets its own number. Every listed account
// appears in the result, even if it has no entries at all.
export function currentEffectiveBalancesByAccount(
  income: IncomeEntry[],
  expenses: ExpenseEntry[],
  accounts: BankAccount[] = [],
  now: Date = new Date(),
): Map<string, number> {
  const out = new Map<string, number>();
  for (const account of accounts) {
    const acctId = String(account.id);
    const acctIncome = income.filter((e) => String(e.bank_account_id) === acctId);
    const acctExpense = expenses.filter((e) => String(e.bank_account_id) === acctId);
    const seed = openingSeedForAccount(account, income, expenses);
    const seeds = seed ? [seed] : [];
    const timeline = buildWealthTimeline(acctIncome, acctExpense, now, seeds);
    out.set(acctId, wealthAt(timeline, now));
  }
  // Also cover any account_ids referenced by entries but not present in `accounts`
  // (defensive — should not happen with matching payloads, but avoids losing money).
  const referenced = new Set<string>();
  for (const e of income) referenced.add(String(e.bank_account_id));
  for (const e of expenses) referenced.add(String(e.bank_account_id));
  for (const id of referenced) {
    if (out.has(id)) continue;
    const acctIncome = income.filter((e) => String(e.bank_account_id) === id);
    const acctExpense = expenses.filter((e) => String(e.bank_account_id) === id);
    const timeline = buildWealthTimeline(acctIncome, acctExpense, null);
    out.set(id, wealthAt(timeline, now));
  }
  return out;
}
