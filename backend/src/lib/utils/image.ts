export type SupportedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export function isValidImageBytes(bytes: Uint8Array, mime: SupportedImageMime): boolean {
  if (mime === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mime === 'image/png') {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (mime === 'image/webp') {
    return (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }
  return false;
}

export function decodeBase64Prefix(base64: string, maxBytes: number): Uint8Array {
  const charsForBytes = Math.ceil((maxBytes * 4) / 3);
  const slice = base64.slice(0, charsForBytes);
  const padded = slice + '='.repeat((4 - (slice.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(Math.min(binary.length, maxBytes));
  for (let i = 0; i < out.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
