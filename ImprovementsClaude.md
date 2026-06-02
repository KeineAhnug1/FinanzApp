# ImprovementsClaude.md — Verbesserungsvorschläge für FinanzApp

> Automatisch generiert durch KI-Analyse mit 8 parallelen Experten-Agenten.
> Analysedatum: 2. Juni 2026

---

## Zusammenfassung

| Kategorie | Findings | Hoch | Mittel | Niedrig |
|-----------|----------|------|--------|---------|
| 🔒 Sicherheit (Security) | 17 | 5 | 7 | 5 |
| 🧪 Testing & DevOps | 14 | 6 | 4 | 4 |
| ♿ UX & Accessibility | 15 | 7 | 5 | 3 |
| 🐛 Frontend-Bugs (Stocks/Groups/Accounts) | 15 | 4 | 7 | 4 |
| ⚙️ Backend-Qualität & Datenintegrität | 19 | 4 | 9 | 6 |
| ⚡ Performance & Optimierung | 13 | 5 | 6 | 2 |
| 🧹 Frontend-Codequalität (Dashboard) | 17 | 5 | 9 | 3 |
| 🗄️ Datenbank & Architektur | 22 | 7 | 11 | 4 |
| **Gesamt** | **132** | **43** | **58** | **31** |

---

## 🔒 Sicherheit (Security)

### 1. TLS Certificate Validation Disabled for PostgreSQL Connection

**Priorität:** 🔴 `HIGH`  
**Datei/Ort:** `backend/server.mjs:32`

**Problem:**
The PostgreSQL connection pool is created with `ssl: { rejectUnauthorized: false }`. This disables certificate verification for the database connection, making it vulnerable to man-in-the-middle attacks. An attacker on the same network path between the app server and the database can intercept or modify all database traffic including user credentials, financial data, and session tokens.

**Empfehlung:**
Use a proper CA certificate bundle instead of disabling verification:
```js
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync('/path/to/ca-cert.pem').toString()
  }
});
```
For managed services like Supabase, the CA bundle can be downloaded from the dashboard.

---

### 2. Missing Content Security Policy (CSP) and Other Security Headers

**Priorität:** 🔴 `HIGH`  
**Datei/Ort:** `backend/server.mjs (handleStatic, sendJson), backend/utils/http.mjs:sendJson`

**Problem:**
The application sets `X-Content-Type-Options: nosniff` and `X-Frame-Options: SAMEORIGIN` on some responses, but there is no Content-Security-Policy header anywhere in the codebase. There is also no `Strict-Transport-Security` (HSTS), no `Referrer-Policy`, and no `Permissions-Policy` header. Without CSP, the app has no defense-in-depth against XSS attacks that could exfiltrate financial data. HSTS absence means users are vulnerable to SSL stripping on first visit. The `X-Frame-Options` is also absent from API responses.

**Empfehlung:**
Add security headers to all responses. In the server middleware or in each `sendJson` call, include:
```js
'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
'Referrer-Policy': 'strict-origin-when-cross-origin',
'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
```

---

### 3. Unsalted SHA-256 Used to Hash 6-Digit Verification Codes

**Priorität:** 🔴 `HIGH`  
**Datei/Ort:** `backend/utils/password.mjs:hashValue, backend/handlers/auth.mjs:handleRegister, handlePasswordForgot`

**Problem:**
The `hashValue()` function uses unsalted SHA-256 to hash email verification codes and password reset codes before storing them in the database. The code space is only 900,000 values (100000–999999). An attacker with read access to the `email_verifications` or `password_resets` tables can precompute a complete rainbow table for all possible 6-digit codes (trivial — only 900,000 SHA-256 computations) and immediately recover any code, enabling account takeover without ever triggering the attempt counter.

**Empfehlung:**
Use HMAC-SHA256 with a server-side secret, or use scrypt/bcrypt for the code hash to make brute-force expensive:
```js
import { createHmac } from 'node:crypto';
const CODE_HMAC_SECRET = process.env.CODE_HMAC_SECRET; // strong random secret
export function hashCode(code) {
  return createHmac('sha256', CODE_HMAC_SECRET).update(String(code)).digest('hex');
}
```
Also use `timingSafeEqual` when comparing the resulting digests.

---

### 4. Verification Code Comparison Not Timing-Safe

**Priorität:** 🔴 `HIGH`  
**Datei/Ort:** `backend/handlers/auth.mjs:443 (handleRegisterVerify), auth.mjs:554 (handlePasswordReset)`

**Problem:**
Verification codes and password reset codes are compared with `hashValue(code) !== verification.code_hash` using the JavaScript `!==` operator. String comparison in JS is not guaranteed to be constant-time — it short-circuits on the first mismatched character. While the server-side attempt counter provides some protection, this is a textbook timing oracle that could still be exploited in a high-speed local or co-located environment to narrow down valid code hashes.

**Empfehlung:**
Use `timingSafeEqual` from Node's crypto module for all secret comparisons:
```js
import { timingSafeEqual, createHmac } from 'node:crypto';
const computed = Buffer.from(hashValue(code), 'hex');
const stored = Buffer.from(verification.code_hash, 'hex');
if (computed.length !== stored.length || !timingSafeEqual(computed, stored)) {
  // reject
}
```

---

### 5. No Rate Limiting on /api/register/verify Endpoint

**Priorität:** 🔴 `HIGH`  
**Datei/Ort:** `backend/handlers/auth.mjs:handleRegisterVerify (line 410), backend/server.mjs:125`

**Problem:**
The `/api/register/verify` endpoint has no IP-based rate limiting. While there is a per-email attempt counter (max 5 tries), an attacker can bypass this by registering many email addresses and sending requests from many IPs, or by exploiting the absence of a per-IP limit to enumerate the validity of email addresses faster. Combined with the SHA-256-only code hashing issue (finding above), this compounds the risk significantly. All other sensitive auth endpoints (login, register, password-forgot, password-reset, password-change) do have `checkRateLimit` calls.

**Empfehlung:**
Add IP-based rate limiting at the top of `handleRegisterVerify`, matching the pattern used elsewhere:
```js
if (!checkRateLimit(req, res, { maxAttempts: 10, windowMs: 60_000, group: 'register-verify' })) return;
```

---

### 6. Plaintext Password Migration Loads All User Passwords Into Memory at Startup

**Priorität:** 🟡 `MEDIUM`  
**Datei/Ort:** `backend/handlers/auth.mjs:migratePlaintextPasswords (line 157)`

**Problem:**
`migratePlaintextPasswords` runs at every server startup and fetches all rows from the `users` table including hashed passwords (`SELECT id, password FROM users`). On large deployments this loads the complete credential store into application memory. If the process is compromised or produces a heap dump/core file during startup, all password hashes are exposed at once. The function should be a one-time migration, not a recurring startup task.

**Empfehlung:**
This migration should be a separate, one-time CLI script with a database flag to mark completion. At minimum, add a guard column:
```sql
ALTER TABLE users ADD COLUMN password_migrated BOOLEAN DEFAULT FALSE;
```
Then query only unmigrated rows: `SELECT id, password FROM users WHERE password_migrated = false`.

---

### 7. Hardcoded HTTP IP Address as Default for Stock Search Backend

**Priorität:** 🟡 `MEDIUM`  
**Datei/Ort:** `backend/config/runtime.mjs:11`

**Problem:**
`STOCK_SEARCH_BASE_URL` defaults to `http://3.225.21.161` — a plain HTTP URL with a raw IP address. This means stock search requests default to an unencrypted channel to a specific AWS IP if the env var is not set. This leaks API keys (`STOCK_API_KEY`) in transit, enables MITM attacks on search results, and embeds infrastructure details in source code.

**Empfehlung:**
Remove the hardcoded IP default. If no `STOCK_SEARCH_BASE_URL` is configured, the endpoint should return a 503 error rather than falling back to an insecure default:
```js
export const STOCK_SEARCH_BASE_URL = String(process.env.STOCK_SEARCH_BASE_URL || '').trim();
// In handler: if (!STOCK_SEARCH_BASE_URL) return sendJson(res, 503, ...)
```

---

### 8. No Rate Limiting on AI-Triggering Forum Questions (Finzbro @mention Amplification)

**Priorität:** 🟡 `MEDIUM`  
**Datei/Ort:** `backend/handlers/forum.mjs:handleQuestions (line 503), maybeCreateFinzbroAutoAnswer (line 355)`

**Problem:**
Every POST to `/api/questions` that mentions `@finzbro` triggers an asynchronous call to the OpenRouter external API. There is no rate limiting on the questions endpoint or the Finzbro trigger. An authenticated attacker can spam questions with `@finzbro` mentions to exhaust the OpenRouter API quota and cause monetary damage (billed API calls) or degrade service. The candidateLimit of 600 in `listQuestionsWithRelations` also means each GET to `/api/questions?search=...` fetches up to 600 questions plus all their answers in a fan-out query, amplifying the load.

**Empfehlung:**
1. Add `checkRateLimit` to the question POST handler (e.g., 5 questions per minute per IP/user).
2. Separately rate-limit the Finzbro auto-answer trigger per user (e.g., max 2 AI triggers per hour per user).
3. Reduce or paginate the `candidateLimit` for the question list.

---

### 9. Account Deletion Missing Password Confirmation

**Priorität:** 🟡 `MEDIUM`  
**Datei/Ort:** `backend/handlers/user.mjs:handleDeleteUserAccount (line 21)`

**Problem:**
The `DELETE /api/user/account` endpoint irreversibly deletes a user's entire account including all financial data but requires no password re-confirmation. Any active session (including one hijacked via XSS or a stolen session cookie from a shared device) is sufficient to permanently destroy the account. This is a high-impact destructive action and should require re-authentication.

**Empfehlung:**
Require the user to supply their current password in the DELETE request body and verify it before proceeding:
```js
const { rows } = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
const isValid = await verifyPassword(payload.current_password, rows[0].password);
if (!isValid) return sendJson(res, 403, { ok: false, message: 'Passwort falsch' });
```

---

### 10. Group Message Deletion Does Not Verify Active Group Membership

**Priorität:** 🟡 `MEDIUM`  
**Datei/Ort:** `backend/handlers/groups.mjs:handleDeleteGroupMessage (line 794)`

**Problem:**
`handleDeleteGroupMessage` only verifies that the requesting user is the message author (`from_user_id !== userId`) but does not verify the user is still an active member of the group. A user who has been removed from a group (or who left) can still delete their own messages in that group if they know the `group_id` and `message_id`. All other group mutation endpoints use `getGroupContext` which enforces active membership via `ACTIVE_MEMBER_FILTER`. This inconsistency is an authorization bypass.

**Empfehlung:**
Add a membership check in `handleDeleteGroupMessage`:
```js
const membershipResult = await pool.query(
  `SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2 AND (status IN ('accepted','active') OR status IS NULL)`,
  [groupId, userId]
);
if (membershipResult.rows.length === 0) return forbidden(res, 'Not a group member');
```
Alternatively, refactor to use `getGroupContext` like the other handlers.

---

### 11. Scrypt Called With Default (Potentially Weak) Parameters

**Priorität:** 🟡 `MEDIUM`  
**Datei/Ort:** `backend/utils/password.mjs:hashPassword (line 38), verifyPassword (line 71)`

**Problem:**
The `scryptAsync` calls use only the required positional arguments `(password, salt, keylen)` with no options object. Node.js scrypt defaults are N=16384 (cost), r=8 (blockSize), p=1 (parallelization). N=16384 is the OWASP minimum but provides about 25ms hashing time on commodity hardware. For a financial application storing sensitive data, OWASP recommends N=65536 or higher. An attacker with the database contents can run ~40 hash attempts per second per GPU at these defaults.

**Empfehlung:**
Explicitly set stronger parameters and encode them in the hash format for future agility:
```js
const SCRYPT_OPTS = { N: 65536, r: 8, p: 1 };
const derived = await scryptAsync(password, salt, PASSWORD_KEYLEN, SCRYPT_OPTS);
// Store as: scrypt$N65536$salt$derived
```
Note: changing parameters requires a rehash-on-login migration, similar to what already exists.

---

### 12. Base64-Encoded Profile Image Stored Directly in Database Without Magic Byte Validation

**Priorität:** 🟡 `MEDIUM`  
**Datei/Ort:** `backend/handlers/user.mjs:handleProfileImageUpload (line 88)`

**Problem:**
Profile images are accepted as data URLs and stored verbatim in the database. Validation only checks the `data:(image/jpeg|png|webp);base64,` prefix via regex, but does not validate the actual binary content (magic bytes). A crafted payload could embed malicious content with a valid prefix. The entire 1 MB payload (readBody limit) is stored in a single database column and then returned in every API response that includes user data (session, group members list, message list), inflating response sizes. The `data:` URL is also returned directly in group member/message responses to all group members.

**Empfehlung:**
1. Validate magic bytes after base64 decoding (JPEG: `FF D8 FF`, PNG: `89 50 4E 47`, WebP: `52 49 46 46`). 2. Store images in object storage (S3/Supabase Storage) and return a URL instead of the raw data URI. 3. Reduce the max profile image size to 100 KB. 4. Strip EXIF metadata before storing.

---

### 13. Password Reset Expiry Mismatch: Hardcoded 15 Minutes vs Configurable TTL

**Priorität:** 🟢 `LOW`  
**Datei/Ort:** `backend/handlers/auth.mjs:handlePasswordForgot (line 500)`

**Problem:**
The password reset code TTL is hardcoded as `15 * 60 * 1000` milliseconds (line 500), independent of the `VERIFICATION_TTL_MINUTES` environment variable. However, the success response reports `expires_in_seconds: VERIFICATION_TTL_MINUTES * 60` (line 514). If `VERIFICATION_TTL_MINUTES` is set to a value other than 15, the client will display an incorrect expiry time. This could confuse users or allow reset codes to be valid longer than the UI implies.

**Empfehlung:**
Replace the hardcoded value with the shared constant:
```js
const expiresAt = new Date(now.getTime() + VERIFICATION_TTL_MINUTES * 60 * 1000);
```

---

### 14. Session Cookie Missing Secure Flag Outside Production

**Priorität:** 🟢 `LOW`  
**Datei/Ort:** `backend/utils/session-store.mjs:buildSessionCookie (line 72), clearSessionCookie (line 80)`

**Problem:**
The `Secure` attribute is only added to session cookies when `NODE_ENV === 'production'`. In staging, test, or any other named environment the cookie will be sent over plain HTTP. If staging is publicly accessible (common in web projects), session tokens can be intercepted in transit. Additionally, the app should not rely on `NODE_ENV` as the only control — a deployment to a TLS-terminated production server that is misconfigured without `NODE_ENV=production` would also be vulnerable.

**Empfehlung:**
Add an explicit `FORCE_HTTPS` env var or derive the Secure flag from the presence of HTTPS configuration rather than relying on `NODE_ENV`:
```js
const useSecureCookie = process.env.SECURE_COOKIE === 'true' || process.env.NODE_ENV === 'production';
if (useSecureCookie) attrs.push('Secure');
```

---

### 15. User Enumeration via Group Invite Endpoint

**Priorität:** 🟢 `LOW`  
**Datei/Ort:** `backend/handlers/groups.mjs:handleInviteUser (line 574)`

**Problem:**
The invite endpoint returns a 404 with message `"User not found"` when a username does not exist. Any group admin can use this endpoint to enumerate valid usernames across the application by iterating through candidate names. While admin privileges are required to call this, it is still an information disclosure concern in a financial application where username privacy may be expected.

**Empfehlung:**
Return a generic success response regardless of whether the username exists (similar to how `handlePasswordForgot` avoids email enumeration), or implement a username search/suggestion feature with appropriate rate limiting instead.

---

### 16. No Rate Limiting on Data-Writing API Endpoints (Finance, Groups, Forum)

**Priorität:** 🟢 `LOW`  
**Datei/Ort:** `backend/handlers/finance.mjs, backend/handlers/groups.mjs, backend/handlers/forum.mjs`

**Problem:**
The rate limiter is only applied to authentication-related endpoints. All authenticated data-mutation endpoints (create income entry, create expense, post group messages, create forum questions/answers, donate to group funding) have no rate limiting. An authenticated user with a valid session can flood the database with thousands of records per minute, causing storage exhaustion, degraded query performance, and denial of service for other users. Group message spam is particularly notable given the `listQuestionsWithRelations` fan-out query.

**Empfehlung:**
Apply `checkRateLimit` to mutation endpoints with appropriate per-group/per-user limits. Example for income entry creation:
```js
if (!checkRateLimit(req, res, { maxAttempts: 60, windowMs: 60_000, group: 'finance-write' })) return;
```
Consider a global per-session request budget for write operations.

---

### 17. No Registration Field Length Limits Allowing Oversized Database Inserts

**Priorität:** 🟢 `LOW`  
**Datei/Ort:** `backend/handlers/auth.mjs:handleRegister (line 357-369)`

**Problem:**
The registration handler trims and validates `username`, `first_name`, `last_name`, and `email` for presence, but imposes no maximum length constraint before inserting into the database. An attacker can submit a `first_name` of 100,000 characters. The 1 MB `readBody` limit provides a crude upper bound, but individual fields are unbounded within that limit. This could exceed database column limits (causing a 500 error with leaked stack traces) or store oversized values that degrade performance across all queries that include those fields.

**Empfehlung:**
Add explicit length validation before DB insertion:
```js
if (username.length > 50) return badRequest(res, 'Username zu lang (max. 50 Zeichen)');
if (firstName.length > 100) return badRequest(res, 'Vorname zu lang (max. 100 Zeichen)');
if (lastName.length > 100) return badRequest(res, 'Nachname zu lang (max. 100 Zeichen)');
if (email.length > 254) return badRequest(res, 'E-Mail zu lang');
```

---


## 🧪 Testing & DevOps

### 1. No test runner configured — zero automated tests

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Testing  
**Datei/Ort:** `package.json`

**Problem:**
There is no test runner (Jest, Vitest, Mocha, Node test runner, etc.) in devDependencies and no `test` script in package.json. The only test-like files are two ad-hoc scripts (`scripts/test-email.mjs`, `scripts/test-transactions.mjs`) that must be run manually and have no assertions framework, no test suite structure, and are not wired into any CI gate. The test-transactions script exits with process.exit(1) on failure but uses raw console.error rather than a proper assertion library, making failures hard to aggregate.

**Empfehlung:**
Adding a test runner (e.g. Node's built-in `node:test` + `assert` with zero extra deps, or Vitest) and a `test` npm script lets you run all tests with `npm test`, catch regressions automatically, and integrate with CI.

---

### 2. No CI/CD pipeline — no .github/workflows or equivalent

**Priorität:** 🔴 `HIGH`  
**Kategorie:** DevOps  
**Datei/Ort:** ``

**Problem:**
There is no `.github/` directory, no GitHub Actions workflow, no GitLab CI, no Bitbucket Pipelines, and no other CI configuration. The manifest.yaml targets Cloud Foundry (SAP BTP, staticfile_buildpack) but is configured as a static-only app, which conflicts with the Node.js backend. There is no automated step that runs lint, type-check, or tests on push or pull request.

**Empfehlung:**
A basic GitHub Actions workflow running `npm run lint`, `npm run type-check`, and `npm test` on every push would catch broken code before it reaches production and enforce code quality without manual effort.

---

### 3. No health check endpoint on the Node server

**Priorität:** 🔴 `HIGH`  
**Kategorie:** DevOps  
**Datei/Ort:** `backend/server.mjs`

**Problem:**
The server has no `/health` or `/healthz` route. Container orchestrators (Kubernetes, Cloud Foundry, Docker Compose), load balancers, and uptime monitors all rely on a dedicated health endpoint that returns 200 + JSON when the app and database are healthy. Without it, a crashed or degraded instance continues to receive traffic.

**Empfehlung:**
Adding `GET /health` that returns `{status:'ok', db:'ok', uptime:...}` (and runs `SELECT 1` against the pool) costs ~10 lines and makes the service compatible with any orchestration platform.

---

### 4. No Docker setup — no Dockerfile or docker-compose

**Priorität:** 🔴 `HIGH`  
**Kategorie:** DevOps  
**Datei/Ort:** ``

**Problem:**
There is no Dockerfile and no docker-compose.yml. The application depends on a PostgreSQL/Supabase database, SMTP server, and optional external APIs. Without a container definition, onboarding a new developer requires manual environment setup, and there is no reproducible way to run the full stack locally or in CI.

**Empfehlung:**
A Dockerfile + docker-compose.yml (with a postgres service) would let any developer run `docker compose up` to get a fully working local environment and would form the foundation for a container-based production deployment.

---

### 5. manifest.yaml uses staticfile_buildpack — incompatible with Node.js backend

**Priorität:** 🔴 `HIGH`  
**Kategorie:** DevOps  
**Datei/Ort:** `manifest.yaml`

**Problem:**
The Cloud Foundry manifest specifies `staticfile_buildpack`, which serves static files via nginx and does not execute Node.js. The actual application is a Node.js HTTP server (`backend/server.mjs`). Deploying this manifest would serve only the `dist/` files with no API, no auth, and no database connectivity. It should use `nodejs_buildpack` with a `start` command.

**Empfehlung:**
Fixing the buildpack makes the Cloud Foundry deployment actually work end-to-end instead of silently serving a broken static shell.

**Aktueller Code:**
```javascript
buildpacks:
  - staticfile_buildpack
```

**Verbesserter Code:**
```javascript
buildpacks:
  - nodejs_buildpack
command: node backend/server.mjs
memory: 256M
```

---

### 6. No integration or end-to-end tests for API routes

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Testing  
**Datei/Ort:** `scripts/`

**Problem:**
The only test coverage that exists is one ad-hoc script (`scripts/test-transactions.mjs`) testing a single handler with a fake pool, and one SMTP smoke test. There are no integration tests that boot the actual server against a test database and call HTTP endpoints, no tests for auth flows (login, register, verify, password reset), no tests for budget handlers, group handlers, or forum handlers. The entire backend surface has effectively zero regression protection.

**Empfehlung:**
Even a small suite of integration tests using Node's built-in `fetch` against a test server instance (with a seeded test DB) would catch the most common regressions in routing, auth middleware, and database queries.

---

### 7. Unstructured logging with console.log — no log levels or structured output

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Observability  
**Datei/Ort:** `backend/server.mjs, backend/handlers/auth.mjs, backend/handlers/forum.mjs`

**Problem:**
All logging is done via bare `console.log`, `console.error`, and `console.warn`. There is no structured logging library (pino, winston, etc.), no log levels, no request IDs, no timestamps, and no JSON output format. In production, operators cannot filter logs by level or correlate related log lines for a single request. Error objects are logged without stack traces in some places.

**Empfehlung:**
Switching to a structured logger like `pino` (zero extra config, very fast) adds timestamps, log levels, JSON output, and request correlation out of the box, making logs parseable by any log aggregator (Datadog, Loki, CloudWatch).

---

### 8. No error monitoring integration (e.g. Sentry)

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Observability  
**Datei/Ort:** `backend/server.mjs`

**Problem:**
Unhandled exceptions and rejected promises are caught at the top-level request handler and logged to console, but there is no integration with an error tracking service such as Sentry, Rollbar, or Honeybadger. Silent errors in background tasks (e.g., the `gcSessions` interval) are swallowed with `.catch(() => {})`. Production issues go unnoticed until a user reports them.

**Empfehlung:**
Adding Sentry (or a similar service) gives automatic alerting on production errors with full stack traces, user context, and frequency counts, dramatically reducing mean time to detection.

**Aktueller Code:**
```javascript
setInterval(() => gcSessions().catch(() => {}), 30 * 60 * 1000);
```

**Verbesserter Code:**
```javascript
setInterval(() => gcSessions().catch((err) => logger.error({ err }, 'gcSessions failed')), 30 * 60 * 1000);
```

---

### 9. Startup does not validate all required environment variables

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** DevOps  
**Datei/Ort:** `backend/server.mjs, backend/config/runtime.mjs`

**Problem:**
Only `DATABASE_URL` and `PORT` are validated at startup (server.mjs lines 27-30). All other required variables — `SMTP_HOST`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASS`, `TWELVE_DATA_API_KEY`, `STOCK_API_KEY`, `OPENROUTER_API_KEY` — silently default to empty strings. The runtime config module exports them as empty strings rather than failing fast. This means a misconfigured deployment starts successfully and fails at runtime (e.g., email sending fails mid-registration).

**Empfehlung:**
A startup validation step that checks required env vars and logs a clear error message before accepting connections would surface misconfigurations in seconds rather than after the first affected user action.

---

### 10. Hardcoded external IP address in source code

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Configuration  
**Datei/Ort:** `backend/config/runtime.mjs:11`

**Problem:**
The stock API base URL falls back to a hardcoded AWS IP address `http://3.225.21.161` when `STOCK_SEARCH_BASE_URL` is not set. Hardcoded IPs break when the server moves, are not documented in `.env.example`, and create a false sense that the service will work in any environment without configuration.

**Empfehlung:**
Removing the hardcoded IP and adding `STOCK_SEARCH_BASE_URL` to `.env.example` makes the dependency explicit and prevents accidental production traffic to an undocumented server.

**Aktueller Code:**
```javascript
process.env.STOCK_SEARCH_BASE_URL || process.env.STOCK_API_BASE_URL || "http://3.225.21.161"
```

**Verbesserter Code:**
```javascript
process.env.STOCK_SEARCH_BASE_URL || process.env.STOCK_API_BASE_URL || ""  // must be set via env
```

---

### 11. Hardcoded AI model name not overridable via environment variable

**Priorität:** 🟢 `LOW`  
**Kategorie:** Configuration  
**Datei/Ort:** `backend/config/runtime.mjs:23`

**Problem:**
The OpenRouter model `arcee-ai/trinity-large-preview:free` is hardcoded as a constant. When this model is discontinued or swapped for a paid tier, a code change and redeployment is required. Other OpenRouter config values are correctly read from env vars.

**Empfehlung:**
Externalizing the model name to an env var allows switching models via a config change without touching source code or redeploying.

**Aktueller Code:**
```javascript
export const OPENROUTER_MODEL = "arcee-ai/trinity-large-preview:free";
```

**Verbesserter Code:**
```javascript
export const OPENROUTER_MODEL = String(process.env.OPENROUTER_MODEL || "arcee-ai/trinity-large-preview:free").trim();
```

---

### 12. .env.example references MongoDB — out of date with current PostgreSQL backend

**Priorität:** 🟢 `LOW`  
**Kategorie:** Documentation  
**Datei/Ort:** `.env.example`

**Problem:**
The `.env.example` file contains `MONGODB_URI` and `MONGODB_DB` at the top, but the application uses PostgreSQL/Supabase via `DATABASE_URL`. The actual `DATABASE_URL` variable that server.mjs requires and validates is missing from `.env.example`. A new developer following this file would configure MongoDB instead of PostgreSQL and the server would refuse to start with `DATABASE_URL is not set`.

**Empfehlung:**
Correcting `.env.example` is the first thing a new contributor reads; having it match the actual required variables eliminates a guaranteed setup failure.

**Aktueller Code:**
```javascript
# MongoDB
MONGODB_URI="mongodb+srv://..."
MONGODB_DB="finanzapp"
```

**Verbesserter Code:**
```javascript
# PostgreSQL / Supabase
DATABASE_URL="postgresql://user:password@host:5432/finanzapp"
```

---

### 13. In-memory rate limiter state lost on restart — no distributed rate limiting

**Priorität:** 🟢 `LOW`  
**Kategorie:** DevOps  
**Datei/Ort:** `backend/utils/rate-limit.mjs`

**Problem:**
The rate limiter uses a module-level `Map` (`_rateLimitBuckets`). On every process restart the state resets, so an attacker can bypass rate limiting by forcing a restart or in a multi-instance deployment. For a university project this is acceptable, but it is a known limitation if the app is deployed with more than one instance (the manifest.yaml sets `instances: 1`).

**Empfehlung:**
For a production multi-instance setup, moving rate limit state to Redis or PostgreSQL would make limits durable across restarts and consistent across instances.

---

### 14. README setup instructions are incomplete and partially incorrect

**Priorität:** 🟢 `LOW`  
**Kategorie:** Documentation  
**Datei/Ort:** `README.md`

**Problem:**
The README does not mention the required `.env` variables beyond a vague reference, does not explain that a Vite build step (`npm run web:build`) is required before `npm start`, does not document how to run lint or type-check, and contains legacy path references (`frontend/dashboard/`) that no longer match the actual project structure (`apps/web/src/pages/`). The Stock API section also documents hardcoded server credentials.

**Empfehlung:**
A correct, complete README reduces onboarding time from hours to minutes and prevents contributors from running a broken setup.

---


## ♿ UX & Accessibility

### 1. Buttons have no visible focus indicator

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Accessibility  
**Datei/Ort:** `/apps/web/src/shared/unified-ui.css (global), /apps/web/src/pages/dashboard/dashboard.css, /apps/web/src/pages/dashboard/style.css`

**Problem:**
No `:focus` or `:focus-visible` rule is defined for `<button>` elements anywhere in the codebase. The unified-ui.css only defines focus styles for `input`, `select`, `textarea`, and `.field-input`. Tab-navigation keyboard users receive no visible focus ring on any button — including the primary submit buttons, entry-tab navigation buttons, carousel arrows, modal action buttons, and the profile/logout buttons. The `prefers-reduced-motion` blocks only cover transitions/animations, not focus indicators.

**Empfehlung:**
Keyboard and switch-access users cannot track focus position, which is a WCAG 2.4.7 (Focus Visible, Level AA) and WCAG 2.4.11 (Focus Appearance, Level AA) failure. Adding `:focus-visible { outline: 2px solid var(--ui-primary); outline-offset: 2px; }` to all interactive elements would fix this.

**Aktueller Code:**
```javascript
/* No button:focus or :focus-visible rule exists in any CSS file */
```

**Verbesserter Code:**
```javascript
button:focus-visible,
.entry-tab-btn:focus-visible,
.app-nav-link:focus-visible,
.hp-btn:focus-visible {
  outline: 2px solid var(--ui-primary);
  outline-offset: 2px;
  border-radius: var(--ui-radius-sm);
}
```

---

### 2. KPI trend positive color fails WCAG AA contrast for small text

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Accessibility  
**Datei/Ort:** `/apps/web/src/pages/dashboard/dashboard.css:237, /apps/web/src/pages/dashboard/style.css:237`

**Problem:**
The `.kpi-trend.positive` class applies `color: var(--success)` which resolves to `#16a34a` in light mode. This text is rendered at `0.76rem` (approximately 12.2 px), which is small text under WCAG. The contrast ratio of `#16a34a` on white surface (`#ffffff`) is **3.30:1**, falling below the 4.5:1 threshold required for WCAG 2.1 SC 1.4.3 Level AA. The dark-mode value (`#4ade80`) achieves 10.17:1 and is fine.

**Empfehlung:**
Fixes a WCAG AA contrast failure for the KPI trend positive indicator shown prominently on the main dashboard overview.

**Aktueller Code:**
```javascript
.kpi-trend.positive {
  color: var(--success); /* #16a34a = 3.30:1 on white */
}
```

**Verbesserter Code:**
```javascript
.kpi-trend.positive {
  color: #0f7a35; /* darkened from #16a34a → 4.61:1 on white */
}
/* Or increase font size to 14pt bold (large text) which only needs 3:1 */
```

---

### 3. Homepage hero stat labels and footer copyright text fail WCAG AA contrast

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Accessibility  
**Datei/Ort:** `/apps/web/src/pages/homepage/style.css:449-452 (.hp-stat__label), :1059-1062 (.hp-footer__copy)`

**Problem:**
`.hp-stat__label` (font-size 0.68rem, ~10.9px) uses `color: var(--hp-ink-faint)` = `#9ca3af` on a white card background (`var(--ui-surface)` = `#ffffff`). Contrast ratio is **2.54:1**, failing the 4.5:1 AA threshold for small text. The footer copyright text (`.hp-footer__copy`, 0.78rem) uses the same `#9ca3af` on `var(--ui-surface)` white — also **2.54:1**. The hero stat labels are real readable content (not `aria-hidden`), so they must meet contrast. Dark mode `--hp-ink-faint: #52525b` on `#18181b` is **2.29:1**, also failing.

**Empfehlung:**
Fixes two prominent WCAG AA contrast failures affecting real text content on the homepage.

**Aktueller Code:**
```javascript
--hp-ink-faint: #9ca3af;  /* light: 2.54:1 on white */
--hp-ink-faint: #52525b;  /* dark: 2.29:1 on #18181b */
```

**Verbesserter Code:**
```javascript
--hp-ink-faint: #6b7280;  /* light: 4.59:1 on white — same as hp-ink-muted */
--hp-ink-faint: #a1a1aa;  /* dark: 7.35:1 on #18181b */
```

---

### 4. Modal dialog lacks focus trap and does not restore focus on close

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Accessibility  
**Datei/Ort:** `/apps/web/src/pages/dashboard/modal.js`

**Problem:**
The confirmation modal opens and calls `okBtn.focus()` but has no focus trap: a keyboard user can Tab past the modal buttons into the obscured background content. When the modal closes (via Escape, cancel, or confirm), focus is not restored to the element that triggered the modal. The modal backdrop also lacks `inert` on the background content to prevent screen-reader access to hidden content. WCAG 2.4.3 (Focus Order) and WCAG 1.3.1 (Info and Relationships).

**Empfehlung:**
Screen-reader and keyboard users will be properly contained within the modal and returned to their original position after dismissal, meeting WCAG 2.4.3.

**Aktueller Code:**
```javascript
// No focus trap, no focus restore
return ({ title, message, confirmText }) =>
  new Promise((resolve) => {
    resolver = resolve;
    // ...
    backdrop.hidden = false;
    okBtn.focus();
  });
```

**Verbesserter Code:**
```javascript
// Store trigger before opening
let triggerElement = null;

return ({ title, message, confirmText, trigger }) =>
  new Promise((resolve) => {
    triggerElement = trigger ?? document.activeElement;
    resolver = resolve;
    // ...
    backdrop.hidden = false;
    // Trap focus within modal
    backdrop.addEventListener('keydown', trapFocus);
    okBtn.focus();
  });

const close = (value) => {
  backdrop.hidden = true;
  backdrop.removeEventListener('keydown', trapFocus);
  triggerElement?.focus(); // restore focus
  // ...
};

function trapFocus(e) {
  if (e.key !== 'Tab') return;
  const focusable = [...backdrop.querySelectorAll('button:not([disabled])')];
  // cycle focus within focusable
}
```

---

### 5. Tab navigation widget is missing role=tablist, role=tab, and role=tabpanel

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Accessibility  
**Datei/Ort:** `/apps/web/pages/dashboard/dashboard.html:36-39, /apps/web/pages/stocks/index.html:34-36`

**Problem:**
Both the Dashboard and Stocks pages implement a tab-switching pattern using `<nav>` + `<button>` elements with `aria-selected`. However, they are missing the required ARIA tab pattern roles. The `<nav>` container should be `role="tablist"` (or a `<div role="tablist">`), each button should have `role="tab"`, and the corresponding panel sections should have `role="tabpanel"` with `aria-labelledby` pointing to the active tab. Without these roles, screen readers announce the widget as a navigation landmark with buttons rather than a tab interface. The view panels also lack `tabindex="0"` to be reachable by keyboard.

**Empfehlung:**
Correctly semanticised tab patterns are announced as 'tab 1 of 3' by screen readers, making the interface comprehensible to assistive-technology users.

**Aktueller Code:**
```javascript
<nav class="entry-tab-nav page-tab-nav" aria-label="Dashboard-Bereiche">
  <button type="button" class="entry-tab-btn is-active" data-view-tab="overview" aria-selected="true">Übersicht</button>
  ...
</nav>
<section class="view-panel" data-view-panel="overview">
```

**Verbesserter Code:**
```javascript
<div role="tablist" aria-label="Dashboard-Bereiche" class="entry-tab-nav page-tab-nav">
  <button type="button" role="tab" id="tab-overview" class="entry-tab-btn is-active" data-view-tab="overview" aria-selected="true" aria-controls="panel-overview">Übersicht</button>
  ...
</div>
<section role="tabpanel" id="panel-overview" aria-labelledby="tab-overview" class="view-panel" data-view-panel="overview" tabindex="0">
```

---

### 6. Homepage initial HTML has empty aria-label attributes on interactive elements

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Accessibility  
**Datei/Ort:** `/apps/web/pages/homepage/index.html:13, :218, :249, :266, :316, :320`

**Problem:**
The brand link (`aria-label=""`), the register video (`aria-label=""`), the income/expenses video (`aria-label=""`), the carousel prev/next buttons (`aria-label=""`), and the dots container (`aria-label=""`) all have empty `aria-label` attributes in the static HTML. These are populated by `app.js` at runtime, but until JavaScript loads and `renderHomepageCopy()` runs, all these elements are announced as unlabelled by screen readers. If JS is slow or fails, the carousel arrows are completely unlabelled interactive controls.

**Empfehlung:**
Providing meaningful static fallback labels ensures accessibility even during slow JS load, eliminating a race condition for screen-reader users.

**Aktueller Code:**
```javascript
<a id="homepage-brand-link" class="hp-nav__brand" href="/homepage/" aria-label="">
<button id="homepage-design-prev" class="hp-carousel__arrow" type="button" aria-label="">
```

**Verbesserter Code:**
```javascript
<a id="homepage-brand-link" class="hp-nav__brand" href="/homepage/" aria-label="Zur FinanzApp Homepage">
<button id="homepage-design-prev" class="hp-carousel__arrow" type="button" aria-label="Vorheriges Bild">
```

---

### 7. Dashboard form status elements missing aria-live for screen-reader announcements

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Accessibility  
**Datei/Ort:** `/apps/web/pages/dashboard/dashboard.html:172, :176, :259, :263`

**Problem:**
The `#income-form-status`, `#income-category-status`, `#expense-form-status`, and `#expense-category-status` elements receive dynamic text updates (save success, save error, delete confirmation, edit mode) via `setStatus()` in the JS layer. None of these elements have `aria-live` attributes in the HTML, so status changes are invisible to screen-reader users. The toast system does announce success/error messages redundantly, but the inline form status text (e.g. 'Bearbeitung aktiv') is never announced.

**Empfehlung:**
Screen-reader users will hear inline form status updates as they happen, improving form feedback accessibility per WCAG 4.1.3 Status Messages (Level AA).

**Aktueller Code:**
```javascript
<p id="income-form-status" class="form-status"></p>
```

**Verbesserter Code:**
```javascript
<p id="income-form-status" class="form-status" aria-live="polite" aria-atomic="true"></p>
```

---

### 8. Profile button aria-label says 'Einstellungen' but the control is a profile/user button

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Accessibility  
**Datei/Ort:** `/apps/web/src/pages/dashboard/profile-menu.js:28`

**Problem:**
The profile button is labelled `aria-label="Einstellungen"` (Settings) by the JS initialization, but it visually shows a user avatar and name and navigates to `/pages/settings/`. While the destination is settings, the button itself is a profile widget. The visual representation and ARIA label should match semantically. Additionally, the stocks page profile button (`/pages/stocks/index.html:19`) has `aria-expanded="false"` but no `aria-label` at all — relying only on the visible text of the avatar initial and profile name, which is insufficient if the name hasn't loaded yet.

**Empfehlung:**
Consistent, accurate labels improve the experience for screen-reader users who rely on the announced role and label to understand what a control does.

**Aktueller Code:**
```javascript
profileBtn.setAttribute("aria-label", "Einstellungen");
// stocks page:
<button id="profile-btn" class="profile-btn" type="button" aria-expanded="false">
```

**Verbesserter Code:**
```javascript
profileBtn.setAttribute("aria-label", "Profil und Einstellungen");
// stocks page:
<button id="profile-btn" class="profile-btn" type="button" aria-expanded="false" aria-label="Profil und Einstellungen">
```

---

### 9. Homepage carousel decorative orb and CTA section animations not covered by prefers-reduced-motion

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Accessibility  
**Datei/Ort:** `/apps/web/src/pages/homepage/style.css:313-340 (orb animations), :804-814 (carousel slide transitions), :971-988 (CTA orbs)`

**Problem:**
The hero section orb drift animations (`hp-orb-drift-a/b/c`, running 20-30s infinite), the `.hp-label::before` pulse animation, and the carousel slide enter/leave CSS transitions (`is-enter-from-right`, `is-leave-to-left` etc.) are not suppressed in the `@media (prefers-reduced-motion: reduce)` block. Only `.reveal-up` is covered. Users with vestibular disorders who prefer reduced motion will still see large continuously-drifting background blobs and sliding carousel transitions.

**Empfehlung:**
Eliminates potential vestibular triggers for users with motion sensitivity, meeting WCAG 2.3.3 Animation from Interactions (AAA) and following the WCAG 2.1 AAA/best-practice guidance for continuous animations.

**Aktueller Code:**
```javascript
@media (prefers-reduced-motion: reduce) {
  .reveal-up { opacity: 1; transform: none; transition: none; }
  /* orb animations, carousel transitions, hp-label pulse are NOT covered */
}
```

**Verbesserter Code:**
```javascript
@media (prefers-reduced-motion: reduce) {
  .reveal-up { opacity: 1; transform: none; transition: none; }
  .hp-hero__orb, .hp-cta__orb { animation: none; }
  .hp-label::before { animation: none; }
  .hp-carousel__slide,
  .hp-carousel__slide.is-enter-from-right,
  .hp-carousel__slide.is-enter-from-left,
  .hp-carousel__slide.is-leave-to-left,
  .hp-carousel__slide.is-leave-to-right {
    transition: none;
    transform: none;
    opacity: 1;
  }
}
```

---

### 10. Skip navigation link is absent across all pages

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Accessibility  
**Datei/Ort:** `/apps/web/pages/dashboard/dashboard.html, /apps/web/pages/homepage/index.html, /apps/web/pages/stocks/index.html`

**Problem:**
None of the application pages include a skip-to-main-content link. Keyboard and screen-reader users must tab through the entire topbar/navigation on every page load before reaching the main content. This is a WCAG 2.4.1 (Bypass Blocks, Level A) failure. The sr-only utility class is already defined in unified-ui.css, making this straightforward to add.

**Empfehlung:**
Keyboard users can skip directly to the main content area, significantly reducing the burden on repeat visits. This is a WCAG Level A requirement.

**Aktueller Code:**
```javascript
<body>
  <div class="dash-shell">
    <header class="dash-topbar page-topbar">
```

**Verbesserter Code:**
```javascript
<body>
  <a class="sr-only" href="#main-content" style="position:absolute;top:0;left:0;padding:8px 16px;background:var(--ui-primary);color:var(--ui-text-on-primary);z-index:200;">
    Zum Hauptinhalt springen
  </a>
  <div class="dash-shell">
    <header class="dash-topbar page-topbar">
  <!-- ... -->
  <main class="dash-main" id="main-content">
```

---

### 11. Carousel missing role=region and no live region for slide change announcements

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Accessibility  
**Datei/Ort:** `/apps/web/pages/homepage/index.html:265-321, /apps/web/src/pages/homepage/app.js:197-281`

**Problem:**
The design carousel (`#homepage-design-carousel`) has no `role="region"` with an accessible name, no `aria-roledescription="carousel"`, and no `aria-live` region to announce when the active slide changes. When a user clicks the prev/next buttons, the slide content changes silently for screen readers (the `aria-hidden` toggling is correct, but the transition itself is not announced). The dot buttons correctly receive `aria-label` and `aria-current`, but there is no way for an AT user to know the carousel position has changed.

**Empfehlung:**
Screen-reader users will be informed of slide changes and can understand the carousel widget structure.

**Aktueller Code:**
```javascript
<div id="homepage-design-carousel" class="hp-carousel">
  <button id="homepage-design-prev" ...>
  <div class="hp-carousel__viewport">
```

**Verbesserter Code:**
```javascript
<section id="homepage-design-carousel" class="hp-carousel" aria-label="Design-Bilder" aria-roledescription="carousel">
  <button id="homepage-design-prev" ...>
  <div class="hp-carousel__viewport" aria-live="polite" aria-atomic="false">
```

---

### 12. Videos on homepage lack captions and have no text fallback for the content shown

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Accessibility  
**Datei/Ort:** `/apps/web/pages/homepage/index.html:211-237 (register video), :241-256 (income/expenses video)`

**Problem:**
Both promotional videos (`register.mp4` and `IncomeAndExpenses.mp4`) use `muted` + `playsinline` + `loop` but have no `<track kind="captions">` element. They are auto-played marketing demos that show UI interactions with no audio, so captions are less critical than for speech-based videos, but the videos have meaningful visual content (demonstrating registration and entry flows) that is not described for users who cannot see video. The `aria-label` on the video provides a title but not a description of the demonstrated content.

**Empfehlung:**
Deaf-blind users and users who cannot watch video receive a meaningful description of what the video demonstrates, meeting WCAG 1.2.1 (Level A) for prerecorded video-only content.

**Aktueller Code:**
```javascript
<video ... aria-label="Demo der schnellen Registrierung in der FinanzApp">
  <source src="./videos/register.mp4" type="video/mp4" />
  <span id="homepage-video-fallback"></span>
</video>
```

**Verbesserter Code:**
```javascript
<!-- If captions track is not feasible, add a descriptive transcript link -->
<video ... aria-label="Demo der schnellen Registrierung in der FinanzApp" aria-describedby="register-video-desc">
  <source src="./videos/register.mp4" type="video/mp4" />
</video>
<p id="register-video-desc" class="sr-only">Das Video zeigt den Registrierungsablauf: E-Mail eingeben, Verifizierungscode bestätigen, Konto erstellt.</p>
```

---

### 13. Recurrence row uses inline style='display:none' instead of hidden attribute

**Priorität:** 🟢 `LOW`  
**Kategorie:** Accessibility  
**Datei/Ort:** `/apps/web/pages/dashboard/dashboard.html:154, :241`

**Problem:**
The income and expense recurrence rows use `style="display:none"` to hide them initially. This approach is functionally acceptable since display:none removes the element from the accessibility tree, but it is inconsistent with the rest of the codebase which correctly uses the `hidden` boolean attribute (e.g. the custom category wrappers use `hidden`). The `hidden` attribute is more semantically explicit and pairs better with ARIA patterns. It also allows CSS to override visibility without JS, unlike inline styles.

**Empfehlung:**
Consistency with the rest of the codebase's hiding pattern and cleaner separation of concerns between markup and style.

**Aktueller Code:**
```javascript
<div class="income-recurrence-row" style="display:none">
  <label class="field-label" for="income-recurrence">Wiederholungen (0 = unbegrenzt)</label>
```

**Verbesserter Code:**
```javascript
<div class="income-recurrence-row" hidden>
  <label class="field-label" for="income-recurrence">Wiederholungen (0 = unbegrenzt)</label>
```

---

### 14. Dashboard tab panels lack aria-controls/aria-labelledby linkage between tab buttons and panels

**Priorität:** 🟢 `LOW`  
**Kategorie:** Accessibility  
**Datei/Ort:** `/apps/web/pages/dashboard/dashboard.html:36-105`

**Problem:**
Even without the full `role="tablist"/role="tab"` pattern, the tab buttons (`data-view-tab`) have no `aria-controls` attribute pointing to the corresponding panel sections, and the panel sections have no `aria-labelledby` pointing back to the tab button. This means screen readers cannot programmatically navigate from a panel back to its tab or understand which panel corresponds to which tab. This is in addition to the missing role issue already reported.

**Empfehlung:**
Provides the structural linkage needed for assistive technologies to navigate between a tab and its panel bidirectionally.

---

### 15. KPI card section elements use <article> but KPIs are not standalone content

**Priorität:** 🟢 `LOW`  
**Kategorie:** Accessibility  
**Datei/Ort:** `/apps/web/pages/dashboard/dashboard.html:74-102`

**Problem:**
The three KPI metric cards and the cashflow/category chart panels use `<article>` elements. The HTML spec says `<article>` is for content that is independently distributable or syndicated. KPI metric cards showing 'Monatliche Einnahmen' are not independently meaningful outside the dashboard context — they are parts of a whole. Using `<article>` causes screen readers to announce 'article' for each one, which may confuse users expecting a more coherent section. `<div>` or `<section>` with appropriate `aria-labelledby` would be more appropriate for KPI cards.

**Empfehlung:**
More accurate semantic structure reduces confusion for screen-reader users who hear 'article' announced for every KPI metric card.

---


## 🐛 Frontend-Bugs (Stocks/Groups/Accounts)

### 1. Null dereference crash after empty-array fallback in fnBuildAnalysisChart

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Bug  
**Datei/Ort:** `stocks/features.js, lines 1194–1213 (fnBuildAnalysisChart)`

**Problem:**
When `fnWithFixedDateRange` returns an empty array, the code enters the `if (aPoints.length === 0)` branch and reassigns `aPoints` to the result of `fnBuildZeroFallbackSeries`. That function guarantees a non-empty array, so in practice the reassignment works. However, immediately after the `if` block at lines 1208–1209 the code reads `aPoints[0].y` and `aPoints[aPoints.length - 1].y` without optional chaining. If `fnBuildZeroFallbackSeries` ever returns an empty array (e.g. if `iPointCount` is computed as 0), this will throw `TypeError: Cannot read properties of undefined (reading 'y')`, crashing the entire analysis view with no user-visible error message. The same pattern exists inside `fnBuildDepotChart` at lines 577–585 where `aTotalPoints[0]?.t` already uses optional chaining inside the branch but the array reference outside is unguarded.

**Empfehlung:**
Prevents a silent crash in the chart rendering path that would leave the canvas blank with no error feedback to the user.

**Aktueller Code:**
```javascript
if (aPoints.length === 0) {
  let nLastValue = Number(aPoints[aPoints.length - 1]?.y);
  // ...
  aPoints = fnBuildZeroFallbackSeries(...);
}
const nFirst = aPoints[0].y;  // crashes if aPoints is still empty
```

**Verbesserter Code:**
```javascript
if (aPoints.length === 0) {
  let nLastValue = Number(aPoints[aPoints.length - 1]?.y);
  // ...
  aPoints = fnBuildZeroFallbackSeries(...);
}
if (!aPoints.length) {
  oArgs.elInfo.textContent = fnT('stocks.no_chart_points', 'Keine Chartpunkte verfügbar.');
  fnClearCanvas(oArgs.oCtx, oArgs.elCanvas);
  return;
}
const nFirst = aPoints[0].y;
```

---

### 2. Buy and sell buttons have no in-flight guard — double-click submits duplicate trades

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Bug  
**Datei/Ort:** `stocks/features.js, lines 901–987 (elBuyBtn) and 989–1098 (elSellBtn)`

**Problem:**
The click handlers on the Buy and Sell buttons are `async` functions that perform multiple sequential API calls (fetch latest price, show modal, `fnCreateDashboardTradeEntry`, `fnPersistBoughtPosition`). There is no `disabled` flag set at the start of the handler, and no flag cleared on completion. A user who double-clicks the button, or who clicks it a second time while the bank-account-selection modal is closing, will fire the entire async chain twice. This can result in two trade entries being posted to the income/expense endpoints and two local position records being written to `localStorage`. The questions/app.js submit handler correctly sets `submitBtn.disabled = true` from the beginning — the same pattern is missing here.

**Empfehlung:**
Prevents duplicate trade records and double-deductions from a bank account balance when users click quickly or repeatedly.

**Aktueller Code:**
```javascript
elBuyBtn.addEventListener('click', async () => {
  const sSymbol = String(sSelectedSymbol || '').trim().toUpperCase();
  const nAmount = Number(elTradeAmountInput.value);
  if (!sSymbol) { ... return; }
  // ... no disabled guard before first await
  let nBuyPrice = await fnGetLatestPriceBySymbol(sSymbol);
```

**Verbesserter Code:**
```javascript
elBuyBtn.addEventListener('click', async () => {
  if (elBuyBtn.disabled) return;
  elBuyBtn.disabled = true;
  elSellBtn.disabled = true;
  try {
    const sSymbol = ...
    // ... rest of handler
  } finally {
    elBuyBtn.disabled = false;
    elSellBtn.disabled = false;
  }
});
```

---

### 3. Race condition: concurrent chart refresh calls from range button + checkbox

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Race Condition  
**Datei/Ort:** `stocks/features.js, lines 446–506 (fnInitDepotView) and 821–834 (fnInitAnalysisView)`

**Problem:**
The `fnRefreshDepotChart` / `fnRefreshAnalysisChart` functions are unguarded async functions bound to multiple UI controls: range buttons, the pnlOnly checkbox, the showPie checkbox, and the account selector. All of them call `await fnRefreshDepotChart()` without any concurrency check. If a user changes the range then immediately toggles pnlOnly, two parallel chart-build operations run concurrently. Both read and write the same canvas context, `aLastDepotChartPoints`, `nProfitLossAbs`, and `mRangeDevelopmentBySymbol`. The second (faster) request can overwrite KPI state mid-render of the first, leaving an inconsistent display. The search handler in the same file correctly uses an incrementing `iSearchRequestSeq` sequence number to discard stale responses — the same pattern is absent from chart refreshes.

**Empfehlung:**
Prevents KPI values and chart rendering from reflecting a mixture of two different time ranges simultaneously.

**Aktueller Code:**
```javascript
aElRangeButtons.forEach((elButton) => {
  elButton.addEventListener('click', async () => {
    sActiveRange = elButton.dataset.range;
    await fnRefreshDepotChart(); // no guard
  });
});
elPnlOnly.addEventListener('change', async () => {
  await fnRefreshDepotChart(); // no guard
});
```

**Verbesserter Code:**
```javascript
let bDepotChartRefreshing = false;
const fnRefreshDepotChart = async () => {
  if (bDepotChartRefreshing) return;
  bDepotChartRefreshing = true;
  try { await fnBuildDepotChart(...); }
  finally { bDepotChartRefreshing = false; }
};
```

---

### 4. Memory leak: `window.resize` listener added on each depot view render but never removed

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Memory Leak  
**Datei/Ort:** `stocks/features.js, line 504 (fnInitDepotView) / bootstrap.js, line 82 (hashchange listener)`

**Problem:**
Each time `fnRenderView('depot')` is called (e.g. when the user switches hash tabs or changes the account selector), `fnInitDepotView()` runs and adds a new `window.addEventListener('resize', fnScheduleResponsiveRedraw)`. Because each invocation creates a new closure for `fnScheduleResponsiveRedraw`, `removeEventListener` with a different reference will not deregister the old one. After navigating depot → analysis → depot multiple times, dozens of resize handlers accumulate, all referencing canvas elements that may have been removed from the DOM. The `window.addEventListener('finanzapp:theme-changed')` in `state-api.js` has the same problem, though it is module-level so it only fires once — but the resize handler fires every resize event for every accumulated closure.

**Empfehlung:**
Prevents handler accumulation that causes multiple redundant redraws on every resize and leaks closures referencing stale DOM elements.

**Aktueller Code:**
```javascript
// Inside fnInitDepotView() — called on every view render:
window.addEventListener('resize', fnScheduleResponsiveRedraw);
```

**Verbesserter Code:**
```javascript
// Store and clean up on re-render:
let _resizeCleanup = null;
// At top of fnRenderView:
if (_resizeCleanup) { _resizeCleanup(); _resizeCleanup = null; }
// Inside fnInitDepotView:
window.addEventListener('resize', fnScheduleResponsiveRedraw);
_resizeCleanup = () => window.removeEventListener('resize', fnScheduleResponsiveRedraw);
```

---

### 5. Memory leak: backdrop click listener accumulates on every `fnOpenAccountDetail` call

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Memory Leak  
**Datei/Ort:** `accounts/app.js, line 226 (fnOpenAccountDetail)`

**Problem:**
Every time `fnOpenAccountDetail` is invoked, a new anonymous arrow function is attached to the shared `elBackdrop` DOM element via `elBackdrop.addEventListener('click', ...)` without `{ once: true }` and without any cleanup. Because it is an anonymous function, the previous listener cannot be removed. After the user opens 10 account detail modals, 10 click handlers are attached to the backdrop; closing the modal triggers all 10. By contrast the `elClose` button and the Escape keydown listener on the same modal both correctly use `{ once: true }`. The `fnAskTransferTargetModal` function in the same file does properly remove its listeners via `cleanup()`, showing the correct pattern is known.

**Empfehlung:**
Prevents handler accumulation that causes `onClose` to execute multiple times per click after the first open.

**Aktueller Code:**
```javascript
elClose.addEventListener('click', onClose, { once: true });
elBackdrop.addEventListener('click', (e) => { if (e.target === elBackdrop) onClose(); }); // missing { once: true }
```

**Verbesserter Code:**
```javascript
elClose.addEventListener('click', onClose, { once: true });
elBackdrop.addEventListener('click', (e) => { if (e.target === elBackdrop) onClose(); }, { once: true });
```

---

### 6. Memory leak: global `document.addEventListener('keydown')` in settings delete-account modal is never removed

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Memory Leak  
**Datei/Ort:** `settings/app.js, lines 310–314 (initDeleteAccount)`

**Problem:**
`initDeleteAccount` registers a `document.addEventListener('keydown', ...)` handler that fires on every keypress for the lifetime of the page to check whether the delete modal is open. Unlike `fnAskTransferTargetModal` in accounts/app.js which stores and removes its `onKeyDown` handler in `cleanup()`, this handler is never removed. Although functionally harmless for a single-page settings view, it conflicts with the pattern used elsewhere and creates a persistent global listener that cannot be individually deregistered. The handler checks `!modal.hidden` before acting, so incorrect behaviour is unlikely, but the intent to scope it to while the modal is open is clear.

**Empfehlung:**
Consistent cleanup pattern; reduces persistent global listeners.

**Aktueller Code:**
```javascript
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !modal.hidden) closeModal();
});
```

**Verbesserter Code:**
```javascript
const onKeyDown = (event) => {
  if (event.key === 'Escape' && !modal.hidden) closeModal();
};
openBtn.addEventListener('click', () => {
  document.addEventListener('keydown', onKeyDown);
  openModal();
});
const closeModal = () => {
  modal.hidden = true;
  document.removeEventListener('keydown', onKeyDown);
};
```

---

### 7. Hardcoded untranslated German strings in fnBuildAnalysisChart

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Code Quality  
**Datei/Ort:** `stocks/features.js, lines 1213, 1224–1225 (fnBuildAnalysisChart)`

**Problem:**
Three status strings in `fnBuildAnalysisChart` are hardcoded German literals and bypass the `fnT()` i18n wrapper: `'Kurs ${sSymbol} (letzter Punkt)'`, `', Bestand: ${fnFmtNumber(...)} Stk'`, and `'Chart aktualisiert: ...'` / `', nicht im Depot'`. The equivalent function `fnBuildDepotChart` (line 611) and the fallback branch of `fnBuildAnalysisChart` (line 1166) both correctly use `fnT()` for the same conceptual strings. This inconsistency means the analysis chart info bar and the KPI label are never translated for non-German users.

**Empfehlung:**
Makes the analysis view consistent with the rest of the UI and enables correct localisation for non-German locales.

**Aktueller Code:**
```javascript
oArgs.elTotalLabel.textContent = `Kurs ${sSymbol} (letzter Punkt)`;
// ...
const sOwnedHint = nOwnedAmount > 0 ? `, Bestand: ${fnFmtNumber(nOwnedAmount, 4)} Stk` : ', nicht im Depot';
oArgs.elInfo.textContent = `Chart aktualisiert: ${sSymbol}, ${oArgs.sRange}...`;
```

**Verbesserter Code:**
```javascript
oArgs.elTotalLabel.textContent = fnT('stocks.price_symbol_last_point', 'Kurs {symbol} (letzter Punkt)', { symbol: sSymbol });
// ...
const sOwnedHint = nOwnedAmount > 0
  ? `, ${fnT('stocks.owned_hint', 'Bestand: {amount} Stk', { amount: fnFmtNumber(nOwnedAmount, 4) })}`
  : `, ${fnT('stocks.not_in_depot', 'nicht im Depot')}`;
oArgs.elInfo.textContent = `${fnT('stocks.chart_updated', 'Chart aktualisiert')}: ${sSymbol}, ${oArgs.sRange}...`;
```

---

### 8. t() translation wrapper duplicated across four modules with subtly different signatures

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Code Duplication  
**Datei/Ort:** `groups/app.js line 120, questions/app.js line 17, accounts/app.js line 19, stocks/state-api.js line 284 (exported as fnT)`

**Problem:**
Every page module defines its own local `t()` wrapper around `sharedT` / `_t` with identical logic: call the shared translation, fall back to a default string, and interpolate `{name}` placeholders. The implementations are almost identical but have minor differences — `groups/app.js` defaults `fallback = ''` while `questions/app.js` and `accounts/app.js` have no default, making the API inconsistent. This pattern requires each new page module to copy the same wrapper. If the fallback interpolation logic ever needs to change, it must be updated in four places. The shared `state-api.js` already exports `fnT` which could be re-used or a dedicated `@shared/js/translation-utils.js` could be extracted.

**Empfehlung:**
Single source of truth for the translation fallback logic; reduces copy-paste bugs and maintenance overhead.

---

### 9. Hardcoded fallback localhost/127.0.0.1 endpoints ship to production in state-api.js

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Code Quality  
**Datei/Ort:** `stocks/state-api.js, lines 14–54 (endpoint arrays)`

**Problem:**
The endpoint arrays `aPositionsEndpoints`, `aShareAccountsEndpoints`, `aBankAccountsEndpoints`, `aIncomeEntriesEndpoints`, `aExpenseEntriesEndpoints`, and `aBackendBaseUrls` all include raw `http://127.0.0.1:5588` and `http://localhost:5588` fallback entries. These are filtered with `.filter(Boolean)` to remove `undefined` entries from `window.*` globals, but the hardcoded localhost strings are never filtered. In a production build, `window.SHAREVIEW_POSITIONS_ENDPOINT` etc. are undefined, so the browser will first attempt the relative `/api/` path (which succeeds), but the localhost entries remain in the array and are visible in the source bundle. If the relative path ever fails (e.g. a 503), the browser will also attempt `http://127.0.0.1:5588` — a cross-origin request that will fail with a CORS error — leaking the internal dev port. The `accounts/app.js` file correctly uses only relative paths without any localhost fallback.

**Empfehlung:**
Removes dev-only infrastructure from the production bundle, avoids CORS errors on fallback, and does not disclose internal service ports.

---

### 10. Inline `onerror` attribute in innerHTML creates a CSP violation and bypasses React-style event delegation

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** XSS / Security  
**Datei/Ort:** `stocks/features.js, lines 398 and 1349 (fnRenderDepotRows, fnInitCategoryView table rows)`

**Problem:**
Two `<img>` elements are injected via `innerHTML` with `onerror="this.style.display='none';"` as an inline event handler attribute. Most production Content Security Policy configurations include `'unsafe-inline'` in `script-src` as restricted or absent, which would block these handlers from executing. Even when CSP is not strictly enforced, inline event handlers in dynamically-generated HTML are generally considered poor practice because they cannot be removed, cannot be unit-tested, and prevent adoption of a `script-src 'nonce-...'` CSP header. The `onerror` logic itself is safe (it only hides the element), but the pattern is inconsistent with the event delegation pattern used throughout the rest of the codebase. A simple `addEventListener` after insertion, or a CSS `.error` class toggled via a delegated listener, would be equivalent and policy-compatible.

**Empfehlung:**
Enables adoption of a strict Content Security Policy; eliminates inline script attributes from innerHTML.

**Aktueller Code:**
```javascript
<img ... onerror="this.style.display='none';">
```

**Verbesserter Code:**
```javascript
// After building the HTML, attach the error handler programmatically:
elHoldingsTbody.querySelectorAll('img.stock-logo').forEach((img) => {
  img.addEventListener('error', () => { img.style.display = 'none'; }, { once: true });
});
```

---

### 11. Missing input validation: trade amount input accepts non-positive fractional values and has no max

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Missing Input Validation  
**Datei/Ort:** `stocks/views.js line (analysisTradeAmountInput), stocks/features.js lines 903–912 and 998–1001`

**Problem:**
The `analysisTradeAmountInput` is rendered with `min="0.0001" step="0.0001"` but has no `max` attribute. The JS validation only checks `nAmount <= 0`, so a user could type `999999999` shares and the trade logic will attempt to post that value to the backend. Additionally, the HTML `min` and `step` attributes are browser hints only — the `value` attribute can be set programmatically to any value. The backend likely validates the amount, but providing a sensible client-side max (e.g. the owned quantity for sells, or a configurable ceiling for buys) would prevent accidental fat-finger trades before a network round-trip. The sell path does check `nAmount > nOwnedAmount`, but only for the total across all accounts — not before the slow `fnGetLatestPriceBySymbol` call.

**Empfehlung:**
Catches obviously erroneous inputs immediately on the client without requiring an API round-trip or showing a confusing backend error.

---

### 12. Missing empty state for the groups list while initial data is loading

**Priorität:** 🟢 `LOW`  
**Kategorie:** Missing Loading/Empty State  
**Datei/Ort:** `groups/app.js, bootstrap() function and renderGroups()`

**Problem:**
`bootstrap()` calls `Promise.all([loadSession(), loadGroups(), loadInvitations()])`. During this period, `groupsState` is an empty array and `renderGroups([])` has already been called (at the top level before `bootstrap()` completes), showing the 'Noch keine Gruppen' empty-state block. There is no visual distinction between 'loading' and 'genuinely empty'. If the API is slow, users see an empty-group placeholder immediately and may assume they are not in any groups, leading to confusion. A simple loading spinner or skeleton element in the initial HTML that is removed once `bootstrap()` resolves would provide a better experience. The same issue exists for invitations, which shows the empty inbox immediately.

**Empfehlung:**
Reduces user confusion during initial load on slow connections; consistent with the loading states shown in the stocks and accounts pages.

---

### 13. fnRenderSearchResults in analysis view does not debounce the backend search call

**Priorität:** 🟢 `LOW`  
**Kategorie:** Code Quality  
**Datei/Ort:** `stocks/features.js, lines 776–809 (fnRenderSearchResults) and line 836 (input listener)`

**Problem:**
The `input` event on `analysisCatalogSearchInput` calls `await fnRenderSearchResults()` synchronously (no debounce). Every keystroke triggers a call to `fnSearchStocksViaBackend`, which issues a `fetch` to `/api/stocks/search`. A user typing 'Apple' will fire 5 network requests in rapid succession. The stale-request problem is partially mitigated by the `iSearchRequestSeq` sequence counter, which discards out-of-order results, but the requests are still all sent. On a slow connection or rate-limited API, this saturates the connection for search queries. A 200–300 ms debounce would reduce the number of in-flight requests without any perceptible UX degradation.

**Empfehlung:**
Reduces unnecessary backend load and avoids rate-limiting on the stock search API endpoint for fast typists.

**Aktueller Code:**
```javascript
elCatalogSearchInput.addEventListener('input', async () => {
  sCatalogSearchTerm = String(elCatalogSearchInput.value || '').trim();
  await fnRenderSearchResults(); // fires on every keystroke
});
```

**Verbesserter Code:**
```javascript
let _searchDebounceTimer = null;
elCatalogSearchInput.addEventListener('input', () => {
  sCatalogSearchTerm = String(elCatalogSearchInput.value || '').trim();
  clearTimeout(_searchDebounceTimer);
  _searchDebounceTimer = setTimeout(() => fnRenderSearchResults(), 250);
});
```

---

### 14. Accessibility: stock-performance span used as a toggle button has no keyboard role or tabindex

**Priorität:** 🟢 `LOW`  
**Kategorie:** Accessibility  
**Datei/Ort:** `stocks/features.js, lines 159/177 (fnBuildDevelopmentCellHtml), views.js (k_profit_loss span)`

**Problem:**
The performance display `<span class="stock-performance is-clickable">` elements in the holdings table and the KPI card are clickable controls that toggle between absolute and percentage display mode. They are rendered as `<span>` elements without `role="button"`, `tabindex="0"`, or keyboard event handlers (`keydown` for Enter/Space). A keyboard-only user or screen reader user cannot discover or activate this interaction. WCAG 2.1 SC 4.1.2 requires that all interactive controls have an appropriate role and are operable via keyboard. The `elKProfitLossCard` click listener and the `elHoldingsTbody` click listener both rely on mouse clicks with no keyboard equivalent.

**Empfehlung:**
Makes the absolute/percentage toggle operable for keyboard-only users and properly announced by screen readers.

**Aktueller Code:**
```javascript
<span class="stock-performance is-clickable" data-display-mode="absolute">—</span>
```

**Verbesserter Code:**
```javascript
<button type="button" class="stock-performance is-clickable" data-display-mode="absolute" aria-label="Anzeigemodus wechseln">—</button>
```

---

### 15. fnAskTransferTargetPrompt uses window.prompt — bypasses custom UI and is not accessible

**Priorität:** 🟢 `LOW`  
**Kategorie:** Accessibility  
**Datei/Ort:** `stocks/features.js, lines 1363–1378 (fnAskTransferTargetPrompt)`

**Problem:**
`fnAskTransferTargetPrompt` uses the native `window.prompt()` dialog to ask users to type a raw account ID from a displayed list. This is a fallback path exported from the stocks page. By contrast, `fnPromptBankAccountSelection` in `state-api.js` and `fnAskTransferTargetModal` in `accounts/app.js` both render proper custom modal dialogs with `<select>` elements. The `window.prompt()` approach requires users to manually type an opaque ID string (a MongoDB ObjectId), provides no visual styling consistency, and does not work at all in environments where `window.prompt` is blocked (e.g. iframes, some browser extensions, cross-origin embeddings). The function is exported but it is not clear it is called anywhere in the reviewed files — if it is dead code it should be removed; if it is used it should be replaced with the modal pattern.

**Empfehlung:**
Consistent UX with no manual ID typing required; works in all environments.

---


## ⚙️ Backend-Qualität & Datenintegrität

### 1. Missing database transaction in handleRegisterVerify: user insert and finance-root creation are not atomic

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Error Handling / Data Integrity  
**Datei/Ort:** `backend/handlers/auth.mjs:handleRegisterVerify`

**Problem:**
The INSERT into `users` and the subsequent `ensureUserFinanceRoots` call (which inserts bank_accounts and share_accounts) run as separate, non-transactional statements. If the server crashes or the DB connection drops between them, the user row exists but has no finance roots, leaving the account in a broken state. The `email_verifications` cleanup row also runs outside the transaction, so a failure there leaves stale verification data.

**Empfehlung:**
Guarantees the user, their finance roots, and verification cleanup are all committed atomically. Eliminates the possibility of a half-created account.

**Aktueller Code:**
```javascript
const { rows: inserted } = await pool.query(`INSERT INTO users ...`);
const userId = inserted[0].id;
await ensureUserFinanceRoots(pool, userId);
await pool.query(`DELETE FROM email_verifications WHERE email = $1`, [email]);
```

**Verbesserter Code:**
```javascript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const { rows: inserted } = await client.query(`INSERT INTO users ...`);
  const userId = inserted[0].id;
  await ensureUserFinanceRoots(client, userId); // pass client, not pool
  await client.query(`DELETE FROM email_verifications WHERE email = $1`, [email]);
  await client.query('COMMIT');
  return sendJson(res, 201, { ok: true, ... });
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
```

---

### 2. Missing database transaction in handleDonateToFunding: three separate writes are not atomic

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Error Handling / Data Integrity  
**Datei/Ort:** `backend/handlers/groups.mjs:handleDonateToFunding`

**Problem:**
The donation flow performs at least five independent DML statements: upsert of `funding_participants`, update of `group_funding.amount`, insert of `private_expenses`, insert of `transactions`, and no rollback path if any of them fails. A crash mid-way results in a partial donation: funding balance may be updated but the expense record (or transaction record) is missing, corrupting the user's financial data.

**Empfehlung:**
Prevents money amounts diverging from expense/transaction records if any write fails partway through the flow.

**Aktueller Code:**
```javascript
await pool.query(`UPDATE funding_participants SET amount = $1 ...`);
await pool.query(`UPDATE group_funding SET amount = $1 ...`);
await pool.query(`INSERT INTO private_expenses ...`);
await pool.query(`INSERT INTO transactions ...`);
```

**Verbesserter Code:**
```javascript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // ... all five writes using client instead of pool ...
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
```

---

### 3. Missing database transaction in handleDeleteUserAccount: parallel deletes have ordering constraint violations

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Error Handling / Data Integrity  
**Datei/Ort:** `backend/handlers/user.mjs:handleDeleteUserAccount`

**Problem:**
Income and private_expenses rows referencing bank_accounts are deleted in a `Promise.all` alongside `DELETE FROM bank_accounts`. If a foreign-key constraint exists, this can fail non-deterministically depending on execution order. More critically, all deletes are non-transactional — if one fails the account is partially deleted and the final `DELETE FROM users` may still run.

**Empfehlung:**
Prevents partial deletes and FK constraint violations. Ensures the user is either fully deleted or not at all.

**Aktueller Code:**
```javascript
await Promise.all([
  pool.query(`DELETE FROM income WHERE bank_account_id IN (SELECT id FROM bank_accounts WHERE user_id = $1)`, [userId]),
  ...
  pool.query(`DELETE FROM bank_accounts WHERE user_id = $1`, [userId]),
]);
await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
```

**Verbesserter Code:**
```javascript
Use a single client transaction and delete in correct dependency order (child rows first, then parent rows).
```

---

### 4. Massive N+1 query problem in listQuestionsWithRelations for single-question GET

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Performance / N+1 Queries  
**Datei/Ort:** `backend/handlers/forum.mjs:handleQuestionById, handleQuestionAnswerCreate, handleAnswerById`

**Problem:**
After any mutation (POST answer, PATCH question, DELETE answer), the code calls `listQuestionsWithRelations(userId)` which fetches up to 600 questions plus all their answers, likes, and user data — just to find and return a single question. This is a full table scan followed by multiple fan-out queries every time one user edits or answers a question. Under load this scales as O(total_questions * users_mutating_concurrently).

**Empfehlung:**
Reduces a 7+ query fan-out over hundreds of rows down to 4-5 targeted queries against a single row. Eliminates the biggest hot path in the forum module.

**Aktueller Code:**
```javascript
// After inserting an answer:
const questions = await listQuestionsWithRelations(userId);
const updatedQuestion = questions.find((item) => item.id === String(questionId));
```

**Verbesserter Code:**
```javascript
// Create a separate fetchSingleQuestionWithRelations(userId, questionId) helper
// that queries only the single question, its answers, and their likes.
// Use it in all single-question response paths.
```

---

### 5. In-process logo cache uses unbounded Map with simplistic LRU eviction that leaks on reuse

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Performance / Memory  
**Datei/Ort:** `backend/handlers/finance.mjs:logoCacheSet, logoCacheGet`

**Problem:**
The cache evicts by deleting the first key returned by `Map.keys().next().value` when size >= 500. JavaScript Maps preserve insertion order, so this is LRU-like, but a deleted-then-re-inserted key moves to the end, permanently inflating memory. Separately, the `domainCache` has no size cap at all — it grows without bound across the server's lifetime.

**Empfehlung:**
Prevents unbounded memory growth from domain cache and makes eviction strategy consistent across both caches.

**Aktueller Code:**
```javascript
if (logoCache.size >= LOGO_CACHE_MAX) {
  const oldest = logoCache.keys().next().value;
  logoCache.delete(oldest);
}
logoCache.set(key, { ... });
```

**Verbesserter Code:**
```javascript
// Option A: use a proper LRU library (lru-cache)
// Option B: give domainCache a size cap and the same eviction logic
const DOMAIN_CACHE_MAX = 2000;
function domainCacheSet(key, domain) {
  if (domainCache.size >= DOMAIN_CACHE_MAX) {
    domainCache.delete(domainCache.keys().next().value);
  }
  domainCache.set(key, { domain, cachedAt: Date.now() });
}
```

---

### 6. Plaintext password migration iterates every user row with one UPDATE per row — no batching

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Performance  
**Datei/Ort:** `backend/handlers/auth.mjs:migratePlaintextPasswords`

**Problem:**
On startup, the function fetches all users and all email_verifications rows and loops over them, issuing one `UPDATE` query per legacy password. For a database with thousands of users this runs a large number of sequential round-trips synchronously, blocking server startup. The password hashing is CPU-intensive (scrypt) — running it in a single-thread loop will starve the event loop.

**Empfehlung:**
Dramatically reduces startup time by only touching rows that actually need migration and processing them concurrently in bounded batches.

**Aktueller Code:**
```javascript
for (const user of users) {
  // ...
  await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [nextPassword, user.id]);
}
```

**Verbesserter Code:**
```javascript
// Process in parallel batches and only select rows that still need migration:
const { rows: users } = await pool.query(
  `SELECT id, password FROM users WHERE password NOT LIKE '$scrypt$%' AND password NOT LIKE '$2b$%'`
);
// Hash in parallel batches of N to avoid blocking the event loop
for (const chunk of chunks(users, 10)) {
  await Promise.all(chunk.map(async (user) => {
    const hashed = await hashPassword(user.password);
    return pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [hashed, user.id]);
  }));
}
```

---

### 7. handleTransactions cursor pagination uses inconsistent sort column between initial and cursor-based queries

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Correctness / Pagination  
**Datei/Ort:** `backend/handlers/finance.mjs:handleTransactions`

**Problem:**
The combined income+expense UNION query sorts by `(sort_at, id)` and the cursor encodes `${ts}_${last.id}`. However, `sort_at` is computed as a `COALESCE` expression and may be NULL (NULLS LAST). If `sort_at` is NULL for the last row in a page, `ts` will be `NaN` and `nextCursor` becomes `NaN_${id}`, which the cursor parser then silently ignores (the regex `^(\d+)[_:](\d+)$` rejects NaN). The user gets stuck on the same page.

**Empfehlung:**
Prevents pagination getting stuck when sort_at is NULL and ensures the cursor always encodes a valid timestamp.

**Aktueller Code:**
```javascript
const ts = last.sort_at instanceof Date ? last.sort_at.getTime() : Date.parse(String(last.sort_at || ""));
if (Number.isFinite(ts)) nextCursor = `${ts}_${last.id}`;
```

**Verbesserter Code:**
```javascript
// Guard and fall back to created_at if sort_at is null:
const sortValue = last.sort_at ?? last.created_at;
const ts = sortValue instanceof Date ? sortValue.getTime() : Date.parse(String(sortValue || ""));
if (Number.isFinite(ts)) nextCursor = `${ts}_${last.id}`;
// Also ensure the UNION query aliases created_at instead of NULL for sort_at
```

---

### 8. Repeated identical pattern for resolving effectiveRecurrence / effectiveIsActive / effectiveState is copy-pasted four times

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** DRY / Maintainability  
**Datei/Ort:** `backend/handlers/finance.mjs:handleIncomeEntries, handleIncomeEntryById, handleExpenseEntries, handleExpenseEntryById`

**Problem:**
The three-line block that derives `effectiveRecurrence`, `effectiveIsActive`, and `effectiveState` from `cycle`, `recurrence`, and `isActive` is copy-pasted identically in all four entry mutation handlers. Any change to this logic must be applied in four places.

**Empfehlung:**
Single source of truth for entry state logic. Eliminates four maintenance points and future divergence bugs.

**Aktueller Code:**
```javascript
const effectiveRecurrence = cycle === "once" ? null : recurrence;
const effectiveIsActive = cycle === "once" ? true : (effectiveRecurrence === 0 ? false : isActive);
const effectiveState = cycle === "once" ? "open" : (effectiveRecurrence === 0 ? "completed" : (effectiveIsActive ? "open" : "paused"));
```

**Verbesserter Code:**
```javascript
// In a shared helper (e.g. helpers/entry-state.mjs):
export function resolveEntryState(cycle, recurrence, isActive) {
  const effectiveRecurrence = cycle === "once" ? null : recurrence;
  const effectiveIsActive = cycle === "once" ? true : (effectiveRecurrence === 0 ? false : isActive);
  const effectiveState = cycle === "once" ? "open" : (effectiveRecurrence === 0 ? "completed" : (effectiveIsActive ? "open" : "paused"));
  return { effectiveRecurrence, effectiveIsActive, effectiveState };
}
```

---

### 9. getGroupContext runs 4 sequential DB round-trips that could be reduced to 2

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Performance / N+1 Queries  
**Datei/Ort:** `backend/handlers/groups.mjs:getGroupContext`

**Problem:**
The function makes 4 sequential queries: SELECT users, SELECT groups, SELECT group_members, then returns. The first two (users and groups) are completely independent and could run in parallel. More importantly, this function is called at the start of nearly every group handler, meaning every group API request pays 4 sequential round-trips before doing any real work.

**Empfehlung:**
Reduces per-request latency for all group endpoints by eliminating one unnecessary sequential round-trip.

**Aktueller Code:**
```javascript
const userResult = await pool.query(`SELECT ... FROM users WHERE id = $1`, [userObjectId]);
// ...
const groupResult = await pool.query(`SELECT * FROM groups WHERE id = $1`, [groupId]);
// ...
const membershipResult = await pool.query(`SELECT * FROM group_members WHERE ...`);
```

**Verbesserter Code:**
```javascript
const [userResult, groupResult] = await Promise.all([
  pool.query(`SELECT id, username, first_name, last_name FROM users WHERE id = $1`, [userObjectId]),
  pool.query(`SELECT * FROM groups WHERE id = $1`, [groupId])
]);
// early-exit checks, then:
const membershipResult = await pool.query(`SELECT * FROM group_members WHERE ...`);
```

---

### 10. handleGroupDetail loads all group data in 7+ queries with no pagination — unbounded for large groups

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Performance / Missing Pagination  
**Datei/Ort:** `backend/handlers/groups.mjs:handleGroupDetail`

**Problem:**
The detail endpoint fetches all fundings, all activities, all participants, all expenses, all transactions, and all messages (via separate queries) for the group in one request. There are no LIMIT clauses on any of these fetches. A group with many months of history returns megabytes of data in a single response with no way for the client to paginate.

**Empfehlung:**
Prevents memory exhaustion and slow responses for active groups with large history. Enables the frontend to load progressively.

**Aktueller Code:**
```javascript
const fundingsResult = await pool.query(
  `SELECT id, group_activity_id, amount, info, created_at FROM group_funding WHERE group_id = $1 ORDER BY created_at DESC`,
  [context.groupId]
);
```

**Verbesserter Code:**
```javascript
// Add limit/cursor parameters to the detail endpoint, or split into separate
// paginated sub-resource endpoints (e.g. GET /api/groups/:id/funding?limit=20&cursor=X)
// At minimum add a hard cap: ORDER BY created_at DESC LIMIT 100
```

---

### 11. Rate limiter uses a module-level mutable singleton initialized via a side-effecting function call

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Architecture / Testability  
**Datei/Ort:** `backend/utils/rate-limit.mjs:initRateLimiter, _sendJsonRef`

**Problem:**
The rate limiter stores `sendJson` in a module-level `_sendJsonRef` object that must be populated before `rateLimitBucket` is called, otherwise it throws. This is an implicit global dependency that breaks in tests and makes the module hard to reason about. If `initRateLimiter` is accidentally not called, every request throws a runtime error instead of failing at import time.

**Empfehlung:**
Eliminates implicit initialization dependency, makes the module safe to use in tests without setup, and removes the runtime error risk.

**Aktueller Code:**
```javascript
const _sendJsonRef = { sendJson: null };
export function initRateLimiter(sendJsonFn) {
  _sendJsonRef.sendJson = sendJsonFn;
}
export function rateLimitBucket(res, key, ...) {
  const { sendJson } = _sendJsonRef;
  if (!sendJson) throw new Error("Rate limiter not initialized");
  ...
}
```

**Verbesserter Code:**
```javascript
// Accept sendJson as a parameter directly:
export function rateLimitBucket(sendJson, res, key, maxAttempts, windowMs) { ... }
// Or import sendJson directly from utils/http.mjs (no circular dependency exists):
import { sendJson } from "../utils/http.mjs";
```

---

### 12. handleBankAccountById DELETE reads request body with silent catch that swallows real errors

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Error Handling  
**Datei/Ort:** `backend/handlers/finance.mjs:handleBankAccountById`

**Problem:**
The body parsing for the DELETE method uses a try/catch that only forwards `payload_too_large` and `invalid_json` — any other error (e.g. a network error, a destroyed socket) is silently ignored and `payload` is set to `{}`. This means the `transfer_to_bank_account_id` field is treated as absent and the wrong response branch is taken. The same pattern appears in `handleShareAccountById`.

**Empfehlung:**
Consistent body parsing behavior; prevents silent swallowing of socket/network errors which would produce confusing wrong-branch responses.

**Aktueller Code:**
```javascript
let payload;
try { payload = await readBody(req); } catch (err) {
  const error = err;
  if (error.message !== "invalid_json") {
    if (error.message === "payload_too_large") return sendJson(res, 413, ...);
    return badRequest(res, "Invalid JSON body");
  }
  payload = {};
}
```

**Verbesserter Code:**
```javascript
// Use the existing parseBody helper which already handles these cases correctly,
// or restructure so the catch does not silently fall through for unknown errors:
const payload = await parseBody(req, res);
if (!payload) return; // parseBody already sent the error response
```

---

### 13. Profile image stored as a base64 data URL in a users column — no size enforcement at the DB layer

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Architecture / Data Storage  
**Datei/Ort:** `backend/handlers/user.mjs:handleProfileImageUpload`

**Problem:**
Profile images are stored as raw base64 data URLs directly in a `users` table column. The server enforces a ~200 KB limit but there is no column-level constraint. This bloats every `SELECT * FROM users` query (e.g. in `getSessionUser`, `migratePlaintextPasswords`, `getPreparedData`) with up to 200 KB of binary data per user. It also makes `users` rows extremely wide for a table that should be a lightweight identity store.

**Empfehlung:**
Store profile images in object storage (S3/Supabase Storage) and persist only a URL. This reduces every user row from potentially 200 KB to < 200 bytes and eliminates the data from queries that do not need it.

---

### 14. handlePasswordForgot uses a hardcoded 15-minute TTL instead of the VERIFICATION_TTL_MINUTES constant

**Priorität:** 🟢 `LOW`  
**Kategorie:** Correctness / Consistency  
**Datei/Ort:** `backend/handlers/auth.mjs:handlePasswordForgot`

**Problem:**
The password reset expiry is computed as `now + 15 * 60 * 1000` — a hardcoded 15 minutes. Every other expiry in the same file uses `VERIFICATION_TTL_MINUTES`. If the environment variable `EMAIL_CODE_TTL_MINUTES` is changed the password reset TTL silently stays at 15 minutes.

**Empfehlung:**
One source of truth for code TTL. Operator configuration is honoured consistently across all flows.

**Aktueller Code:**
```javascript
const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
```

**Verbesserter Code:**
```javascript
const expiresAt = new Date(now.getTime() + VERIFICATION_TTL_MINUTES * 60 * 1000);
```

---

### 15. migratePlaintextPasswords fetches all users including sensitive fields at startup on every deploy

**Priorität:** 🟢 `LOW`  
**Kategorie:** Security / Performance  
**Datei/Ort:** `backend/handlers/auth.mjs:migratePlaintextPasswords`

**Problem:**
The migration runs unconditionally on every server start, fetching `SELECT id, password FROM users` for all users. After the one-time migration is complete, this query is pure overhead on every restart. There is no feature flag, version table, or detection of whether migration has already run.

**Empfehlung:**
Eliminates a full-table scan on every server start once the one-time migration is complete. Reduces startup latency.

**Aktueller Code:**
```javascript
export async function migratePlaintextPasswords(pool) {
  const { rows: users } = await pool.query(`SELECT id, password FROM users`);
```

**Verbesserter Code:**
```javascript
// Either: check a migrations table / env flag before running
// Or: filter at the DB level to only fetch rows that still need migration
const { rows: users } = await pool.query(
  `SELECT id, password FROM users
   WHERE password IS NOT NULL
     AND password NOT LIKE '$scrypt$%'
     AND length(password) > 0`
);
if (users.length === 0 && verifications.length === 0) return; // fast exit
```

---

### 16. handleIncomeEntries and handleExpenseEntries GET use cursor-by-id rather than cursor-by-(date, id)

**Priorität:** 🟢 `LOW`  
**Kategorie:** Correctness / Pagination  
**Datei/Ort:** `backend/handlers/finance.mjs:handleIncomeEntries, handleExpenseEntries`

**Problem:**
The list endpoints paginate using `WHERE id < $cursor ORDER BY id DESC`, but the default (first-page) ordering is `ORDER BY received_at/spent_at DESC NULLS LAST, pay_date DESC NULLS LAST, created_at DESC`. These two orderings are inconsistent: page 2 (cursor-based) will use id order while page 1 used date order, so items can appear on both pages or be skipped entirely.

**Empfehlung:**
Consistent pagination across pages. Eliminates the possibility of duplicate or missing entries when iterating through the full list.

**Aktueller Code:**
```javascript
// page 1: ORDER BY received_at DESC NULLS LAST, pay_date DESC NULLS LAST, created_at DESC
// page 2 (cursor): WHERE id < $cursorId ORDER BY id DESC
```

**Verbesserter Code:**
```javascript
// Use the same composite cursor as handleTransactions: (sort_date, id)
// Both page 1 and page N should ORDER BY received_at DESC NULLS LAST, id DESC
// Cursor: WHERE (received_at, id) < ($sortAt, $cursorId) ORDER BY received_at DESC NULLS LAST, id DESC
```

---

### 17. resolveLogoDomainBySymbol does not handle fetch errors — upstream failure propagates as unhandled rejection

**Priorität:** 🟢 `LOW`  
**Kategorie:** Error Handling  
**Datei/Ort:** `backend/handlers/finance.mjs:resolveLogoDomainBySymbol`

**Problem:**
The function uses `await fetch(...)` but has no try/catch. A network failure to the stock search API throws an uncaught rejection that bubbles up through `handleStockLogoProxy`'s own try/catch and returns a 502. However, because the error originates in a helper, the cache key is never set, so each retry re-issues the failing external request without any backoff or negative-caching.

**Empfehlung:**
Upstream fetch failures are negative-cached, preventing repeated hammering of an unreachable external service and returning a graceful empty domain instead of an unhandled exception.

**Aktueller Code:**
```javascript
const upstreamResponse = await fetch(upstreamUrl.toString(), { headers: { ... } });
const payload = await upstreamResponse.json().catch(() => null);
if (!upstreamResponse.ok || !Array.isArray(payload)) { domainCacheSet(cacheKey, ""); return ""; }
```

**Verbesserter Code:**
```javascript
try {
  const upstreamResponse = await fetch(upstreamUrl.toString(), { headers: { ... } });
  const payload = await upstreamResponse.json().catch(() => null);
  if (!upstreamResponse.ok || !Array.isArray(payload)) { domainCacheSet(cacheKey, ""); return ""; }
  ...
} catch {
  domainCacheSet(cacheKey, ""); // negative-cache for LOGO_NEGATIVE_TTL
  return "";
}
```

---

### 18. runtime.mjs exports OPENROUTER_MODEL as a hardcoded constant with no override path

**Priorität:** 🟢 `LOW`  
**Kategorie:** Configuration / Flexibility  
**Datei/Ort:** `backend/config/runtime.mjs`

**Problem:**
The OpenRouter model `arcee-ai/trinity-large-preview:free` is hardcoded with no environment variable override. If the model is deprecated or a different model is preferred in production, it requires a code change and redeploy instead of an environment variable update.

**Empfehlung:**
Allows model selection via environment variable without code changes. Makes A/B testing different models trivial.

**Aktueller Code:**
```javascript
export const OPENROUTER_MODEL = "arcee-ai/trinity-large-preview:free";
```

**Verbesserter Code:**
```javascript
export const OPENROUTER_MODEL = String(process.env.OPENROUTER_MODEL || "arcee-ai/trinity-large-preview:free").trim();
```

---

### 19. handleShareAccountById DELETE issues 3 separate UPDATE queries for shares transfer that could be one

**Priorität:** 🟢 `LOW`  
**Kategorie:** Performance / DRY  
**Datei/Ort:** `backend/handlers/finance.mjs:handleShareAccountById`

**Problem:**
When transferring shares to another account before deletion, the code issues three separate UPDATE queries for the three different share columns (share_account_id, depot_id, bank_account_id). These could be combined into one query using CASE expressions or the same value for all three columns.

**Empfehlung:**
Reduces 3 round-trips to 1 and ensures all three column updates happen within a single atomic statement.

**Aktueller Code:**
```javascript
await pool.query(`UPDATE shares SET share_account_id = $1 WHERE share_account_id = $2`, [transferTargetId, accountId]);
await pool.query(`UPDATE shares SET depot_id = $1 WHERE depot_id = $2`, [transferTargetId, accountId]);
await pool.query(`UPDATE shares SET bank_account_id = $1 WHERE bank_account_id = $2`, [transferTargetId, accountId]);
```

**Verbesserter Code:**
```javascript
await pool.query(`
  UPDATE shares SET
    share_account_id = CASE WHEN share_account_id = $2 THEN $1 ELSE share_account_id END,
    depot_id         = CASE WHEN depot_id = $2         THEN $1 ELSE depot_id END,
    bank_account_id  = CASE WHEN bank_account_id = $2  THEN $1 ELSE bank_account_id END
  WHERE share_account_id = $2 OR depot_id = $2 OR bank_account_id = $2
`, [transferTargetId, accountId]);
```

---


## ⚡ Performance & Optimierung

### 1. No HTTP Response Compression (gzip/brotli)

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Network  
**Datei/Ort:** `backend/server.mjs – handleStatic() and sendJson() in backend/utils/http.mjs`

**Problem:**
The Node.js HTTP server serves all static files and JSON API responses without any content-encoding compression. There is no gzip, brotli, or deflate handling anywhere in the codebase (confirmed by searching for zlib, createGzip, createBrotliCompress, Accept-Encoding). The package.json has no compression dependency. Text-based assets (JS, CSS, HTML, JSON) typically compress 60–80%, so every page load and API call transfers full uncompressed bytes.

**Empfehlung:**
Reduces transfer size of JS/CSS/JSON responses by 60–80%, directly cutting page load time and bandwidth cost. The stocks.js bundle alone (68 KB) would shrink to ~18 KB with brotli.

**Aktueller Code:**
```javascript
// backend/utils/http.mjs
export function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...
  });
  res.end(body);
}
```

**Verbesserter Code:**
```javascript
import { createBrotliCompress, createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

// Check Accept-Encoding and pipe through brotli or gzip before sending.
// Or simply add a reverse proxy (nginx, Caddy) in front that handles compression automatically.
```

---

### 2. No ETag / Conditional Request Support for Static Files

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Caching  
**Datei/Ort:** `backend/server.mjs – handleStatic()`

**Problem:**
The static file handler sends Cache-Control: no-cache for non-hashed assets (HTML pages, shared JSON files) but never generates or checks ETags or Last-Modified headers. Browsers must re-download every no-cache resource on every visit because the server never returns 304 Not Modified. This affects every HTML page load (index.html, dashboard.html, pages/*.html).

**Empfehlung:**
304 responses for unchanged HTML/assets are a single round-trip with zero body bytes, dramatically cutting repeat-visit load times.

**Aktueller Code:**
```javascript
const cacheControl = isHashed
  ? "public, max-age=31536000, immutable"
  : "no-cache";
res.writeHead(200, {
  "Content-Type": ...,
  "Cache-Control": cacheControl,
  // No ETag, no Last-Modified
});
```

**Verbesserter Code:**
```javascript
import { stat } from 'node:fs/promises';
// After reading the file:
const fileStat = await stat(filePath);
const etag = `"${fileStat.mtimeMs.toString(16)}-${fileStat.size.toString(16)}"`;
const ifNoneMatch = req.headers['if-none-match'];
if (ifNoneMatch === etag) {
  res.writeHead(304); res.end(); return;
}
res.writeHead(200, { 'ETag': etag, 'Cache-Control': 'no-cache', ... });
```

---

### 3. Stock Search Input Has No Debounce

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Network  
**Datei/Ort:** `apps/web/src/pages/stocks/features.js – line 836`

**Problem:**
The stock catalog search fires fnSearchStocksViaBackend (an HTTP request to /api/stocks/search) on every single 'input' event with no debounce or throttle. A user typing 'Apple' generates 5 separate network requests in quick succession. fnSearchStocksViaBackend itself may also fall back to fetching the full Allstocks.json catalog if the backend returns no results, making this potentially 2 requests per keystroke.

**Empfehlung:**
Reduces API call volume by ~80% for a typical search interaction, removes visible lag during typing, and reduces backend load.

**Aktueller Code:**
```javascript
elCatalogSearchInput.addEventListener("input", async () => {
  sCatalogSearchTerm = String(elCatalogSearchInput.value || "").trim();
  await fnRenderSearchResults(); // fires HTTP request immediately on every keystroke
});
```

**Verbesserter Code:**
```javascript
let _searchDebounceTimer = null;
elCatalogSearchInput.addEventListener("input", () => {
  sCatalogSearchTerm = String(elCatalogSearchInput.value || "").trim();
  clearTimeout(_searchDebounceTimer);
  _searchDebounceTimer = setTimeout(() => fnRenderSearchResults(), 300);
});
```

---

### 4. Dashboard Bootstrap Makes 5 Sequential API Requests

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Network  
**Datei/Ort:** `apps/web/src/pages/dashboard/bootstrap.js and dashboard-api.js – refreshCategoryData(), refreshDashboardData()`

**Problem:**
Dashboard initialisation fires API requests in sequence: (1) /api/session, then (2) refreshCategoryData() -> /api/categories, then (3) refreshDashboardData() which sequentially calls (4) /api/bank-accounts, then (5) /api/transactions, then (6) /api/budgets/status. Each waits for the previous to complete. On a 50 ms round-trip, this is 250–300 ms of pure waiting before any data is rendered.

**Empfehlung:**
Running the independent calls in parallel with Promise.all would reduce the waterfall to 2 sequential tiers (~100 ms instead of ~300 ms), cutting perceived load time by more than half.

**Aktueller Code:**
```javascript
// bootstrap.js
await refreshCategoryData();   // waits for /api/categories
// ... then
await refreshDashboardData();  // waits for /api/bank-accounts, /api/transactions, /api/budgets/status sequentially
```

**Verbesserter Code:**
```javascript
// Run independent fetches in parallel
await Promise.all([
  refreshCategoryData(),
  refreshDashboardData()
]);

// Inside refreshDashboardData, also parallelise:
const [tx, budgetAlerts] = await Promise.all([
  loadTransactions(),
  loadBudgetStatus()
]);
```

---

### 5. ensureUserFinanceRoots Called Redundantly on Every Finance API Request

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Database  
**Datei/Ort:** `backend/handlers/finance.mjs – handleTransactions(), handleIncomeEntries(), handleExpenseEntries()`

**Problem:**
ensureUserFinanceRoots executes 2–4 database queries on every call (SELECT bank_accounts, optionally INSERT, SELECT share_accounts, optionally INSERT). It is called at the top of handleTransactions, handleIncomeEntries, and handleExpenseEntries independently. A page load that calls all three endpoints will run this function 3 times, issuing up to 12 redundant queries against the accounts tables for an already-established user.

**Empfehlung:**
Eliminating duplicate account lookups for established users saves 4–8 DB round-trips per dashboard load.

**Aktueller Code:**
```javascript
// handleTransactions
const userAccounts = await ensureUserFinanceRoots(pool, userId);

// handleIncomeEntries (separate request)
const userAccounts = await ensureUserFinanceRoots(pool, userId);

// handleExpenseEntries (separate request)
const userAccounts = await ensureUserFinanceRoots(pool, userId);
```

**Verbesserter Code:**
```javascript
// Replace ensureUserFinanceRoots with a lighter listUserBankAccounts for established users.
// Only call ensureUserFinanceRoots on first login / registration. Add a flag column
// (e.g. users.accounts_initialized) so subsequent requests use the fast path:
const userAccounts = await listUserBankAccounts(pool, userId);
// if (!userAccounts.length) ... handle edge case once
```

---

### 6. Session Validation Issues 2 DB Queries Per Authenticated Request

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Database  
**Datei/Ort:** `backend/handlers/auth.mjs – getSessionUser()`

**Problem:**
Every authenticated API request calls getSessionUser which makes two sequential DB queries: (1) SELECT from sessions WHERE token=? and (2) SELECT from users WHERE id=?. Optionally a third query is made to UPDATE sessions SET expires_at when the session nears expiry. The user record is re-fetched from the database on every single request, even though the users table data almost never changes.

**Empfehlung:**
Joining sessions and users in one query halves the per-request DB overhead. Alternatively, storing the username/email in the session row at creation time eliminates the second query entirely.

**Aktueller Code:**
```javascript
// getSessionRecord: SELECT user_id FROM sessions WHERE token = $1
const rec = await getSessionRecord(token);
// then separately:
const { rows } = await pool.query(
  `SELECT id, username, email, ... FROM users WHERE id = $1`, [rec.userId]
);
```

**Verbesserter Code:**
```javascript
// Combine into a single JOIN query:
const { rows } = await pool.query(
  `SELECT s.user_id, s.expires_at, u.username, u.email, u.first_name, u.last_name, u."profileImage"
   FROM sessions s JOIN users u ON u.id = s.user_id
   WHERE s.token = $1`,
  [token]
);
```

---

### 7. Allstocks.json Catalog Fetched Without In-Memory or localStorage Cache

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Caching  
**Datei/Ort:** `apps/web/src/pages/stocks/state-api.js – fnLoadAllStocksCatalog() (line 770)`

**Problem:**
fnLoadAllStocksCatalog performs a plain fetch('/global-information/Allstocks.json') with no caching layer. The existing fnCacheRead/fnCacheWrite helpers (5-minute TTL localStorage cache) are used for Twelve Data API calls but not for this catalog. The catalog is also fetched at line 1307 via Promise.all alongside positions. On every depot view initialization the full JSON is re-downloaded and re-parsed regardless of how recently it was loaded.

**Empfehlung:**
Adding a memory-level cache (module-scope variable) means the catalog is fetched at most once per session, eliminating repeated downloads of what can be a large JSON file.

**Aktueller Code:**
```javascript
export async function fnLoadAllStocksCatalog(oOptions = {}) {
  try {
    const oResponse = await fetch(sAllStocksDataPath); // no cache check
    if (!oResponse.ok) return [];
    const oData = await oResponse.json();
    // ... filter and return
  } catch { return []; }
}
```

**Verbesserter Code:**
```javascript
let _catalogCache = null;
let _catalogCacheTs = 0;
const CATALOG_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function fnLoadAllStocksCatalog(oOptions = {}) {
  if (_catalogCache && Date.now() - _catalogCacheTs < CATALOG_TTL_MS) {
    return _applyExchangeFilter(_catalogCache, oOptions);
  }
  const oResponse = await fetch(sAllStocksDataPath);
  if (!oResponse.ok) return [];
  _catalogCache = (await oResponse.json())?.data ?? [];
  _catalogCacheTs = Date.now();
  return _applyExchangeFilter(_catalogCache, oOptions);
}
```

---

### 8. Logo Proxy Fires Up to 8 Parallel External HTTP Requests Per Cache Miss

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Network  
**Datei/Ort:** `backend/handlers/finance.mjs – handleStockLogoProxy()`

**Problem:**
On a cache miss, the logo handler constructs 2 path candidates (domain + ticker) and 4 format/background variants, then pushes all 8 into a Promise.any race. This means every uncached logo causes 8 simultaneous outbound HTTP requests to the logo.dev API. With many uncached logos on the stocks page, this can saturate the Node.js HTTP agent and exhaust upstream API rate limits quickly.

**Empfehlung:**
Trying candidates sequentially with a fast timeout (or limiting to 2 highest-priority variants first) reduces external request volume by 75% while maintaining similar success rates for most symbols.

**Aktueller Code:**
```javascript
const formatVariants = [
  { format: "svg", background: "transparent" },
  { format: "svg" },
  { format: "png", background: "transparent" },
  { format: "png" }
];
const fetches = [];
for (const pathCandidate of logoCandidates) {  // 2 candidates
  for (const variant of formatVariants) {       // 4 variants each = 8 requests
    fetches.push(fetch(...));
  }
}
const result = await Promise.any(fetches); // all 8 fired simultaneously
```

**Verbesserter Code:**
```javascript
// Try only the 2 highest-priority variants first (domain SVG transparent, ticker SVG)
// Only fall back to remaining variants if both fail:
const priorityFetches = [
  buildLogoFetch(domain ? `/${encodeURIComponent(domain)}` : null, 'svg', 'transparent'),
  buildLogoFetch(`/ticker/${encodeURIComponent(symbol)}`, 'svg', 'transparent')
].filter(Boolean);
try {
  return await Promise.any(priorityFetches);
} catch {
  // fallback to remaining variants
}
```

---

### 9. Startup Password Migration Scans Entire Users Table on Every Boot

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Database  
**Datei/Ort:** `backend/handlers/auth.mjs – migratePlaintextPasswords() called from server.mjs line 98`

**Problem:**
migratePlaintextPasswords runs on every server startup and issues SELECT id, password FROM users (full table scan) plus SELECT id, password FROM email_verifications, then iterates every row individually calling the expensive scrypt hash function for any non-hashed password. This is a O(n) sequential startup operation that grows linearly with user count. Once all passwords are migrated there is no guard to skip the scan.

**Empfehlung:**
Adding a CHECK or a flag to skip when no plaintext passwords exist, or using a one-time migration marker (e.g. a migrations table), reduces startup time to a near-zero cost query after the initial migration is complete.

**Aktueller Code:**
```javascript
// server.mjs
await migratePlaintextPasswords(pool); // runs full table scan every startup

// auth.mjs - no early exit guard
const { rows: users } = await pool.query(`SELECT id, password FROM users`);
```

**Verbesserter Code:**
```javascript
// Add early-exit using a WHERE filter to only scan unhashed passwords:
const { rows: users } = await pool.query(
  `SELECT id, password FROM users
   WHERE password NOT LIKE '$scrypt$%' AND password NOT LIKE '$sha256$%'
     AND password IS NOT NULL AND password <> ''`
);
if (users.length === 0 && verifications.length === 0) return; // fast path
```

---

### 10. sectionMap Rebuilt as new Map on Every Static File Request

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** CPU  
**Datei/Ort:** `backend/routes/ui-routes.mjs – resolveStaticPath() line 67`

**Problem:**
resolveStaticPath creates a new Map with 7 entries on every call, even though the mappings are static constants that never change at runtime. Every static file request (HTML pages, assets) allocates a new Map object, populates it, does a lookup, then discards it. While individually cheap, this is unnecessary allocation on the hot request path.

**Empfehlung:**
Hoisting the map to module scope (created once at startup) eliminates repeated allocations and keeps the hot path allocation-free.

**Aktueller Code:**
```javascript
// Called on every static file request:
export function resolveStaticPath(projectRoot, pathname) {
  const distRoot = path.join(projectRoot, "apps", "web", "dist");
  // ...
  const sectionMap = new Map([ // rebuilt on every call
    ["/pages/accounts/", path.join(distRoot, ...)],
    ["/pages/groups/",   path.join(distRoot, ...)],
    // 5 more entries...
  ]);
  const sectionRoot = sectionMap.get(pathname);
}
```

**Verbesserter Code:**
```javascript
// At module scope (once at startup):
const DIST_ROOT = path.join(PROJECT_ROOT, "apps", "web", "dist");
const SECTION_MAP = new Map([
  ["/pages/accounts/", path.join(DIST_ROOT, "pages", "accounts", "index.html")],
  // ...
]);

export function resolveStaticPath(projectRoot, pathname) {
  const sectionRoot = SECTION_MAP.get(pathname);
  // ...
}
```

---

### 11. Missing Database Indexes for Frequent Query Patterns

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Database  
**Datei/Ort:** `database/supabase-schema.sql`

**Problem:**
Several high-frequency query patterns lack appropriate indexes: (1) handleIncomeEntries orders by received_at DESC but the index covers (bank_account_id, pay_date DESC, created_at DESC) — received_at is not indexed, forcing a sort. (2) handleExpenseEntries orders by spent_at DESC but only pay_date is indexed similarly. (3) The budget status query filters private_expenses by spent_at >= monthStart and GROUP BY category — no index covers (bank_account_id, spent_at, category). (4) The sessions table has no index on user_id, which is queried during session cleanup and cascade operations.

**Empfehlung:**
Proper indexes on the sort and filter columns eliminate full-table scans on income and expenses tables, which grow continuously with user data.

**Aktueller Code:**
```javascript
-- Existing indexes (incomplete for actual query patterns):
CREATE INDEX idx_income_bank_date ON income(bank_account_id, pay_date DESC, created_at DESC);
CREATE INDEX idx_expenses_bank_date ON private_expenses(bank_account_id, pay_date DESC, created_at DESC);
-- No index on received_at, spent_at, or category
```

**Verbesserter Code:**
```javascript
CREATE INDEX idx_income_received ON income(bank_account_id, received_at DESC NULLS LAST);
CREATE INDEX idx_expenses_spent ON private_expenses(bank_account_id, spent_at DESC NULLS LAST);
CREATE INDEX idx_expenses_category_spent ON private_expenses(bank_account_id, spent_at, category);
CREATE INDEX idx_sessions_user ON sessions(user_id);
```

---

### 12. Vite Build Lacks manualChunks, Source Maps Config, and Compression Plugin

**Priorität:** 🟢 `LOW`  
**Kategorie:** Bundle Size  
**Datei/Ort:** `apps/web/vite.config.ts`

**Problem:**
The Vite build configuration has no manualChunks strategy, no explicit minify setting, no sourcemap control for production, and no vite-plugin-compression for pre-compressed brotli/gzip assets. Vite's default chunking bundles shared utilities into every entry point that imports them. Without a compression plugin, the server must either compress at runtime (costly) or serve uncompressed assets.

**Empfehlung:**
Adding manualChunks to separate large shared chunks (api-client, language-utils) and a compression plugin produces pre-built .br/.gz files that can be served by the static file handler with zero runtime cost.

**Aktueller Code:**
```javascript
build: {
  outDir: 'dist',
  emptyOutDir: true,
  rollupOptions: {
    input: { /* 9 entry points */ }
    // No manualChunks, no sourcemap: false, no compression
  }
}
```

**Verbesserter Code:**
```javascript
import { compression } from 'vite-plugin-compression2';

build: {
  outDir: 'dist',
  sourcemap: false, // disable in production
  rollupOptions: {
    input: { /* 9 entry points */ },
    output: {
      manualChunks: {
        'shared': ['./src/shared/js/api-client.js', './src/shared/js/language-utils.js',
                   './src/shared/js/currency-utils.js', './src/shared/js/session-utils.js']
      }
    }
  }
},
plugins: [compression({ algorithm: 'brotliCompress' })]
```

---

### 13. Dashboard refreshDashboardData Fetches Bank Accounts Even With No Multi-Account Users

**Priorität:** 🟢 `LOW`  
**Kategorie:** Network  
**Datei/Ort:** `apps/web/src/pages/dashboard/dashboard-api.js – refreshDashboardData()`

**Problem:**
Every time the dashboard refreshes, it fetches /api/bank-accounts to populate the account filter selector, even for users who have only one bank account. The selector is immediately hidden (dashboardFilterWrap.hidden = true) for single-account users, so the fetch result is wasted. This adds a round-trip for the most common case.

**Empfehlung:**
Since bank accounts rarely change, this list can be cached in memory for the session duration and only re-fetched after create/delete operations.

**Aktueller Code:**
```javascript
export async function refreshDashboardData() {
  if (!appState.user?.id) return;
  appState.bankAccounts = await loadBankAccounts(appState.user.id); // always fetched
  // ... then hides filter UI if only one account
  dashboardFilterWrap.hidden = !hasMultipleAccounts;
}
```

**Verbesserter Code:**
```javascript
// Cache bank accounts in appState after first fetch; invalidate only on mutations:
if (!appState.bankAccountsLoaded) {
  appState.bankAccounts = await loadBankAccounts();
  appState.bankAccountsLoaded = true;
}
// Only re-fetch after POST/DELETE to /api/bank-accounts
```

---


## 🧹 Frontend-Codequalität (Dashboard)

### 1. Duplicated translation wrapper function across every module

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Code Duplication  
**Datei/Ort:** `dashboard/script.js (tr), dashboard/overview-cashflow.js (cashflowT), dashboard/expense.js (expenseT), dashboard/income.js (incomeT)`

**Problem:**
Each module copy-pastes an identical three-line translation wrapper that calls sharedT, falls back to a hardcoded string, and interpolates {param} placeholders. The only difference is the local variable name. This means any bug fix or logic change must be applied in four places. shared/language-utils.js already exports createT(prefix) which is designed for exactly this purpose.

**Empfehlung:**
Eliminating all four copies and using createT from language-utils reduces ~40 lines of duplicated logic to a single import per file and makes future i18n changes a one-place edit.

**Aktueller Code:**
```javascript
function cashflowT(key, fallback, params = {}) {
  const translated = sharedT(key, params);
  if (translated && translated !== key) return translated;
  if (!params || !Object.keys(params).length) return fallback;
  return String(fallback || "").replaceAll(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
}
```

**Verbesserter Code:**
```javascript
import { createT } from '@shared/js/language-utils.js';
const cashflowT = createT('cashflow'); // or createT('') for module-level scoping
```

---

### 2. XSS risk: user-controlled strings injected into innerHTML without escaping in script.js

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Security / XSS  
**Datei/Ort:** `dashboard/script.js – render(), renderLoginFields(), renderForgotFields(), renderResetFields(), renderVerifyFields()`

**Problem:**
The render() method writes this.innerHTML using template literals that embed title, subtitle, fields, and submitLabel — all values derived from the tr() function which returns strings. If any translation string or fallback were ever sourced from user input (e.g., a malicious server response or a compromised i18n file) the HTML would be injected verbatim. More concretely, renderForgotFields() and renderVerifyFields() embed escapeAttribute(this.pendingEmail) in value= attributes, but the same email value appears unescaped in status messages via setStatus → textContent, which is safe. The risk is real if the server ever reflects data back through the translation layer.

**Empfehlung:**
Using DOM APIs (createElement / textContent / setAttribute) for the structural parts removes the innerHTML injection surface entirely. At minimum, all dynamic values embedded in template literals going to innerHTML must pass through escapeHtml/escapeAttribute.

**Aktueller Code:**
```javascript
this.innerHTML = `
  <section class="login-card">
    <h1 class="login-title">${title}</h1>
    <p class="login-subtitle">${subtitle}</p>
    ...`;
// title/subtitle come from tr() which passes server-sourced translations unescaped
```

**Verbesserter Code:**
```javascript
// Use textContent for all user-visible text nodes
const h1 = this.querySelector('.login-title');
if (h1) h1.textContent = title;
// Or escape every interpolated value:
`<h1 class="login-title">${escapeHtml(title)}</h1>`
```

---

### 3. No debouncing on search inputs

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Performance  
**Datei/Ort:** `dashboard/categories-search.js – initListSearch(), lines 58-70`

**Problem:**
Both incomeSearch and expenseSearch fire renderIncomeList / renderExpenseList on every keypress via the 'input' event with no debounce. renderIncomeList calls buildHierarchicalGroups which iterates, sorts, and flat-maps the full entry array, then writes a large innerHTML string. On a large dataset this runs synchronously on the main thread for every character typed, causing visible jank.

**Empfehlung:**
A 150-200ms debounce reduces render calls by ~80% during fast typing, keeps the UI responsive, and costs two lines of code.

**Aktueller Code:**
```javascript
incomeSearch.addEventListener("input", () => {
  listState.incomeSearch = incomeSearch.value;
  renderIncomeList(appState.incomeEntries);
});
```

**Verbesserter Code:**
```javascript
let incomeSearchTimer;
incomeSearch.addEventListener("input", () => {
  listState.incomeSearch = incomeSearch.value;
  clearTimeout(incomeSearchTimer);
  incomeSearchTimer = setTimeout(() => renderIncomeList(appState.incomeEntries), 180);
});
```

---

### 4. CATEGORY_LABELS object duplicates data already present in INCOME_CATEGORY_OPTIONS / EXPENSE_CATEGORY_OPTIONS

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Code Duplication  
**Datei/Ort:** `dashboard/state.js – lines 57-75 (CATEGORY_LABELS) vs lines 35-52 (option arrays)`

**Problem:**
Every label in CATEGORY_LABELS is already declared in INCOME_CATEGORY_OPTIONS and EXPENSE_CATEGORY_OPTIONS. The same German strings appear three times for each category key. When a label needs updating (e.g., 'Rueckzahlung' → 'Rückzahlung') it must be changed in three places and it is easy to let them drift. categories-controls.js categoryLabel() already looks up CATEGORY_LABELS, but the source of truth should be the option arrays.

**Empfehlung:**
Deriving CATEGORY_LABELS from the option arrays at module load time makes the label canonical in one place and eliminates the risk of inconsistent label drift.

**Aktueller Code:**
```javascript
export const INCOME_CATEGORY_OPTIONS = [
  { value: "salary", label: "Gehalt" },
  ...
];
export const CATEGORY_LABELS = {
  salary: "Gehalt",
  ...
};
```

**Verbesserter Code:**
```javascript
export const INCOME_CATEGORY_OPTIONS = [
  { value: "salary", label: "Gehalt" },
  ...
];
// Derive instead of duplicating:
export const CATEGORY_LABELS = Object.fromEntries(
  [...INCOME_CATEGORY_OPTIONS, ...EXPENSE_CATEGORY_OPTIONS].map(({ value, label }) => [value, label])
);
```

---

### 5. refreshDashboardData calls renderBankAccountSelectors and renderBudgetAlerts which are defined in dashboard-api.js but referenced without import guards

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Correctness / Missing error handling  
**Datei/Ort:** `dashboard/dashboard-api.js – refreshDashboardData(), lines ~60-75`

**Problem:**
refreshDashboardData() calls renderBankAccountSelectors() and renderBudgetAlerts() directly. Both are defined in the same file, but loadBankAccounts(), loadTransactions(), and loadBudgetStatus() are all awaited with no try/catch. If any network call throws (e.g., a fetch exception on offline/timeout), refreshDashboardData rejects and the UI is left in a partial state with no user feedback. The outer bootstrap.js also does not catch the rejection from refreshDashboardData.

**Empfehlung:**
Wrapping each network call in a try/catch (or adding a .catch on the outer call) ensures the UI degrades gracefully and the user sees an error message rather than a silently broken dashboard.

**Aktueller Code:**
```javascript
export async function refreshDashboardData() {
  if (!appState.user?.id) return;
  appState.bankAccounts = await loadBankAccounts(appState.user.id);
  // ... no try/catch
  const tx = await loadTransactions();
  // ...
}
```

**Verbesserter Code:**
```javascript
export async function refreshDashboardData() {
  if (!appState.user?.id) return;
  try {
    appState.bankAccounts = await loadBankAccounts();
    // ...
    const tx = await loadTransactions();
    // ...
  } catch (err) {
    setStatus('dashboard-status', 'error', 'Daten konnten nicht geladen werden.');
    console.error('refreshDashboardData failed', err);
  }
}
```

---

### 6. Dead/unused bUseSharedTopbar flag with dead code branches in bootstrap.js

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Code Quality  
**Datei/Ort:** `dashboard/bootstrap.js – lines 50-57`

**Problem:**
The constant bUseSharedTopbar is hardcoded to true and never changes. The two if (!bUseSharedTopbar) blocks calling initDashboardMobileNav(), hydrateProfile(), and initProfileMenu() are therefore permanently unreachable dead code. This confuses readers into thinking there is a live toggle when there is none, and the dead branches must still be mentally parsed during maintenance.

**Empfehlung:**
Removing the flag and the dead branches reduces cognitive load and eliminates functions that may be unmaintained because they are never executed.

**Aktueller Code:**
```javascript
const bUseSharedTopbar = true;
if (!bUseSharedTopbar) {
  initDashboardMobileNav();
  hydrateProfile(appState.user);
}
// ...
if (!bUseSharedTopbar) {
  initProfileMenu();
}
```

**Verbesserter Code:**
```javascript
// Remove bUseSharedTopbar entirely; delete the two dead if-blocks.
// If the toggle is genuinely needed, use an env/feature-flag.
```

---

### 7. loadUserCategories called with a userId argument that the function ignores

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Correctness  
**Datei/Ort:** `dashboard/dashboard-api.js – refreshCategoryData() and refreshDashboardData()`

**Problem:**
refreshCategoryData() calls loadUserCategories(appState.user.id) and refreshDashboardData() calls loadBankAccounts(appState.user.id). Both loadUserCategories and loadBankAccounts are defined with no parameters — they derive context from appState directly and their signatures are just (). Passing userId creates a false impression that the functions are parameterised, and the argument is silently discarded. This is a latent correctness bug: if future code assumes the passed userId controls which user's data is loaded, it will be wrong.

**Empfehlung:**
Removing the spurious arguments makes the call sites match the function signatures, prevents confusion, and surfaces the coupling to appState explicitly.

**Aktueller Code:**
```javascript
const categories = await loadUserCategories(appState.user.id);
// but loadUserCategories() signature: export async function loadUserCategories() {
```

**Verbesserter Code:**
```javascript
const categories = await loadUserCategories();
```

---

### 8. Confirm modal Escape key listener is never removed — memory leak

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Memory Leak  
**Datei/Ort:** `dashboard/modal.js – initConfirmModal(), line ~28`

**Problem:**
initConfirmModal attaches a document-level 'keydown' listener to close the modal on Escape. This listener is attached once at initialisation time and is never removed, even when the dashboard is torn down or the user navigates away (soft-navigation via iframe). On every call to initConfirmModal (called once in bootstrap, but the pattern is dangerous) the listener accumulates. More critically, the listener closes over the backdrop and resolver references, preventing GC of those nodes if the DOM is replaced.

**Empfehlung:**
Using { once: true } or an AbortController/signal on the keydown listener ensures it is cleaned up after each modal interaction rather than persisting for the page lifetime.

**Aktueller Code:**
```javascript
document.addEventListener("keydown", (event) => {
  if (!backdrop.hidden && event.key === "Escape") {
    close(false);
  }
});
```

**Verbesserter Code:**
```javascript
// Option 1: add/remove per open/close cycle
const handleKeydown = (event) => {
  if (event.key === "Escape") close(false);
};
// In the returned open function:
document.addEventListener("keydown", handleKeydown, { once: false });
// In close():
document.removeEventListener("keydown", handleKeydown);
```

---

### 9. renderCashflowBars builds and replaces the entire chart innerHTML on every updateFinanceCards call

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Performance  
**Datei/Ort:** `dashboard/overview-cashflow.js – renderCashflowBars()`

**Problem:**
Every call to updateFinanceCards (triggered by chart drill-down clicks, account filter changes, locale changes, and data refreshes) destroys and recreates the entire SVG chart including all polylines, dots, hitzone rects, tooltips, and event listeners. Event listeners are re-attached on every render. The tooltip div is re-appended on every render with container.append(tooltip). If updateFinanceCards is called in rapid succession (e.g., during resize or multiple filter changes) this causes significant DOM churn.

**Empfehlung:**
Separating the data computation from the render, caching the SVG structure, and using attribute/point updates instead of full innerHTML replacement would reduce DOM mutations by ~90% on each redraw.

**Aktueller Code:**
```javascript
container.innerHTML = `... entire chart markup ...`;
// then re-queries and re-attaches all event listeners
const tooltip = document.createElement("div");
container.append(tooltip);
```

**Verbesserter Code:**
```javascript
// At minimum: skip re-render when inputs haven't changed
const signature = JSON.stringify({keys, incomeValues, expenseValues});
if (container.dataset.lastSig === signature) return;
container.dataset.lastSig = signature;
// Full fix: extract SVG data-update helpers
```

---

### 10. Magic strings for API endpoints scattered across dashboard-api.js with no central definition

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Maintainability  
**Datei/Ort:** `dashboard/dashboard-api.js – all API call sites`

**Problem:**
API path strings like '/api/income-entries', '/api/expense-entries', '/api/transactions', '/api/bank-accounts', '/api/categories', '/api/budgets/status' are hardcoded inline at each call site. There is no central API_ROUTES constant or similar. If the backend renames an endpoint (e.g., /api/transactions → /api/entries) every occurrence must be found and changed manually, and a grep is needed to be sure no call site was missed.

**Empfehlung:**
A single API_ROUTES object defined once at the top of dashboard-api.js makes endpoint changes a one-line edit and makes the full API surface immediately visible.

**Aktueller Code:**
```javascript
const endpoint = appState.selectedBankAccountId
  ? `/api/income-entries?bank_account_id=...`
  : "/api/income-entries";
```

**Verbesserter Code:**
```javascript
const API = {
  incomeEntries: '/api/income-entries',
  expenseEntries: '/api/expense-entries',
  transactions: '/api/transactions',
  bankAccounts: '/api/bank-accounts',
  categories: '/api/categories',
  budgetsStatus: '/api/budgets/status',
};
// usage:
const endpoint = appState.selectedBankAccountId
  ? `${API.incomeEntries}?bank_account_id=...`
  : API.incomeEntries;
```

---

### 11. getIncomeFormElements and getExpenseFormElements are near-identical functions

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Code Duplication  
**Datei/Ort:** `dashboard/dashboard-api.js – getIncomeFormElements() and getExpenseFormElements()`

**Problem:**
Both functions perform the same getElementById/querySelector pattern on a different ID prefix ('income-' vs 'expense-'). They return objects with identical structure. setIncomeFormModeCreate/setIncomeFormModeEdit and their expense counterparts are also near-mirrors of each other (same logic, different field names and defaults). This is ~120 lines of duplicated code that must be maintained in parallel.

**Empfehlung:**
A single getFormElements(prefix) factory and a single setFormModeCreate(prefix, defaultCategory, defaultRecurrenceKey) function would cut this to ~60 lines and make future form field additions a single change.

**Aktueller Code:**
```javascript
export function getIncomeFormElements() {
  const form = document.getElementById("income-form");
  // ... 14 getElementById/querySelector calls
}
export function getExpenseFormElements() {
  const form = document.getElementById("expense-form");
  // ... 14 identical calls with 'expense-' prefix
}
```

**Verbesserter Code:**
```javascript
function getFormElements(prefix) {
  return {
    form: document.getElementById(`${prefix}-form`),
    submitBtn: document.getElementById(`${prefix}-submit-btn`),
    cancelBtn: document.getElementById(`${prefix}-cancel-btn`),
    source: document.getElementById(`${prefix}-source`),
    // ...
  };
}
export const getIncomeFormElements = () => getFormElements('income');
export const getExpenseFormElements = () => getFormElements('expense');
```

---

### 12. fetchJsonSync uses synchronous XMLHttpRequest, blocking the main thread

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Performance  
**Datei/Ort:** `shared/language-utils.js – fetchJsonSync(), line 89`

**Problem:**
The i18n initialisation uses a synchronous XHR (xhr.open('GET', url, false)) to load locale index and dictionary files. Synchronous XHR blocks the browser's main thread for the entire network round-trip, freezing all JavaScript execution and UI rendering. It is deprecated in the Fetch standard and generates browser console warnings. It is called from both loadLocaleSync and loadIndexSync which are called from runInit() at DOMContentLoaded.

**Empfehlung:**
Converting the init chain to async/await with fetch() removes the main-thread block, eliminates the deprecation warning, and allows the browser to continue rendering during the locale fetch.

**Aktueller Code:**
```javascript
function fetchJsonSync(url) {
  const xhr = new XMLHttpRequest();
  xhr.open("GET", url, false); // synchronous, blocks main thread
  xhr.send();
  // ...
}
```

**Verbesserter Code:**
```javascript
async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}
// Then make loadIndexSync -> loadIndex() async, etc.
```

---

### 13. MutationObserver in language-utils.js observes the entire document with characterData:true, causing translation re-runs on every text change

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Performance  
**Datei/Ort:** `shared/language-utils.js – runInit(), lines 277-288`

**Problem:**
The MutationObserver is attached to document.documentElement with subtree:true and characterData:true. This means any text node change anywhere in the document — including the translation function itself updating node.nodeValue — will re-trigger safeApply(document.documentElement) via the observer. The applying flag prevents infinite recursion, but every DOM update from renderIncomeList, renderExpenseList, renderCashflowBars, etc., fires the observer callback and causes a full document tree-walk for translation lookups.

**Empfehlung:**
Scoping the observer to only watch for new childList additions (new nodes being added to the DOM that need translation) and removing characterData:true would eliminate the redundant re-translation of already-translated nodes.

**Aktueller Code:**
```javascript
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true, // fires on every text change
  attributes: true,
  attributeFilter: ["placeholder", "aria-label", "title"]
});
```

**Verbesserter Code:**
```javascript
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  // remove characterData: true
  attributes: true,
  attributeFilter: ["placeholder", "aria-label", "title"]
});
```

---

### 14. No loading/disabled state on the account filter select during refreshDashboardData

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** UX / Missing loading state  
**Datei/Ort:** `dashboard/dashboard-api.js – initDashboardAccountFilter()`

**Problem:**
When the user changes the account filter, refreshDashboardData is awaited but the select element is not disabled during the async operation. The user can trigger multiple concurrent refreshDashboardData calls by changing the select repeatedly before the first one completes, causing race conditions where appState is written by whichever call resolves last, potentially out of order.

**Empfehlung:**
Disabling the select for the duration of the async operation prevents concurrent refreshes and gives the user clear feedback that data is loading.

**Aktueller Code:**
```javascript
dashboardFilterSelect.addEventListener("change", async () => {
  appState.selectedBankAccountId = String(dashboardFilterSelect.value || "").trim();
  await refreshDashboardData();
});
```

**Verbesserter Code:**
```javascript
dashboardFilterSelect.addEventListener("change", async () => {
  appState.selectedBankAccountId = String(dashboardFilterSelect.value || "").trim();
  dashboardFilterSelect.disabled = true;
  try {
    await refreshDashboardData();
  } finally {
    dashboardFilterSelect.disabled = false;
  }
});
```

---

### 15. renderBankAccountSelectors uses both hidden and style.display to hide the filter wrap

**Priorität:** 🟢 `LOW`  
**Kategorie:** Code Quality  
**Datei/Ort:** `dashboard/dashboard-api.js – renderBankAccountSelectors(), lines ~100-106`

**Problem:**
The same element dashboardFilterWrap is hidden using two separate mechanisms: the boolean hidden attribute and an inline style.display. This is redundant — the HTML hidden attribute alone is sufficient and is the modern idiomatic approach. Having both means a stylesheet that sets display:block on [hidden] elements would be counteracted by the inline style, and the intent of the code is unclear to readers.

**Empfehlung:**
Using only the hidden attribute removes one line of code per toggle site and avoids the specificity conflict between inline styles and attribute-based CSS.

**Aktueller Code:**
```javascript
if (dashboardFilterWrap) {
  dashboardFilterWrap.hidden = !hasMultipleAccounts;
  dashboardFilterWrap.style.display = hasMultipleAccounts ? "" : "none";
}
```

**Verbesserter Code:**
```javascript
if (dashboardFilterWrap) {
  dashboardFilterWrap.hidden = !hasMultipleAccounts;
}
```

---

### 16. Missing aria-live region for form status messages

**Priorität:** 🟢 `LOW`  
**Kategorie:** Accessibility  
**Datei/Ort:** `dashboard/income.js and expense.js – form status elements referenced via setStatus()`

**Problem:**
The income-form-status and expense-form-status elements receive success/error messages via setStatus() which sets textContent. For screen reader users these changes are invisible unless the container has an appropriate aria-live attribute. The shared toast system in api-client.js correctly uses aria-live='polite' on its region, but the inline form status elements do not, meaning assistive technology users get no announcement of save confirmations or errors.

**Empfehlung:**
Adding aria-live='polite' (for success) or aria-live='assertive' (for errors) to the status elements in the HTML ensures screen readers announce form feedback without requiring visual focus.

**Aktueller Code:**
```javascript
<!-- HTML presumed to be: -->
<p id="income-form-status" class="form-status"></p>
```

**Verbesserter Code:**
```javascript
<p id="income-form-status" class="form-status" aria-live="polite" aria-atomic="true"></p>
```

---

### 17. Hardcoded German strings in categories-search.js bypass the i18n system

**Priorität:** 🟢 `LOW`  
**Kategorie:** Maintainability / i18n  
**Datei/Ort:** `dashboard/categories-search.js – initCategoryManagerActions(), lines 27-30, 36, 39`

**Problem:**
The category deletion confirmation dialog and its status messages ('Kategorie loeschen?', 'Die Kategorie...', 'Kategorie konnte nicht geloescht werden.', 'Kategorie geloescht.') are hardcoded German strings. Other modules in the same file use sharedT for translation. These strings will not be translated when the locale switches to 'en-US', unlike the rest of the UI.

**Empfehlung:**
Running these strings through the t() / sharedT() function with appropriate fallbacks makes the category deletion flow consistent with the rest of the internationalised UI.

**Aktueller Code:**
```javascript
const confirmDelete = await incomeState.askConfirm({
  title: "Kategorie loeschen?",
  message: `Die Kategorie "${category}" wird aus der Auswahl entfernt...`,
  confirmText: "Kategorie loeschen"
});
```

**Verbesserter Code:**
```javascript
const confirmDelete = await incomeState.askConfirm({
  title: t('category.delete_confirm_title') || 'Kategorie loeschen?',
  message: t('category.delete_confirm_message', { category }) || `Die Kategorie "${category}" wird aus der Auswahl entfernt...`,
  confirmText: t('category.delete_confirm_btn') || 'Kategorie loeschen'
});
```

---


## 🗄️ Datenbank & Architektur

### 1. No Row Level Security (RLS) policies on any table

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Security  
**Datei/Ort:** `database/supabase-schema.sql — all tables`

**Problem:**
The schema creates all tables but never enables RLS nor defines any policy. In Supabase, the anon and authenticated roles can read or write every row in every table via the auto-generated REST API unless RLS is enabled. Any user who discovers the Supabase project URL and anon key can query every other user's financial data, messages, and personal information.

**Empfehlung:**
Enabling RLS and adding per-user policies (e.g., `USING (user_id = auth.uid())`) restricts every Supabase REST / realtime access path to exactly the rows the authenticated user owns, independent of the backend layer.

**Aktueller Code:**
```javascript
-- No ENABLE ROW LEVEL SECURITY or CREATE POLICY statements anywhere in the schema
```

**Verbesserter Code:**
```javascript
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_self ON users USING (id = current_setting('app.user_id')::int);
-- Repeat for bank_accounts, income, private_expenses, sessions, etc.
```

---

### 2. Balance is mutated with a non-atomic read-modify-write pattern under concurrency

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Data Integrity  
**Datei/Ort:** `backend/helpers/finance-db.mjs:incrementBankAccountBalance — called from finance.mjs handleIncomeEntries, handleExpenseEntries, handleIncomeEntryById, handleExpenseEntryById`

**Problem:**
The balance column is updated with `balance + $1`, which is atomic at the SQL level, but the surrounding code first reads the existing entry amount, then deletes/updates the entry, then calls incrementBankAccountBalance — all as separate, non-transactional statements. A concurrent request between the SELECT and the UPDATE can result in a double-debit or double-credit. For example, if two PATCH requests arrive simultaneously for the same income entry, both will read the old amount and both will apply the delta, producing a wrong balance.

**Empfehlung:**
Wrapping each multi-step financial write (INSERT entry + adjust balance, UPDATE entry + adjust balance, DELETE entry + reverse balance) in a single database transaction guarantees atomicity and prevents race-condition balance corruption.

**Aktueller Code:**
```javascript
// Separate statements, no transaction:
const { rows: existing } = await pool.query(`SELECT id, amount ... FROM income WHERE id=$1`, [entryId]);
await pool.query(`DELETE FROM income WHERE id=$1`, [entryId]);
await incrementBankAccountBalance(pool, existing[0].bank_account_id, -toFixedAmount(existing[0].amount));
```

**Verbesserter Code:**
```javascript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const { rows: existing } = await client.query(`SELECT id, amount, bank_account_id FROM income WHERE id=$1 FOR UPDATE`, [entryId]);
  await client.query(`DELETE FROM income WHERE id=$1`, [entryId]);
  await client.query(`UPDATE bank_accounts SET balance = balance + $1 WHERE id=$2`, [-toFixedAmount(existing[0].amount), existing[0].bank_account_id]);
  await client.query('COMMIT');
} catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
```

---

### 3. handleDeleteUserAccount deletes rows in parallel with foreign-key dependencies

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Data Integrity  
**Datei/Ort:** `backend/handlers/user.mjs:handleDeleteUserAccount lines 30-44`

**Problem:**
The handler fires seven DELETE queries with `Promise.all`. Some of these have foreign-key relationships: `bank_accounts` rows are referenced by `income`, `private_expenses`, `funding_participants`, `shares`, `requests`, and `transactions`. The parallel deletes can violate FK constraints depending on execution order (e.g., deleting `bank_accounts` before `income` when `income.bank_account_id` references `bank_accounts`). This is currently working only because cascade deletes happen to fire, but the parallel deletion of `users` and its dependents without a transaction is inherently fragile and can leave orphaned rows or raise FK violations.

**Empfehlung:**
Running the deletions in correct dependency order inside a single transaction, or relying fully on CASCADE FK rules defined in the schema, guarantees a clean, atomic account deletion.

**Aktueller Code:**
```javascript
await Promise.all([
  pool.query(`DELETE FROM income WHERE bank_account_id IN (SELECT id FROM bank_accounts WHERE user_id = $1)`, [userId]),
  pool.query(`DELETE FROM bank_accounts WHERE user_id = $1`, [userId]),
  ...
]);
await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
```

**Verbesserter Code:**
```javascript
// Option A: rely on schema CASCADE (add ON DELETE CASCADE on all FK chains).
// Option B: explicit ordered transaction:
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(`DELETE FROM income WHERE bank_account_id IN (SELECT id FROM bank_accounts WHERE user_id=$1)`, [userId]);
  await client.query(`DELETE FROM private_expenses WHERE bank_account_id IN (SELECT id FROM bank_accounts WHERE user_id=$1)`, [userId]);
  // ... remaining dependents in FK order ...
  await client.query(`DELETE FROM users WHERE id=$1`, [userId]);
  await client.query('COMMIT');
} catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
```

---

### 4. Missing UNIQUE constraint on group_members (user_id, group_id)

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Missing Constraint  
**Datei/Ort:** `database/supabase-schema.sql — group_members table`

**Problem:**
The `group_members` table has no unique constraint on `(user_id, group_id)`. Nothing prevents the same user from being inserted as a member of the same group multiple times. This would cause duplicate membership rows, incorrect role checks, and incorrect member-count calculations throughout the group handlers.

**Empfehlung:**
A unique constraint prevents duplicate memberships and enables safe upsert with ON CONFLICT.

**Aktueller Code:**
```javascript
CREATE TABLE group_members (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  role VARCHAR NOT NULL,
  status VARCHAR
);
```

**Verbesserter Code:**
```javascript
CREATE TABLE group_members (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  role VARCHAR NOT NULL,
  status VARCHAR,
  UNIQUE (user_id, group_id)
);
```

---

### 5. Ambiguous dual-column FK on shares table (share_account_id AND depot_id both reference share_accounts)

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Schema Design  
**Datei/Ort:** `database/supabase-schema.sql — shares table; backend/helpers/finance-db.mjs:deleteBankAccountAssociations; database/data-service.mjs`

**Problem:**
The `shares` table has three nullable FK columns pointing at what is semantically the same parent entity (`share_account_id`, `depot_id`, and `bank_account_id`). `share_account_id` and `depot_id` both reference `share_accounts(id)`. Every query that touches shares must `OR` all three columns, making queries verbose and fragile. `bank_account_id` on a shares row has no clear semantic meaning. The schema comment in the app code shows this grew from a legacy migration and was never cleaned up.

**Empfehlung:**
Collapsing to a single `share_account_id NOT NULL` column removes all the `OR depot_id = ANY(...)` workarounds, adds a proper NOT NULL constraint, and eliminates the risk of a share row orphaned because only one of two FK columns is set.

**Aktueller Code:**
```javascript
CREATE TABLE shares (
  share_account_id INT REFERENCES share_accounts(id) ON DELETE CASCADE,
  depot_id INT REFERENCES share_accounts(id) ON DELETE CASCADE,
  bank_account_id INT REFERENCES bank_accounts(id) ON DELETE SET NULL,
  ...
);
-- Then in every query:
WHERE share_account_id = ANY($1) OR depot_id = ANY($1) OR bank_account_id = ANY($1)
```

**Verbesserter Code:**
```javascript
-- After data migration: unify depot_id -> share_account_id, drop bank_account_id
CREATE TABLE shares (
  share_account_id INT NOT NULL REFERENCES share_accounts(id) ON DELETE CASCADE,
  ...
);
-- Queries become simply:
WHERE share_account_id = ANY($1)
```

---

### 6. sessions table queried on every authenticated request with no expiry index

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Missing Index  
**Datei/Ort:** `database/supabase-schema.sql — sessions table; backend/utils/session-store.mjs:getSessionRecord`

**Problem:**
Every authenticated API request calls `getSessionRecord`, which executes `SELECT ... FROM sessions WHERE token = $1`. There is an index `idx_sessions_token` on `token` (good) and `idx_sessions_expires` on `expires_at` (good for GC), but the session renewal UPDATE (`UPDATE sessions SET expires_at=$1 WHERE token=$2`) and expiry check run without a composite index. More critically, the session store does not cache the validated session in memory at all, so a single page load that fires 5 parallel API calls results in 5 database round-trips just to validate the session token.

**Empfehlung:**
An in-process LRU session cache (keyed on token, invalidated on logout/expiry) would eliminate the majority of session table reads. For a student project this is low priority but important to know for scaling.

**Aktueller Code:**
```javascript
async function getSessionRecord(token) {
  const { rows } = await pool.query(
    `SELECT user_id, expires_at FROM sessions WHERE token = $1`,
    [token]
  );
  // ...renewal UPDATE...
}
```

**Verbesserter Code:**
```javascript
// Add an in-process Map<token, {userId, expiresAt}> cache with a short TTL (30s).
// On logout/destroy, delete from cache. Reduces DB hits per request from N to ~0 on cache hit.
```

---

### 7. Missing index on transactions table for the most common lookup patterns

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Missing Index  
**Datei/Ort:** `database/supabase-schema.sql — transactions table; database/data-service.mjs lines 112-120`

**Problem:**
The `transactions` table can be queried with up to five OR conditions (`request_id`, `private_expense_id`, `group_expense_id`, `funding_participant_id`, `income_id`). The schema only has `idx_transactions_expense` on `group_expense_id`. The other four FK columns (`request_id`, `private_expense_id`, `funding_participant_id`, `income_id`) have no indexes. Additionally, `from_bank_account_id`, `to_bank_account_id`, and `bank_account_id` (used in `deleteBankAccountAssociations`) have no indexes, causing full table scans on delete.

**Empfehlung:**
Adding partial or regular indexes on each FK column on the transactions table makes per-entity transaction lookups O(log n) instead of O(n).

**Aktueller Code:**
```javascript
-- Only one index exists:
CREATE INDEX idx_transactions_expense ON transactions(group_expense_id);
-- Missing:
-- idx_transactions_request, idx_transactions_private_expense,
-- idx_transactions_funding_participant, idx_transactions_income,
-- idx_transactions_from_account, idx_transactions_to_account
```

**Verbesserter Code:**
```javascript
CREATE INDEX idx_transactions_request ON transactions(request_id);
CREATE INDEX idx_transactions_private_expense ON transactions(private_expense_id);
CREATE INDEX idx_transactions_funding_participant ON transactions(funding_participant_id);
CREATE INDEX idx_transactions_income ON transactions(income_id);
CREATE INDEX idx_transactions_from_account ON transactions(from_bank_account_id);
CREATE INDEX idx_transactions_to_account ON transactions(to_bank_account_id);
```

---

### 8. N+1 query pattern in migratePlaintextPasswords — one UPDATE per user in a loop

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** N+1 Query  
**Datei/Ort:** `backend/handlers/auth.mjs:migratePlaintextPasswords lines 157-199`

**Problem:**
At every server startup, `migratePlaintextPasswords` fetches all users and all email_verifications with two SELECT * queries, then issues one UPDATE per user/verification in a sequential for loop. On a large dataset this is O(n) round-trips to the database at startup. Even for a small user base this adds latency at boot. The function also fetches the full password column for all users, which is an unnecessary data exposure in memory.

**Empfehlung:**
The migration only needs to run once. A database migration flag or a dedicated migration script (rather than startup code) eliminates the recurring cost entirely. Alternatively, batch the UPDATEs with a single query or use a CASE expression.

**Aktueller Code:**
```javascript
for (const user of users) {
  // ...
  await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [nextPassword, user.id]);
}
```

**Verbesserter Code:**
```javascript
-- Add a column `password_migrated boolean default false` or use a migrations table.
-- Run migration once as a deploy step, not on every server boot.
-- If inline: collect IDs and new hashes, then batch:
// INSERT INTO users (id, password) VALUES ... ON CONFLICT (id) DO UPDATE SET password = excluded.password
```

---

### 9. profileImage stored as TEXT base64 in the users table (up to 210 KB per row)

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Schema Design  
**Datei/Ort:** `database/supabase-schema.sql — users.profileImage TEXT; backend/handlers/user.mjs:handleProfileImageUpload`

**Problem:**
Profile images are stored as base64-encoded data URLs directly in the `users` table column `profileImage TEXT`. The handler enforces a 200 KB limit, but storing binary data as base64 in a text column inflates storage by 33%, bloats every `SELECT * FROM users` query, pollutes the WAL, and prevents CDN caching. Supabase provides Storage (S3-backed) specifically for this purpose.

**Empfehlung:**
Storing a URL to Supabase Storage (or any object store) instead of the raw base64 shrinks the users row, enables CDN delivery with proper Cache-Control headers, and removes the base64 overhead.

**Aktueller Code:**
```javascript
"profileImage" TEXT  -- stores full 'data:image/png;base64,...' string up to 210KB
await pool.query(`UPDATE users SET "profileImage" = $1 WHERE id = $2`, [profileImage, userId]);
```

**Verbesserter Code:**
```javascript
"profile_image_url" TEXT  -- stores a URL e.g. 'https://...supabase.co/storage/v1/object/public/avatars/42.webp'
// Upload to Supabase Storage via their SDK, then store only the resulting public URL.
```

---

### 10. income and private_expenses tables have four redundant date columns with overlapping semantics

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Schema Design  
**Datei/Ort:** `database/supabase-schema.sql — income (received_at, pay_date), private_expenses (spent_at, due_date, pay_date); finance.mjs INSERT always sets pay_date = received_at / spent_at`

**Problem:**
The `income` table has both `received_at` and `pay_date`, and the code always inserts them with the same value (`$5, $5`). The `private_expenses` table has `spent_at`, `due_date`, and `pay_date`, all inserted from the same timestamp. The transaction handler's UNION query uses `COALESCE(received_at, pay_date, created_at)` — indicating the distinction has collapsed. This creates confusion about which column is authoritative, makes indexes harder to design, and means NULL-checking must cover multiple fallback columns throughout the codebase.

**Empfehlung:**
Consolidating to a single authoritative timestamp per table (e.g., `date` or `booked_at` for income, `date` for expenses) with a separate nullable `due_date` only when semantically meaningful would simplify all queries and indexes.

**Aktueller Code:**
```javascript
-- income INSERT:
VALUES ($1, $2, $3, $4, $5, $5, ...)  -- received_at=$5, pay_date=$5 (same value)
-- private_expenses INSERT:
VALUES ($1, $2, $3, $4, $4, $5, $5, $5, ...)  -- spent_at=due_date=pay_date same value
```

**Verbesserter Code:**
```javascript
-- Keep one canonical date column per table.
-- income: received_at (nullable due_date if needed for scheduled entries)
-- private_expenses: spent_at (plus due_date only for future-dated entries)
-- Remove pay_date from income, remove duplicate pay_date assignment in expenses
```

---

### 11. group_funding has a NOT NULL foreign key to group_activities but activities are optional

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Missing Constraint  
**Datei/Ort:** `database/supabase-schema.sql — group_funding.group_activity_id NOT NULL REFERENCES group_activities`

**Problem:**
The `group_funding` table declares `group_activity_id INT NOT NULL REFERENCES group_activities(id)`. However, the application code checks `funding.group_activity_id ? ... : null`, implying the activity link is considered optional. If a funding row is ever inserted without a prior activity, the NOT NULL constraint will raise an error. Conversely, if the intention is that all funding must be tied to an activity, the application code should enforce this at the API layer rather than silently checking for null.

**Empfehlung:**
Making the FK nullable (INT REFERENCES group_activities(id) ON DELETE SET NULL) aligns the schema with actual application semantics, or alternatively document and enforce the NOT NULL invariant at the API layer.

**Aktueller Code:**
```javascript
CREATE TABLE group_funding (
  group_activity_id INT NOT NULL REFERENCES group_activities(id) ON DELETE CASCADE,
  ...
);
```

**Verbesserter Code:**
```javascript
CREATE TABLE group_funding (
  group_activity_id INT REFERENCES group_activities(id) ON DELETE SET NULL,
  ...
);
```

---

### 12. transactions table has nullable FK columns but no CHECK ensuring at least one is set

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Missing Constraint  
**Datei/Ort:** `database/supabase-schema.sql — transactions table`

**Problem:**
The `transactions` table has five nullable FK columns (`private_expense_id`, `request_id`, `funding_participant_id`, `group_expense_id`, `income_id`) and three additional nullable account columns. Nothing in the schema enforces that at least one of these is populated. Orphaned transaction rows with all NULLs are valid by the schema, making audit and reporting queries unreliable.

**Empfehlung:**
A CHECK constraint requiring at least one source FK to be non-null ensures every transaction row is traceable to a business event.

**Aktueller Code:**
```javascript
CREATE TABLE transactions (
  private_expense_id INT REFERENCES private_expenses(id) ON DELETE SET NULL,
  request_id INT REFERENCES requests(id) ON DELETE SET NULL,
  funding_participant_id INT REFERENCES funding_participants(id) ON DELETE SET NULL,
  group_expense_id INT REFERENCES group_expenses(id) ON DELETE SET NULL,
  income_id INT REFERENCES income(id) ON DELETE SET NULL,
  from_bank_account_id INT,
  to_bank_account_id INT,
  bank_account_id INT,
  user_id INT
);
```

**Verbesserter Code:**
```javascript
-- Add:
CONSTRAINT transactions_has_source CHECK (
  private_expense_id IS NOT NULL OR request_id IS NOT NULL OR
  funding_participant_id IS NOT NULL OR group_expense_id IS NOT NULL OR
  income_id IS NOT NULL
)
-- Also add FK constraints for the three untyped INT columns:
from_bank_account_id INT REFERENCES bank_accounts(id) ON DELETE SET NULL,
to_bank_account_id INT REFERENCES bank_accounts(id) ON DELETE SET NULL,
bank_account_id INT REFERENCES bank_accounts(id) ON DELETE SET NULL,
user_id INT REFERENCES users(id) ON DELETE SET NULL
```

---

### 13. deleteGroupCascade performs manual multi-step deletion instead of using database CASCADE

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Architecture  
**Datei/Ort:** `backend/handlers/groups.mjs:deleteGroupCascade lines 53-88`

**Problem:**
The function manually deletes group-related rows across seven tables in multiple sequential async steps without a transaction. If the process crashes or a query fails mid-way, the group can be left partially deleted. The same result could be achieved by adding ON DELETE CASCADE to the relevant FK columns and issuing a single `DELETE FROM groups WHERE id=$1`. The existing schema already has `ON DELETE CASCADE` on `group_members` and `group_activities` referencing `groups`, but not on `group_funding` -> `group_activities` or `group_expenses` -> `group_funding`.

**Empfehlung:**
Completing the CASCADE chain in the schema reduces this entire function to a single SQL statement, eliminates the possibility of partial deletes, and removes ~35 lines of error-prone application logic.

**Aktueller Code:**
```javascript
// Seven separate pool.query calls across multiple await steps, no transaction wrapper
async function deleteGroupCascade(groupId) {
  const fundingResult = await pool.query(`SELECT id FROM group_funding WHERE group_id=$1`, ...);
  // ... 6 more steps ...
  await pool.query(`DELETE FROM groups WHERE id=$1`, [groupId]);
}
```

**Verbesserter Code:**
```javascript
-- In schema: add ON DELETE CASCADE to group_funding, group_expenses, group_message etc.
-- Then the entire function becomes:
await pool.query(`DELETE FROM groups WHERE id = $1`, [groupId]);
```

---

### 14. No connection pool size or timeout configured — pool uses library defaults

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Connection Pooling  
**Datei/Ort:** `backend/server.mjs line 34; database/db-client.mjs line 15`

**Problem:**
Both the main server Pool and the db-client Pool are created with only `connectionString` and `ssl`. The `pg` library defaults to a pool `max` of 10 connections, `idleTimeoutMillis` of 10 000 ms, and `connectionTimeoutMillis` of 0 (no timeout). Supabase free-tier projects have a connection limit of 60 (or fewer with PgBouncer). Without explicit configuration, the pool may exhaust connections silently, and a hung database will cause API requests to queue indefinitely. There are also two separate Pool instances created (server.mjs and db-client.mjs), doubling the connection consumption.

**Empfehlung:**
Explicit pool sizing prevents connection exhaustion; a `connectionTimeoutMillis` prevents infinite request queuing; removing the duplicate pool in db-client.mjs halves connection usage.

**Aktueller Code:**
```javascript
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
// db-client.mjs also creates its own separate Pool
```

**Verbesserter Code:**
```javascript
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,                      // stay well under Supabase free-tier limit
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});
// Remove the standalone pool in db-client.mjs; export the shared pool from server context instead.
```

---

### 15. email_verifications stores plaintext password in a staging table

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Security  
**Datei/Ort:** `database/supabase-schema.sql — email_verifications.password VARCHAR; backend/handlers/auth.mjs:handleRegister`

**Problem:**
During registration, a bcrypt/scrypt hash of the user's password is stored in `email_verifications.password`. Although the code does hash the password before inserting, this table is also readable (via Supabase direct DB access or a compromised query) and contains a column literally named `password`. The migration code also reads and updates this column. If the hashing step is ever bypassed by a bug, a plaintext password would land in this table. Additionally the `code_hash` is stored as a raw hex SHA-256 of the numeric OTP — SHA-256 of a 6-digit number is trivially brute-forceable offline (only 900 000 possible values).

**Empfehlung:**
Use a keyed HMAC (e.g., HMAC-SHA256 with a server-side secret) for the verification code hash instead of plain SHA-256, making offline brute-force attacks infeasible. Also consider naming the column `password_hash` to make intent explicit.

**Aktueller Code:**
```javascript
code_hash VARCHAR NOT NULL  -- SHA-256(6-digit-code) with no HMAC key
password VARCHAR NOT NULL   -- scrypt hash stored in staging table
```

**Verbesserter Code:**
```javascript
code_hash VARCHAR NOT NULL  -- store HMAC-SHA256(code, SERVER_SECRET) instead of SHA-256(code)
password_hash VARCHAR NOT NULL  -- rename for clarity; ensure hashing is always enforced
```

---

### 16. categories and state fields use unconstrained VARCHAR — no CHECK constraints for enum-like values

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Missing Constraint  
**Datei/Ort:** `database/supabase-schema.sql — income.cycle, income.state, income.recurrence, private_expenses.cycle, private_expenses.state, requests.status, group_expenses.state, group_members.role, group_members.status`

**Problem:**
Fields like `cycle` (values: once/weekly/monthly/yearly), `state` (open/paused/completed), `status` (pending/accepted/rejected), and `role` (admin/member) are stored as unconstrained VARCHAR. No CHECK constraint validates their values. Invalid data written directly to the database (e.g., via the Supabase SQL editor or a future migration) would bypass application-layer validation silently and cause undefined behavior in the `normalizeCycle` / `recurrenceMonthlyContribution` logic.

**Empfehlung:**
CHECK constraints or PostgreSQL ENUM types guarantee value validity at the storage layer, independent of the application.

**Aktueller Code:**
```javascript
cycle VARCHAR DEFAULT 'once',
state VARCHAR DEFAULT 'open',
role VARCHAR NOT NULL,
status VARCHAR
```

**Verbesserter Code:**
```javascript
cycle VARCHAR DEFAULT 'once' CHECK (cycle IN ('once','weekly','monthly','yearly')),
state VARCHAR DEFAULT 'open' CHECK (state IN ('open','paused','completed')),
role VARCHAR NOT NULL CHECK (role IN ('admin','member')),
status VARCHAR CHECK (status IN ('accepted','invited','active','rejected','left') OR status IS NULL)
```

---

### 17. Missing index on income.category and private_expenses.category used in filtered queries

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Missing Index  
**Datei/Ort:** `database/supabase-schema.sql — indexes section; backend/handlers/finance.mjs:handleTransactions line 200`

**Problem:**
The transaction list endpoint supports filtering by `category` using `LOWER(category) = LOWER($n)`. Both the `income` and `private_expenses` tables lack an index on `category`. For users with hundreds of entries this means a full index scan on the already-indexed `bank_account_id` followed by a row-level category filter. A functional index on `LOWER(category)` would allow the planner to use an index scan for this filter.

**Empfehlung:**
A functional index on `LOWER(category)` makes category-filtered queries efficient without requiring case normalization in the data.

**Aktueller Code:**
```javascript
-- No category index exists on income or private_expenses
```

**Verbesserter Code:**
```javascript
CREATE INDEX idx_income_category ON income(bank_account_id, LOWER(category));
CREATE INDEX idx_expenses_category ON private_expenses(bank_account_id, LOWER(category));
```

---

### 18. getPreparedData in data-service.mjs loads all entries per user with no pagination or limit

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** N+1 Query / Unoptimized Query  
**Datei/Ort:** `database/data-service.mjs — all SELECT * queries (lines 42-115)`

**Problem:**
The `getPreparedData` function fetches `SELECT * FROM income WHERE bank_account_id = ANY(...)` and similar unbounded queries for expenses, shares, group data, and transactions. There is no LIMIT, no date range filter, and no cursor. A user with years of transaction history will cause this function to fetch tens of thousands of rows into Node.js memory at once. The function is also building its own in-memory join layer rather than letting PostgreSQL do the joins with proper indexes.

**Empfehlung:**
Adding LIMIT and time-range parameters (e.g., last 12 months default), or converting the separate SELECT + in-memory join into proper JOIN queries, would dramatically reduce memory use and query time.

**Aktueller Code:**
```javascript
pool.query(`SELECT * FROM income WHERE bank_account_id = ANY($1)`, [bankAccountIds])
// No LIMIT, no ORDER BY, no date range
```

**Verbesserter Code:**
```javascript
pool.query(
  `SELECT * FROM income WHERE bank_account_id = ANY($1) AND created_at >= NOW() - INTERVAL '12 months' ORDER BY created_at DESC LIMIT 500`,
  [bankAccountIds]
)
```

---

### 19. No soft-delete on any financial record — permanent deletion loses audit history

**Priorität:** 🟢 `LOW`  
**Kategorie:** Missing Audit Trail  
**Datei/Ort:** `database/supabase-schema.sql — income, private_expenses, requests, transactions tables; backend/handlers/finance.mjs DELETE handlers`

**Problem:**
When an income entry or expense is deleted, `DELETE FROM income WHERE id=$1` permanently removes the row. The corresponding `transactions` row has `income_id` set to NULL via ON DELETE SET NULL, creating an orphaned transaction with no traceable source. For a financial application this means no audit trail: a user cannot see why their balance changed historically, and deleted entries cannot be recovered.

**Empfehlung:**
Adding a `deleted_at TIMESTAMP` column and replacing DELETEs with `UPDATE ... SET deleted_at = NOW()` (soft delete) preserves audit history. All read queries add `WHERE deleted_at IS NULL`. The `group_message` table already has this pattern with `deleted_at`.

**Aktueller Code:**
```javascript
-- group_message has: deleted_at TIMESTAMP  (good)
-- income, private_expenses, requests have no deleted_at column
await pool.query(`DELETE FROM income WHERE id=$1`, [entryId]);
```

**Verbesserter Code:**
```javascript
-- Add to income, private_expenses, requests:
deleted_at TIMESTAMP DEFAULT NULL
-- Change delete to soft-delete:
await pool.query(`UPDATE income SET deleted_at = NOW() WHERE id = $1`, [entryId]);
-- Add partial indexes:
CREATE INDEX idx_income_active ON income(bank_account_id) WHERE deleted_at IS NULL;
```

---

### 20. income.info and income.source are both populated with the same value — redundant columns

**Priorität:** 🟢 `LOW`  
**Kategorie:** Schema Design  
**Datei/Ort:** `database/supabase-schema.sql — income.source VARCHAR, income.info TEXT; backend/handlers/finance.mjs line 381`

**Problem:**
In every INSERT for income entries, `info` is set to `source || note || null` — always equal to `source` when source is non-empty. The same pattern appears for private_expenses (info = source || note). The `info` column appears to be a legacy field that now duplicates `source`. This adds confusion for anyone reading the schema, wastes storage, and makes it unclear which column to use for display.

**Empfehlung:**
Dropping the redundant `info` column (after confirming it is not used independently anywhere in queries) simplifies the schema and eliminates the dual-population in every INSERT/UPDATE.

**Aktueller Code:**
```javascript
source VARCHAR,
info TEXT,
-- In INSERT:
VALUES ($1, $2, $3, $4, $5, $5, $6, $7, ...) -- info=$7 = source||note
```

**Verbesserter Code:**
```javascript
-- Remove info column from income and private_expenses.
-- Use source for the payee/merchant name, note for free-text annotation.
```

---

### 21. Hardcoded HTTP IP address for STOCK_SEARCH_BASE_URL in runtime config

**Priorität:** 🟢 `LOW`  
**Kategorie:** Architecture  
**Datei/Ort:** `backend/config/runtime.mjs line 11`

**Problem:**
The default value for `STOCK_SEARCH_BASE_URL` is `http://3.225.21.161` — a raw HTTP IP address. This is committed to source code, meaning it is exposed in the git history. Calls to this address are unencrypted (HTTP), making them vulnerable to MITM attacks on the API key and response data. If this IP rotates, the application breaks silently with a fallback that is invisible in the environment config.

**Empfehlung:**
The IP should never be the default in code. Use an environment variable with no default, fail loudly on startup if missing, and ensure the endpoint uses HTTPS.

**Aktueller Code:**
```javascript
export const STOCK_SEARCH_BASE_URL = String(
  process.env.STOCK_SEARCH_BASE_URL || process.env.STOCK_API_BASE_URL || "http://3.225.21.161"
).trim();
```

**Verbesserter Code:**
```javascript
export const STOCK_SEARCH_BASE_URL = String(
  process.env.STOCK_SEARCH_BASE_URL || process.env.STOCK_API_BASE_URL || ""
).trim();
// In server start: if (!STOCK_SEARCH_BASE_URL) console.warn('[config] STOCK_SEARCH_BASE_URL not set');
```

---

### 22. Missing index on requests table for the to_bank_account_id column

**Priorität:** 🟢 `LOW`  
**Kategorie:** Missing Index  
**Datei/Ort:** `database/supabase-schema.sql — requests table`

**Problem:**
The `requests` table is queried with `WHERE from_bank_account_id = ANY($1) OR to_bank_account_id = ANY($1)`. There is no index on either column. For users with many payment requests, this requires a full table scan. An OR condition across two unindexed columns is especially costly because the planner cannot use a single index scan.

**Empfehlung:**
Separate indexes on both columns allow the planner to use a bitmap OR scan, turning a full table scan into two partial index scans.

**Aktueller Code:**
```javascript
-- No index on requests(from_bank_account_id) or requests(to_bank_account_id)
```

**Verbesserter Code:**
```javascript
CREATE INDEX idx_requests_from_account ON requests(from_bank_account_id);
CREATE INDEX idx_requests_to_account ON requests(to_bank_account_id);
```

---

