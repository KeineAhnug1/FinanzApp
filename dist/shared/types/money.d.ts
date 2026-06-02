export type Currency = 'EUR' | 'USD' | 'GBP' | 'CHF' | 'JPY' | 'CAD' | 'AUD';
export type Brand<T, U extends string> = T & {
    readonly __brand: U;
};
export type Cents = Brand<bigint, 'Cents'>;
export interface Money {
    amount: Cents;
    currency: Currency;
}
export declare function toCents(input: string): Cents;
export declare function fromCents(amount: Cents): string;
export declare function parseMoney(input: unknown, currency?: Currency): Money | null;
export declare function formatMoney(money: Money, locale?: string): string;
export declare function parseCurrency(value: unknown): Currency | null;
//# sourceMappingURL=money.d.ts.map