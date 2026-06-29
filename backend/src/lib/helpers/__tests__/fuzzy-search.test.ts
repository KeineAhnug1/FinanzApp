import { describe, it, expect } from 'vitest';
import { fuzzySearchQuestions } from '../fuzzy-search';

const items = [
  { thema: 'Bargeld weiter wichtig?',  message: 'Nutzt ihr noch Bargeld? Macht es Sinn, ein paar 100€ daheim zu haben für den Notfall?' },
  { thema: 'ETFs für Anfänger',        message: 'Welche ETFs eignen sich am besten für den Einstieg?' },
  { thema: 'Notgroschen-Höhe',         message: 'Wie viele Monatsausgaben sollte man als Notgroschen halten?' },
  { thema: 'Trade Republic vs. Scalable', message: 'Welcher Broker ist besser für Sparpläne?' },
  { thema: 'Krypto-Anteil im Portfolio',  message: 'Wie viel Prozent eures Portfolios habt ihr in Krypto?' },
  { thema: 'Auslandsüberweisung günstig', message: 'Wie überweise ich am günstigsten Geld nach Spanien?' },
  { thema: 'Robo-Advisor sinnvoll?',   message: 'Was haltet ihr von Quirion, Scalable oder Whitebox?' },
];

describe('fuzzySearchQuestions', () => {
  it('returns everything when query is empty', () => {
    expect(fuzzySearchQuestions(items, '')).toHaveLength(items.length);
  });

  it('finds exact substring matches', () => {
    const r = fuzzySearchQuestions(items, 'Bargeld');
    expect(r[0]?.thema).toBe('Bargeld weiter wichtig?');
  });

  it('tolerates a single missing letter (Bageld → Bargeld)', () => {
    const r = fuzzySearchQuestions(items, 'Bageld');
    expect(r[0]?.thema).toBe('Bargeld weiter wichtig?');
  });

  it('tolerates a single missing letter at different position (Brgeld → Bargeld)', () => {
    const r = fuzzySearchQuestions(items, 'Brgeld');
    expect(r[0]?.thema).toBe('Bargeld weiter wichtig?');
  });

  it('tolerates a single substituted letter (Bsrgeld → Bargeld)', () => {
    const r = fuzzySearchQuestions(items, 'Bsrgeld');
    expect(r[0]?.thema).toBe('Bargeld weiter wichtig?');
  });

  it('tolerates an adjacent transposition (Brageld → Bargeld)', () => {
    const r = fuzzySearchQuestions(items, 'Brageld');
    expect(r[0]?.thema).toBe('Bargeld weiter wichtig?');
  });

  it('tolerates inserted letter (Barggeld → Bargeld)', () => {
    const r = fuzzySearchQuestions(items, 'Barggeld');
    expect(r[0]?.thema).toBe('Bargeld weiter wichtig?');
  });

  it('is case-insensitive', () => {
    const r = fuzzySearchQuestions(items, 'BARGELD');
    expect(r[0]?.thema).toBe('Bargeld weiter wichtig?');
  });

  it('matches umlauts via normalization (uberweisung → Überweisung)', () => {
    const r = fuzzySearchQuestions(items, 'uberweisung');
    expect(r[0]?.thema).toBe('Auslandsüberweisung günstig');
  });

  it('ranks best matches first when multiple candidates score', () => {
    // "Notgroschen" is exact, also fuzzy-matches "Notfall" weakly.
    const r = fuzzySearchQuestions(items, 'Notgroschen');
    expect(r[0]?.thema).toBe('Notgroschen-Höhe');
  });

  it('does not return totally unrelated items', () => {
    const r = fuzzySearchQuestions(items, 'Bargeld');
    expect(r.find((q) => q.thema === 'ETFs für Anfänger')).toBeUndefined();
  });

  it('rejects 3-letter typos as noise', () => {
    // "xyzabc" should not match anything
    const r = fuzzySearchQuestions(items, 'xyzabc');
    expect(r).toHaveLength(0);
  });

  it('handles multi-word queries (only matches if BOTH words land somewhere)', () => {
    const r = fuzzySearchQuestions(items, 'ETF Anfänger');
    expect(r[0]?.thema).toBe('ETFs für Anfänger');
  });

  it('finds matches in message body too', () => {
    const r = fuzzySearchQuestions(items, 'Whitebox');
    expect(r[0]?.thema).toBe('Robo-Advisor sinnvoll?');
  });
});
