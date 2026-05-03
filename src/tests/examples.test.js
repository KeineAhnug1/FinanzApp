import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  parsePositiveAmount,
  parseIncome,
  parseObjectId,
  normalizeRecurrence,
  normalizeEmail,
  parseBoolean,
  categoryKey,
  escapeRegex,
  uniqueCategoryList,
  normalizeCategoryValue,
} from '../../backend/utils/data.mjs';
import {
  hashPassword,
  verifyPassword,
  hashValue,
  isScryptPasswordHash,
  isSha256PasswordHash,
} from '../../backend/utils/password.mjs';
import { parseCookies, sendJson, readBody } from '../../backend/utils/http.mjs';


describe('parsePositiveAmount', () => {
  it('gibt eine positive Zahl korrekt zurück', () => {
    expect(parsePositiveAmount('42.5')).toBe(42.50);
  });

  it('rundet auf zwei Nachkommastellen', () => {
    expect(parsePositiveAmount('9.999')).toBe(10.00);
  });

  it('gibt null zurück für negative Zahlen', () => {
    expect(parsePositiveAmount(-5)).toBeNull();
  });

  it('gibt null zurück für null', () => {
    expect(parsePositiveAmount(null)).toBeNull();
  });

  it('gibt null zurück für null bei null-Eingabe', () => {
    expect(parsePositiveAmount(0)).toBeNull();
  });

  it('gibt null zurück für leeren String', () => {
    expect(parsePositiveAmount('')).toBeNull();
  });

  it('gibt null zurück für nicht-numerischen String', () => {
    expect(parsePositiveAmount('abc')).toBeNull();
  });
});


describe('parseIncome', () => {
  it('akzeptiert den Wert 0', () => {
    expect(parseIncome(0)).toBe(0);
  });

  it('akzeptiert positive Zahlen', () => {
    expect(parseIncome('1500.50')).toBe(1500.50);
  });

  it('rundet auf zwei Nachkommastellen', () => {
    expect(parseIncome('1.999')).toBe(2.00);
  });

  it('gibt null zurück für negative Zahlen', () => {
    expect(parseIncome(-1)).toBeNull();
  });

  it('gibt null zurück für nicht-numerische Werte', () => {
    expect(parseIncome('xyz')).toBeNull();
  });
});


describe('parseObjectId', () => {
  it('gibt null zurück für null', () => {
    expect(parseObjectId(null)).toBeNull();
  });

  it('gibt null zurück für leeren String', () => {
    expect(parseObjectId('')).toBeNull();
  });

  it('gibt null zurück für ungültige ID', () => {
    expect(parseObjectId('kein-valid-id')).toBeNull();
  });

  it('gibt eine ObjectId zurück für gültige 24-stellige Hex-ID', () => {
    const validId = '507f1f77bcf86cd799439011';
    const result = parseObjectId(validId);
    expect(result).not.toBeNull();
    expect(result.toHexString()).toBe(validId);
  });
});


describe('normalizeRecurrence', () => {
  it('gibt null zurück für unbekannte Werte', () => {
    expect(normalizeRecurrence('täglich')).toBeNull();
    expect(normalizeRecurrence('jährlich')).toBeNull();
    expect(normalizeRecurrence('daily')).toBeNull();
  });

  it('akzeptiert gültige Werte in Kleinschreibung', () => {
    expect(normalizeRecurrence('once')).toBe('once');
    expect(normalizeRecurrence('weekly')).toBe('weekly');
    expect(normalizeRecurrence('monthly')).toBe('monthly');
  });

  it('normalisiert Groß-/Kleinschreibung', () => {
    expect(normalizeRecurrence('Monthly')).toBe('monthly');
    expect(normalizeRecurrence('WEEKLY')).toBe('weekly');
    expect(normalizeRecurrence('Once')).toBe('once');
  });

  it('gibt "once" zurück für leeren String', () => {
    expect(normalizeRecurrence('')).toBe('once');
  });
});


describe('normalizeEmail', () => {
  it('wandelt in Kleinbuchstaben um', () => {
    expect(normalizeEmail('Test@Example.COM')).toBe('test@example.com');
  });

  it('entfernt führende und nachfolgende Leerzeichen', () => {
    expect(normalizeEmail('  user@test.de  ')).toBe('user@test.de');
  });

  it('gibt leeren String für null zurück', () => {
    expect(normalizeEmail(null)).toBe('');
  });
});


describe('parseBoolean', () => {
  it('gibt true zurück für boolean true', () => {
    expect(parseBoolean(true)).toBe(true);
  });

  it('gibt false zurück für boolean false', () => {
    expect(parseBoolean(false)).toBe(false);
  });

  it('parst den String "true"', () => {
    expect(parseBoolean('true')).toBe(true);
  });

  it('parst den String "false"', () => {
    expect(parseBoolean('false')).toBe(false);
  });

  it('gibt den Fallback zurück für unbekannte Werte', () => {
    expect(parseBoolean('ja', false)).toBe(false);
    expect(parseBoolean(null, true)).toBe(true);
  });
});


describe('categoryKey', () => {
  it('gibt den lowercase-Schlüssel zurück', () => {
    expect(categoryKey('Lebensmittel')).toBe('lebensmittel');
  });

  it('trimmt Leerzeichen und normalisiert', () => {
    expect(categoryKey('  Sport  ')).toBe('sport');
  });
});


describe('escapeRegex', () => {
  it('escaped Sonderzeichen für Regex', () => {
    expect(escapeRegex('Preis: 5.00 €')).toBe('Preis: 5\\.00 €');
  });

  it('escaped Klammern und andere Metazeichen', () => {
    expect(escapeRegex('(test)')).toBe('\\(test\\)');
  });

  it('lässt normale Strings unverändert', () => {
    expect(escapeRegex('hello')).toBe('hello');
  });
});


describe('uniqueCategoryList', () => {
  it('dedupliziert Kategorien case-insensitiv', () => {
    const result = uniqueCategoryList(['Sport', 'sport', 'SPORT']);
    expect(result).toHaveLength(1);
  });

  it('sortiert das Ergebnis alphabetisch', () => {
    const result = uniqueCategoryList(['Essen', 'Auto', 'Bildung']);
    expect(result).toEqual(['Auto', 'Bildung', 'Essen']);
  });

  it('ignoriert leere Einträge', () => {
    const result = uniqueCategoryList(['', '  ', 'Miete']);
    expect(result).toEqual(['Miete']);
  });

  it('gibt ein leeres Array für null/undefined zurück', () => {
    expect(uniqueCategoryList(null)).toEqual([]);
    expect(uniqueCategoryList(undefined)).toEqual([]);
  });
});


describe('hashValue', () => {
  it('gibt einen SHA-256-Hex-String zurück', () => {
    const result = hashValue('test');
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ist deterministisch', () => {
    expect(hashValue('abc')).toBe(hashValue('abc'));
  });

  it('erzeugt unterschiedliche Hashes für unterschiedliche Eingaben', () => {
    expect(hashValue('abc')).not.toBe(hashValue('def'));
  });
});


describe('isScryptPasswordHash / isSha256PasswordHash', () => {
  it('erkennt scrypt-Hashes am Präfix', () => {
    expect(isScryptPasswordHash('scrypt$salt$derived')).toBe(true);
    expect(isScryptPasswordHash('sha256$abc')).toBe(false);
    expect(isScryptPasswordHash('')).toBe(false);
    expect(isScryptPasswordHash(null)).toBe(false);
  });

  it('erkennt sha256-Hashes am Präfix', () => {
    expect(isSha256PasswordHash('sha256$abc')).toBe(true);
    expect(isSha256PasswordHash('scrypt$salt$derived')).toBe(false);
    expect(isSha256PasswordHash('')).toBe(false);
  });
});


describe('hashPassword und verifyPassword', () => {
  it('hashPassword erzeugt einen scrypt-Hash', async () => {
    const hash = await hashPassword('meinPasswort123');
    expect(hash).toMatch(/^scrypt\$/);
  });

  it('verifyPassword bestätigt das richtige Passwort', async () => {
    const hash = await hashPassword('meinPasswort123');
    const result = await verifyPassword('meinPasswort123', hash);
    expect(result).toBe(true);
  });

  it('verifyPassword schlägt fehl bei falschem Passwort', async () => {
    const hash = await hashPassword('richtig');
    const result = await verifyPassword('falsch', hash);
    expect(result).toBe(false);
  });

  it('verifyPassword lehnt den Hash selbst als Passwort ab', async () => {
    const hash = await hashPassword('test');
    const result = await verifyPassword(hash, hash);
    expect(result).toBe(false);
  });

  it('verifyPassword gibt false zurück wenn der gespeicherte Hash leer ist', async () => {
    const result = await verifyPassword('passwort', '');
    expect(result).toBe(false);
  });
});


describe('parseCookies', () => {
  function mockReqWithCookie(cookieHeader) {
    return { headers: { cookie: cookieHeader } };
  }

  it('gibt ein leeres Objekt zurück wenn kein Cookie-Header gesetzt ist', () => {
    expect(parseCookies({ headers: {} })).toEqual({});
  });

  it('parst einen einzelnen Cookie', () => {
    const req = mockReqWithCookie('session=abc123');
    expect(parseCookies(req)).toEqual({ session: 'abc123' });
  });

  it('parst mehrere Cookies', () => {
    const req = mockReqWithCookie('a=1; b=2; c=3');
    expect(parseCookies(req)).toEqual({ a: '1', b: '2', c: '3' });
  });

  it('dekodiert URL-enkodierte Cookie-Werte', () => {
    const req = mockReqWithCookie('name=Max%20Mustermann');
    expect(parseCookies(req)).toEqual({ name: 'Max Mustermann' });
  });
});


describe('sendJson', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ruft writeHead mit dem richtigen Statuscode und Content-Type auf', () => {
    const res = { writeHead: vi.fn(), end: vi.fn() };
    sendJson(res, 200, { ok: true });
    expect(res.writeHead).toHaveBeenCalledOnce();
    const [statusCode, headers] = res.writeHead.mock.calls[0];
    expect(statusCode).toBe(200);
    expect(headers['Content-Type']).toBe('application/json; charset=utf-8');
  });

  it('serialisiert die Payload als JSON in den Body', () => {
    const res = { writeHead: vi.fn(), end: vi.fn() };
    sendJson(res, 201, { id: '42', name: 'Test' });
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ id: '42', name: 'Test' }));
  });

  it('setzt den richtigen HTTP-Statuscode bei Fehlerantworten', () => {
    const res = { writeHead: vi.fn(), end: vi.fn() };
    sendJson(res, 404, { error: 'not_found' });
    const [statusCode] = res.writeHead.mock.calls[0];
    expect(statusCode).toBe(404);
  });

  it('fügt extra Headers hinzu', () => {
    const res = { writeHead: vi.fn(), end: vi.fn() };
    sendJson(res, 200, {}, { 'X-Custom': 'wert' });
    const [, headers] = res.writeHead.mock.calls[0];
    expect(headers['X-Custom']).toBe('wert');
  });
});


describe('readBody', () => {
  function mockRequest(bodyObject) {
    const emitter = new EventEmitter();
    emitter.headers = {};
    process.nextTick(() => {
      emitter.emit('data', Buffer.from(JSON.stringify(bodyObject)));
      emitter.emit('end');
    });
    return emitter;
  }

  it('liest und parst einen JSON-Body', async () => {
    const req = mockRequest({ name: 'Test', amount: 42 });
    const body = await readBody(req);
    expect(body).toEqual({ name: 'Test', amount: 42 });
  });

  it('gibt ein leeres Objekt zurück bei leerem Body', async () => {
    const emitter = new EventEmitter();
    emitter.headers = {};
    process.nextTick(() => emitter.emit('end'));
    const body = await readBody(emitter);
    expect(body).toEqual({});
  });

  it('wirft einen Fehler bei ungültigem JSON', async () => {
    const emitter = new EventEmitter();
    emitter.headers = {};
    process.nextTick(() => {
      emitter.emit('data', Buffer.from('kein json {{{'));
      emitter.emit('end');
    });
    await expect(readBody(emitter)).rejects.toThrow('invalid_json');
  });

  it('wirft einen Fehler wenn der Body größer als 1 MB ist', async () => {
    const emitter = new EventEmitter();
    emitter.destroy = vi.fn();
    emitter.headers = {};
    process.nextTick(() => {
      emitter.emit('data', Buffer.alloc(1_100_000));
      emitter.emit('end');
    });
    await expect(readBody(emitter)).rejects.toThrow('payload_too_large');
  });
});
