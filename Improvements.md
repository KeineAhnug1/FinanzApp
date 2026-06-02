Improvements and Cleanup Proposals

Overview
- Scope: Backend (Node/PG), Web (Vite static), Database helpers, Tooling.
- Goals: Remove redundancies, trim dead code, clarify configs, and tighten consistency.

Backend
- Remove unused imports
  - Files: backend/handlers/user.mjs:1–8, backend/handlers/finance.mjs:1–24, backend/handlers/groups.mjs:1–9
  - Issue: Several modules import `http`, `Pool` or helpers they do not use directly (e.g., `http` in handlers that only rely on type JSDoc; `Pool` is only referenced in JSDoc). ESLint config currently suppresses these via `varsIgnorePattern`, but keeping unused imports bloats code and confuses readers.
  - Fix: Drop non‑used imports; rely on JSDoc types or inline typedefs as needed. If type import is desired, prefer pure JSDoc `@typedef` rather than runtime import.

- Consolidate request body utilities
  - Files: backend/utils/http.mjs, backend/handlers/user.mjs, backend/handlers/finance.mjs
  - Issue: Some handlers use `readBody` directly to special‑case payload‑too‑large. Others use `parseBody`. This divergence duplicates error handling paths and spreads HTTP concerns across handlers.
  - Fix: Extend `parseBody` to support an options bag (e.g., maxBytes, allowedTypes). Use `parseBody(req, res, { maxBytes: 210_000 })` for image/profile uploads. Replace direct `readBody` usage to keep error handling centralized.

- Rate limiter initialization contract
  - Files: backend/utils/rate-limit.mjs, backend/server.mjs
  - Issue: Rate limiter requires `initRateLimiter(sendJson)` before any use; otherwise it throws. While server calls it during startup, defensive guards in `checkRateLimit` would avoid runtime surprises during future refactors/tests.
  - Fix: In `checkRateLimit`, if not initialized, allow the request (no rate limit) and optionally log once. Alternatively, keep as‑is but add a short comment in server start path explaining the dependency.

- Static file resolution and redirects
  - Files: backend/routes/ui-routes.mjs
  - Issue: `PROTECTED_UI_PATHS` hard‑codes `/pages/dashboard/dashboard.html` while redirects map `/pages/dashboard/` → dist index. Also both `PROTECTED_UI_PATHS` and `PROTECTED_UI_PREFIXES` list overlapping entries; `PROTECTED_UI_PATHS` seems unnecessary if prefixes cover all secured areas.
  - Fix: Remove `PROTECTED_UI_PATHS`, keep `PROTECTED_UI_PREFIXES` only. Add an explicit allowlist for root and `/pages/homepage/`. Ensure protection remains for the dashboard path via prefix rule.

- Hardcoded upstream defaults
  - Files: backend/config/runtime.mjs
  - Issue: `STOCK_SEARCH_BASE_URL` default points to a raw IP (`http://3.225.21.161`). This is brittle and leaks environment detail.
  - Fix: Default to an empty string and fail fast in handlers with a clear 500 + setup hint (already implemented). Document required env vars in README and `.env.example`.

- Session cookie handling consistency
  - Files: backend/utils/session-store.mjs
  - Issue: Cookie attributes are repeated between build and clear variants.
  - Fix: Factor a small helper returning common attributes; avoids drift when attributes change.

- Password migration and hashing
  - Files: backend/handlers/auth.mjs, backend/utils/password.mjs
  - Issue: On login, if a legacy hash is detected, the code rehashes with scrypt (good). Consider inlining a one‑time background job or marking migrated accounts to avoid repeated checks.
  - Fix: Optional: add a DB boolean column `password_is_legacy` and drop repeated `isScryptPasswordHash` checks in hot paths. Not urgent.

- Forum OpenRouter integration robustness
  - Files: backend/handlers/forum.mjs
  - Issue: Reads two API keys and cycles through them. Consider proper exponential backoff with per‑key quotas and clearer error propagation.
  - Fix: Add small key‑rotation util with jittered backoff and structured error messages for clients.

API Routing and Handlers
- Route dispatch order and fallthrough
  - Files: backend/routes/api-dispatch.mjs
  - Issue: Dispatch order mixes features; not strictly wrong, but makes it harder to reason about shadowing. Also adding new domains risks accidental 404s if not inserted correctly.
  - Fix: Group and order by domain (auth first handled in server, then user, finance, budgets, groups, forum, entries). Add a comment explaining order guarantees.

- Redundant constants and config spread
  - Files: backend/config/runtime.mjs
  - Issue: App mixes static MIME map, domain constants, and feature toggles in one file.
  - Fix: Optional: split into `env.ts` (process.env derived), `constants.ts` (MIME map, regex), and `features.ts` (flags). Reduces noise when reviewing diffs.

Database Layer
- Duplicate connection pools
  - Files: backend/server.mjs, database/db-client.mjs
  - Issue: Two separate `pg.Pool` instances are created for app and scripts. That’s acceptable, but some utilities in `database/*` import the pool instance (`export { pool }`) while backend passes a Pool around explicitly.
  - Fix: Keep separation for scripts, but avoid mixing patterns in backend. Ensure all backend modules receive the Pool via parameters (already largely done). For scripts, consider a tiny `getPool()` factory that caches the instance to avoid accidental multiple pools within one script.

- Non‑destructive DB scripts clarity
  - Files: database/clear-database.mjs, database/migrate-to-supabase.mjs
  - Issue: Both are intentionally no‑op. This is fine, but should be mentioned prominently in README to avoid confusion.
  - Fix: Add one line to README under “Nützliche Skripte” clarifying that these print instructions/do nothing. Optionally rename to `db:migrate:hint` and `db:clear:noop`.

Web (Vite)
- Dist artifacts in repo
  - Files: apps/web/dist/**, dist/shared/types/**
  - Status: Added `.gitignore` to exclude these paths. Next step: remove already‑tracked artifacts in VCS.

- Duplicate asset folders
  - Files: apps/web/public/shared/images/* and apps/web/src/shared/images/*
  - Resolution: Removed unused duplicates in `apps/web/src/shared/images/*`. `public/shared/images` remains the source of truth.

- Homepage assets duplication in dist and source
  - Files: apps/web/pages/homepage/images/*, apps/web/dist/homepage/images/* (built)
  - Issue: Dist copies are expected; ensure source of truth remains under `apps/web/public/homepage` and references use `/homepage/...`.
  - Fix: After ignoring dist, duplication ceases to matter. Keep paths consistent via `vite` static handling.

- Vite inputs and server redirects
  - Files: apps/web/vite.config.ts, backend/routes/ui-routes.mjs
  - Issue: Dashboard route is compiled as `pages/dashboard/dashboard.html` but server maps `/pages/dashboard/` to `dist/index.html` to reuse the auth page. This can be surprising.
  - Fix: Either: (a) build a dedicated `pages/dashboard/index.html` and change server map; or (b) document the special case in a code comment to avoid future accidental breakage.

Tooling & Quality
- ESLint config simplification
  - Files: eslint.config.mjs
  - Issue: `varsIgnorePattern: "^(http|Pool)$"` used to silence type‑only imports. Prefer explicit `// eslint-disable-next-line` or better: avoid runtime imports for types and rely on `@ts-check` JSDoc.
  - Fix: Remove the special ignore pattern after cleaning unused imports.

- TypeScript build targets and emitted artifacts
  - Files: tsconfig.json, tsconfig.build.json
  - Issue: The repo contains `dist/shared/types/*` from a previous TS build. Ensure `tsconfig.build.json` emits to top‑level `dist/` and do not commit it.
  - Fix: Add to `.gitignore` and purge from VCS.

Security & Robustness
- Static file path normalization
  - Files: backend/server.mjs (handleStatic)
  - Issue: Current normalization uses `path.normalize` and checks `relativePath.startsWith("..")`. This is good. Consider also rejecting paths containing `\0` and limit path length for safety.
  - Fix: Add a quick guard rejecting `pathname.includes("\0")` and extremely long paths (> 2k chars) with 400.

- Cookie security flags
  - Files: backend/utils/session-store.mjs
  - Issue: `Secure` is only set in production. When running behind HTTPS in staging with `NODE_ENV` not set, this downgrades security.
  - Fix: Add an env toggle `SESSION_SECURE_COOKIE=true` to force Secure regardless of NODE_ENV.

Redundancies and Removals
- Remove PROTECTED_UI_PATHS duplication
  - Files: backend/routes/ui-routes.mjs
  - Reason: Prefix list already covers all protected pages.

- Remove unused image duplicates
  - Files: apps/web/src/shared/images/*
  - Reason: Not referenced; public/ variant is used. Keep one set.

- Stop committing build artifacts
  - Files: apps/web/dist/**, dist/shared/**
  - Reason: Redundant with sources and causes stale code issues.

Documentation
- Add `.env.example`
  - Include keys used in runtime: PORT, DATABASE_URL, SMTP_*, OPENROUTER_*, STOCK_API_KEY, STOCK_SEARCH_BASE_URL, TWELVE_DATA_API_KEY, LOGO_DEV_*.

- README route consistency
  - Current README lists `/dashboard.html`, but the server expects `/pages/dashboard/dashboard.html` or uses `/` auth.
  - Align examples with server routing (e.g., `/pages/dashboard/dashboard.html`, `/pages/groups/`, etc.).

Nice‑to‑Have Improvements
- Move repeated SQL snippets into small helpers (e.g., pagination patterns for entries).
- Add unit tests for pure helpers in `backend/utils` and `backend/helpers` (formatters, parsers, MIME map selection).
- Introduce a simple request logger in dev (method, path, status, ms) to ease debugging.

Action Plan (suggested order)
1) Ignore and remove build artifacts: add .gitignore, delete tracked dist files.
2) Clean unused imports and ESLint ignore patterns.
3) Unify `parseBody` usage; extend with options for large payload endpoints.
4) Remove PROTECTED_UI_PATHS; keep prefixes only.
5) Add `.env.example` and README notes for no‑op DB scripts and required keys.
6) Optional: refactor runtime config split and cookie security toggle.
