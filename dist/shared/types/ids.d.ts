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
export declare function toUserId(value: string | number): UserId;
export declare function toAccountId(value: number): AccountId;
export declare function toISODate(date: Date): ISODateString;
//# sourceMappingURL=ids.d.ts.map