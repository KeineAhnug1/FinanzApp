import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkRateLimit, getClientIp, rateLimitBucket } from '../rate-limit';

const req = (headers: Record<string, string> = {}, url = 'http://test.local/'): Request =>
  new Request(url, { headers });

describe('getClientIp', () => {
  it('prefers cf-connecting-ip over other headers', () => {
    const r = req({
      'cf-connecting-ip': '1.1.1.1',
      'x-forwarded-for': '2.2.2.2',
      'x-real-ip': '3.3.3.3',
    });
    expect(getClientIp(r)).toBe('1.1.1.1');
  });

  it('falls back to first entry of x-forwarded-for', () => {
    const r = req({ 'x-forwarded-for': '4.4.4.4, 5.5.5.5, 6.6.6.6' });
    expect(getClientIp(r)).toBe('4.4.4.4');
  });

  it('falls back to x-real-ip when forwarded headers are absent', () => {
    const r = req({ 'x-real-ip': '7.7.7.7' });
    expect(getClientIp(r)).toBe('7.7.7.7');
  });

  it('returns "unknown" when no IP headers are present', () => {
    expect(getClientIp(req())).toBe('unknown');
  });
});

describe('rateLimitBucket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows the first hit and tracks subsequent hits within the window', () => {
    const key = `unit:first:${Math.random()}`;
    expect(rateLimitBucket(key, 3, 1000)).toBe(true);
    expect(rateLimitBucket(key, 3, 1000)).toBe(true);
    expect(rateLimitBucket(key, 3, 1000)).toBe(true);
  });

  it('returns false once the limit is exceeded inside the window', () => {
    const key = `unit:limit:${Math.random()}`;
    rateLimitBucket(key, 2, 1000);
    rateLimitBucket(key, 2, 1000);
    expect(rateLimitBucket(key, 2, 1000)).toBe(false);
  });

  it('resets the counter once the window has elapsed', () => {
    const key = `unit:reset:${Math.random()}`;
    rateLimitBucket(key, 1, 1000);
    expect(rateLimitBucket(key, 1, 1000)).toBe(false);
    vi.advanceTimersByTime(1500);
    expect(rateLimitBucket(key, 1, 1000)).toBe(true);
  });
});

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null while requests stay below the limit', () => {
    const r = req({ 'cf-connecting-ip': '10.0.0.1' });
    const result = checkRateLimit(r, { maxAttempts: 5, windowMs: 1000, group: 'allow-test' });
    expect(result).toBeNull();
  });

  it('returns a 429 JSON response once the limit is exceeded', async () => {
    const r = req({ 'cf-connecting-ip': '10.0.0.2' });
    const opts = { maxAttempts: 2, windowMs: 1000, group: 'block-test' };
    expect(checkRateLimit(r, opts)).toBeNull();
    expect(checkRateLimit(r, opts)).toBeNull();
    const blocked = checkRateLimit(r, opts);
    expect(blocked).toBeInstanceOf(Response);
    expect(blocked?.status).toBe(429);
    const body = (await blocked!.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(false);
    expect(body.message).toMatch(/Zu viele Anfragen/);
  });

  it('isolates buckets per group, so a different group still allows traffic from the same IP', () => {
    const r = req({ 'cf-connecting-ip': '10.0.0.3' });
    const opts = { maxAttempts: 1, windowMs: 1000 };
    expect(checkRateLimit(r, { ...opts, group: 'iso-a' })).toBeNull();
    expect(checkRateLimit(r, { ...opts, group: 'iso-a' })).not.toBeNull();
    expect(checkRateLimit(r, { ...opts, group: 'iso-b' })).toBeNull();
  });
});
