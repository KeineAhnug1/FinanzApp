export type { Currency, Brand, Cents, Money } from './money.js';
export { toCents, fromCents, parseMoney, formatMoney, parseCurrency } from './money.js';

export type {
  UserId,
  AccountId,
  BankAccountId,
  ShareAccountId,
  GroupId,
  EntryId,
  BudgetId,
  QuestionId,
  AnswerId,
  ISODateString,
  YearMonth
} from './ids.js';

export { toUserId, toAccountId, toISODate } from './ids.js';

export interface ApiResponse<T = unknown> {
  ok: boolean;
  message?: string;
  data?: T;
}

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string | null;
  profileImage?: string | null;
}
