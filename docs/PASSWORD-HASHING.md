# Password Hashing — Design Decision

## Runtime constraint

The backend runs on **Cloudflare Workers**. The hashing primitive must be available without
`nodejs_compat`, must not pull in native bindings, and must run on `crypto.subtle`.

## Chosen algorithm

**PBKDF2 with SHA-256, 100 000 iterations, 32-byte salt (random), 64-byte derived key.**
Implemented via `crypto.subtle.deriveBits` in `backend/src/lib/utils/password.ts`.
Equality check uses a constant-time XOR-accumulating compare.

The legacy Node-based `scrypt` path (under the `scrypt$…$…` prefix) is read-only and uses
`node:crypto.timingSafeEqual` only when verifying old records that pre-date the Edge migration.

## Why not bcrypt

- The native `bcrypt` package is a C/N-API addon — it cannot load inside a Worker isolate.
- `bcryptjs` is pure JS but is *slow* on V8 isolates, has known non-constant-time codepaths
  in its compare helper, and balloons the bundle by ~30 KB for no security gain over PBKDF2.
- Bcrypt silently **truncates passwords at 72 bytes**. PBKDF2-SHA256 handles arbitrary length.
- PBKDF2-SHA256 with 100k iterations is FIPS-approved and gives equivalent practical security
  to bcrypt cost=10 for our threat model (online attacker against an Edge worker). Argon2id
  would be stronger but, like bcrypt, requires WASM and pushes us off the Web Crypto API.

## Supported on-disk formats

| Prefix | Format | Status |
|---|---|---|
| `scrypt:` | `scrypt:saltHex:hashHex` — PBKDF2-SHA256 derived bits | **Current.** All new hashes use this. |
| `scrypt$` | `scrypt$saltHex$hashHex` — Node `crypto.scrypt` derived bytes | Legacy (read-only). Records from before the Edge migration. |
| `sha256:` / `sha256$` | `sha256:hex` — unsalted SHA-256 digest | Deprecated. Read-only for the few records that still carry it. |

The `scrypt:` prefix is the only format produced by `hashPassword()`. The other two only
ever appear during `verifyPassword()` as transparent fallbacks.

## Migration story

No DB migration is required. On the next successful login of a user whose stored hash is
legacy or deprecated, the auth route can re-hash with `hashPassword()` and overwrite the
column — the verify path already accepts all three formats. Until that happens, legacy
records continue to verify correctly.

## Operational notes

- **Salt:** 32 random bytes (`SCRYPT_SALT_LEN`) from `crypto.getRandomValues` per password.
  Salt is sent through PBKDF2 as raw bytes and stored hex-encoded.
- **Iterations:** 100 000 (PBKDF2-SHA256). Tunable in `deriveKey()`.
- **Derived key length:** 64 bytes (512 bits).
- **Comparison:** XOR-accumulator over equal-length byte arrays — early-return only on
  length mismatch, otherwise constant-time across all bytes.
- **Empty password:** allowed by the primitive (PBKDF2 of zero-length input is well-defined).
  Application-level validation must reject empty passwords at the route layer; the hashing
  utility itself is unopinionated.
- **Unicode:** passwords are UTF-8 encoded via `TextEncoder` before being fed to PBKDF2, so
  multi-byte characters (umlauts, emoji, currency symbols) round-trip correctly.
- **Whitespace:** the stored hash is trimmed before parsing, but the **password is not
  trimmed**. `"abc "` and `"abc"` are different passwords by design.

## When to revisit

- If Cloudflare ships first-class Argon2 in `crypto.subtle`, migrate to Argon2id (re-hash on
  login, same migration path as above).
- If iteration count needs raising for compute-hardening, bump the constant in `deriveKey()`
  and let the legacy-on-login re-hash pattern carry old records forward.
