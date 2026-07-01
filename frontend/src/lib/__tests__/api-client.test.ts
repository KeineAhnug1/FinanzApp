import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { apiUrl, getCsrfToken, invalidateCsrfCache } from '../api-client';

describe('apiUrl', () => {
  const originalBase = process.env.NEXT_PUBLIC_API_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = originalBase;
  });

  it('returns the path unchanged when no base URL is configured', () => {
    process.env.NEXT_PUBLIC_API_URL = '';
    expect(apiUrl('/api/auth/session')).toBe('/api/auth/session');
  });

  it('prefixes the path with a configured base URL', () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';
    expect(apiUrl('/api/auth/session')).toBe('https://api.example.com/api/auth/session');
  });

  it('strips a trailing slash from the base URL', () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com/';
    expect(apiUrl('/api/foo')).toBe('https://api.example.com/api/foo');
  });
});

describe('getCsrfToken', () => {
  beforeEach(() => {
    document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    invalidateCsrfCache();
  });

  it('returns the token when the csrf_token cookie is set', () => {
    document.cookie = 'csrf_token=abc123; path=/';
    expect(getCsrfToken()).toBe('abc123');
  });

  it('returns an empty string when the cookie is missing', () => {
    expect(getCsrfToken()).toBe('');
  });

  it('decodes URL-encoded token values', () => {
    document.cookie = 'csrf_token=' + encodeURIComponent('a/b+c=') + '; path=/';
    expect(getCsrfToken()).toBe('a/b+c=');
  });

  it('ignores unrelated cookies and reads csrf_token specifically', () => {
    document.cookie = 'other=foo; path=/';
    document.cookie = 'csrf_token=zzz; path=/';
    expect(getCsrfToken()).toBe('zzz');
  });
});

describe('invalidateCsrfCache', () => {
  it('is callable without throwing', () => {
    expect(() => invalidateCsrfCache()).not.toThrow();
  });
});
