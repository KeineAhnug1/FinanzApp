import { describe, expect, it } from 'vitest';
import { isValidImageBytes, decodeBase64Prefix } from '../image';

describe('isValidImageBytes', () => {
  it('accepts a valid JPEG signature', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(isValidImageBytes(bytes, 'image/jpeg')).toBe(true);
  });

  it('accepts a valid PNG signature', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(isValidImageBytes(bytes, 'image/png')).toBe(true);
  });

  it('accepts a valid WebP signature', () => {
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(isValidImageBytes(bytes, 'image/webp')).toBe(true);
  });

  it('rejects mismatched magic bytes', () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(isValidImageBytes(pngBytes, 'image/jpeg')).toBe(false);
  });

  it('rejects truncated headers', () => {
    expect(isValidImageBytes(new Uint8Array([0xff, 0xd8]), 'image/jpeg')).toBe(false);
    expect(isValidImageBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'image/png')).toBe(false);
    expect(
      isValidImageBytes(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]), 'image/webp'),
    ).toBe(false);
  });

  it('rejects an empty byte array', () => {
    expect(isValidImageBytes(new Uint8Array(), 'image/jpeg')).toBe(false);
    expect(isValidImageBytes(new Uint8Array(), 'image/png')).toBe(false);
    expect(isValidImageBytes(new Uint8Array(), 'image/webp')).toBe(false);
  });

  it('rejects a WebP with wrong inner marker', () => {
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20,
    ]);
    expect(isValidImageBytes(bytes, 'image/webp')).toBe(false);
  });
});

describe('decodeBase64Prefix', () => {
  it('decodes only the requested prefix length', () => {
    const full = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x99, 0x99, 0x99]);
    const base64 = btoa(String.fromCharCode(...full));
    const decoded = decodeBase64Prefix(base64, 8);
    expect(Array.from(decoded)).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('handles non-aligned base64 input by padding', () => {
    const full = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    const base64 = btoa(String.fromCharCode(...full));
    const decoded = decodeBase64Prefix(base64, 3);
    expect(Array.from(decoded)).toEqual([0xff, 0xd8, 0xff]);
  });

  it('throws on invalid base64', () => {
    expect(() => decodeBase64Prefix('@@@not-base64@@@', 8)).toThrow();
  });
});
