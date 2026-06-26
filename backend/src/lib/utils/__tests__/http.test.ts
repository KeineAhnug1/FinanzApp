import { describe, expect, it } from 'vitest';
import { isSecure, parseBody } from '../http';

const jsonReq = (body: unknown, headers: Record<string, string> = {}): Request =>
  new Request('http://test.local/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('parseBody', () => {
  it('parses a JSON body', async () => {
    const result = await parseBody<{ name: string; age: number }>(
      jsonReq({ name: 'Ada', age: 36 }),
    );
    expect(result).toEqual({ name: 'Ada', age: 36 });
  });

  it('extracts fields from a multipart/form-data body', async () => {
    const fd = new FormData();
    fd.append('email', 'ada@example.com');
    fd.append('plan', 'pro');
    const r = new Request('http://test.local/', { method: 'POST', body: fd });
    const result = await parseBody<Record<string, unknown>>(r);
    expect(result.email).toBe('ada@example.com');
    expect(result.plan).toBe('pro');
  });

  it('extracts fields from application/x-www-form-urlencoded body', async () => {
    const r = new Request('http://test.local/', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'a=1&b=two',
    });
    const result = await parseBody<Record<string, unknown>>(r);
    expect(result.a).toBe('1');
    expect(result.b).toBe('two');
  });

  it('returns an empty object for invalid JSON', async () => {
    const result = await parseBody(jsonReq('{not-json'));
    expect(result).toEqual({});
  });

  it('returns an empty object when content-type is unsupported', async () => {
    const r = new Request('http://test.local/', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'hello',
    });
    expect(await parseBody(r)).toEqual({});
  });
});

describe('isSecure', () => {
  it('treats https:// URLs as secure', () => {
    expect(isSecure(new Request('https://example.com/'))).toBe(true);
  });

  it('treats plain http:// URLs without overrides as insecure', () => {
    expect(isSecure(new Request('http://example.com/'))).toBe(false);
  });

  it('respects x-forwarded-proto=https on an http URL', () => {
    const r = new Request('http://example.com/', {
      headers: { 'x-forwarded-proto': 'https' },
    });
    expect(isSecure(r)).toBe(true);
  });

  it('respects cf-visitor scheme=https on an http URL', () => {
    const r = new Request('http://example.com/', {
      headers: { 'cf-visitor': '{"scheme":"https"}' },
    });
    expect(isSecure(r)).toBe(true);
  });
});
