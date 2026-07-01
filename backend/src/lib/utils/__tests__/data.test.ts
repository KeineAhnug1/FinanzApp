import { describe, expect, it } from 'vitest';
import { normalizeEmail } from '../data';
import { getCsrfTokenFromCookies, buildCsrfCookie, clearCsrfCookie, generateCsrfToken } from '../csrf';

describe('normalizeEmail', () => {
  it('lowercases and trims input', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
  });

  it('returns empty string for nullish input', () => {
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(undefined)).toBe('');
  });

  it('coerces non-string values', () => {
    expect(normalizeEmail(42)).toBe('42');
  });
});

describe('getCsrfTokenFromCookies', () => {
  it('returns null when header is missing', () => {
    expect(getCsrfTokenFromCookies(null)).toBeNull();
  });

  it('extracts the csrf_token value', () => {
    expect(getCsrfTokenFromCookies('a=1; csrf_token=abc123; b=2')).toBe('abc123');
  });

  it('returns null when csrf_token is absent', () => {
    expect(getCsrfTokenFromCookies('session=xyz; other=1')).toBeNull();
  });

  it('decodes URI-encoded values', () => {
    expect(getCsrfTokenFromCookies('csrf_token=hello%20world')).toBe('hello world');
  });
});

describe('buildCsrfCookie / clearCsrfCookie', () => {
  it('builds an insecure cookie with SameSite=Lax', () => {
    const cookie = buildCsrfCookie('tok');
    expect(cookie).toContain('csrf_token=tok');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
  });

  it('builds a secure cookie with SameSite=None and Secure flag', () => {
    const cookie = buildCsrfCookie('tok', true);
    expect(cookie).toContain('SameSite=None');
    expect(cookie).toContain('Secure');
  });

  it('clears the cookie with Max-Age=0', () => {
    const cookie = clearCsrfCookie();
    expect(cookie).toContain('csrf_token=');
    expect(cookie).toContain('Max-Age=0');
  });
});

describe('generateCsrfToken', () => {
  it('produces a 48-char hex string', () => {
    const token = generateCsrfToken();
    expect(token).toMatch(/^[0-9a-f]{48}$/);
  });

  it('produces distinct tokens across calls', () => {
    expect(generateCsrfToken()).not.toBe(generateCsrfToken());
  });
});
