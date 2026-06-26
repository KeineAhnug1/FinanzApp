import { describe, expect, it } from 'vitest';
import { detectBlockedRegistrationName } from '../blocked-names';

const baseInput = (
  username: unknown,
  firstName: unknown = '',
  lastName: unknown = '',
) => ({ username, firstName, lastName });

describe('detectBlockedRegistrationName', () => {
  it('returns null for a harmless name', () => {
    expect(
      detectBlockedRegistrationName(baseInput('flo', 'Flo', 'Mustermann')),
    ).toBeNull();
  });

  it('returns null when all fields are empty strings', () => {
    expect(detectBlockedRegistrationName(baseInput('', '', ''))).toBeNull();
  });

  it('returns null when all fields are nullish', () => {
    expect(
      detectBlockedRegistrationName(baseInput(null, undefined, null)),
    ).toBeNull();
  });

  it('detects a reserved system name (admin)', () => {
    expect(detectBlockedRegistrationName(baseInput('admin'))).toBe('admin');
  });

  it('matches the same term regardless of letter casing', () => {
    expect(detectBlockedRegistrationName(baseInput('Admin'))).toBe('admin');
    expect(detectBlockedRegistrationName(baseInput('ADMIN'))).toBe('admin');
  });

  it('ignores surrounding whitespace and punctuation', () => {
    expect(detectBlockedRegistrationName(baseInput('   admin   '))).toBe('admin');
    expect(detectBlockedRegistrationName(baseInput('.admin.'))).toBe('admin');
    expect(detectBlockedRegistrationName(baseInput('a-d-m-i-n'))).toBe('admin');
  });

  it('strips Unicode diacritics via NFKD so führer matches fuhrer', () => {
    expect(detectBlockedRegistrationName(baseInput('führer'))).toBe('fuhrer');
    expect(detectBlockedRegistrationName(baseInput('Führer'))).toBe('fuhrer');
  });

  it('matches on substring containment (administrator contains admin)', () => {
    expect(detectBlockedRegistrationName(baseInput('administrator'))).toBe('admin');
  });

  it('detects a blocked term embedded inside otherwise harmless characters', () => {
    expect(detectBlockedRegistrationName(baseInput('my-admin-account'))).toBe('admin');
  });

  it('joins username + firstName + lastName before checking', () => {
    expect(detectBlockedRegistrationName(baseInput('safe', 'ad', 'min'))).toBe('admin');
    expect(detectBlockedRegistrationName(baseInput('foo', 'bar', 'root'))).toBe('root');
  });

  it('does not collapse leetspeak digits into letters', () => {
    // '4dm1n' normalizes to '4dm1n' (digits remain digits); 'admin' is not a substring.
    expect(detectBlockedRegistrationName(baseInput('4dm1n'))).toBeNull();
  });

  it('does not match visually-similar Cyrillic look-alikes', () => {
    // Cyrillic capital 'А' (U+0410) has no NFKD decomposition to Latin 'A',
    // so it is stripped by the [^a-z0-9] filter, leaving 'dmin' — not blocked.
    expect(detectBlockedRegistrationName(baseInput('Аdmin'))).toBeNull();
  });

  it('coerces non-string inputs via String() before normalizing', () => {
    expect(detectBlockedRegistrationName(baseInput(123, 'admin', 456))).toBe('admin');
  });

  it('returns the matched term in its already-normalized form', () => {
    expect(detectBlockedRegistrationName(baseInput('Hitler'))).toBe('hitler');
  });

  it('matches purely numeric extremist codes as substrings', () => {
    expect(detectBlockedRegistrationName(baseInput('user1488'))).not.toBeNull();
  });
});
