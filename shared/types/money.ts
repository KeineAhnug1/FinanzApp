export type Currency = 'EUR' | 'USD';

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

