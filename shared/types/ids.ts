import { Brand } from './money.js';

export type UserId = Brand<string, 'UserId'>;
export type AccountId = Brand<number, 'AccountId'>;
export type BankAccountId = Brand<number, 'BankAccountId'>;
export type ShareAccountId = Brand<number, 'ShareAccountId'>;
export type GroupId = Brand<number, 'GroupId'>;
export type EntryId = Brand<number, 'EntryId'>;
export type BudgetId = Brand<number, 'BudgetId'>;
export type QuestionId = Brand<number, 'QuestionId'>;
export type AnswerId = Brand<number, 'AnswerId'>;

export type ISODateString = Brand<string, 'ISODateString'>;
export type YearMonth = Brand<string, 'YearMonth'>;

export function toUserId(value: string | number): UserId {
  return String(value) as UserId;
}

export function toAccountId(value: number): AccountId {
  return value as AccountId;
}

export function toISODate(date: Date): ISODateString {
  return date.toISOString() as ISODateString;
}
