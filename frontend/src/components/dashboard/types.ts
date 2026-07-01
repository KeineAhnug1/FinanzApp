export interface BankAccount {
  id: string;
  label: string;
  balance: number;
  type: string;
  created_at?: string;
}

export interface IncomeEntry {
  id: string;
  source: string;
  amount: number;
  category: string;
  cycle: string;
  received_at: string;
  bank_account_id: string;
  note?: string;
  transfer_id?: number | null;
  recurrence?: number | null;
  is_active?: boolean;
  state?: string;
  isProjected?: boolean;
  isPastRecurring?: boolean;
  projectedFromId?: string;
}

export interface ExpenseEntry {
  id: string;
  source: string;
  amount: number;
  category: string;
  cycle: string;
  spent_at: string;
  bank_account_id: string;
  note?: string;
  transfer_id?: number | null;
  recurrence?: number | null;
  is_active?: boolean;
  state?: string;
  isProjected?: boolean;
  isPastRecurring?: boolean;
  projectedFromId?: string;
}

export interface BudgetAlert {
  budget_id?: string;
  category: string;
  spent: number;
  target: number;
  percentage: number;
  exceeded: boolean;
}

export type AnyEntry = IncomeEntry | ExpenseEntry;

export const INCOME_CATEGORIES = [
  { value: 'salary', label: 'Gehalt' },
  { value: 'freelance', label: 'Freelance' },
  { value: 'bonus', label: 'Bonus' },
  { value: 'refund', label: 'Rückzahlung' },
  { value: 'investment', label: 'Kapitalerträge' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'other', label: 'Sonstiges' },
];

export const EXPENSE_CATEGORIES = [
  { value: 'rent', label: 'Miete' },
  { value: 'groceries', label: 'Lebensmittel' },
  { value: 'utilities', label: 'Nebenkosten' },
  { value: 'transport', label: 'Mobilität' },
  { value: 'health', label: 'Gesundheit' },
  { value: 'entertainment', label: 'Freizeit' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'other', label: 'Sonstiges' },
];

export const CYCLE_OPTIONS = [
  { value: 'once', label: 'Einmalig' },
  { value: 'weekly', label: 'Wöchentlich' },
  { value: 'monthly', label: 'Monatlich' },
  { value: 'yearly', label: 'Jährlich' },
];

export const CATEGORY_LABELS: Record<string, string> = {
  ...Object.fromEntries(
    [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].map(({ value, label }) => [value, label])
  ),
  // Server-only category used for the auto-generated opening-balance entry. Not
  // exposed in the user-facing dropdowns, but rendered with this label in lists.
  opening: 'Eröffnungssaldo',
};

export function getCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] || cat;
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(dateStr));
}

export function toDatetimeLocal(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type BudgetVariant = 'ok' | 'warn' | 'over';

// Farbe nach projiziertem Monats-Endstand:
//   - over: bereits über 100 % (real überzogen)
//   - warn: bei aktuellem Tempo bis Monatsende > 100 %
//   - ok:   bei aktuellem Tempo bleibt das Budget eingehalten
// Edge cases: ungültiges target, kein Spent, oder zu früh im Monat (< 10 % vergangen)
// → konservativ als 'ok' werten, sonst springt jeder am 1. eines Monats sofort auf 'warn'.
export function projectBudgetVariant(spent: number, target: number, now: Date = new Date()): BudgetVariant {
  if (!Number.isFinite(target) || target <= 0) return 'ok';
  if (!Number.isFinite(spent) || spent <= 0) return 'ok';
  if (spent > target) return 'over';
  const day = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const elapsedRatio = Math.max(0.1, day / daysInMonth);
  const projected = spent / elapsedRatio;
  return projected > target ? 'warn' : 'ok';
}
