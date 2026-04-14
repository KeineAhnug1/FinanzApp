import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const PASSWORD_HASH_PREFIX = "scrypt$";
export const PASSWORD_HASH_SHA256_PREFIX = "sha256$";
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEYLEN = 64;

export function hashValue(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function isScryptPasswordHash(value) {
  return typeof value === "string" && value.startsWith(PASSWORD_HASH_PREFIX);
}

export function isSha256PasswordHash(value) {
  return typeof value === "string" && value.startsWith(PASSWORD_HASH_SHA256_PREFIX);
}

export async function hashPassword(plainPassword) {
  const password = String(plainPassword || "");
  const salt = randomBytes(PASSWORD_SALT_BYTES).toString("hex");
  const derived = (await scryptAsync(password, salt, PASSWORD_KEYLEN)).toString("hex");
  return `${PASSWORD_HASH_PREFIX}${salt}$${derived}`;
}

export async function verifyPassword(plainPassword, storedPassword) {
  const plain = String(plainPassword || "");
  const stored = String(storedPassword || "");

  if (!stored) return false;

  // Reject attempts to log in using a hash string directly.
  // A valid plain password must never start with a known hash prefix.
  if (isScryptPasswordHash(plain) || isSha256PasswordHash(plain)) return false;

  if (isScryptPasswordHash(stored)) {
    const parts = stored.split("$");
    if (parts.length !== 3) return false;

    const salt = parts[1];
    const expectedHex = parts[2];

    try {
      const expected = Buffer.from(expectedHex, "hex");
      const actual = await scryptAsync(plain, salt, expected.length);
      if (actual.length !== expected.length) return false;
      return timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }

  if (isSha256PasswordHash(stored)) {
    const expectedHash = stored.slice(PASSWORD_HASH_SHA256_PREFIX.length);
    return hashValue(plain) === expectedHash;
  }

  // Plaintext fallback only for legacy migration – never stored new
  return plain === stored;
}
