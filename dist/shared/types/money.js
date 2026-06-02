"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toCents = toCents;
exports.fromCents = fromCents;
exports.parseMoney = parseMoney;
exports.formatMoney = formatMoney;
exports.parseCurrency = parseCurrency;
function toCents(input) {
    const [i, f = ''] = input.split('.');
    const frac = (f + '00').slice(0, 2);
    const sign = i.startsWith('-') ? -1n : 1n;
    const absInt = BigInt(i.replace('-', '') || '0');
    const absFrac = BigInt(frac || '0');
    return (absInt * 100n + absFrac) * sign;
}
function fromCents(amount) {
    const sign = amount < 0 ? '-' : '';
    const abs = amount < 0 ? -amount : amount;
    const euros = abs / 100n;
    const cents = abs % 100n;
    return `${sign}${euros}.${cents.toString().padStart(2, '0')}`;
}
function parseMoney(input, currency = 'EUR') {
    const str = String(input ?? '').trim();
    if (!str || !/^-?\d+(\.\d{1,2})?$/.test(str))
        return null;
    return { amount: toCents(str), currency };
}
function formatMoney(money, locale = 'de-DE') {
    const num = Number(fromCents(money.amount));
    return new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency }).format(num);
}
function parseCurrency(value) {
    const upper = String(value ?? '').trim().toUpperCase();
    const VALID = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'];
    return VALID.includes(upper) ? upper : null;
}
//# sourceMappingURL=money.js.map