import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  hashCode,
  verifyCode,
  isScryptPasswordHash,
  isSha256PasswordHash,
} from '../password';

describe('hashPassword', () => {
  it('produces a non-empty scrypt-prefixed hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toBeTruthy();
    expect(hash.startsWith('scrypt:')).toBe(true);
    const parts = hash.split(':');
    expect(parts).toHaveLength(3);
    expect(parts[1]).toMatch(/^[0-9a-f]+$/);
    expect(parts[2]).toMatch(/^[0-9a-f]+$/);
  });

  it('returns distinct hashes for identical input (random salt)', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
  });

  it('produces a hash that verifies against its source password', async () => {
    const hash = await hashPassword('verifiable-input');
    expect(await verifyPassword('verifiable-input', hash)).toBe(true);
  });
});

describe('verifyPassword', () => {
  it('rejects a wrong password', async () => {
    const hash = await hashPassword('right-one');
    expect(await verifyPassword('wrong-one', hash)).toBe(false);
  });

  it('returns false for an empty stored hash without throwing', async () => {
    expect(await verifyPassword('whatever', '')).toBe(false);
  });

  it('returns false for malformed scrypt hash (missing parts)', async () => {
    expect(await verifyPassword('x', 'scrypt:')).toBe(false);
    expect(await verifyPassword('x', 'scrypt:abcdef')).toBe(false);
  });

  it('returns false for an unrecognised hash format', async () => {
    expect(await verifyPassword('x', 'bcrypt$2a$10$xxxxxx')).toBe(false);
  });

  it('verifies sha256 legacy format', async () => {
    const enc = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-256', enc.encode('legacy-pw'));
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const stored = `sha256:${hex}`;
    expect(await verifyPassword('legacy-pw', stored)).toBe(true);
    expect(await verifyPassword('not-it', stored)).toBe(false);
  });

  it('returns false for sha256 prefix with empty digest', async () => {
    expect(await verifyPassword('x', 'sha256:')).toBe(false);
  });

  it('trims whitespace around the stored hash before verifying', async () => {
    const hash = await hashPassword('trim-me');
    expect(await verifyPassword('trim-me', `  ${hash}  `)).toBe(true);
  });
});

describe('hashCode / verifyCode', () => {
  it('round-trips a code without secret', async () => {
    const stored = await hashCode('123456');
    expect(await verifyCode('123456', stored)).toBe(true);
  });

  it('rejects an incorrect code', async () => {
    const stored = await hashCode('123456');
    expect(await verifyCode('654321', stored)).toBe(false);
  });

  it('round-trips an HMAC-keyed code', async () => {
    const stored = await hashCode('abc', 'pepper');
    expect(await verifyCode('abc', stored, 'pepper')).toBe(true);
    expect(await verifyCode('abc', stored, 'different-pepper')).toBe(false);
  });

  it('returns false for an empty stored hash without throwing', async () => {
    expect(await verifyCode('123456', '')).toBe(false);
  });

  it('returns false when stored hash has invalid hex length', async () => {
    expect(await verifyCode('123456', 'not-hex-at-all')).toBe(false);
  });
});

describe('isScryptPasswordHash / isSha256PasswordHash', () => {
  it('detects new scrypt format', () => {
    expect(isScryptPasswordHash('scrypt:abc:def')).toBe(true);
  });

  it('detects legacy scrypt format', () => {
    expect(isScryptPasswordHash('scrypt$abc$def')).toBe(true);
  });

  it('rejects non-scrypt hashes', () => {
    expect(isScryptPasswordHash('sha256:abc')).toBe(false);
    expect(isScryptPasswordHash('')).toBe(false);
  });

  it('detects sha256 format (both separators)', () => {
    expect(isSha256PasswordHash('sha256:abc')).toBe(true);
    expect(isSha256PasswordHash('sha256$abc')).toBe(true);
  });

  it('rejects non-sha256 hashes', () => {
    expect(isSha256PasswordHash('scrypt:abc:def')).toBe(false);
    expect(isSha256PasswordHash('')).toBe(false);
  });
});
