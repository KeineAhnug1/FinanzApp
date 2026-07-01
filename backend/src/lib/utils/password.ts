// scrypt password hashing via Web Crypto (crypto.subtle) — Edge-compatible.
const SCRYPT_KEY_LEN = 64;
const SCRYPT_SALT_LEN = 32;

function bufToHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return arr;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password).buffer as ArrayBuffer, 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    SCRYPT_KEY_LEN * 8,
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(SCRYPT_SALT_LEN);
  crypto.getRandomValues(salt);
  const hash = await deriveKey(password, salt);
  return `scrypt:${bufToHex(salt)}:${bufToHex(hash)}`;
}

// Verify a legacy scrypt hash (format: scrypt$saltHex$hashHex) using node:crypto scrypt
async function verifyLegacyScrypt(password: string, saltHex: string, hashHex: string): Promise<boolean> {
  try {
    // @ts-ignore — node:crypto available via nodejs_compat flag in wrangler
    const nodeCrypto = await import('node:crypto') as { scrypt: Function; timingSafeEqual: Function };
    const keylen = hashHex.length / 2;
    return await new Promise<boolean>((resolve) => {
      nodeCrypto.scrypt(password, saltHex, keylen, (err: unknown, derived: Uint8Array) => {
        if (err) return resolve(false);
        try {
          const expected = hexToBuf(hashHex);
          if (derived.length !== expected.length) return resolve(false);
          resolve(nodeCrypto.timingSafeEqual(derived, expected));
        } catch { resolve(false); }
      });
    });
  } catch { return false; }
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  stored = stored.trim();

  if (stored.startsWith('scrypt:')) {
    // New format: scrypt:saltHex:hashHex (PBKDF2-SHA256)
    const [, saltHex, hashHex] = stored.split(':');
    if (!saltHex || !hashHex) return false;
    const derived = await deriveKey(password, hexToBuf(saltHex));
    const a = new Uint8Array(derived);
    const b = hexToBuf(hashHex);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
    return diff === 0;
  }
  if (stored.startsWith('scrypt$')) {
    // Legacy format: scrypt$saltHex$hashHex (node:crypto scrypt)
    const parts = stored.split('$');
    if (parts.length !== 3 || !parts[1] || !parts[2]) return false;
    return verifyLegacyScrypt(password, parts[1], parts[2]);
  }
  if (stored.startsWith('sha256:') || stored.startsWith('sha256$')) {
    const hashHex = stored.slice(7);
    if (!hashHex) return false;
    const enc = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(password));
    const derived = bufToHex(digest);
    if (derived.length !== hashHex.length) return false;
    let diff = 0;
    for (let i = 0; i < derived.length; i++) diff |= (derived.charCodeAt(i) ?? 0) ^ (hashHex.charCodeAt(i) ?? 0);
    return diff === 0;
  }
  return false;
}

export async function hashCode(code: string, secret?: string): Promise<string> {
  const enc = new TextEncoder();
  const str = String(code);
  if (secret) {
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(str));
    return bufToHex(sig);
  }
  return bufToHex(await crypto.subtle.digest('SHA-256', enc.encode(str)));
}

export async function verifyCode(code: string, storedHash: string, secret?: string): Promise<boolean> {
  try {
    const a = hexToBuf(await hashCode(String(code), secret));
    const b = hexToBuf(String(storedHash ?? ''));
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
    return diff === 0;
  } catch { return false; }
}

export const isScryptPasswordHash = (h: string): boolean => typeof h === 'string' && (h.startsWith('scrypt:') || h.startsWith('scrypt$'));
export const isSha256PasswordHash = (h: string): boolean => typeof h === 'string' && (h.startsWith('sha256:') || h.startsWith('sha256$'));
