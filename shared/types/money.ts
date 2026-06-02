export type Currency = 'EUR' | 'USD' | 'GBP' | 'CHF' | 'JPY' | 'CAD' | 'AUD';

export type Brand<T, U extends string> = T & { readonly __brand: U };
export type Cents = Brand<bigint, 'Cents'>;

export interface Money {
  amount: Cents;
  currency: Currency;
}

export function toCents(input: string): Cents {
  const [i, f = ''] = input.split('.');
  const frac = (f + '00').slice(0, 2);
  const sign = i.startsWith('-') ? -1n : 1n;
  const absInt = BigInt(i.replace('-', '') || '0');
  const absFrac = BigInt(frac || '0');
  return (absInt * 100n + absFrac) * sign as Cents;
}

export function fromCents(amount: Cents): string {
  const sign = amount < 0 ? '-' : '';
  const abs = amount < 0 ? -amount : amount;
  const euros = abs / 100n;
  const cents = abs % 100n;
  return `${sign}${euros}.${cents.toString().padStart(2, '0')}`;
}

export function parseMoney(input: unknown, currency: Currency = 'EUR'): Money | null {
  const str = String(input ?? '').trim();
  if (!str || !/^-?\d+(\.\d{1,2})?$/.test(str)) return null;
  return { amount: toCents(str), currency };
}

export function formatMoney(money: Money, locale = 'de-DE'): string {
  const num = Number(fromCents(money.amount));
  return new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency }).format(num);
}

export function parseCurrency(value: unknown): Currency | null {
  const upper = String(value ?? '').trim().toUpperCase();
  const VALID: Currency[] = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'];
  return (VALID as string[]).includes(upper) ? upper as Currency : null;
}
