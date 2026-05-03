// ============================================================
// examples.test.js — Kommentierte Code-Beispiele für Vitest
//
// Diese Datei enthält KEINE echten Tests.
// Alle Tests sind mit it.skip markiert — sie werden nie
// ausgeführt, aber vitest zeigt sie als "skipped" an.
//
// Zweck: Als Nachschlagewerk zeigen diese Beispiele anhand
// der Funktionen dieses Projekts, wie man die fünf wichtigsten
// Test-Patterns mit Vitest umsetzt.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';

// Die Imports der zu testenden Funktionen würden so aussehen:
//   import { parsePositiveAmount, parseObjectId, normalizeRecurrence } from '../../backend/utils/data.mjs';
//   import { hashPassword, verifyPassword } from '../../backend/utils/password.mjs';


// ------------------------------------------------------------
// BEISPIEL 1 — Einfacher Unit Test
//
// Was passiert: Eine reine Funktion wird mit verschiedenen
// Eingaben aufgerufen und das Ergebnis mit `expect` verglichen.
//
// Warum: Unit Tests für reine Funktionen (kein Netzwerk, keine
// Datenbank) sind schnell, deterministisch und günstig.
// `parsePositiveAmount` aus backend/utils/data.mjs ist ein
// idealer Kandidat: sie nimmt einen Wert und gibt eine Zahl
// oder `null` zurück — kein externes System nötig.
// ------------------------------------------------------------
describe('Beispiel 1 — Einfacher Unit Test', () => {
  it.skip('parsePositiveAmount rundet auf zwei Nachkommastellen', () => {
    // Aufruf der Funktion mit einem Wert mit mehr als zwei Dezimalstellen
    const result = parsePositiveAmount('9.999');
    // 9.999 wird auf 10.00 gerundet (toFixed(2) intern)
    expect(result).toBe(10.00);
  });

  it.skip('parsePositiveAmount gibt null zurück für ungültige Eingaben', () => {
    // Negative Zahl → ungültig
    expect(parsePositiveAmount(-5)).toBeNull();
    // Leerer String → kein gültiger Betrag
    expect(parsePositiveAmount('')).toBeNull();
    // Buchstaben → nicht numerisch
    expect(parsePositiveAmount('abc')).toBeNull();
  });

  it.skip('parsePositiveAmount akzeptiert gültige positive Zahl als String', () => {
    expect(parsePositiveAmount('42.5')).toBe(42.50);
  });
});


// ------------------------------------------------------------
// BEISPIEL 2 — Async-Funktion testen
//
// Was passiert: `await` im Testbody wartet auf das Promise.
// `hashPassword` erzeugt einen echten scrypt-Hash; `verifyPassword`
// prüft ihn danach. Da wir keine Datenbank brauchen, sind das
// vollständig isolierbare Unit Tests.
//
// Warum: Async-Funktionen werden genauso mit `expect` geprüft,
// aber der Testbody muss `async` sein und jeden Aufruf awaiten.
// Vergisst man `await`, gilt das Promise selbst als truthy —
// der Test ist dann immer grün, auch wenn die Funktion wirft.
// ------------------------------------------------------------
describe('Beispiel 2 — Async-Funktion testen', () => {
  it.skip('hashPassword erzeugt Hash, verifyPassword bestätigt ihn', async () => {
    const hash = await hashPassword('meinPasswort123');

    // Der Hash enthält das Format "scrypt$<salt>$<derived>"
    expect(hash).toMatch(/^scrypt\$/);

    // Richtiges Passwort → true
    const correct = await verifyPassword('meinPasswort123', hash);
    expect(correct).toBe(true);
  });

  it.skip('verifyPassword schlägt fehl bei falschem Passwort', async () => {
    const hash = await hashPassword('richtig');

    const wrong = await verifyPassword('falsch', hash);
    expect(wrong).toBe(false);
  });

  it.skip('verifyPassword schlägt fehl wenn der Hash direkt als Passwort übergeben wird', async () => {
    // Angreifer versucht, den Hash selbst als Login-Passwort zu nutzen —
    // password.mjs erkennt das am Präfix und blockt es.
    const hash = await hashPassword('test');
    const result = await verifyPassword(hash, hash);
    expect(result).toBe(false);
  });
});


// ------------------------------------------------------------
// BEISPIEL 3 — API-Call mit vi.spyOn mocken
//
// Was passiert: `vi.spyOn` ersetzt `globalThis.fetch` durch eine
// Fake-Funktion, die sofort eine vordefinierte Antwort zurückgibt.
// So lässt sich testen, wie der Code auf eine Antwort reagiert —
// ohne Netzwerk, ohne API-Key, ohne Kosten.
//
// Warum: Der Server ruft externe Dienste auf (Exchange-Rate-API,
// TwelveData, OpenRouter). In Tests sind diese unbrauchbar:
// sie kosten Geld, antworten langsam oder gar nicht, und ihr
// Verhalten ist nicht kontrollierbar.
//
// Das Beispiel zeigt das Mocking-Pattern anhand einer
// hypothetischen Hilfsfunktion, die einen Wechselkurs abruft.
// Die echte Implementierung liegt im Handler für
// /api/exchange-rates/latest in backend/routes/api-dispatch/finance.mjs.
// ------------------------------------------------------------
describe('Beispiel 3 — API-Call mit vi.spyOn mocken', () => {
  it.skip('fetchEurToUsd gibt den USD-Kurs aus der (gemockten) API-Antwort zurück', async () => {
    // fetch wird durch eine Fake-Funktion ersetzt, die sofort antwortet.
    // mockResolvedValueOnce gilt nur für EINEN Aufruf.
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ rates: { USD: 1.08 } }),
    });

    // Hypothetische Funktion (vereinfacht):
    //   async function fetchEurToUsd() {
    //     const res = await fetch('https://api.exchangerate.host/latest?base=EUR&symbols=USD');
    //     const data = await res.json();
    //     return data.rates.USD;
    //   }
    const rate = await fetchEurToUsd();

    expect(rate).toBe(1.08);
    // Sicherstellen, dass fetch genau einmal mit der richtigen URL aufgerufen wurde
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.exchangerate.host/latest?base=EUR&symbols=USD'
    );
  });
});


// ------------------------------------------------------------
// BEISPIEL 4 — Fehlerfall testen
//
// Was passiert: Funktionen, die bei ungültiger Eingabe `null`
// zurückgeben oder eine Exception werfen, werden gezielt mit
// kaputten Eingaben aufgerufen.
//
// Warum: Fehlerfälle sind genauso wichtig wie der Erfolgsfall.
// `parseObjectId` gibt `null` zurück wenn die ID kein gültiges
// MongoDB-ObjectId-Format hat. `toBeNull()` und `toThrow()` sind
// die passenden Matcher dafür.
// ------------------------------------------------------------
describe('Beispiel 4 — Fehlerfall testen', () => {
  it.skip('parseObjectId gibt null zurück für ungültige Eingaben', () => {
    // Zu kurze ID → kein gültiges ObjectId-Format
    expect(parseObjectId('kein-valid-id')).toBeNull();
    // null-Eingabe → früher Abbruch in der Funktion
    expect(parseObjectId(null)).toBeNull();
    // Leerer String → ebenfalls null
    expect(parseObjectId('')).toBeNull();
  });

  it.skip('normalizeRecurrence gibt null zurück für unbekannte Werte', () => {
    // Nur 'once', 'weekly', 'monthly' sind gültige Werte
    expect(normalizeRecurrence('täglich')).toBeNull();
    expect(normalizeRecurrence('jährlich')).toBeNull();
    expect(normalizeRecurrence('daily')).toBeNull();
  });

  it.skip('normalizeRecurrence akzeptiert gültige Werte unabhängig von Groß/Kleinschreibung', () => {
    // Groß/Kleinschreibung wird normalisiert
    expect(normalizeRecurrence('Monthly')).toBe('monthly');
    expect(normalizeRecurrence('WEEKLY')).toBe('weekly');
    expect(normalizeRecurrence('Once')).toBe('once');
  });
});


// ------------------------------------------------------------
// BEISPIEL 5 — afterEach mit vi.restoreAllMocks()
//
// Was passiert: Nach jedem Test stellt `vi.restoreAllMocks()`
// alle mit `vi.spyOn` gemockten Funktionen auf ihre ursprüngliche
// Implementierung zurück.
//
// Warum: Ohne Cleanup "leckt" ein Mock aus einem Test in den
// nächsten. Bleibt `fetch` gemockt, schlägt jeder nachfolgende
// Test fehl, der echtes Verhalten erwartet — oder läuft
// fehlerhaft durch, weil er noch den Fake trifft.
// `afterEach` läuft nach JEDEM einzelnen Test in diesem
// `describe`-Block automatisch.
// ------------------------------------------------------------
describe('Beispiel 5 — afterEach mit vi.restoreAllMocks()', () => {
  // Wird nach JEDEM it()-Block ausgeführt — auch nach fehlgeschlagenen.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.skip('erster Test mockt fetch und prüft die Antwort', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: 'abc123' }),
    });

    const res = await fetch('/api/login');
    const data = await res.json();
    expect(data.token).toBe('abc123');
    // Nach diesem Test: vi.restoreAllMocks() in afterEach stellt fetch wieder her
  });

  it.skip('zweiter Test trifft das originale (nicht gemockte) fetch', () => {
    // fetch ist hier wieder die originale Node.js-Funktion.
    // Ohne afterEach/restoreAllMocks wäre hier noch der Mock aktiv.
    expect(vi.isMockFunction(globalThis.fetch)).toBe(false);
  });
});
