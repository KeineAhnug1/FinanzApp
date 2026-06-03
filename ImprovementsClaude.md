# ImprovementsClaude.md — Verbesserungsvorschläge für FinanzApp

> Automatisch generiert durch KI-Analyse mit 8 parallelen Experten-Agenten.
> Analysedatum: 2. Juni 2026

---

## Zusammenfassung

| Kategorie | Findings | Hoch | Mittel | Niedrig |
|-----------|----------|------|--------|---------|
| 🔒 Sicherheit (Security) | 3 | 0 | 2 | 1 |
| 🐛 Frontend-Bugs (Stocks/Groups/Accounts) | 4 | 0 | 4 | 0 |
| ⚙️ Backend-Qualität & Datenintegrität | 5 | 2 | 3 | 0 |
| ⚡ Performance & Optimierung | 2 | 1 | 1 | 0 |
| 🧹 Frontend-Codequalität (Dashboard) | 2 | 1 | 1 | 0 |
| 🗄️ Datenbank & Architektur | 8 | 4 | 4 | 0 |

---

## 🔒 Sicherheit (Security)

### 1. Unsalted SHA-256 Used to Hash 6-Digit Verification Codes

**Priorität:** 🟡 `MEDIUM`  
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

### 2. No Rate Limiting on AI-Triggering Forum Questions (Finzbro @mention Amplification)

**Priorität:** 🟡 `MEDIUM`  
**Datei/Ort:** `backend/handlers/forum.mjs:handleQuestions (line 503), maybeCreateFinzbroAutoAnswer (line 355)`

**Problem:**
Every POST to `/api/questions` that mentions `@finzbro` triggers an asynchronous call to the OpenRouter external API. There is no rate limiting on the questions endpoint or the Finzbro trigger. An authenticated attacker can spam questions with `@finzbro` mentions to exhaust the OpenRouter API quota and cause monetary damage (billed API calls) or degrade service.

**Empfehlung:**
1. Add `checkRateLimit` to the question POST handler (e.g., 5 questions per minute per IP/user).
2. Separately rate-limit the Finzbro auto-answer trigger per user (e.g., max 2 AI triggers per hour per user).
3. Reduce or paginate the `candidateLimit` for the question list.

---

### 3. No Rate Limiting on Data-Writing API Endpoints (Finance, Groups, Forum)

**Priorität:** 🟢 `LOW`  
**Datei/Ort:** `backend/handlers/finance.mjs, backend/handlers/groups.mjs, backend/handlers/forum.mjs`

**Problem:**
The rate limiter is only applied to authentication-related endpoints. All authenticated data-mutation endpoints (create income entry, create expense, post group messages, create forum questions/answers, donate to group funding) have no rate limiting.

**Empfehlung:**
Apply `checkRateLimit` to mutation endpoints with appropriate per-group/per-user limits:
```js
if (!checkRateLimit(req, res, { maxAttempts: 60, windowMs: 60_000, group: 'finance-write' })) return;
```

---


## 🐛 Frontend-Bugs (Stocks/Groups/Accounts)

### 1. t() translation wrapper duplicated across four modules with subtly different signatures

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Code Duplication  
**Datei/Ort:** `groups/app.js line 120, questions/app.js line 17, accounts/app.js line 19, stocks/state-api.js line 284 (exported as fnT)`

**Problem:**
Every page module defines its own local `t()` wrapper around `sharedT` / `_t` with identical logic: call the shared translation, fall back to a default string, and interpolate `{name}` placeholders. The implementations are almost identical but have minor differences — `groups/app.js` defaults `fallback = ''` while `questions/app.js` and `accounts/app.js` have no default. If the fallback interpolation logic ever needs to change, it must be updated in four places.

**Empfehlung:**
Single source of truth for the translation fallback logic; reduces copy-paste bugs and maintenance overhead.

---

### 2. Hardcoded fallback localhost/127.0.0.1 endpoints ship to production in state-api.js

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Code Quality  
**Datei/Ort:** `stocks/state-api.js, lines 14–54 (endpoint arrays)`

**Problem:**
The endpoint arrays include raw `http://127.0.0.1:5588` and `http://localhost:5588` fallback entries. These are never filtered and remain in the production bundle. If the relative path fails, the browser will attempt these cross-origin requests, causing CORS errors and leaking internal dev ports.

**Empfehlung:**
Remove all localhost/127.0.0.1 fallback entries from production code. Use only relative paths like `accounts/app.js` does.

---

### 3. Hardcoded untranslated German strings in fnBuildAnalysisChart

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Code Quality  
**Datei/Ort:** `stocks/features.js, lines 1213, 1224–1225 (fnBuildAnalysisChart)`

**Problem:**
Three status strings bypass the `fnT()` i18n wrapper: `'Kurs ${sSymbol} (letzter Punkt)'`, `', Bestand: ${fnFmtNumber(...)} Stk'`, and `'Chart aktualisiert: ...'`. This inconsistency means the analysis chart info bar is never translated for non-German users.

**Empfehlung:**
```js
oArgs.elTotalLabel.textContent = fnT('stocks.price_symbol_last_point', 'Kurs {symbol} (letzter Punkt)', { symbol: sSymbol });
```

---

### 4. Missing input validation: trade amount input accepts non-positive fractional values and has no max

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Missing Input Validation  
**Datei/Ort:** `stocks/views.js line (analysisTradeAmountInput), stocks/features.js lines 903–912 and 998–1001`

**Problem:**
The `analysisTradeAmountInput` has no `max` attribute. The JS validation only checks `nAmount <= 0`, so a user could type `999999999` shares. The sell path does check `nAmount > nOwnedAmount`, but only after a slow `fnGetLatestPriceBySymbol` call.

**Empfehlung:**
Add client-side max validation before API calls. For sells, validate against `nOwnedAmount` before calling `fnGetLatestPriceBySymbol`.

---


## ⚙️ Backend-Qualität & Datenintegrität

### 1. Missing database transaction in handleRegisterVerify: user insert and finance-root creation are not atomic

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Error Handling / Data Integrity  
**Datei/Ort:** `backend/handlers/auth.mjs:handleRegisterVerify`

**Problem:**
The INSERT into `users` and the subsequent `ensureUserFinanceRoots` call run as separate, non-transactional statements. If the server crashes between them, the user row exists but has no finance roots, leaving the account in a broken state.

**Empfehlung:**
```js
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
The donation flow performs at least five independent DML statements with no rollback path. A crash mid-way results in a partial donation: funding balance may be updated but the expense record is missing, corrupting the user's financial data.

**Empfehlung:**
```js
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

### 3. Massive N+1 query problem in listQuestionsWithRelations for single-question GET

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Performance / N+1 Queries  
**Datei/Ort:** `backend/handlers/forum.mjs:handleQuestionById, handleQuestionAnswerCreate, handleAnswerById`

**Problem:**
After any mutation, the code calls `listQuestionsWithRelations(userId)` which fetches up to 600 questions plus all their answers, likes, and user data — just to find and return a single question.

**Empfehlung:**
Create a separate `fetchSingleQuestionWithRelations(userId, questionId)` helper that queries only the single question, its answers, and their likes.

---

### 4. Repeated identical pattern for resolving effectiveRecurrence / effectiveIsActive / effectiveState is copy-pasted four times

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** DRY / Maintainability  
**Datei/Ort:** `backend/handlers/finance.mjs:handleIncomeEntries, handleIncomeEntryById, handleExpenseEntries, handleExpenseEntryById`

**Problem:**
The three-line block that derives `effectiveRecurrence`, `effectiveIsActive`, and `effectiveState` is copy-pasted identically in all four entry mutation handlers.

**Empfehlung:**
```js
// In a shared helper (e.g. helpers/entry-state.mjs):
export function resolveEntryState(cycle, recurrence, isActive) {
  const effectiveRecurrence = cycle === "once" ? null : recurrence;
  const effectiveIsActive = cycle === "once" ? true : (effectiveRecurrence === 0 ? false : isActive);
  const effectiveState = cycle === "once" ? "open" : (effectiveRecurrence === 0 ? "completed" : (effectiveIsActive ? "open" : "paused"));
  return { effectiveRecurrence, effectiveIsActive, effectiveState };
}
```

---

### 5. handleBankAccountById DELETE reads request body with silent catch that swallows real errors

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Error Handling  
**Datei/Ort:** `backend/handlers/finance.mjs:handleBankAccountById`

**Problem:**
The body parsing for the DELETE method uses a try/catch that only forwards `payload_too_large` and `invalid_json` — any other error is silently ignored and `payload` is set to `{}`.

**Empfehlung:**
Use the existing `parseBody` helper which already handles these cases correctly:
```js
const payload = await parseBody(req, res);
if (!payload) return;
```

---


## ⚡ Performance & Optimierung

### 1. Dashboard Bootstrap Makes 5 Sequential API Requests

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Network  
**Datei/Ort:** `apps/web/src/pages/dashboard/bootstrap.js and dashboard-api.js`

**Problem:**
Dashboard initialisation fires API requests in sequence: (1) /api/session, then (2) /api/categories, then (3) /api/bank-accounts, (4) /api/transactions, (5) /api/budgets/status. Each waits for the previous to complete. On a 50 ms round-trip, this is 250–300 ms of pure waiting.

**Empfehlung:**
```js
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

### 2. Session Validation Issues 2 DB Queries Per Authenticated Request

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Database  
**Datei/Ort:** `backend/handlers/auth.mjs – getSessionUser()`

**Problem:**
Every authenticated API request calls `getSessionUser` which makes two sequential DB queries: (1) SELECT from sessions and (2) SELECT from users.

**Empfehlung:**
```js
// Combine into a single JOIN query:
const { rows } = await pool.query(
  `SELECT s.user_id, s.expires_at, u.username, u.email, u.first_name, u.last_name, u."profileImage"
   FROM sessions s JOIN users u ON u.id = s.user_id
   WHERE s.token = $1`,
  [token]
);
```

---


## 🧹 Frontend-Codequalität (Dashboard)

### 1. XSS risk: user-controlled strings injected into innerHTML without escaping in script.js

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Security / XSS  
**Datei/Ort:** `dashboard/script.js – render(), renderLoginFields(), renderForgotFields(), renderResetFields(), renderVerifyFields()`

**Problem:**
The `render()` method writes `this.innerHTML` using template literals that embed `title`, `subtitle`, `fields`, and `submitLabel` values without escaping. If any translation string or fallback were sourced from user input, the HTML would be injected verbatim.

**Empfehlung:**
Use DOM APIs (`createElement` / `textContent` / `setAttribute`) for structural parts, or escape every interpolated value:
```js
`<h1 class="login-title">${escapeHtml(title)}</h1>`
```

---

### 2. fetchJsonSync uses synchronous XMLHttpRequest, blocking the main thread

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Performance  
**Datei/Ort:** `shared/language-utils.js – fetchJsonSync(), line 89`

**Problem:**
The i18n initialisation uses a synchronous XHR (`xhr.open('GET', url, false)`) to load locale files. Synchronous XHR blocks the browser's main thread for the entire network round-trip, is deprecated, and generates browser console warnings.

**Empfehlung:**
Convert the init chain to async/await with `fetch()`:
```js
async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}
```

---


## 🗄️ Datenbank & Architektur

### 1. Balance is mutated with a non-atomic read-modify-write pattern under concurrency

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Data Integrity  
**Datei/Ort:** `backend/helpers/finance-db.mjs:incrementBankAccountBalance`

**Problem:**
The surrounding code first reads the existing entry amount, then deletes/updates the entry, then calls `incrementBankAccountBalance` — all as separate, non-transactional statements. A concurrent request can result in a double-debit or double-credit.

**Empfehlung:**
```js
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

### 2. Missing UNIQUE constraint on group_members (user_id, group_id)

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Missing Constraint  
**Datei/Ort:** `database/supabase-schema.sql — group_members table`

**Problem:**
The `group_members` table has no unique constraint on `(user_id, group_id)`. Nothing prevents the same user from being inserted as a member of the same group multiple times, causing duplicate membership rows and incorrect role checks.

**Empfehlung:**
```sql
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

### 3. Ambiguous dual-column FK on shares table (share_account_id AND depot_id both reference share_accounts)

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Schema Design  
**Datei/Ort:** `database/supabase-schema.sql — shares table`

**Problem:**
The `shares` table has `share_account_id` and `depot_id` both referencing `share_accounts(id)`. Every query must `OR` all three columns, making queries verbose and fragile.

**Empfehlung:**
After data migration, unify `depot_id` → `share_account_id` and drop `bank_account_id` from shares:
```sql
CREATE TABLE shares (
  share_account_id INT NOT NULL REFERENCES share_accounts(id) ON DELETE CASCADE,
  ...
);
```

---

### 4. Missing index on transactions table for the most common lookup patterns

**Priorität:** 🔴 `HIGH`  
**Kategorie:** Missing Index  
**Datei/Ort:** `database/supabase-schema.sql — transactions table`

**Problem:**
The `transactions` table can be queried with up to five OR conditions, but only `group_expense_id` is indexed. The other four FK columns have no indexes, causing full table scans.

**Empfehlung:**
```sql
CREATE INDEX idx_transactions_request ON transactions(request_id);
CREATE INDEX idx_transactions_private_expense ON transactions(private_expense_id);
CREATE INDEX idx_transactions_funding_participant ON transactions(funding_participant_id);
CREATE INDEX idx_transactions_income ON transactions(income_id);
CREATE INDEX idx_transactions_from_account ON transactions(from_bank_account_id);
CREATE INDEX idx_transactions_to_account ON transactions(to_bank_account_id);
```

---

### 5. email_verifications stores plaintext password in a staging table

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Security  
**Datei/Ort:** `database/supabase-schema.sql — email_verifications.password VARCHAR`

**Problem:**
`code_hash` is stored as a raw hex SHA-256 of the numeric OTP — trivially brute-forceable offline (only 900,000 possible values). The column is also named `password` instead of `password_hash`.

**Empfehlung:**
Use HMAC-SHA256 with a server-side secret and rename column to `password_hash` for clarity.

---

### 6. categories and state fields use unconstrained VARCHAR — no CHECK constraints

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Missing Constraint  
**Datei/Ort:** `database/supabase-schema.sql — income.cycle, income.state, group_members.role, etc.`

**Problem:**
Fields like `cycle`, `state`, `status`, and `role` are stored as unconstrained VARCHAR. Invalid data written directly to the database bypasses application-layer validation silently.

**Empfehlung:**
```sql
cycle VARCHAR DEFAULT 'once' CHECK (cycle IN ('once','weekly','monthly','yearly')),
state VARCHAR DEFAULT 'open' CHECK (state IN ('open','paused','completed')),
role VARCHAR NOT NULL CHECK (role IN ('admin','member')),
status VARCHAR CHECK (status IN ('accepted','invited','active','rejected','left') OR status IS NULL)
```

---

### 7. transactions table has nullable FK columns but no CHECK ensuring at least one is set

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Missing Constraint  
**Datei/Ort:** `database/supabase-schema.sql — transactions table`

**Problem:**
Nothing in the schema enforces that at least one FK is populated. Orphaned transaction rows with all NULLs are valid by the schema, making audit and reporting queries unreliable.

**Empfehlung:**
```sql
CONSTRAINT transactions_has_source CHECK (
  private_expense_id IS NOT NULL OR request_id IS NOT NULL OR
  funding_participant_id IS NOT NULL OR group_expense_id IS NOT NULL OR
  income_id IS NOT NULL
)
```

---

### 8. Missing index on income.category and private_expenses.category

**Priorität:** 🟡 `MEDIUM`  
**Kategorie:** Missing Index  
**Datei/Ort:** `database/supabase-schema.sql`

**Problem:**
The transaction list endpoint supports filtering by `category` but both tables lack an index on `category`, causing full-table scans.

**Empfehlung:**
```sql
CREATE INDEX idx_income_category ON income(bank_account_id, LOWER(category));
CREATE INDEX idx_expenses_category ON private_expenses(bank_account_id, LOWER(category));
```

---
